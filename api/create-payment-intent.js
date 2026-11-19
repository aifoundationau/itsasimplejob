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

// Provisioned via Stripe MCP on sandbox account acct_1UKnKUI8bClhBF4P ONLY (never used in live mode)
const SANDBOX_STRIPE_PRODUCT_ID = 'prod_VaqooBzIgPduQC';
const SANDBOX_STRIPE_DEFAULT_UNIT_PRICE_ID = 'price_1UZgMSI8bClhBF4PKywysjAj';
const SANDBOX_STRIPE_TOKEN_PAYMENT_LINKS = {
  10: 'https://buy.stripe.com/test_bJebJ15ggaFf1t673z1wY07',
  50: 'https://buy.stripe.com/test_14AbJ1bEE8x71t687D1wY08',
  100: 'https://buy.stripe.com/test_cNi8wP9wwbJj5Jm0Fb1wY09'
};

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
  const customerCountry = String(
    body.customerCountry ||
    req.headers?.['x-vercel-ip-country'] ||
    req.headers?.['cf-ipcountry'] ||
    process.env.DEV_COUNTRY ||
    'AU'
  ).trim().toUpperCase();
  const isAustralianCustomer = customerCountry === 'AU';
  const rawSubtotal = Number(body.subtotalExGstAud);
  const hasExplicitSubtotal = Number.isFinite(rawSubtotal) && rawSubtotal > 0;
  const subtotalExGstAud = hasExplicitSubtotal ? Math.round(rawSubtotal * 100) / 100 : wholeUp(Number(body.amount));
  const taxBehavior = 'exclusive';
  const collectTax = 'automatic';
  // Stripe Tax rule: 10% Exclusive Australian GST is ONLY charged for Australians (country === 'AU')
  const taxRate = isAustralianCustomer ? 0.10 : 0;
  const taxabilityReason = isAustralianCustomer ? 'standard_rated' : 'not_collecting';
  const taxAmountAud = isAustralianCustomer
    ? (hasExplicitSubtotal
        ? Math.round(subtotalExGstAud * 10) / 100
        : Math.round((Number(body.taxAmountAud) || 0) * 100) / 100)
    : 0;
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
  const hostHeader = String(req.headers?.host || '').trim();
  const hostProto = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostHeader) ? 'http' : 'https';
  const reqOrigin = String(
    body.returnUrl ||
    req.headers?.origin ||
    (hostHeader ? `${hostProto}://${hostHeader}` : 'https://www.itsasimplejob.com')
  ).replace(/\/+$/, '');

  const isTestMode = String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
  const configuredProductId = (process.env.STRIPE_TOKEN_PRODUCT_ID || '').trim() || (isTestMode ? SANDBOX_STRIPE_PRODUCT_ID : null);
  const configuredUnitPriceId = (process.env.STRIPE_TOKEN_PRICE_ID || '').trim() || (isTestMode ? SANDBOX_STRIPE_DEFAULT_UNIT_PRICE_ID : null);

  try {
    const subtotalCents = Math.round(subtotalExGstAud * 100);
    const itemQuantity = tokens ? tokens : 1;
    const unitAmountCents = tokens
      ? Math.max(100, Math.round(subtotalCents / tokens))
      : subtotalCents;
    const unitPriceAud = Math.round(unitAmountCents) / 100;
    const mcpPriceId = (tokens && unitAmountCents === 100 && configuredUnitPriceId) ? configuredUnitPriceId : null;

    // Default price is $1.00 AUD per token (unit_amount: 100 cents) with quantity = tokens (e.g. Qty 50 × A$1.00 per token = A$50.00).
    // Uses Stripe Tax (automatic_tax: { enabled: true }) with tax_behavior: 'exclusive' so 10% GST applies strictly to Australians (AU).
    const lineItems = mcpPriceId
      ? [{ price: mcpPriceId, quantity: itemQuantity }]
      : [
          {
            price_data: {
              currency: 'aud',
              unit_amount: unitAmountCents,
              tax_behavior: 'exclusive',
              ...(tokens && configuredProductId
                ? { product: configuredProductId }
                : {
                    product_data: {
                      name: tokens ? "It's A Simple Job Token" : description,
                      tax_code: 'txcd_10000000',
                      description: `AUD only: $${subtotalExGstAud.toFixed(2)} AUD ex-GST subtotal (10% GST applies to Australian customers only)`
                    }
                  })
            },
            quantity: itemQuantity
          }
        ];

    const sharedMetadata = {
      businessId: BUSINESS_ID,
      docketNumber,
      ...(tokens ? { tokens: String(tokens), quantity: String(itemQuantity), unitPriceAud: String(unitPriceAud.toFixed(2)) } : {}),
      customerName,
      customerCountry,
      isAustralianCustomer: String(isAustralianCustomer),
      taxabilityReason,
      invoiceCurrency: 'AUD',
      collectTax,
      taxBehavior,
      subtotalExGstAud: String(subtotalExGstAud.toFixed(2)),
      taxAmountAud: String(taxAmountAud.toFixed(2)),
      totalIncGstAud: String(amountAud.toFixed(2))
    };

    const [createdIntent, checkoutSession] = await Promise.all([
      stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'aud',
        description: `${description} (AUD only • ${isAustralianCustomer ? '10% exclusive AU GST' : '0% GST non-AU'})`.slice(0, 200),
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: sharedMetadata
      }, {
        idempotencyKey: `iasj-pi-${docketNumber}-${customerCountry}-${amountCents}`
      }),
      stripe.checkout.sessions.create({
        mode: 'payment',
        currency: 'aud',
        automatic_tax: { enabled: true },
        line_items: lineItems,
        success_url: `${reqOrigin}/?stripe_token_success=1&tokens=${encodeURIComponent(tokens || 10)}&docket=${encodeURIComponent(docketNumber)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${reqOrigin}/?stripe_token_cancel=1&tokens=${encodeURIComponent(tokens || 10)}`,
        payment_intent_data: { metadata: sharedMetadata },
        metadata: sharedMetadata
      })
    ]);

    let intent = createdIntent;
    if (intent.lastResponse?.headers?.['idempotent-replayed'] === 'true') {
      intent = await stripe.paymentIntents.retrieve(intent.id);
    }

    return sendJson(res, 200, {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      checkoutSessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
      productId: configuredProductId,
      priceId: mcpPriceId || configuredUnitPriceId,
      unitPriceAud,
      unitAmountCents,
      quantity: itemQuantity,
      pricePerTokenLabel: `$${unitPriceAud.toFixed(2)} AUD per token`,
      paymentLinkUrl: (isTestMode && tokens && unitAmountCents === 100 && SANDBOX_STRIPE_TOKEN_PAYMENT_LINKS[tokens]) || null,
      status: intent.status,
      tokens,
      customerCountry,
      isAustralianCustomer,
      taxRate,
      taxabilityReason,
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
