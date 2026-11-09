/**
 * It's A Simple Job - Currency, region & price list (browser).
 *
 *  - Everything is priced and invoiced in Australian Dollars (AUD).
 *  - Services and products are priced in tokens set by the superadmin; 1 token = A$1 by default.
 *  - Whole numbers only: every AUD and token amount is rounded up.
 *  - Geolocation sets the visitor's default region. Australia and New Zealand see AUD;
 *    everyone else sees a USD conversion (AUD -> USD at a daily live rate, 2 decimal places
 *    maximum, rounded up to the cent), but is still invoiced and charged in AUD.
 *
 * Other modules use window.iasjCurrency and listen for the 'iasjPricingChanged' event
 * to redraw prices when the region, exchange rate or price list changes.
 */

import {
  DEFAULT_COUNTRY,
  DEFAULT_PRICING,
  GST_PERCENT,
  PRICING_FIELDS,
  SERVICE_LABELS,
  TOKEN_PACK_COUNT,
  convertAudToUsd,
  displayCurrencyFor,
  isAudRegion,
  normalizePricing,
  priceCategoryJob,
  priceCourier,
  priceJob,
  wholeUp
} from '../shared/pricing.js';

const CACHE_KEY = 'iasj_pricing_cache';
const FALLBACK_AUD_USD = 0.70;

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && typeof cached === 'object') return cached;
  } catch (e) {}
  return null;
}

// Storage can be full or blocked (e.g. private browsing); prices still work without the cache
function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      audToUsd: state.audToUsd,
      fxDate: state.fxDate,
      pricing: state.pricing,
      pricingUpdatedAt: state.pricingUpdatedAt
    }));
  } catch (e) {}
}

const cached = readCache();

const state = {
  country: DEFAULT_COUNTRY,
  countrySource: 'default', // default | ip | timezone | gps | saved
  ipCountry: null,
  audToUsd: Number(cached?.audToUsd) > 0 ? Number(cached.audToUsd) : FALLBACK_AUD_USD,
  fxDate: cached?.fxDate || null,
  pricing: normalizePricing(cached?.pricing).pricing,
  pricingUpdatedAt: cached?.pricingUpdatedAt || null,
  loaded: false
};

const fmt = n => wholeUp(n).toLocaleString('en-AU');

function emitChange(reason) {
  try {
    window.dispatchEvent(new CustomEvent('iasjPricingChanged', { detail: { reason } }));
  } catch (e) {
    console.warn('💱 [Currency] Price refresh failed:', e);
  }
}

/* ----------------------------------------------------------------------------
   Loading
   ---------------------------------------------------------------------------- */

let readyResolve;
const ready = new Promise(resolve => { readyResolve = resolve; });

async function load() {
  try {
    const response = await fetch('/api/pricing', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    state.ipCountry = /^[A-Z]{2}$/.test(data.country || '') ? data.country : null;
    if (Number(data.audToUsd) > 0) state.audToUsd = Number(data.audToUsd);
    state.fxDate = data.fxDate || null;
    state.pricing = normalizePricing(data.pricing).pricing;
    state.pricingUpdatedAt = data.pricingUpdatedAt || null;
    writeCache();
  } catch (err) {
    // Static hosting or offline: keep the cached / default price list and fallback rate
    console.warn('💱 [Currency] Live prices unavailable, using saved defaults:', err.message);
  } finally {
    state.loaded = true;
    readyResolve(state);
    emitChange('loaded');
  }
}

/* ----------------------------------------------------------------------------
   Region
   ---------------------------------------------------------------------------- */

/**
 * Set the visitor's region. Called by the geolocation / regional settings code.
 */
function setCountry(country, source = 'saved') {
  const code = String(country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return;
  const changed = code !== state.country;
  state.country = code;
  state.countrySource = source;
  if (changed) emitChange('region');
}

const isAud = () => isAudRegion(state.country);
const displayCurrency = () => displayCurrencyFor(state.country);

/* ----------------------------------------------------------------------------
   Conversions (all whole numbers, rounded up)
   ---------------------------------------------------------------------------- */

const tokenPriceAud = () => state.pricing.tokenPriceAud;
const audForTokens = tokens => wholeUp(tokens) * tokenPriceAud();
const tokensForAud = aud => wholeUp(wholeUp(aud) / tokenPriceAud());
// USD conversion: 2 decimal places maximum, rounded up to the cent (AUD stays whole dollars)
const toUsd = aud => convertAudToUsd(aud, state.audToUsd);

/* ----------------------------------------------------------------------------
   Formatting
   ---------------------------------------------------------------------------- */

const formatAud = (aud, suffix = '') => `$${fmt(aud)} AUD${suffix}`;
const fmtCents = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatUsd = (usd, suffix = '') => `$${fmtCents(usd)} USD${suffix}`;
const formatTokens = (tokens, suffix = '') => `${fmt(tokens)} ${wholeUp(tokens) === 1 ? 'Token' : 'Tokens'}${suffix}`;

/**
 * Money in the visitor's display currency: AUD in Australia / New Zealand, otherwise "≈ $X USD"
 */
function formatMoney(aud, { suffix = '' } = {}) {
  return isAud() ? formatAud(aud, suffix) : `≈ ${formatUsd(toUsd(aud), suffix)}`;
}

/**
 * Tooltip explaining what a displayed price means
 */
function moneyTitle(aud, { suffix = '' } = {}) {
  const tokens = tokensForAud(aud);
  if (isAud()) return `${formatAud(aud, suffix)} • ${formatTokens(tokens, suffix)}. All invoices are in Australian Dollars (AUD).`;
  return `Converted from ${formatAud(aud, suffix)} at today's rate. All invoices are in Australian Dollars (AUD) — you will be charged ${formatAud(aud, suffix)}.`;
}

/**
 * The AUD amount actually charged, shown beside USD conversions for international visitors
 */
function chargedNote(aud) {
  return isAud() ? '' : `Charged as ${formatAud(aud)}`;
}

// Exchange rate as the conversion of A$100 (e.g. "A$100 ≈ US$70.25"), same rounding as every USD price
const rateText = () => `A$100 ≈ US$${fmtCents(toUsd(100))}`;

function disclaimerText() {
  const base = 'All prices, invoices and payments are in Australian Dollars (AUD), in whole dollars, rounded up.';
  if (isAud()) return base;
  return `${base} Prices shown in USD are an approximate conversion at today's exchange rate (${rateText()}), rounded up to the cent, for your information only. Your card provider may apply its own rate and fees.`;
}

/**
 * Standard AUD disclaimer block. Used on price estimates, invoices, checkout and the token wallet.
 */
function disclaimerHtml({ compact = false } = {}) {
  const usdLine = isAud()
    ? ''
    : ` Prices shown in USD are an approximate conversion at today's exchange rate (${rateText()}), rounded up to the cent, for your information only. Your card provider may apply its own rate and fees.`;
  return `
    <div class="aud-disclaimer${compact ? ' aud-disclaimer-compact' : ''}" role="note" data-agent-id="aud-disclaimer" data-testid="aud-disclaimer">
      <i class="fa-solid fa-circle-info"></i>
      <span><strong>All invoices are in Australian Dollars (AUD).</strong> AUD amounts are whole dollars, rounded up.${usdLine}
      <a href="/terms.html#currency" target="_blank" rel="noopener">Terms of Service</a></span>
    </div>
  `;
}

/* ----------------------------------------------------------------------------
   Pricing (bound to the live price list)
   ---------------------------------------------------------------------------- */

const getPricing = () => state.pricing;

/* ----------------------------------------------------------------------------
   Superadmin: save the price list
   ---------------------------------------------------------------------------- */

async function savePricing(newPricing) {
  const idToken = await window.firebaseService?.getIdToken?.();
  if (!idToken) throw new Error('Please sign in with your superadmin Google account to change prices.');

  let response;
  try {
    response = await fetch('/api/pricing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(newPricing)
    });
  } catch (err) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let data = null;
  try { data = await response.json(); } catch (e) {}
  if (!response.ok || !data?.pricing) throw new Error(data?.error || `Could not save prices (HTTP ${response.status}).`);

  state.pricing = normalizePricing(data.pricing).pricing;
  state.pricingUpdatedAt = data.updatedAt || new Date().toISOString();
  writeCache();
  emitChange('pricing');
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
  formatWhole: fmt,
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
  savePricing,
  priceJob: args => priceJob(args, state.pricing),
  priceCategoryJob: args => priceCategoryJob(args, state.pricing),
  priceCourier: args => priceCourier(args, state.pricing),
  PRICING_FIELDS,
  SERVICE_LABELS,
  TOKEN_PACK_COUNT,
  GST_PERCENT,
  DEFAULT_PRICING
};

window.iasjCurrency = iasjCurrency;
load();
