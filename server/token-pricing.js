/**
 * It's A Simple Job - Token pricing (server only).
 * Everything is priced and charged in AUD. 1 token = the superadmin's token price (default A$1).
 * Visitors outside Australia and New Zealand are shown a USD conversion at a daily live rate
 * (2 decimal places maximum, rounded up to the cent), but every payment is still charged and invoiced in AUD.
 */

import { getAdminDb } from './firebase-admin.js';
import {
  BASE_CURRENCY,
  DEFAULT_PRICING,
  MAX_TOKEN_PURCHASE,
  MIN_TOKEN_PURCHASE,
  convertAudToUsd,
  normalizePricing
} from '../shared/pricing.js';

export { MAX_TOKEN_PURCHASE, MIN_TOKEN_PURCHASE };

const PRICING_DOC_PATH = 'platform_settings/pricing';
const PRICING_MAX_AGE_MS = 60 * 1000;

const FX_DOC_PATH = 'platform_settings/fx_aud_usd';
const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FALLBACK_AUD_USD = 0.70;

let cachedPricing = null; // { pricing, updatedAt, updatedBy, fetchedAt }
let cachedRate = null;    // { rate, rateDate, source, fetchedAt }

/* ----------------------------------------------------------------------------
   Superadmin price list
   ---------------------------------------------------------------------------- */

/**
 * The live price list. Read from Firestore (cached for a minute per instance);
 * falls back to the built-in defaults when Firestore is unavailable.
 */
export async function getPricing() {
  if (cachedPricing && Date.now() - cachedPricing.fetchedAt < PRICING_MAX_AGE_MS) return cachedPricing;

  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.doc(PRICING_DOC_PATH).get();
      const data = snap.exists ? snap.data() : null;
      cachedPricing = {
        pricing: normalizePricing(data).pricing,
        updatedAt: data?.updatedAt || null,
        updatedBy: data?.updatedBy || null,
        fetchedAt: Date.now()
      };
      return cachedPricing;
    } catch (err) {
      console.warn('🪙 [Pricing] Could not read price list, using defaults:', err.message);
    }
  }

  return cachedPricing || { pricing: normalizePricing(DEFAULT_PRICING).pricing, updatedAt: null, updatedBy: null, fetchedAt: Date.now() };
}

/**
 * Save a new price list (superadmin only; the caller checks the role).
 * Every amount is rounded up to a whole number; out-of-range values are rejected.
 */
export async function savePricing(db, input, user) {
  const { pricing, errors } = normalizePricing(input, { strict: true });
  if (errors.length) return { errors };

  const updatedAt = new Date().toISOString();
  await db.doc(PRICING_DOC_PATH).set({ ...pricing, updatedAt, updatedBy: user.email || user.uid });
  cachedPricing = { pricing, updatedAt, updatedBy: user.email || user.uid, fetchedAt: Date.now() };
  return { pricing, updatedAt };
}

/* ----------------------------------------------------------------------------
   AUD -> USD currency conversion
   ---------------------------------------------------------------------------- */

const FX_SOURCES = [
  {
    name: 'frankfurter.dev (ECB)',
    url: 'https://api.frankfurter.dev/v1/latest?base=AUD&symbols=USD',
    read: data => ({ rate: Number(data?.rates?.USD), rateDate: data?.date || null })
  },
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/AUD',
    read: data => ({ rate: Number(data?.rates?.USD), rateDate: data?.time_last_update_utc || null })
  }
];

async function fetchLiveRate() {
  for (const source of FX_SOURCES) {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { rate, rateDate } = source.read(await response.json());
      // Sanity bounds so a bad feed can never show a wildly wrong conversion
      if (!(rate > 0.3 && rate < 1.3)) throw new Error(`rate ${rate} out of range`);
      return { rate, rateDate, source: source.name, fetchedAt: Date.now() };
    } catch (err) {
      console.warn(`💱 [FX] ${source.name} unavailable:`, err.message);
    }
  }
  return null;
}

function fallbackRate() {
  const direct = Number(process.env.FX_FALLBACK_AUD_USD);
  if (direct > 0) return direct;
  // Older deployments configured the inverse (USD -> AUD) rate
  const inverse = Number(process.env.FX_FALLBACK_USD_AUD);
  if (inverse > 0) return 1 / inverse;
  return DEFAULT_FALLBACK_AUD_USD;
}

const isFresh = entry => entry && Date.now() - entry.fetchedAt < FX_MAX_AGE_MS;

/**
 * AUD -> USD rate, refreshed at most once a day. Cached in memory and, when the server
 * has Firestore access, in platform_settings so all serverless instances share one rate.
 */
export async function getAudToUsdRate() {
  if (isFresh(cachedRate)) return cachedRate;

  const db = getAdminDb();
  let stored = null;
  if (db) {
    try {
      const snap = await db.doc(FX_DOC_PATH).get();
      stored = snap.exists ? snap.data() : null;
      if (isFresh(stored)) {
        cachedRate = stored;
        return cachedRate;
      }
    } catch (err) {
      console.warn('💱 [FX] Could not read cached rate:', err.message);
    }
  }

  const live = await fetchLiveRate();
  if (live) {
    cachedRate = live;
    if (db) db.doc(FX_DOC_PATH).set(live).catch(err => console.warn('💱 [FX] Could not store rate:', err.message));
    return cachedRate;
  }

  // Both feeds down: use the last known rate, then the configured fallback
  const lastKnown = cachedRate || stored;
  if (lastKnown) return lastKnown;
  return { rate: fallbackRate(), rateDate: null, source: 'fallback', fetchedAt: Date.now() };
}

/**
 * USD conversion of an AUD amount for display: 2 decimal places maximum, rounded up to the cent
 */
export const audToUsd = (aud, rate) => convertAudToUsd(aud, rate);

/* ----------------------------------------------------------------------------
   Token quotes
   ---------------------------------------------------------------------------- */

/**
 * Price a number of tokens. Always charged in AUD; usdEstimate is for display only.
 */
export async function quoteTokens(tokens, { pricing, fx } = {}) {
  const count = Number(tokens);
  if (!Number.isInteger(count) || count < MIN_TOKEN_PURCHASE || count > MAX_TOKEN_PURCHASE) {
    throw new RangeError(`Token amount must be a whole number from ${MIN_TOKEN_PURCHASE} to ${MAX_TOKEN_PURCHASE}.`);
  }

  const activePricing = pricing || (await getPricing()).pricing;
  const rate = fx || await getAudToUsdRate();
  const totalAud = count * activePricing.tokenPriceAud;

  return {
    tokens: count,
    currency: BASE_CURRENCY,
    tokenPriceAud: activePricing.tokenPriceAud,
    totalAud,
    totalCents: totalAud * 100,
    usdEstimate: audToUsd(totalAud, rate.rate),
    audToUsd: rate.rate,
    fxDate: rate.rateDate || null,
    fxSource: rate.source || null
  };
}
