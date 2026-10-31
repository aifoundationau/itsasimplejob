/**
 * It's A Simple Job - Server-side Stripe helpers for the /api serverless functions.
 * The secret key is read from the server environment only and is never sent to the browser.
 */

import Stripe from 'stripe';
import { sendJson } from './http.js';

export const BUSINESS_ID = 'its-a-simple-job';

let stripeClient = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (!stripeClient) stripeClient = new Stripe(secretKey);
  return stripeClient;
}

// Map Stripe SDK errors to a safe HTTP response.
export function sendStripeError(res, err, fallbackMessage) {
  console.error(`💳 [Stripe API] ${fallbackMessage}:`, err.message);
  if (err.type === 'StripeAuthenticationError') {
    return sendJson(res, 503, { error: 'Online payments are not configured correctly on the server.' });
  }
  if (err.statusCode === 404 || err.code === 'resource_missing') {
    return sendJson(res, 404, { error: 'Payment not found.' });
  }
  if (err.statusCode && err.statusCode < 500) {
    return sendJson(res, 400, { error: err.message || fallbackMessage });
  }
  return sendJson(res, 502, { error: fallbackMessage });
}
