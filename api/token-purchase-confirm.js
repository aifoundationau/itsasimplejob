/**
 * POST /api/token-purchase-confirm  (Authorization: Bearer <Firebase ID token>)
 * Body: { paymentIntentId }
 * Checks the payment with Stripe and credits the tokens exactly once.
 */

import { allowMethods, readJsonBody, sendError, sendJson } from '../server/http.js';
import { requireAdminDb, requireUser } from '../server/firebase-admin.js';
import { getStripe, sendStripeError } from '../server/stripe.js';
import { getWallet, settlePurchase } from '../server/tokens.js';

const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9]{10,}$/;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  let user;
  let db;
  try {
    user = await requireUser(req);
    db = requireAdminDb();
  } catch (err) {
    return sendError(res, err);
  }

  const stripe = getStripe();
  if (!stripe) return sendJson(res, 503, { error: 'Online payments are not configured on the server.' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: 'Invalid request body.' });
  }

  const paymentIntentId = String(body.paymentIntentId || '');
  if (!PAYMENT_INTENT_PATTERN.test(paymentIntentId)) {
    return sendJson(res, 400, { error: 'Invalid payment reference.' });
  }

  try {
    const result = await settlePurchase(db, stripe, user.uid, paymentIntentId);
    const wallet = await getWallet(db, user.uid);
    return sendJson(res, 200, { ...result, wallet });
  } catch (err) {
    if (err.type?.startsWith?.('Stripe')) return sendStripeError(res, err, 'Could not check the payment');
    return sendError(res, err, 'Could not confirm the token purchase.');
  }
}
