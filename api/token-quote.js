/**
 * GET /api/token-quote?tokens=50&currency=AUD|USD
 * Prices tokens for the visitor: AUD in Australia (daily live rate), USD elsewhere.
 * `currency` is the visitor's manual AUD/USD switch; omit it to decide by IP country.
 * Without `tokens`, returns prices for the standard token packs.
 */

import { allowMethods, getQuery, sendError, sendJson } from '../server/http.js';
import { getVisitorCountry, resolveCurrency } from '../server/geo.js';
import { quoteTokens, TOKEN_PACKS, TOKEN_PRICE_USD } from '../server/token-pricing.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  const query = getQuery(req);
  const country = getVisitorCountry(req);
  const currency = resolveCurrency(req, query.get('currency'));

  try {
    const requested = query.get('tokens');
    const quotes = requested
      ? [await quoteTokens(requested, currency)]
      : await Promise.all(TOKEN_PACKS.map(tokens => quoteTokens(tokens, currency)));

    return sendJson(res, 200, {
      country,
      currency,
      defaultCurrency: country === 'AU' ? 'AUD' : 'USD',
      tokenPriceUsd: TOKEN_PRICE_USD,
      fxRate: quotes[0].fxRate,
      fxDate: quotes[0].fxDate || null,
      fxSource: quotes[0].fxSource || null,
      quotes: quotes.map(({ tokens, total, totalCents }) => ({ tokens, total, totalCents }))
    });
  } catch (err) {
    if (err instanceof RangeError) return sendJson(res, 400, { error: err.message });
    return sendError(res, err, 'Could not price tokens right now.');
  }
}
