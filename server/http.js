/**
 * It's A Simple Job - Shared HTTP helpers for the /api serverless functions.
 * Handlers use plain Node req/res so they run on Vercel and in the local Vite dev server.
 */

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function getQuery(req) {
  return new URL(req.url || '/', 'http://localhost').searchParams;
}

// Vercel pre-parses JSON bodies; the Vite dev server does not.
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  sendJson(res, 405, { error: 'Method not allowed.' });
  return false;
}

// Errors thrown with a .status (e.g. HttpError) are safe to show; anything else becomes a generic 500
export function sendError(res, err, fallbackMessage = 'Something went wrong. Please try again.') {
  if (err?.status) return sendJson(res, err.status, { error: err.message });
  console.error('[api]', err);
  return sendJson(res, 500, { error: fallbackMessage });
}
