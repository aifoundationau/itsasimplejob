/**
 * It's A Simple Job - AUD-Only Currency & SuperAdmin Distance-Tier Token Pricing (Browser)
 *
 *  - Web App uses Australian Dollars (AUD) ONLY.
 *  - Customers register as Supporters, pay a 1 Token booking fee (SuperAdmin-adjustable), and pay the Courier Driver directly via PayID.
 *  - Couriers buy Tokens in AUD. Every customer order charges the courier tokens based on route distance:
 *      • 0 – 10 km (1 Token)
 *      • 11 – 20 km (2 Tokens)
 *      • 21 – 40 km (3 Tokens)
 *      • 41 – 60 km (4 Tokens)
 *      • 61+ km (5 Tokens)
 */

import {
  DEFAULT_COUNTRY,
  DEFAULT_PRICING,
  GST_PERCENT,
  PICKUP_TIME_SLOTS_9AM_TO_4PM,
  PRICING_FIELDS,
  SERVICE_LABELS,
  TOKEN_PACK_COUNT,
  calculateDriverCourierPrice,
  convertAudToUsd,
  displayCurrencyFor,
  getDriverOrderTokenCharge,
  getSupporterBookingFeeTokens,
  isAudRegion,
  normalizePricing,
  priceCategoryJob,
  priceCourier,
  priceJob,
  roundUpToCents,
  wholeUp
} from '../shared/pricing.js';

const CACHE_KEY = 'iasj_pricing_cache';

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    const localTiersRaw = localStorage.getItem('iasj_driver_order_tokens');
    const localTokenAud = localStorage.getItem('iasj_token_price_aud');
    const localSupporterFee = localStorage.getItem('iasj_supporter_booking_fee_tokens');
    const localEconomyRaw = localStorage.getItem('iasj_economy_controls');
    let p = cached?.pricing || {};
    if (localTiersRaw) {
      try {
        const localTiers = JSON.parse(localTiersRaw);
        p.driverOrderTokens = { ...(p.driverOrderTokens || {}), ...localTiers };
      } catch (e) {}
    }
    if (localTokenAud) {
      p.tokenPriceAud = Math.max(1, Math.round(Number(localTokenAud) || 1));
    }
    if (localSupporterFee !== null && localSupporterFee !== '') {
      p.supporterBookingFeeTokens = Math.max(0, Math.round(Number(localSupporterFee) || 0));
    }
    if (localEconomyRaw) {
      try {
        p.economyControls = { ...(p.economyControls || {}), ...JSON.parse(localEconomyRaw) };
      } catch (e) {}
    }
    if (cached || localTiersRaw || localTokenAud || localSupporterFee !== null || localEconomyRaw) {
      return { pricing: normalizePricing(p).pricing, pricingUpdatedAt: cached?.pricingUpdatedAt || new Date().toISOString() };
    }
  } catch (e) {}
  return null;
}

function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      pricing: state.pricing,
      pricingUpdatedAt: state.pricingUpdatedAt
    }));
    if (state.pricing?.driverOrderTokens) {
      localStorage.setItem('iasj_driver_order_tokens', JSON.stringify(state.pricing.driverOrderTokens));
    }
    if (state.pricing?.tokenPriceAud) {
      localStorage.setItem('iasj_token_price_aud', String(state.pricing.tokenPriceAud));
    }
    if (state.pricing?.supporterBookingFeeTokens !== undefined) {
      localStorage.setItem('iasj_supporter_booking_fee_tokens', String(state.pricing.supporterBookingFeeTokens));
    }
    if (state.pricing?.economyControls) {
      localStorage.setItem('iasj_economy_controls', JSON.stringify(state.pricing.economyControls));
    }
  } catch (e) {}
}

const cached = readCache();

const state = {
  country: DEFAULT_COUNTRY,
  countrySource: 'default',
  ipCountry: 'AU',
  audToUsd: 1,
  fxDate: null,
  pricing: normalizePricing(cached?.pricing).pricing,
  pricingUpdatedAt: cached?.pricingUpdatedAt || null,
  loaded: false
};

const fmtWhole = n => wholeUp(n).toLocaleString('en-AU');
const fmtAudValue = n => {
  const num = Number(n) || 0;
  if (Number.isInteger(num)) return num.toLocaleString('en-AU');
  return num.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function emitChange(reason) {
  try {
    window.dispatchEvent(new CustomEvent('iasjPricingChanged', { detail: { reason } }));
  } catch (e) {
    console.warn('💱 [Currency] Price refresh failed:', e);
  }
}

let readyResolve;
const ready = new Promise(resolve => { readyResolve = resolve; });

async function load() {
  try {
    const response = await fetch('/api/pricing', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    state.pricing = normalizePricing(data.pricing).pricing;
    state.pricingUpdatedAt = data.pricingUpdatedAt || null;
    writeCache();
  } catch (err) {
    // Fallback: check Firestore directly
    try {
      const firestorePricing = await window.firebaseService?.getPlatformPricingFromFirestore?.();
      if (firestorePricing) {
        state.pricing = normalizePricing(firestorePricing).pricing;
        state.pricingUpdatedAt = firestorePricing.updatedAt || null;
        if (firestorePricing.freeDriverHourUntil !== undefined && typeof window !== 'undefined' && window.superadminDB) {
          const remoteUntil = Number(firestorePricing.freeDriverHourUntil) || 0;
          const localUntil = Number(window.superadminDB.getFreeDriverHourUntil?.() || 0);
          const remoteUpdatedMs = Date.parse(firestorePricing.updatedAt || '') || 0;
          if (remoteUntil > Date.now() && remoteUntil > localUntil) {
            window.superadminDB.activateFreeDriverHour(Math.max(1000, remoteUntil - Date.now()));
          } else if (remoteUntil <= Date.now() && (localUntil <= Date.now() || (remoteUpdatedMs > 0 && localUntil - 3600000 < remoteUpdatedMs))) {
            window.superadminDB.endFreeDriverHour();
          }
          window.renderSuperadminFreeDriverHourUI?.();
        }
        writeCache();
      }
    } catch (fe) {}
    console.warn('💱 [Currency] Using saved AUD defaults:', err.message);
  } finally {
    state.loaded = true;
    readyResolve(state);
    emitChange('loaded');
  }
}

function setCountry() {
  state.country = 'AU';
  state.countrySource = 'au_only';
}

const isAud = () => true;
const displayCurrency = () => 'AUD';

const tokenPriceAud = () => state.pricing.tokenPriceAud;
const audForTokens = tokens => wholeUp(tokens) * tokenPriceAud();
const tokensForAud = aud => wholeUp(wholeUp(aud) / tokenPriceAud());
const toUsd = aud => wholeUp(aud);

const formatAud = (aud, suffix = '') => `$${fmtAudValue(aud)} AUD${suffix}`;
const formatUsd = (aud, suffix = '') => formatAud(aud, suffix);
const formatTokens = (tokens, suffix = '') => `${fmtWhole(tokens)} ${wholeUp(tokens) === 1 ? 'Token' : 'Tokens'}${suffix}`;

function formatMoney(aud, { suffix = '' } = {}) {
  return formatAud(aud, suffix);
}

function moneyTitle(aud, { suffix = '' } = {}) {
  return `${formatAud(aud, suffix)} • Paid directly in Australian Dollars (AUD).`;
}

function chargedNote() {
  return '';
}

const rateText = () => 'AUD Only';

function disclaimerText() {
  return 'All prices and driver PayID payments are in Australian Dollars (AUD) only. Customers pay the courier driver directly via PayID.';
}

function disclaimerHtml({ compact = false } = {}) {
  return `
    <div class="aud-disclaimer${compact ? ' aud-disclaimer-compact' : ''}" role="note" data-agent-id="aud-disclaimer" data-testid="aud-disclaimer">
      <i class="fa-solid fa-circle-info"></i>
      <span><strong>AUD Only — Direct Driver PayID Settlement:</strong> Supporters pay a 1 Token booking fee and pay the selected driver directly via PayID in Australian Dollars (AUD). Couriers pay distance-tier tokens per order (0–10km, 11–20km, 21–40km, 41–60km, 61+km).</span>
    </div>
  `;
}

const getPricing = () => state.pricing;

function updateLocalPricing(partialPricing) {
  const merged = {
    ...state.pricing,
    ...(partialPricing || {}),
    driverOrderTokens: {
      ...(state.pricing.driverOrderTokens || {}),
      ...(partialPricing?.driverOrderTokens || {})
    },
    economyControls: {
      ...(state.pricing.economyControls || {}),
      ...(partialPricing?.economyControls || {})
    }
  };
  state.pricing = normalizePricing(merged).pricing;
  state.pricingUpdatedAt = new Date().toISOString();
  writeCache();
  emitChange('pricing');
  return state.pricing;
}

async function savePricing(newPricing) {
  // Always persist locally immediately so SuperAdmin changes work offline/locally as well
  updateLocalPricing(newPricing);

  // Persist directly to Firestore database platform_settings/pricing
  try {
    const gUser = window.firebaseService?.getCurrentGoogleUser?.();
    if (window.firebaseService?.savePlatformPricingToFirestore) {
      await window.firebaseService.savePlatformPricingToFirestore(state.pricing, gUser?.email || 'support@aifoundation.net.au');
    }
  } catch (e) {}

  const idToken = await window.firebaseService?.getIdToken?.();
  if (!idToken) {
    return state.pricing;
  }

  try {
    const response = await fetch('/api/pricing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(newPricing)
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.pricing) {
      state.pricing = normalizePricing(data.pricing).pricing;
      state.pricingUpdatedAt = data.updatedAt || new Date().toISOString();
      writeCache();
      emitChange('pricing');
    }
  } catch (err) {
    console.warn('Saved pricing to local storage fallback:', err.message);
  }
  return state.pricing;
}

export const iasjCurrency = {
  state,
  ready,
  load,
  setCountry,
  isAud,
  displayCurrency,
  tokenPriceAud,
  audForTokens,
  tokensForAud,
  toUsd,
  wholeUp,
  roundUpToCents,
  formatWhole: fmtWhole,
  formatAud,
  formatUsd,
  formatTokens,
  formatMoney,
  moneyTitle,
  chargedNote,
  rateText,
  disclaimerText,
  disclaimerHtml,
  getPricing,
  updateLocalPricing,
  savePricing,
  getSupporterBookingFeeTokens: () => getSupporterBookingFeeTokens(state.pricing),
  getDriverOrderTokenCharge: km => {
    const base = getDriverOrderTokenCharge(km, state.pricing);
    if (typeof window !== 'undefined' && window.superadminDB?.isFreeDriverHourActive?.()) {
      return {
        ...base,
        baseTierTokens: base.tokens,
        tokens: 0,
        audEquivalent: 0,
        freeHourActive: true,
        tierLabel: `${base.tierLabel} (FREE HOUR — 0 Tokens)`
      };
    }
    return base;
  },
  calculateDriverCourierPrice: args => calculateDriverCourierPrice(args, state.pricing),
  priceJob: args => priceJob(args, state.pricing),
  priceCategoryJob: args => priceCategoryJob(args, state.pricing),
  priceCourier: args => priceCourier(args, state.pricing),
  PICKUP_TIME_SLOTS_9AM_TO_4PM,
  PRICING_FIELDS,
  SERVICE_LABELS,
  TOKEN_PACK_COUNT,
  GST_PERCENT,
  DEFAULT_PRICING
};

window.iasjCurrency = iasjCurrency;
load();
