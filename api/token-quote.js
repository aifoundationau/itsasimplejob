/**
 * GET /api/token-quote?tokens=50&currency=AUD|USD
 * Prices tokens in AUD (1 token = the superadmin's token price, default A$1).
 * Tokens are always charged in AUD; visitors outside Australia and New Zealand also get a USD estimate.
 * `currency` is the visitor's display choice; omit it to decide by IP country.
 * Without `tokens`, returns prices for the superadmin's token packs.
 */

import { allowMethods, getQuery, sendError, sendJson } from '../server/http.js';
import { getVisitorCountry, resolveDisplayCurrency } from '../server/geo.js';
import { getAudToUsdRate, getPricing, quoteTokens } from '../server/token-pricing.js';
import { BASE_CURRENCY, displayCurrencyFor } from '../shared/pricing.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  const query = getQuery(req);
  const country = getVisitorCountry(req);

  try {
    const [{ pricing }, fx] = await Promise.all([getPricing(), getAudToUsdRate()]);
    const requested = query.get('tokens');
    const amounts = requested ? [Number(requested)] : pricing.tokenPacks;
    const quotes = await Promise.all(amounts.map(tokens => quoteTokens(tokens, { pricing, fx })));

    return sendJson(res, 200, {
      country,
      chargeCurrency: BASE_CURRENCY,
      displayCurrency: resolveDisplayCurrency(req, query.get('currency')),
      defaultDisplayCurrency: displayCurrencyFor(country),
      tokenPriceAud: pricing.tokenPriceAud,
      audToUsd: fx.rate,
      fxDate: fx.rateDate || null,
      fxSource: fx.source || null,
      quotes: quotes.map(({ tokens, totalAud, totalCents, usdEstimate }) => ({ tokens, totalAud, totalCents, usdEstimate }))
    });
  } catch (err) {
    if (err instanceof RangeError) return sendJson(res, 400, { error: err.message });
    return sendError(res, err, 'Could not price tokens right now.');
  }
}
