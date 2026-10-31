/**
 * GET /api/wallet  (Authorization: Bearer <Firebase ID token>)
 * Returns the signed-in user's token balance and recent activity.
 * Also settles any purchases left pending (e.g. the browser closed right after paying).
 */

import { allowMethods, sendError, sendJson } from '../server/http.js';
import { requireAdminDb, requireUser } from '../server/firebase-admin.js';
import { getStripe } from '../server/stripe.js';
import { getLedger, getWallet, settlePendingPurchases } from '../server/tokens.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const user = await requireUser(req);
    const db = requireAdminDb();

    const stripe = getStripe();
    if (stripe) await settlePendingPurchases(db, stripe, user.uid);

    const [wallet, activity] = await Promise.all([getWallet(db, user.uid), getLedger(db, user.uid)]);
    return sendJson(res, 200, { ...wallet, activity });
  } catch (err) {
    return sendError(res, err, 'Could not load your wallet.');
  }
}
