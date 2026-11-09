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

// Provisioned via Stripe MCP on account acct_1UKnKUI8bClhBF4P (AI Foundation sandbox)
const STRIPE_MCP_PRODUCT_ID = 'prod_VaqooBzIgPduQC';
const STRIPE_MCP_TOKEN_PRICE_IDS = {
  10: 'price_1UZf7RI8bClhBF4PEhIGJoc3',
  50: 'price_1UZf7VI8bClhBF4PE52HKTjw',
  100: 'price_1UZf7ZI8bClhBF4PcJWNqJv0'
};
const STRIPE_MCP_TOKEN_PAYMENT_LINKS = {
  10: 'https://buy.stripe.com/test_8x2fZh388eVvc7KfA51wY04',
  50: 'https://buy.stripe.com/test_6oU5kD388eVvc7K1Jf1wY05',
  100: 'https://buy.stripe.com/test_14A6oH388fZzgo0drX1wY06'
};

let cachedExclusiveGstTaxRateId = null;

async function getExclusiveAudGstTaxRateId(stripe) {
  if (cachedExclusiveGstTaxRateId) return cachedExclusiveGstTaxRateId;
  try {
    const rates = await stripe.taxRates.list({ active: true, limit: 25 });
    let gstRate = rates.data.find(r => Number(r.percentage) === 10 && r.inclusive === false);
    if (!gstRate) {
      gstRate = await stripe.taxRates.create({
        display_name: 'GST',
        description: 'Australian Goods & Services Tax (10% Exclusive)',
        jurisdiction: 'AU',
        percentage: 10,
        inclusive: false,
        country: 'AU'
      });
    }
    cachedExclusiveGstTaxRateId = gstRate.id;
    return cachedExclusiveGstTaxRateId;
  } catch (err) {
    console.warn('💳 [Stripe TaxRate lookup warning]:', err.message);
    return null;
  }
}

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

  const tokens = Number.isFinite(Number(body.tokens)) && Number(body.tokens) > 0
    ? Math.round(Number(body.tokens))
    : null;
  const docketNumber = String(body.docketNumber || (tokens ? `TOK-${tokens}-${Date.now()}` : '')).trim();
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
  const reqOrigin = String(
    body.returnUrl ||
    req.headers?.origin ||
    (req.headers?.host ? `http://${req.headers.host}` : 'http://localhost:3002')
  ).replace(/\/+$/, '');

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
        ...(tokens ? { tokens: String(tokens) } : {}),
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

    // Also create a Stripe Hosted Checkout Session (checkout.stripe.com) with AUD-only + 10% Exclusive GST
    const gstTaxRateId = await getExclusiveAudGstTaxRateId(stripe);
    const subtotalCents = Math.round(subtotalExGstAud * 100);
    const taxCents = Math.round(taxAmountAud * 100);

    const lineItems = gstTaxRateId
      ? [
          {
            price_data: {
              currency: 'aud',
              unit_amount: subtotalCents,
              tax_behavior: 'exclusive',
              product_data: {
                name: tokens ? `${tokens} Courier Tokens ($1.00 AUD / Token)` : description,
                description: `AUD Only • Quote Subtotal $${subtotalExGstAud.toFixed(2)} AUD + 10% Exclusive GST ($${taxAmountAud.toFixed(2)} AUD) = Total $${amountAud.toFixed(2)} AUD`
              }
            },
            quantity: 1,
            tax_rates: [gstTaxRateId]
          }
        ]
      : [
          {
            price_data: {
              currency: 'aud',
              unit_amount: subtotalCents,
              tax_behavior: 'exclusive',
              product_data: {
                name: tokens ? `${tokens} Courier Tokens (Quote Subtotal)` : description
              }
            },
            quantity: 1
          },
          ...(taxCents > 0 ? [{
            price_data: {
              currency: 'aud',
              unit_amount: taxCents,
              tax_behavior: 'exclusive',
              product_data: {
                name: 'Tax (Exclusive • Automatic 10% GST)'
              }
            },
            quantity: 1
          }] : [])
        ];

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency: 'aud',
      line_items: lineItems,
      success_url: `${reqOrigin}/?stripe_token_success=1&tokens=${encodeURIComponent(tokens || 10)}&docket=${encodeURIComponent(docketNumber)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${reqOrigin}/?stripe_token_cancel=1&tokens=${encodeURIComponent(tokens || 10)}`,
      metadata: {
        businessId: BUSINESS_ID,
        docketNumber,
        ...(tokens ? { tokens: String(tokens) } : {}),
        customerName,
        invoiceCurrency: 'AUD',
        collectTax,
        taxBehavior,
        subtotalExGstAud: String(subtotalExGstAud.toFixed(2)),
        taxAmountAud: String(taxAmountAud.toFixed(2)),
        totalIncGstAud: String(amountAud.toFixed(2))
      }
    });

    return sendJson(res, 200, {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      checkoutSessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
      productId: STRIPE_MCP_PRODUCT_ID,
      priceId: (tokens && STRIPE_MCP_TOKEN_PRICE_IDS[tokens]) || null,
      paymentLinkUrl: (tokens && STRIPE_MCP_TOKEN_PAYMENT_LINKS[tokens]) || null,
      status: intent.status,
      tokens,
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
