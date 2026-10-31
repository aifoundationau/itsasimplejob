/**
 * GET /api/payment-status?id=pi_...
 * Looks up a PaymentIntent directly with Stripe so the browser never has to be trusted
 * about whether a payment succeeded.
 */

import { BUSINESS_ID, getStripe, sendStripeError } from '../server/stripe.js';
import { getQuery, sendJson } from '../server/http.js';

const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9]{10,}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const stripe = getStripe();
  if (!stripe) {
    return sendJson(res, 503, { error: 'Online payments are not configured on the server.' });
  }

  const paymentIntentId = getQuery(req).get('id') || '';
  if (!PAYMENT_INTENT_PATTERN.test(paymentIntentId)) {
    return sendJson(res, 400, { error: 'Invalid payment reference.' });
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });

    // The Stripe account is shared across AI Foundation businesses; only expose this tenant's payments
    if (intent.metadata?.businessId !== BUSINESS_ID) {
      return sendJson(res, 404, { error: 'Payment not found.' });
    }

    const charge = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const card = charge?.payment_method_details?.card;

    return sendJson(res, 200, {
      paymentIntentId: intent.id,
      status: intent.status,
      amount: intent.amount / 100,
      currency: intent.currency.toUpperCase(),
      docketNumber: intent.metadata.docketNumber || '',
      chargeId: charge?.id || null,
      receiptUrl: charge?.receipt_url || null,
      cardBrand: card?.brand || null,
      last4: card?.last4 || null,
      livemode: intent.livemode
    });
  } catch (err) {
    return sendStripeError(res, err, 'Could not check the payment status');
  }
}
