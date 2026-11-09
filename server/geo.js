/**
 * It's A Simple Job - Visitor location helpers.
 * Vercel adds the visitor's country (from their IP) as the x-vercel-ip-country header.
 * The country sets the visitor's default region: Australia and New Zealand see AUD,
 * everyone else sees a USD conversion. Payments are always charged in AUD.
 */

import { displayCurrencyFor } from '../shared/pricing.js';

export function getVisitorCountry(req) {
  const country = req.headers['x-vercel-ip-country'];
  if (country && /^[A-Za-z]{2}$/.test(String(country))) return String(country).toUpperCase();
  // Local dev has no Vercel geo header
  return (process.env.DEV_COUNTRY || 'AU').toUpperCase();
}

/**
 * Currency to display: the visitor's AUD/USD choice if they made one, otherwise decided by IP country
 */
export function resolveDisplayCurrency(req, requestedCurrency) {
  const requested = String(requestedCurrency || '').toUpperCase();
  if (requested === 'AUD' || requested === 'USD') return requested;
  return displayCurrencyFor(getVisitorCountry(req));
}
