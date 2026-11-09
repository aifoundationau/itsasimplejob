/**
 * It's A Simple Job - Server-side Firebase Admin helpers for the /api serverless functions.
 * Verifies signed-in users and gives server-only access to the dedicated Firestore database.
 * Token balances must only ever be changed through this module, never from the browser.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ai-foundation-firebase';
export const FIRESTORE_DATABASE_ID = process.env.FIREBASE_DATABASE_ID || 'itsasimplejob';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// FIREBASE_SERVICE_ACCOUNT holds the service account JSON, either raw or base64-encoded
function readServiceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  } catch (e) {
    console.error('🔥 [Firebase Admin] FIREBASE_SERVICE_ACCOUNT is not valid JSON (raw or base64).');
    return null;
  }
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = readServiceAccount();
  // Without credentials the app can still verify ID tokens, but cannot read or write Firestore
  return initializeApp(serviceAccount
    ? { credential: cert(serviceAccount), projectId: serviceAccount.project_id || PROJECT_ID }
    : { projectId: PROJECT_ID });
}

export function hasAdminCredentials() {
  return !!readServiceAccount();
}

export function getAdminDb() {
  if (!hasAdminCredentials()) return null;
  return getFirestore(getAdminApp(), FIRESTORE_DATABASE_ID);
}

export function requireAdminDb() {
  const db = getAdminDb();
  if (!db) throw new HttpError(503, 'Tokens are not configured on the server yet.');
  return db;
}

/**
 * Verify the "Authorization: Bearer <Firebase ID token>" header and return the signed-in user
 */
export async function requireUser(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!match) throw new HttpError(401, 'Please sign in with Google to continue.');

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(match[1]);
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      emailVerified: decoded.email_verified === true,
      name: decoded.name || ''
    };
  } catch (e) {
    throw new HttpError(401, 'Your sign-in has expired. Please sign in with Google again.');
  }
}

// Superadmins are listed by email in SUPERADMIN_EMAILS (comma-separated)
export function isSuperadminEmail(email) {
  const allowed = (process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(String(email).trim().toLowerCase());
}

export function isSuperadmin(user) {
  return !!user?.emailVerified && isSuperadminEmail(user.email);
}

/**
 * Look up a registered user by email (used to address messages). Returns null if there is no such user.
 */
export async function findUserByEmail(email) {
  if (!hasAdminCredentials()) throw new HttpError(503, 'Messages are not configured on the server yet.');
  try {
    const record = await getAuth(getAdminApp()).getUserByEmail(String(email).trim());
    return { uid: record.uid, email: record.email || '', name: record.displayName || '' };
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') return null;
    throw err;
  }
}
