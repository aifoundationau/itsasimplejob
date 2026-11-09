/**
 * It's A Simple Job - Messages between users (server only).
 * Every user has a private mailbox; all superadmins share one ("superadmin").
 * Messages to the superadmin are free. Messages to other users cost the superadmin's
 * price-list amount (fees.message tokens), taken from the sender's wallet in the same
 * Firestore transaction that delivers the message, so a message is never sent without
 * being paid for, and never charged twice.
 *
 * Data layout (database: itsasimplejob; browsers have no direct access):
 *   mailboxes/{owner}                    { rateWindowStart, rateCount }   owner = uid or 'superadmin'
 *   mailboxes/{owner}/inbox/{messageId}  message copy for the recipient (read: false until opened)
 *   mailboxes/{owner}/sent/{messageId}   message copy for the sender
 *   wallets/{uid}/ledger/message_{id}    { type: 'message', tokens: -price, ... } when a message is charged
 */

import { HttpError } from './firebase-admin.js';
import { SUPERADMIN_MAILBOX } from '../shared/pricing.js';

const LIST_LIMIT = 50;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_MESSAGES = 20;

const mailboxRef = (db, owner) => db.doc(`mailboxes/${owner}`);
const folderRef = (db, owner, folder) => mailboxRef(db, owner).collection(folder);
const walletRef = (db, uid) => db.doc(`wallets/${uid}`);

function publicMessage(doc) {
  const m = doc.data();
  return {
    id: doc.id,
    from: m.from,
    to: m.to,
    subject: m.subject,
    body: m.body,
    createdAt: m.createdAt,
    read: !!m.read,
    tokensCharged: m.tokensCharged || 0
  };
}

export async function listMessages(db, owner, folder) {
  const snap = await folderRef(db, owner, folder).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get();
  return snap.docs.map(publicMessage);
}

export async function countUnread(db, owner) {
  const snap = await folderRef(db, owner, 'inbox').where('read', '==', false).count().get();
  return snap.data().count || 0;
}

export async function markRead(db, owner, messageId) {
  const ref = folderRef(db, owner, 'inbox').doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Message not found.');
  if (!snap.data().read) await ref.update({ read: true, readAt: new Date().toISOString() });
}

/**
 * Deliver one message and charge the sender if it is not free.
 *   sender:    { uid, name, email, isSuperadmin }
 *   recipient: { uid, name, email, isSuperadmin }
 * clientMessageId makes retries safe: the same id is delivered and charged once.
 */
export async function sendMessage(db, { sender, recipient, subject, body, priceTokens, clientMessageId }) {
  const messageId = `${sender.uid}_${clientMessageId}`;
  const senderOwner = sender.isSuperadmin ? SUPERADMIN_MAILBOX : sender.uid;
  const recipientOwner = recipient.isSuperadmin ? SUPERADMIN_MAILBOX : recipient.uid;
  const sentRef = folderRef(db, senderOwner, 'sent').doc(messageId);
  const inboxRef = folderRef(db, recipientOwner, 'inbox').doc(messageId);
  const limitRef = mailboxRef(db, sender.uid);
  const now = new Date().toISOString();

  const party = p => p.isSuperadmin
    ? { uid: null, name: "It's A Simple Job Superadmin", email: null, role: 'superadmin' }
    : { uid: p.uid, name: p.name || p.email || 'User', email: p.email || null, role: 'user' };

  return db.runTransaction(async tx => {
    // Firestore transactions: every read before any write
    const existing = await tx.get(sentRef);
    if (existing.exists) {
      return { message: publicMessage(existing), tokensCharged: existing.data().tokensCharged || 0, duplicate: true };
    }

    const limitSnap = sender.isSuperadmin ? null : await tx.get(limitRef);
    const walletSnap = priceTokens > 0 ? await tx.get(walletRef(db, sender.uid)) : null;

    // Rate limit (also protects the free superadmin inbox from floods)
    let rate = null;
    if (limitSnap) {
      const data = limitSnap.data() || {};
      const windowStart = Date.parse(data.rateWindowStart || 0) || 0;
      const inWindow = Date.now() - windowStart < RATE_WINDOW_MS;
      const count = inWindow ? (data.rateCount || 0) : 0;
      if (count >= RATE_MAX_MESSAGES) {
        throw new HttpError(429, 'You have sent a lot of messages in the last few minutes. Please wait a little and try again.');
      }
      rate = { rateWindowStart: inWindow ? data.rateWindowStart : now, rateCount: count + 1 };
    }

    // Charge the sender (whole tokens) if this message is not free
    let availableAfter = null;
    if (priceTokens > 0) {
      const available = walletSnap.data()?.available || 0;
      if (available < priceTokens) {
        throw new HttpError(402, `This message costs ${priceTokens} token${priceTokens === 1 ? '' : 's'} and you have ${available}. Buy tokens in your Token Wallet. Messages to the superadmin are free.`);
      }
      availableAfter = available - priceTokens;
    }

    const message = {
      from: party(sender),
      to: party(recipient),
      subject,
      body,
      createdAt: now,
      tokensCharged: priceTokens
    };

    tx.create(sentRef, { ...message, read: true });
    tx.create(inboxRef, { ...message, read: false });
    if (rate) tx.set(limitRef, rate, { merge: true });
    if (priceTokens > 0) {
      tx.update(walletRef(db, sender.uid), { available: availableAfter, updatedAt: now });
      tx.create(walletRef(db, sender.uid).collection('ledger').doc(`message_${messageId}`), {
        type: 'message',
        tokens: -priceTokens,
        availableAfter,
        ref: messageId,
        createdAt: now
      });
    }

    return { message: { id: messageId, ...message, read: true }, tokensCharged: priceTokens, duplicate: false };
  });
}
