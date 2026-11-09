/**
 * Messages between users (Admin Page > Messages).  Authorization: Bearer <Firebase ID token>
 *
 * GET   /api/messages?folder=inbox|sent
 *   The signed-in user's messages (superadmins see the shared superadmin mailbox), the unread
 *   count and what a message to another user costs.
 *
 * POST  /api/messages   { to: 'superadmin' | '<email>', subject, body, clientMessageId }
 *   Sends a message. Messages to the superadmin are free (so are the superadmin's own messages);
 *   messages to other users cost the price-list amount in tokens, charged when the message is sent.
 *
 * PATCH /api/messages   { id }
 *   Marks an inbox message as read.
 */

import { allowMethods, getQuery, readJsonBody, sendError, sendJson } from '../server/http.js';
import { HttpError, findUserByEmail, isSuperadmin, isSuperadminEmail, requireAdminDb, requireUser } from '../server/firebase-admin.js';
import { getPricing } from '../server/token-pricing.js';
import { countUnread, listMessages, markRead, sendMessage } from '../server/messages.js';
import { getWallet } from '../server/tokens.js';
import {
  MESSAGE_BODY_MAX,
  MESSAGE_SUBJECT_MAX,
  SUPERADMIN_MAILBOX,
  messagePriceTokens
} from '../shared/pricing.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

// Strip control characters (keeps line breaks and tabs) and trim
const cleanText = (value, max) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim()
  .slice(0, max);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;

  try {
    const user = await requireUser(req);
    const db = requireAdminDb();
    const superadmin = isSuperadmin(user);
    const owner = superadmin ? SUPERADMIN_MAILBOX : user.uid;

    if (req.method === 'GET') {
      const folder = getQuery(req).get('folder') === 'sent' ? 'sent' : 'inbox';
      const [{ pricing }, messages, unread] = await Promise.all([
        getPricing(),
        listMessages(db, owner, folder),
        countUnread(db, owner)
      ]);
      return sendJson(res, 200, {
        mailbox: superadmin ? 'superadmin' : 'personal',
        isSuperadmin: superadmin,
        folder,
        messages,
        unread,
        messagePriceTokens: messagePriceTokens(pricing, { toSuperadmin: false, fromSuperadmin: superadmin }),
        tokenPriceAud: pricing.tokenPriceAud
      });
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'Invalid request body.' });
    }

    if (req.method === 'PATCH') {
      const id = String(body.id || '');
      if (!MESSAGE_ID_PATTERN.test(id)) return sendJson(res, 400, { error: 'Invalid message reference.' });
      await markRead(db, owner, id);
      return sendJson(res, 200, { ok: true, unread: await countUnread(db, owner) });
    }

    // POST: send a message
    const subject = cleanText(body.subject, MESSAGE_SUBJECT_MAX);
    const text = cleanText(body.body, MESSAGE_BODY_MAX);
    const clientMessageId = String(body.clientMessageId || '');
    const to = String(body.to || '').trim();

    if (!subject) return sendJson(res, 400, { error: 'Please add a subject.' });
    if (!text) return sendJson(res, 400, { error: 'Please write a message.' });
    if (!CLIENT_ID_PATTERN.test(clientMessageId)) return sendJson(res, 400, { error: 'Invalid message reference.' });

    let recipient;
    if (to.toLowerCase() === SUPERADMIN_MAILBOX || isSuperadminEmail(to)) {
      if (superadmin) return sendJson(res, 400, { error: 'You are the superadmin. Send your message to another user by email.' });
      recipient = { isSuperadmin: true };
    } else {
      if (!EMAIL_PATTERN.test(to)) return sendJson(res, 400, { error: 'Enter the email address of the person you want to message, or choose the superadmin.' });
      if (to.toLowerCase() === String(user.email || '').toLowerCase()) {
        return sendJson(res, 400, { error: 'You cannot send a message to yourself.' });
      }
      const found = await findUserByEmail(to);
      if (!found) {
        return sendJson(res, 404, { error: "We couldn't find an It's A Simple Job user with that email address. They need to sign in once before they can receive messages." });
      }
      recipient = { ...found, isSuperadmin: false };
    }

    const { pricing } = await getPricing();
    const priceTokens = messagePriceTokens(pricing, { toSuperadmin: recipient.isSuperadmin, fromSuperadmin: superadmin });

    const result = await sendMessage(db, {
      sender: { uid: user.uid, name: user.name, email: user.email, isSuperadmin: superadmin },
      recipient,
      subject,
      body: text,
      priceTokens,
      clientMessageId
    });

    return sendJson(res, 200, {
      message: result.message,
      tokensCharged: result.tokensCharged,
      free: result.tokensCharged === 0,
      wallet: result.tokensCharged > 0 ? await getWallet(db, user.uid) : null
    });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err);
    return sendError(res, err, 'Could not reach your messages. Please try again.');
  }
}
