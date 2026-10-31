/**
 * It's A Simple Job - Visitor location helpers.
 * Vercel adds the visitor's country (from their IP) as the x-vercel-ip-country header.
 */

export function getVisitorCountry(req) {
  const country = req.headers['x-vercel-ip-country'];
  if (country) return String(country).toUpperCase();
  // Local dev has no Vercel geo header
  return (process.env.DEV_COUNTRY || 'AU').toUpperCase();
}

/**
 * AUD for visitors in Australia, USD for everyone else, unless the visitor switched manually
 */
export function resolveCurrency(req, requestedCurrency) {
  const requested = String(requestedCurrency || '').toUpperCase();
  if (requested === 'AUD' || requested === 'USD') return requested;
  return getVisitorCountry(req) === 'AU' ? 'AUD' : 'USD';
}
