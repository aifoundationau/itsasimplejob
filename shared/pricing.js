/**
 * It's A Simple Job - Shared pricing rules (used by the browser bundle and the /api functions).
 *
 * Business rules:
 *  - Everything is priced and invoiced in Australian Dollars (AUD).
 *  - Services and products are priced in tokens. The superadmin sets every token amount
 *    and the AUD price of one token (default A$1).
 *  - Whole numbers only: every calculated AUD and token amount is rounded UP to a whole number.
 *  - Visitors in Australia and New Zealand see AUD; everyone else sees a USD conversion
 *    (2 decimal places maximum, rounded up to the cent), but they are still invoiced and charged in AUD.
 */

export const BASE_CURRENCY = 'AUD';
export const GST_PERCENT = 10;
export const AUD_REGIONS = ['AU', 'NZ'];
export const DEFAULT_COUNTRY = 'AU';
export const MAX_COURIER_WEIGHT_KG = 20;
export const MIN_TOKEN_PURCHASE = 1;
export const MAX_TOKEN_PURCHASE = 10000;

export const SERVICE_LABELS = {
  plumbing: 'Plumbing & Water Services',
  electrical: 'Licensed Electrical Services',
  handyman: 'General Handyman & Assembly',
  garden: 'Garden & Lawn Maintenance',
  painting: 'Painting & Surface Repairs',
  appliance: 'Appliance Repair & Installation',
  courier: 'Courier & Express Freight'
};

export const DEFAULT_PRICING = Object.freeze({
  tokenPriceAud: 1,
  hourlyTokens: Object.freeze({
    plumbing: 98,
    electrical: 110,
    handyman: 75,
    garden: 68,
    painting: 72,
    appliance: 90,
    courier: 55
  }),
  fees: Object.freeze({
    calloutStandard: 35,
    calloutUrgent: 55,
    calloutCourier: 25,
    materialsBuffer: 25,
    // Tokens to send a message to another user. Messages to (and from) the superadmin are always free.
    message: 1
  }),
  courier: Object.freeze({
    baseLoading: 35,
    perKm: 2,
    includedKm: 20,
    extraKmSurchargePct: 10,
    asapSurchargePct: 20
  }),
  tokenPacks: Object.freeze([10, 25, 50, 100])
});

/**
 * Every superadmin-editable number. Drives validation here and the price list editor in the browser.
 */
export const PRICING_FIELDS = [
  { path: 'tokenPriceAud', group: 'Tokens', label: 'Price of 1 token', unit: 'AUD', min: 1, max: 1000 },

  ...Object.keys(DEFAULT_PRICING.hourlyTokens).map(key => ({
    path: `hourlyTokens.${key}`, group: 'Trade services (hourly rate)', label: SERVICE_LABELS[key], unit: 'tokens / hr', min: 1, max: 5000
  })),

  { path: 'fees.calloutStandard', group: 'Job fees', label: 'Standard callout & vehicle transit', unit: 'tokens', min: 0, max: 5000 },
  { path: 'fees.calloutUrgent', group: 'Job fees', label: 'Urgent / emergency callout', unit: 'tokens', min: 0, max: 5000 },
  { path: 'fees.calloutCourier', group: 'Job fees', label: 'Courier callout', unit: 'tokens', min: 0, max: 5000 },
  { path: 'fees.materialsBuffer', group: 'Job fees', label: 'Consumables / materials buffer', unit: 'tokens', min: 0, max: 5000 },

  { path: 'fees.message', group: 'Messages', label: 'Message to another user (messages to the superadmin are always free)', unit: 'tokens', min: 0, max: 100 },

  { path: 'courier.baseLoading', group: 'Courier', label: 'Base loading & dispatch', unit: 'tokens', min: 0, max: 5000 },
  { path: 'courier.perKm', group: 'Courier', label: 'Distance rate', unit: 'tokens / km', min: 1, max: 500 },
  { path: 'courier.includedKm', group: 'Courier', label: 'Distance charged at the standard rate', unit: 'km', min: 0, max: 5000 },
  { path: 'courier.extraKmSurchargePct', group: 'Courier', label: 'Surcharge on each km after that', unit: '%', min: 0, max: 100 },
  { path: 'courier.asapSurchargePct', group: 'Courier', label: 'ASAP priority surcharge', unit: '%', min: 0, max: 100 }
];

export const TOKEN_PACK_COUNT = DEFAULT_PRICING.tokenPacks.length;

/* ----------------------------------------------------------------------------
   Messages between users (Admin Page > Messages)
   ---------------------------------------------------------------------------- */

export const SUPERADMIN_MAILBOX = 'superadmin';
export const MESSAGE_SUBJECT_MAX = 120;
export const MESSAGE_BODY_MAX = 2000;

/**
 * Tokens charged for one message. Messages to the superadmin are always free,
 * and so are the superadmin's own messages (replies to refund requests and the like).
 */
export function messagePriceTokens(pricing, { toSuperadmin, fromSuperadmin }) {
  if (toSuperadmin || fromSuperadmin) return 0;
  return wholeUp(pricing?.fees?.message ?? DEFAULT_PRICING.fees.message);
}

/**
 * Round any amount UP to a whole number. Floating-point noise is removed first,
 * so 150 * 0.1 (= 15.000000000000002) becomes 15, not 16.
 */
export function wholeUp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(Math.round(n * 1e6) / 1e6);
}

/**
 * Round UP to the next cent (2 decimal places maximum). Only used for USD conversions;
 * every AUD amount and token amount stays a whole number.
 */
export function roundUpToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(Math.round(n * 1e6) / 1e4) / 100;
}

/**
 * USD conversion of an AUD amount for display (the AUD amount is what is charged)
 */
export function convertAudToUsd(aud, audToUsdRate) {
  return roundUpToCents(wholeUp(aud) * Number(audToUsdRate));
}

export function isAudRegion(country) {
  return AUD_REGIONS.includes(String(country || '').toUpperCase());
}

export function displayCurrencyFor(country) {
  return isAudRegion(country) ? 'AUD' : 'USD';
}

const getPath = (obj, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);

function setPath(obj, path, value) {
  const keys = path.split('.');
  let node = obj;
  keys.slice(0, -1).forEach(key => { node = node[key]; });
  node[keys[keys.length - 1]] = value;
}

const clonePricing = pricing => JSON.parse(JSON.stringify(pricing));

/**
 * Clean a price list into whole numbers.
 * strict: report every missing or out-of-range value (used when the superadmin saves).
 * not strict: silently fall back to the defaults (used when reading stored settings).
 */
export function normalizePricing(input, { strict = false } = {}) {
  const pricing = clonePricing(DEFAULT_PRICING);
  const errors = [];
  const source = input && typeof input === 'object' ? input : {};

  for (const field of PRICING_FIELDS) {
    const raw = getPath(source, field.path);
    if (raw === undefined || raw === null || raw === '') {
      if (strict) errors.push(`${field.label} is required.`);
      continue;
    }
    const value = wholeUp(raw);
    if (!Number.isFinite(Number(raw)) || value < field.min || value > field.max) {
      if (strict) errors.push(`${field.label} must be a whole number from ${field.min} to ${field.max} ${field.unit}.`);
      continue;
    }
    setPath(pricing, field.path, value);
  }

  const packs = Array.isArray(source.tokenPacks) ? source.tokenPacks.map(wholeUp) : null;
  const packsValid = packs
    && packs.length === TOKEN_PACK_COUNT
    && packs.every(p => p >= MIN_TOKEN_PURCHASE && p <= MAX_TOKEN_PURCHASE)
    && new Set(packs).size === packs.length;
  if (packsValid) {
    pricing.tokenPacks = [...packs].sort((a, b) => a - b);
  } else if (strict) {
    errors.push(`Token packs must be ${TOKEN_PACK_COUNT} different whole numbers from ${MIN_TOKEN_PURCHASE} to ${MAX_TOKEN_PURCHASE}.`);
  }

  return { pricing, errors };
}

/**
 * Turn token line items into an AUD tax invoice. Each line's AUD amount is tokens x token price.
 * GST is 10% of the AUD subtotal (rounded up), and the token total is the AUD total in tokens (rounded up).
 */
function buildInvoice(lines, tokenPriceAud) {
  const price = wholeUp(tokenPriceAud) || 1;
  const pricedLines = lines.map(line => ({ ...line, tokens: wholeUp(line.tokens), aud: wholeUp(line.tokens) * price }));
  const subtotalTokens = pricedLines.reduce((sum, line) => sum + line.tokens, 0);
  const subtotalAud = subtotalTokens * price;
  const gstAud = wholeUp(subtotalAud * GST_PERCENT / 100);
  const totalAud = subtotalAud + gstAud;
  const totalTokens = wholeUp(totalAud / price);
  return {
    currency: BASE_CURRENCY,
    tokenPriceAud: price,
    gstPercent: GST_PERCENT,
    lines: pricedLines,
    subtotal: subtotalAud,
    gst: gstAud,
    estimatedTotal: totalAud,
    tokens: {
      subtotal: subtotalTokens,
      gst: totalTokens - subtotalTokens,
      estimatedTotal: totalTokens
    }
  };
}

/**
 * Price a trade job. hourlyTokens is the trade's hourly rate in tokens; hours are rounded up to whole hours.
 * Returns AUD amounts in the fields the invoice, Stripe checkout and dispatch feed already use.
 */
export function priceJob({ hourlyTokens, hours, calloutTokens, materialsTokens, categoryName = 'Labour' }, pricing = DEFAULT_PRICING) {
  const billableHours = Math.max(1, wholeUp(hours));
  const rateTokens = wholeUp(hourlyTokens);
  const invoice = buildInvoice([
    { key: 'labour', label: `${categoryName} - Labour (${billableHours} hr${billableHours === 1 ? '' : 's'})`, tokens: rateTokens * billableHours },
    { key: 'callout', label: 'Insured Vehicle Transit & Mobilisation', tokens: calloutTokens },
    { key: 'materials', label: 'Consumables / Materials Buffer', tokens: materialsTokens }
  ], pricing.tokenPriceAud);

  const [labour, callout, materials] = invoice.lines;
  return {
    ...invoice,
    hours: billableHours,
    hourlyRate: rateTokens * invoice.tokenPriceAud,
    baseLabour: labour.aud,
    calloutFee: callout.aud,
    materialsEstimate: materials.aud,
    tokens: {
      ...invoice.tokens,
      hourlyRate: rateTokens,
      baseLabour: labour.tokens,
      calloutFee: callout.tokens,
      materialsEstimate: materials.tokens
    }
  };
}

/**
 * Price a trade job from the price list for a category (used by the AI booking agent)
 */
export function priceCategoryJob({ category, hours, isUrgent, hourlyTokens, categoryName }, pricing = DEFAULT_PRICING) {
  const key = Object.prototype.hasOwnProperty.call(pricing.hourlyTokens, category) ? category : 'handyman';
  const calloutTokens = isUrgent
    ? pricing.fees.calloutUrgent
    : (key === 'courier' ? pricing.fees.calloutCourier : pricing.fees.calloutStandard);
  return priceJob({
    hourlyTokens: hourlyTokens ?? pricing.hourlyTokens[key],
    hours,
    calloutTokens,
    materialsTokens: key === 'courier' ? 0 : pricing.fees.materialsBuffer,
    categoryName: categoryName || SERVICE_LABELS[key]
  }, pricing);
}

/**
 * Price a courier run. Distance is rounded up to whole km.
 */
export function priceCourier({ distanceKm, isAsap }, pricing = DEFAULT_PRICING) {
  const c = pricing.courier;
  const km = Math.max(1, wholeUp(distanceKm));
  const standardKm = Math.min(km, c.includedKm);
  const extraKm = km - standardKm;

  const baseTokens = c.baseLoading;
  const distanceTokens = standardKm * c.perKm + wholeUp(extraKm * c.perKm * (100 + c.extraKmSurchargePct) / 100);
  const asapTokens = isAsap ? wholeUp((baseTokens + distanceTokens) * c.asapSurchargePct / 100) : 0;

  const lines = [
    { key: 'base', label: 'Base Loading & Dispatch', tokens: baseTokens },
    { key: 'distance', label: `Distance Charge (${km} km)`, tokens: distanceTokens }
  ];
  if (isAsap) lines.push({ key: 'asap', label: `ASAP Priority Dispatch (+${c.asapSurchargePct}%)`, tokens: asapTokens });

  const invoice = buildInvoice(lines, pricing.tokenPriceAud);
  const line = key => invoice.lines.find(l => l.key === key) || { aud: 0, tokens: 0 };
  return {
    ...invoice,
    distanceKm: km,
    standardKm,
    extraKm,
    isAsap: !!isAsap,
    perKmTokens: c.perKm,
    extraKmSurchargePct: c.extraKmSurchargePct,
    asapSurchargePct: c.asapSurchargePct,
    // Fields the invoice, Stripe checkout and dispatch feed already use
    calloutFee: line('base').aud,
    baseLabour: line('distance').aud + line('asap').aud,
    materialsEstimate: 0
  };
}
