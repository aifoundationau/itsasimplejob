/**
 * POST /api/create-payment-intent
 * Creates (or reuses) a Stripe PaymentIntent for a booking docket and returns its client secret,
 * which the browser uses to mount Stripe's Payment Element.
 *
 * All invoices are in Australian Dollars and use whole dollars only: the amount is rounded up
 * to a whole number of AUD before charging.
 *
 * Note: the amount still comes from the browser because bookings are priced client-side.
 * Once bookings are written server-side, look the amount up by docket number here instead.
 */

import { BUSINESS_ID, getStripe, sendStripeError } from '../server/stripe.js';
import { readJsonBody, sendJson } from '../server/http.js';
import { wholeUp } from '../shared/pricing.js';

const MIN_AMOUNT_AUD = 1;
const MAX_AMOUNT_AUD = 20000;   // safety ceiling
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
  const rawSubtotal = Number(body.subtotalExGstAud);
  const hasExplicitSubtotal = Number.isFinite(rawSubtotal) && rawSubtotal > 0;
  const subtotalExGstAud = hasExplicitSubtotal ? Math.round(rawSubtotal * 100) / 100 : wholeUp(Number(body.amount));
  const taxBehavior = 'exclusive';
  const collectTax = 'automatic';
  const taxAmountAud = hasExplicitSubtotal
    ? Math.round(subtotalExGstAud * 10) / 100
    : Math.round((Number(body.taxAmountAud) || 0) * 100) / 100;
  const amountAud = hasExplicitSubtotal
    ? Math.round((subtotalExGstAud + taxAmountAud) * 100) / 100
    : wholeUp(Number(body.amount));
  const amountCents = Math.round(amountAud * 100);

  if (!DOCKET_PATTERN.test(docketNumber)) {
    return sendJson(res, 400, { error: 'Invalid docket number.' });
  }
  if (!Number.isFinite(amountAud) || amountAud < MIN_AMOUNT_AUD || amountAud > MAX_AMOUNT_AUD) {
    return sendJson(res, 400, { error: `Amount must be between $${MIN_AMOUNT_AUD} and $${MAX_AMOUNT_AUD.toLocaleString('en-AU')} AUD.` });
  }

  const customerName = String(body.customerName || '').trim().slice(0, 100);
  const description = String(body.description || `Payment for docket ${docketNumber}`).trim().slice(0, 200);

  try {
    let intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      description: `${description} (AUD Only • Exclusive 10% GST)`.slice(0, 200),
      // Cards and wallets only, so checkout completes inside the modal without a page redirect
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        businessId: BUSINESS_ID,
        docketNumber,
        customerName,
        invoiceCurrency: 'AUD',
        collectTax,
        taxBehavior,
        subtotalExGstAud: String(subtotalExGstAud.toFixed(2)),
        taxAmountAud: String(taxAmountAud.toFixed(2)),
        totalIncGstAud: String(amountAud.toFixed(2))
      }
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
      subtotalExGstAud,
      taxAmountAud,
      totalIncGstAud: intent.amount / 100,
      amount: intent.amount / 100,
      currency: 'AUD',
      collectTax: 'automatic',
      taxBehavior: 'exclusive'
    });
  } catch (err) {
    return sendStripeError(res, err, 'Could not start the payment');
  }
}
