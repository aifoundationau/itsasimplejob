/**
 * POST /api/token-purchase  (Authorization: Bearer <Firebase ID token>)
 * Body: { tokens, currency?: 'AUD' | 'USD', purchaseId }
 * Prices the tokens on the server and starts a Stripe payment for them.
 * Tokens are credited later by /api/token-purchase-confirm once Stripe confirms payment.
 */

import { allowMethods, readJsonBody, sendError, sendJson } from '../server/http.js';
import { requireAdminDb, requireUser } from '../server/firebase-admin.js';
import { BUSINESS_ID, getStripe, sendStripeError } from '../server/stripe.js';
import { resolveCurrency } from '../server/geo.js';
import { quoteTokens } from '../server/token-pricing.js';
import { recordPendingPurchase } from '../server/tokens.js';

const PURCHASE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

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

  const purchaseId = String(body.purchaseId || '');
  if (!PURCHASE_ID_PATTERN.test(purchaseId)) {
    return sendJson(res, 400, { error: 'Invalid purchase reference.' });
  }

  let quote;
  try {
    quote = await quoteTokens(body.tokens, resolveCurrency(req, body.currency));
  } catch (err) {
    if (err instanceof RangeError) return sendJson(res, 400, { error: err.message });
    return sendError(res, err, 'Could not price tokens right now.');
  }

  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: quote.totalCents,
      currency: quote.currency.toLowerCase(),
      description: `${quote.tokens} It's A Simple Job tokens`,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      ...(user.emailVerified && user.email ? { receipt_email: user.email } : {}),
      metadata: {
        businessId: BUSINESS_ID,
        type: 'token_purchase',
        uid: user.uid,
        tokens: String(quote.tokens),
        fxRate: String(quote.fxRate)
      }
    }, {
      // A double-click or retry of the same checkout reuses one PaymentIntent
      idempotencyKey: `iasj-tokens-${user.uid}-${purchaseId}`
    });
  } catch (err) {
    return sendStripeError(res, err, 'Could not start the token purchase');
  }

  try {
    await recordPendingPurchase(db, user, intent, quote, purchaseId);
  } catch (err) {
    return sendError(res, err, 'Could not record the token purchase.');
  }

  return sendJson(res, 200, {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    tokens: quote.tokens,
    total: quote.total,
    currency: quote.currency,
    fxRate: quote.fxRate
  });
}
