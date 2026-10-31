/**
 * It's A Simple Job - Token pricing.
 * 1 token = US$1. Visitors in Australia see and pay the AUD equivalent at a daily live rate;
 * everyone else sees and pays USD.
 */

import { getAdminDb } from './firebase-admin.js';

export const TOKEN_PRICE_USD = 1;
export const MIN_TOKEN_PURCHASE = 1;
export const MAX_TOKEN_PURCHASE = 10000;
export const TOKEN_PACKS = [10, 25, 50, 100];

const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FX_DOC_PATH = 'platform_settings/fx_usd_aud';
const DEFAULT_FALLBACK_RATE = 1.45;

let cachedRate = null; // { rate, rateDate, source, fetchedAt }

const FX_SOURCES = [
  {
    name: 'frankfurter.dev (ECB)',
    url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD',
    read: data => ({ rate: Number(data?.rates?.AUD), rateDate: data?.date || null })
  },
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    read: data => ({ rate: Number(data?.rates?.AUD), rateDate: data?.time_last_update_utc || null })
  }
];

async function fetchLiveRate() {
  for (const source of FX_SOURCES) {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { rate, rateDate } = source.read(await response.json());
      // Sanity bounds so a bad feed can never misprice tokens
      if (!(rate > 0.8 && rate < 3)) throw new Error(`rate ${rate} out of range`);
      return { rate, rateDate, source: source.name, fetchedAt: Date.now() };
    } catch (err) {
      console.warn(`💱 [FX] ${source.name} unavailable:`, err.message);
    }
  }
  return null;
}

const isFresh = entry => entry && Date.now() - entry.fetchedAt < FX_MAX_AGE_MS;

/**
 * USD -> AUD rate, refreshed at most once a day. Cached in memory and, when the server
 * has Firestore access, in platform_settings so all serverless instances share one rate.
 */
export async function getUsdToAudRate() {
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

  const fallbackRate = Number(process.env.FX_FALLBACK_USD_AUD) || DEFAULT_FALLBACK_RATE;
  return { rate: fallbackRate, rateDate: null, source: 'fallback', fetchedAt: Date.now() };
}

/**
 * Price a number of tokens in AUD or USD
 */
export async function quoteTokens(tokens, currency) {
  const count = Math.floor(Number(tokens));
  if (!Number.isFinite(count) || count < MIN_TOKEN_PURCHASE || count > MAX_TOKEN_PURCHASE) {
    throw new RangeError(`Token amount must be between ${MIN_TOKEN_PURCHASE} and ${MAX_TOKEN_PURCHASE}.`);
  }

  const usdCents = Math.round(count * TOKEN_PRICE_USD * 100);
  if (currency !== 'AUD') {
    return { tokens: count, currency: 'USD', totalCents: usdCents, total: usdCents / 100, fxRate: 1 };
  }

  const fx = await getUsdToAudRate();
  const totalCents = Math.round(usdCents * fx.rate);
  return {
    tokens: count,
    currency: 'AUD',
    totalCents,
    total: totalCents / 100,
    fxRate: fx.rate,
    fxDate: fx.rateDate,
    fxSource: fx.source
  };
}
