/**
 * POST /api/stripe-webhook
 * Receives live/test Stripe webhook events with strict HMAC raw-body signature verification.
 * Multi-tenant guard ensures only events for It's A Simple Job are processed on shared Stripe accounts.
 */

import Stripe from 'stripe';
import { sendJson } from '../server/http.js';
import { getAdminDb, HttpError } from '../server/firebase-admin.js';
import { BUSINESS_ID, getStripe } from '../server/stripe.js';
import { settlePurchase } from '../server/tokens.js';

export const config = {
  api: {
    bodyParser: false
  }
};

const TENANT_BUSINESS_IDS = new Set([BUSINESS_ID, 'itsasimplejob']);
const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

function parseOptionalInt(val) {
  const num = Number(val);
  return Number.isInteger(num) && num > 0 ? num : null;
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Webhook payload too large.');
    }
    return req.body;
  }
  if (typeof req.body === 'string') {
    const buf = Buffer.from(req.body, 'utf8');
    if (buf.length > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Webhook payload too large.');
    }
    return buf;
  }

  const chunks = [];
  let totalLength = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buf.length;
    if (totalLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Webhook payload too large.');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function isEventForThisTenant(event, db) {
  const obj = event.data?.object || {};
  const businessId = String(obj?.metadata?.businessId || '').trim();
  if (TENANT_BUSINESS_IDS.has(businessId)) {
    return true;
  }

  if (event.type === 'charge.refunded' && !businessId) {
    const piId = typeof obj.payment_intent === 'string'
      ? obj.payment_intent
      : (obj.payment_intent?.id || null);
    if (piId && db) {
      const existingTx = await db.doc(`stripe_transactions/${piId}`).get();
      if (existingTx.exists) return true;
    }
  }

  return false;
}

async function safeSettleTokenPurchase(db, stripe, uid, paymentIntentId) {
  try {
    await settlePurchase(db, stripe, uid, paymentIntentId);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      console.warn(`🪙 [Webhook] Pending purchase doc not found for uid=${uid}, pi=${paymentIntentId}`);
      return;
    }
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    return sendJson(res, 503, { error: 'Stripe webhook signing secret is not configured on the server.' });
  }

  const signature = req.headers?.['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    return sendJson(res, 400, { error: 'Missing stripe-signature header.' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    if (err instanceof HttpError && err.status === 413) {
      return sendJson(res, 413, { error: err.message });
    }
    return sendJson(res, 400, { error: 'Failed to read raw webhook body.' });
  }

  let event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.warn(`💳 [Stripe Webhook] Signature verification failed: ${err.message}`);
    return sendJson(res, 400, { error: 'Invalid Stripe webhook signature.' });
  }

  try {
    const db = getAdminDb();

    const forThisTenant = await isEventForThisTenant(event, db);
    if (!forThisTenant) {
      return sendJson(res, 200, {
        received: true,
        ignored: true,
        reason: 'other_tenant',
        eventId: event.id,
        type: event.type
      });
    }

    const eventRef = db ? db.doc(`stripe_webhook_events/${event.id}`) : null;
    if (eventRef) {
      const existing = await eventRef.get();
      if (existing.exists && existing.data()?.status === 'processed') {
        return sendJson(res, 200, {
          received: true,
          duplicate: true,
          eventId: event.id,
          type: event.type
        });
      }
    }

    const obj = event.data?.object || {};
    const now = new Date().toISOString();
    let handled = true;

    switch (event.type) {
      case 'payment_intent.succeeded': {
        if (obj.metadata?.type === 'token_purchase' && obj.metadata?.uid && db) {
          const stripe = getStripe();
          if (!stripe) {
            return sendJson(res, 503, { error: 'Stripe secret key is not configured on the server.' });
          }
          await safeSettleTokenPurchase(db, stripe, obj.metadata.uid, obj.id);
        }
        if (db) {
          await db.doc(`stripe_transactions/${obj.id}`).set({
            businessId: BUSINESS_ID,
            paymentIntentId: obj.id,
            status: 'succeeded',
            amountCents: obj.amount ?? 0,
            amountAud: Math.round(obj.amount ?? 0) / 100,
            currency: String(obj.currency || 'aud').toUpperCase(),
            docketNumber: obj.metadata?.docketNumber || '',
            tokens: parseOptionalInt(obj.metadata?.tokens),
            uid: obj.metadata?.uid || null,
            type: obj.metadata?.type || 'payment',
            livemode: Boolean(event.livemode),
            webhookEventId: event.id,
            updatedAt: now
          }, { merge: true });
        }
        break;
      }

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        const isCanceled = event.type === 'payment_intent.canceled';
        if (isCanceled && obj.metadata?.type === 'token_purchase' && obj.metadata?.uid && db) {
          const stripe = getStripe();
          if (stripe) {
            await safeSettleTokenPurchase(db, stripe, obj.metadata.uid, obj.id);
          }
        }
        if (db) {
          await db.doc(`stripe_transactions/${obj.id}`).set({
            businessId: BUSINESS_ID,
            paymentIntentId: obj.id,
            status: isCanceled ? 'canceled' : 'failed',
            failureMessage: obj.last_payment_error?.message || null,
            docketNumber: obj.metadata?.docketNumber || '',
            uid: obj.metadata?.uid || null,
            livemode: Boolean(event.livemode),
            webhookEventId: event.id,
            updatedAt: now
          }, { merge: true });
        }
        break;
      }

      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const piId = typeof obj.payment_intent === 'string'
          ? obj.payment_intent
          : (obj.payment_intent?.id || null);
        if (obj.payment_status === 'paid' && obj.metadata?.type === 'token_purchase' && obj.metadata?.uid && piId && db) {
          const stripe = getStripe();
          if (!stripe) {
            return sendJson(res, 503, { error: 'Stripe secret key is not configured on the server.' });
          }
          await safeSettleTokenPurchase(db, stripe, obj.metadata.uid, piId);
        }
        if (db) {
          await db.doc(`stripe_transactions/${piId || obj.id}`).set({
            businessId: BUSINESS_ID,
            checkoutSessionId: obj.id,
            paymentIntentId: piId,
            status: obj.payment_status === 'paid' ? 'succeeded' : 'pending',
            paymentStatus: obj.payment_status || '',
            amountTotalCents: obj.amount_total ?? null,
            amountSubtotalCents: obj.amount_subtotal ?? null,
            taxCents: obj.total_details?.amount_tax ?? 0,
            amountAud: obj.amount_total != null ? Math.round(obj.amount_total) / 100 : null,
            currency: String(obj.currency || 'aud').toUpperCase(),
            docketNumber: obj.metadata?.docketNumber || '',
            tokens: parseOptionalInt(obj.metadata?.tokens),
            uid: obj.metadata?.uid || null,
            customerEmail: obj.customer_details?.email || obj.customer_email || null,
            livemode: Boolean(event.livemode),
            webhookEventId: event.id,
            updatedAt: now
          }, { merge: true });
        }
        break;
      }

      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const piId = typeof obj.payment_intent === 'string'
          ? obj.payment_intent
          : (obj.payment_intent?.id || null);
        if (db) {
          await db.doc(`stripe_transactions/${piId || obj.id}`).set({
            businessId: BUSINESS_ID,
            checkoutSessionId: obj.id,
            paymentIntentId: piId,
            status: event.type === 'checkout.session.expired' ? 'expired' : 'failed',
            docketNumber: obj.metadata?.docketNumber || '',
            uid: obj.metadata?.uid || null,
            livemode: Boolean(event.livemode),
            webhookEventId: event.id,
            updatedAt: now
          }, { merge: true });
        }
        break;
      }

      case 'charge.refunded': {
        const piId = typeof obj.payment_intent === 'string'
          ? obj.payment_intent
          : (obj.payment_intent?.id || null);
        const txId = piId || obj.id;
        if (db) {
          await db.doc(`stripe_transactions/${txId}`).set({
            businessId: BUSINESS_ID,
            chargeId: obj.id,
            paymentIntentId: piId,
            status: obj.refunded ? 'refunded' : 'partially_refunded',
            refunded: Boolean(obj.refunded),
            amountRefundedCents: obj.amount_refunded ?? 0,
            currency: String(obj.currency || 'aud').toUpperCase(),
            livemode: Boolean(event.livemode),
            webhookEventId: event.id,
            updatedAt: now
          }, { merge: true });
        }
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        if (db) {
          await db.doc(`stripe_transactions/${obj.id}`).set({
            businessId: BUSINESS_ID,
            invoiceId: obj.id,
            invoiceNumber: obj.number || null,
            status: event.type === 'invoice.paid' ? 'paid' : 'failed',
            amountPaidCents: obj.amount_paid ?? 0,
            amountDueCents: obj.amount_due ?? 0,
            taxCents: obj.tax ?? 0,
            currency: String(obj.currency || 'aud').toUpperCase(),
            docketNumber: obj.metadata?.docketNumber || '',
            customerCrn: obj.metadata?.customerCrn || '',
            providerSpn: obj.metadata?.providerSpn || '',
            hostedInvoiceUrl: obj.hosted_invoice_url || null,
            livemode: Boolean(event.livemode),
            webhookEventId: event.id,
            updatedAt: now
          }, { merge: true });
        }
        break;
      }

      default:
        handled = false;
        break;
    }

    if (eventRef) {
      await eventRef.set({
        eventId: event.id,
        type: event.type,
        status: 'processed',
        handled,
        businessId: BUSINESS_ID,
        livemode: Boolean(event.livemode),
        processedAt: now
      }, { merge: true });
    }

    return sendJson(res, 200, {
      received: true,
      eventId: event.id,
      type: event.type,
      handled
    });
  } catch (err) {
    console.error(`💳 [Stripe Webhook] Processing failed for ${event.type} (${event.id}):`, err.message);
    return sendJson(res, 500, { error: 'Webhook processing failed.' });
  }
}
