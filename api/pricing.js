/**
 * GET /api/pricing
 *   Public. Returns the visitor's region (from their IP country), the currency to show them,
 *   the live AUD -> USD conversion rate and the superadmin price list (all amounts in whole tokens).
 *
 * PUT /api/pricing  (Authorization: Bearer <Firebase ID token>, superadmin only)
 *   Body: the full price list. Every amount is rounded up to a whole number before saving.
 */

import { allowMethods, readJsonBody, sendError, sendJson } from '../server/http.js';
import { isSuperadmin, requireAdminDb, requireUser, HttpError } from '../server/firebase-admin.js';
import { getVisitorCountry } from '../server/geo.js';
import { getAudToUsdRate, getPricing, savePricing } from '../server/token-pricing.js';
import { BASE_CURRENCY, GST_PERCENT, displayCurrencyFor, isAudRegion } from '../shared/pricing.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PUT'])) return;

  if (req.method === 'PUT') {
    try {
      const user = await requireUser(req);
      if (!isSuperadmin(user)) throw new HttpError(403, 'Only a superadmin can change prices.');
      const db = requireAdminDb();

      let body;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return sendJson(res, 400, { error: 'Invalid request body.' });
      }

      const result = await savePricing(db, body, user);
      if (result.errors) return sendJson(res, 400, { error: result.errors[0], errors: result.errors });
      return sendJson(res, 200, { pricing: result.pricing, updatedAt: result.updatedAt });
    } catch (err) {
      return sendError(res, err, 'Could not save the price list.');
    }
  }

  try {
    const country = getVisitorCountry(req);
    const [{ pricing, updatedAt }, fx] = await Promise.all([getPricing(), getAudToUsdRate()]);
    return sendJson(res, 200, {
      country,
      isAudRegion: isAudRegion(country),
      displayCurrency: displayCurrencyFor(country),
      baseCurrency: BASE_CURRENCY,
      gstPercent: GST_PERCENT,
      audToUsd: fx.rate,
      fxDate: fx.rateDate || null,
      fxSource: fx.source || null,
      pricing,
      pricingUpdatedAt: updatedAt || null
    });
  } catch (err) {
    return sendError(res, err, 'Could not load prices right now.');
  }
}
