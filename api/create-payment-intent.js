/**
 * POST /api/create-payment-intent
 * Creates (or reuses) a Stripe PaymentIntent for a booking docket and returns its client secret,
 * which the browser uses to mount Stripe's Payment Element.
 *
 * Note: the amount still comes from the browser because bookings are priced client-side.
 * Once bookings are written server-side, look the amount up by docket number here instead.
 */

import { BUSINESS_ID, getStripe, sendStripeError } from '../server/stripe.js';
import { readJsonBody, sendJson } from '../server/http.js';

const MIN_AMOUNT_CENTS = 50;        // Stripe's minimum charge for AUD
const MAX_AMOUNT_CENTS = 2000000;   // $20,000 safety ceiling
const DOCKET_PATTERN = /^[A-Z0-9-]{4,40}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const stripe = getStripe();
  if (!stripe) {
    return sendJson(res, 503, { error: 'Online payments are not configured on the server.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: 'Invalid request body.' });
  }

  const docketNumber = String(body.docketNumber || '').trim();
  const amountCents = Math.round(Number(body.amount) * 100);

  if (!DOCKET_PATTERN.test(docketNumber)) {
    return sendJson(res, 400, { error: 'Invalid docket number.' });
  }
  if (!Number.isFinite(amountCents) || amountCents < MIN_AMOUNT_CENTS || amountCents > MAX_AMOUNT_CENTS) {
    return sendJson(res, 400, { error: 'Amount must be between $0.50 and $20,000.00 AUD.' });
  }

  const customerName = String(body.customerName || '').trim().slice(0, 100);
  const description = String(body.description || `Payment for docket ${docketNumber}`).trim().slice(0, 200);

  try {
    let intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      description,
      // Cards and wallets only, so checkout completes inside the modal without a page redirect
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { businessId: BUSINESS_ID, docketNumber, customerName }
    }, {
      // Re-opening checkout for the same docket and amount returns the same PaymentIntent
      idempotencyKey: `iasj-pi-${docketNumber}-${amountCents}`
    });

    // A replayed request returns the original response, so fetch the current state (it may already be paid)
    if (intent.lastResponse?.headers?.['idempotent-replayed'] === 'true') {
      intent = await stripe.paymentIntents.retrieve(intent.id);
    }

    return sendJson(res, 200, {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      amount: intent.amount / 100,
      currency: intent.currency.toUpperCase()
    });
  } catch (err) {
    return sendStripeError(res, err, 'Could not start the payment');
  }
}
