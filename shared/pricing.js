/**
 * It's A Simple Job - Courier-Only Shared Pricing & Driver Token Rules
 * (Used by browser bundle and /api serverless functions)
 *
 * Business Rules:
 *  - Web App uses Australian Dollars (AUD) ONLY.
 *  - Customers register as Supporters, pay a 1 Token booking fee (SuperAdmin-adjustable), and pay the selected Courier Driver directly via PayID.
 *  - Each Courier Driver sets their own:
 *      • Per-km rate ($ AUD / km)
 *      • Same-day fee ($ AUD)
 *      • Urgent fee ($ AUD)
 *      • Max pickup weight (kg) & Max package dimensions: Height, Width, Length (cm)
 *  - Couriers buy Tokens in AUD. Every customer order charges the courier tokens based on route distance:
 *      • 0 – 10 km (1 Token default)
 *      • 11 – 20 km (2 Tokens default)
 *      • 21 – 40 km (3 Tokens default)
 *      • 41 – 60 km (4 Tokens default)
 *      • 61+ km (5 Tokens default)
 *    SuperAdmin decides all token prices (Supporter booking fee, all 5 courier tiers, AUD price per token) and currency/token toggles.
 */

export const BASE_CURRENCY = 'AUD';
export const GST_PERCENT = 10;
export const AUD_REGIONS = ['AU'];
export const DEFAULT_COUNTRY = 'AU';
export const MAX_COURIER_WEIGHT_KG = 5000;
export const MIN_TOKEN_PURCHASE = 1;
export const MAX_TOKEN_PURCHASE = 10000;

export const PICKUP_TIME_SLOTS_9AM_TO_4PM = Object.freeze([
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '01:00 PM',
  '01:30 PM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM'
]);

export const SERVICE_LABELS = {
  courier: 'Direct Driver Courier Service'
};

export const DEFAULT_PRICING = Object.freeze({
  tokenPriceAud: 1,
  supporterBookingFeeTokens: 1,
  driverOrderTokens: Object.freeze({
    tier0to10km: 1,
    tier11to20km: 2,
    tier21to40km: 3,
    tier41to60km: 4,
    tier61PlusKm: 5
  }),
  economyControls: Object.freeze({
    isTokenSystemEnabled: true,
    isAudEnabled: true,
    isUsdEnabled: false
  }),
  hourlyTokens: Object.freeze({
    courier: 55
  }),
  fees: Object.freeze({
    calloutStandard: 0,
    calloutUrgent: 0,
    calloutCourier: 0,
    materialsBuffer: 0,
    message: 1
  }),
  courier: Object.freeze({
    baseLoading: 0,
    perKm: 2,
    includedKm: 20,
    extraKmSurchargePct: 0,
    asapSurchargePct: 0
  }),
  tokenPacks: Object.freeze([10, 50, 100])
});

/**
 * SuperAdmin editable fields (AUD only + Supporter Booking Fee + 5 Courier Distance Bracket Token Tiers)
 */
export const PRICING_FIELDS = [
  { path: 'tokenPriceAud', group: 'Token Economy (AUD Only)', label: 'AUD Price of 1 Token', unit: 'AUD', min: 1, max: 1000 },
  { path: 'supporterBookingFeeTokens', group: 'Supporter Booking Fee (Customer)', label: 'Customer (Supporter) Booking Fee per Order', unit: 'tokens', min: 0, max: 100 },

  { path: 'driverOrderTokens.tier0to10km', group: 'Courier Driver Distance Tiers', label: '0 – 10 km Delivery Charge', unit: 'tokens', min: 0, max: 1000 },
  { path: 'driverOrderTokens.tier11to20km', group: 'Courier Driver Distance Tiers', label: '11 – 20 km Delivery Charge', unit: 'tokens', min: 0, max: 1000 },
  { path: 'driverOrderTokens.tier21to40km', group: 'Courier Driver Distance Tiers', label: '21 – 40 km Delivery Charge', unit: 'tokens', min: 0, max: 1000 },
  { path: 'driverOrderTokens.tier41to60km', group: 'Courier Driver Distance Tiers', label: '41 – 60 km Delivery Charge', unit: 'tokens', min: 0, max: 1000 },
  { path: 'driverOrderTokens.tier61PlusKm', group: 'Courier Driver Distance Tiers', label: '61+ km Delivery Charge', unit: 'tokens', min: 0, max: 1000 },

  { path: 'fees.message', group: 'Platform Messaging', label: 'Message to another user (messages to SuperAdmin are always free)', unit: 'tokens', min: 0, max: 100 }
];

export const TOKEN_PACK_COUNT = DEFAULT_PRICING.tokenPacks.length;

export const SUPERADMIN_MAILBOX = 'superadmin';
export const MESSAGE_SUBJECT_MAX = 120;
export const MESSAGE_BODY_MAX = 2000;

export function wholeUp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(Math.round(n * 1e6) / 1e6);
}

export function roundUpToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(Math.round(n * 1e6) / 1e4) / 100;
}

/**
 * Web App uses AUD only.
 */
export function convertAudToUsd(aud) {
  return wholeUp(aud);
}

export function isAudRegion() {
  return true;
}

export function displayCurrencyFor() {
  return 'AUD';
}

export function messagePriceTokens(pricing, { toSuperadmin, fromSuperadmin }) {
  if (toSuperadmin || fromSuperadmin) return 0;
  return wholeUp(pricing?.fees?.message ?? DEFAULT_PRICING.fees.message);
}

/**
 * Supporter (Customer) Booking Fee in whole tokens (default: 1 Token).
 */
export function getSupporterBookingFeeTokens(pricing = DEFAULT_PRICING) {
  const tokenPriceAud = Math.max(1, wholeUp(pricing?.tokenPriceAud ?? DEFAULT_PRICING.tokenPriceAud));
  if (pricing?.economyControls?.isTokenSystemEnabled === false) {
    return { tokens: 0, tokenPriceAud, audCost: 0 };
  }
  const tokens = Math.max(0, wholeUp(pricing?.supporterBookingFeeTokens ?? DEFAULT_PRICING.supporterBookingFeeTokens));
  return {
    tokens,
    tokenPriceAud,
    audCost: tokens * tokenPriceAud
  };
}

/**
 * Determine which distance bracket a courier route falls into and how many tokens the courier is charged.
 * Brackets (default tokens):
 *  - 0–10 km  → 1 Token
 *  - 11–20 km → 2 Tokens
 *  - 21–40 km → 3 Tokens
 *  - 41–60 km → 4 Tokens
 *  - 61+ km   → 5 Tokens
 */
export function getDriverOrderTokenCharge(distanceKm, pricing = DEFAULT_PRICING) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const tiers = pricing?.driverOrderTokens || DEFAULT_PRICING.driverOrderTokens;
  const tokenPriceAud = Math.max(1, wholeUp(pricing?.tokenPriceAud ?? DEFAULT_PRICING.tokenPriceAud));
  const tokensEnabled = pricing?.economyControls?.isTokenSystemEnabled !== false;

  const makeTier = (tierKey, tierLabel, rawTokens, defaultTokens) => {
    const tokens = tokensEnabled ? Math.max(0, wholeUp(rawTokens ?? defaultTokens)) : 0;
    return {
      tierKey,
      tierLabel,
      tokens,
      tokenPriceAud,
      audCost: tokens * tokenPriceAud
    };
  };

  if (km <= 10) {
    return makeTier('tier0to10km', '0–10 km', tiers.tier0to10km, DEFAULT_PRICING.driverOrderTokens.tier0to10km);
  }
  if (km <= 20) {
    return makeTier('tier11to20km', '11–20 km', tiers.tier11to20km, DEFAULT_PRICING.driverOrderTokens.tier11to20km);
  }
  if (km <= 40) {
    return makeTier('tier21to40km', '21–40 km', tiers.tier21to40km, DEFAULT_PRICING.driverOrderTokens.tier21to40km);
  }
  if (km <= 60) {
    return makeTier('tier41to60km', '41–60 km', tiers.tier41to60km, DEFAULT_PRICING.driverOrderTokens.tier41to60km);
  }
  return makeTier('tier61PlusKm', '61+ km', tiers.tier61PlusKm, DEFAULT_PRICING.driverOrderTokens.tier61PlusKm);
}

/**
 * Calculate the customer's AUD price for a specific driver based on the driver's own rates:
 *  - distanceKm * driver.perKmRateAud
 *  - + driver.sameDayFeeAud (if speedTier === 'same_day')
 *  - + driver.urgentFeeAud (if speedTier === 'urgent')
 */
export function calculateDriverCourierPrice(
  {
    distanceKm,
    speedTier = 'standard',
    driver = {},
    deliveryMode = 'auto'
  },
  pricing = DEFAULT_PRICING
) {
  const km = Math.max(1, Math.round((Number(distanceKm) || 1) * 10) / 10);

  // Determine if bicycle mode rates apply
  const useBicycle = (deliveryMode === 'bicycle' && driver.hasBicycleCourier) ||
                     (!driver.hasVehicleCourier && driver.hasBicycleCourier);

  const perKmRateAud = useBicycle
    ? Number(driver.bicyclePerKmRateAud ?? 1.80)
    : Number(driver.perKmRateAud ?? driver.vehiclePerKmRateAud ?? 2.20);

  const sameDayFeeAud = useBicycle
    ? Number(driver.bicycleSameDayFeeAud ?? 0)
    : Number(driver.sameDayFeeAud ?? driver.vehicleSameDayFeeAud ?? 0);

  const urgentFeeAud = useBicycle
    ? Number(driver.bicycleUrgentFeeAud ?? 0)
    : Number(driver.urgentFeeAud ?? driver.vehicleUrgentFeeAud ?? 0);

  const distanceChargeAud = roundUpToCents(km * perKmRateAud);
  const appliedSameDayFeeAud = speedTier === 'same_day' ? roundUpToCents(sameDayFeeAud) : 0;
  const appliedUrgentFeeAud = speedTier === 'urgent' ? roundUpToCents(urgentFeeAud) : 0;
  const totalAud = roundUpToCents(
    distanceChargeAud + appliedSameDayFeeAud + appliedUrgentFeeAud
  );

  const tokenCharge = getDriverOrderTokenCharge(km, pricing);
  const supporterFee = getSupporterBookingFeeTokens(pricing);

  return {
    currency: 'AUD',
    deliveryMode: useBicycle ? 'bicycle' : 'vehicle',
    deliveryModeLabel: useBicycle ? 'Bicycle Courier (Letters, Food & Small Items)' : 'Motor Vehicle Courier',
    distanceKm: km,
    perKmRateAud,
    distanceChargeAud,
    distanceFeeAud: distanceChargeAud,
    speedTier,
    sameDayFeeAud: appliedSameDayFeeAud,
    urgentFeeAud: appliedUrgentFeeAud,
    totalAud,
    supporterBookingFeeTokens: supporterFee.tokens,
    supporterBookingFeeAud: supporterFee.audCost,
    driverTokenCharge: tokenCharge.tokens,
    distanceTierLabel: tokenCharge.tierLabel,
    driverTokenCostAud: tokenCharge.audCost
  };
}

const getPath = (obj, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);

function setPath(obj, path, value) {
  const keys = path.split('.');
  let node = obj;
  keys.slice(0, -1).forEach(key => {
    if (!node[key] || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  });
  node[keys[keys.length - 1]] = value;
}

const clonePricing = pricing => JSON.parse(JSON.stringify(pricing));

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
  } else if (strict && source.tokenPacks !== undefined) {
    errors.push(`Token packs must be ${TOKEN_PACK_COUNT} different whole numbers from ${MIN_TOKEN_PURCHASE} to ${MAX_TOKEN_PURCHASE}.`);
  }

  if (source.economyControls && typeof source.economyControls === 'object') {
    const ec = source.economyControls;
    if (typeof ec.isTokenSystemEnabled === 'boolean') pricing.economyControls.isTokenSystemEnabled = ec.isTokenSystemEnabled;
    if (typeof ec.isAudEnabled === 'boolean') pricing.economyControls.isAudEnabled = ec.isAudEnabled;
    if (typeof ec.isUsdEnabled === 'boolean') pricing.economyControls.isUsdEnabled = ec.isUsdEnabled;
  }

  return { pricing, errors };
}

export function priceCourier({ distanceKm, isAsap, speedTier, driver }, pricing = DEFAULT_PRICING) {
  const tier = speedTier || (isAsap ? 'urgent' : 'standard');
  const calc = calculateDriverCourierPrice({ distanceKm, speedTier: tier, driver: driver || {} }, pricing);
  return {
    currency: 'AUD',
    tokenPriceAud: pricing.tokenPriceAud,
    gstPercent: GST_PERCENT,
    distanceKm: calc.distanceKm,
    isAsap: tier === 'urgent',
    speedTier: tier,
    perKmRateAud: calc.perKmRateAud,
    distanceChargeAud: calc.distanceChargeAud,
    sameDayFeeAud: calc.sameDayFeeAud,
    urgentFeeAud: calc.urgentFeeAud,
    subtotal: calc.totalAud,
    gst: 0,
    estimatedTotal: calc.totalAud,
    calloutFee: calc.sameDayFeeAud + calc.urgentFeeAud,
    baseLabour: calc.distanceChargeAud,
    materialsEstimate: 0,
    tokens: {
      subtotal: calc.driverTokenCharge,
      gst: 0,
      estimatedTotal: calc.driverTokenCharge
    },
    driverTokenCharge: calc.driverTokenCharge,
    distanceTierLabel: calc.distanceTierLabel
  };
}

export function priceJob(args, pricing = DEFAULT_PRICING) {
  return priceCourier({ distanceKm: 15, speedTier: 'standard' }, pricing);
}

export function priceCategoryJob(args, pricing = DEFAULT_PRICING) {
  return priceCourier({ distanceKm: 15, speedTier: args?.isUrgent ? 'urgent' : 'standard' }, pricing);
}
