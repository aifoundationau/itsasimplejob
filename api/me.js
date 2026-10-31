/**
 * GET /api/me  (Authorization: Bearer <Firebase ID token>)
 * Returns the verified signed-in user and whether they are a superadmin.
 */

import { allowMethods, sendError, sendJson } from '../server/http.js';
import { hasAdminCredentials, isSuperadmin, requireUser } from '../server/firebase-admin.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const user = await requireUser(req);
    return sendJson(res, 200, {
      uid: user.uid,
      email: user.email,
      name: user.name,
      isSuperadmin: isSuperadmin(user),
      tokensEnabled: hasAdminCredentials()
    });
  } catch (err) {
    return sendError(res, err);
  }
}
