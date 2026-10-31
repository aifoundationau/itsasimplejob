/**
 * It's A Simple Job - Token wallet ledger (server only).
 * 1 token = US$1. Balances are changed only here, inside Firestore transactions,
 * after Stripe has confirmed the payment. Browsers have no write access to these documents.
 *
 * Data layout (database: itsasimplejob):
 *   wallets/{uid}                      { uid, email, available, held, createdAt, updatedAt }
 *   wallets/{uid}/purchases/{piId}     { tokens, amountCents, currency, fxRate, status, ... }
 *   wallets/{uid}/ledger/{entryId}     { type, tokens, availableAfter, ref, createdAt, ... }
 */

import { HttpError } from './firebase-admin.js';

const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;

const walletRef = (db, uid) => db.doc(`wallets/${uid}`);
const purchaseRef = (db, uid, paymentIntentId) => db.doc(`wallets/${uid}/purchases/${paymentIntentId}`);

export async function getWallet(db, uid) {
  const snap = await walletRef(db, uid).get();
  const data = snap.data() || {};
  return { available: data.available || 0, held: data.held || 0 };
}

export async function getLedger(db, uid, limit = 20) {
  const snap = await walletRef(db, uid).collection('ledger').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(doc => {
    const { type, tokens, availableAfter, ref, amountCents, currency, createdAt } = doc.data();
    return { id: doc.id, type, tokens, availableAfter, ref, amountCents: amountCents ?? null, currency: currency ?? null, createdAt };
  });
}

/**
 * Record a pending purchase when its PaymentIntent is created. Safe to repeat for the same PaymentIntent.
 */
export async function recordPendingPurchase(db, user, intent, quote, purchaseId) {
  const now = new Date().toISOString();
  try {
    await purchaseRef(db, user.uid, intent.id).create({
      uid: user.uid,
      email: user.email,
      tokens: quote.tokens,
      amountCents: quote.totalCents,
      currency: quote.currency,
      fxRate: quote.fxRate,
      purchaseId,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    });
  } catch (err) {
    if (err.code !== 6) throw err; // 6 = ALREADY_EXISTS: retried request for the same PaymentIntent
  }
}

/**
 * Check one purchase with Stripe and credit the tokens exactly once if it succeeded.
 * Returns { status } where status is credited | processing | pending | canceled | abandoned | failed.
 */
export async function settlePurchase(db, stripe, uid, paymentIntentId) {
  const ref = purchaseRef(db, uid, paymentIntentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Purchase not found.');

  const purchase = snap.data();
  if (purchase.status !== 'pending') return { status: purchase.status, tokens: purchase.tokens };

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const matches = intent.metadata?.type === 'token_purchase'
    && intent.metadata?.uid === uid
    && intent.amount === purchase.amountCents
    && intent.currency.toUpperCase() === purchase.currency;

  const now = new Date().toISOString();
  if (!matches) {
    await ref.update({ status: 'failed', failureReason: 'Stripe payment does not match purchase record', updatedAt: now });
    throw new HttpError(409, 'This payment does not match the token purchase. Please contact support.');
  }

  if (intent.status === 'succeeded') {
    await db.runTransaction(async tx => {
      const fresh = await tx.get(ref);
      if (fresh.data().status !== 'pending') return; // credited by a concurrent request

      const wallet = await tx.get(walletRef(db, uid));
      const current = wallet.data() || {};
      const available = (current.available || 0) + purchase.tokens;

      tx.set(walletRef(db, uid), {
        uid,
        email: purchase.email || current.email || '',
        available,
        held: current.held || 0,
        updatedAt: now,
        ...(wallet.exists ? {} : { createdAt: now })
      }, { merge: true });

      tx.update(ref, { status: 'credited', creditedAt: now, updatedAt: now });

      tx.create(walletRef(db, uid).collection('ledger').doc(`purchase_${paymentIntentId}`), {
        type: 'purchase',
        tokens: purchase.tokens,
        availableAfter: available,
        ref: paymentIntentId,
        amountCents: purchase.amountCents,
        currency: purchase.currency,
        createdAt: now
      });
    });
    return { status: 'credited', tokens: purchase.tokens };
  }

  if (intent.status === 'processing') return { status: 'processing', tokens: purchase.tokens };

  if (intent.status === 'canceled') {
    await ref.update({ status: 'canceled', updatedAt: now });
    return { status: 'canceled', tokens: purchase.tokens };
  }

  if (Date.now() - Date.parse(purchase.createdAt) > ABANDON_AFTER_MS) {
    await ref.update({ status: 'abandoned', updatedAt: now });
    return { status: 'abandoned', tokens: purchase.tokens };
  }

  return { status: 'pending', tokens: purchase.tokens };
}

/**
 * Settle any purchases still pending (e.g. the browser closed right after paying).
 */
export async function settlePendingPurchases(db, stripe, uid) {
  const pending = await walletRef(db, uid).collection('purchases').where('status', '==', 'pending').limit(10).get();
  for (const doc of pending.docs) {
    try {
      await settlePurchase(db, stripe, uid, doc.id);
    } catch (err) {
      console.warn(`🪙 [Tokens] Could not settle purchase ${doc.id}:`, err.message);
    }
  }
}
