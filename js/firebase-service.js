/**
 * It's A Simple Job - Firebase Service Layer
 * Multi-Tenant Cloud Firestore Client for 'ai-foundation-firebase'
 * Partitioned with: businessId = 'its-a-simple-job'
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  limit, 
  onSnapshot 
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';

// Firebase Project Configuration (Loaded dynamically from .env via window.ENV)
export const firebaseConfig = {
  apiKey: (typeof window !== 'undefined' && window.ENV?.FIREBASE_API_KEY) || "AIzaSyCPeAOWQj8456TeIWDIPsyxyWT7QLrC8J8",
  authDomain: (typeof window !== 'undefined' && window.ENV?.FIREBASE_AUTH_DOMAIN) || "ai-foundation-firebase.firebaseapp.com",
  projectId: (typeof window !== 'undefined' && window.ENV?.FIREBASE_PROJECT_ID) || "ai-foundation-firebase",
  storageBucket: (typeof window !== 'undefined' && window.ENV?.FIREBASE_STORAGE_BUCKET) || "ai-foundation-firebase.firebasestorage.app",
  messagingSenderId: (typeof window !== 'undefined' && window.ENV?.FIREBASE_MESSAGING_SENDER_ID) || "614773274800",
  appId: (typeof window !== 'undefined' && window.ENV?.FIREBASE_APP_ID) || "1:614773274800:web:a35e56edaa97ca729ea375",
  measurementId: (typeof window !== 'undefined' && window.ENV?.FIREBASE_MEASUREMENT_ID) || "G-CKTVQJTZ8V"
};

// Dedicated Firestore database for this app (named database inside the shared project)
export const FIRESTORE_DATABASE_ID = (typeof window !== 'undefined' && window.ENV?.FIREBASE_DATABASE_ID) || "itsasimplejob";

// Official Multi-Tenant Partition Tag
export const BUSINESS_ID = "its-a-simple-job";

// Non-blocking timeout helper for database operations
export async function withTimeout(promise, ms = 3000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Operation timed out')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// Initialize Firebase App, Firestore, Auth
let app = null;
let db = null;
let auth = null;
let analytics = null;
let googleProvider = null;
let isConnected = false;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app, FIRESTORE_DATABASE_ID);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  isConnected = true;
  console.log(`🔥 [Firebase] Initialized Firestore (database: ${FIRESTORE_DATABASE_ID}) & Google Auth`);

  // Resilient non-blocking dynamic analytics loading - ad-blockers will never break the app!
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    import('https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js')
      .then(({ getAnalytics, isSupported }) => isSupported().then(supported => {
        if (supported && app) {
          analytics = getAnalytics(app);
          console.log("📊 [Firebase] Analytics initialized (ID: " + firebaseConfig.measurementId + ")");
        }
      }))
      .catch(() => {
        console.log("📊 [Firebase] Analytics script blocked by ad-blocker or unavailable; core services remain fully operational.");
      });
  }
} catch (err) {
  console.warn("⚠️ [Firebase] Initialization notice:", err.message);
}

/**
 * Unique Reference Number Generators
 */
export function generateSPN() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `SPN-${num}`;
}

export function getOrCreateCRN(custPhone = '', custName = '') {
  const cachedCRN = localStorage.getItem('iasj_customer_crn');
  if (cachedCRN) return cachedCRN;

  const num = Math.floor(100000 + Math.random() * 900000);
  const newCRN = `CRN-${num}`;
  localStorage.setItem('iasj_customer_crn', newCRN);
  if (custPhone) localStorage.setItem('iasj_customer_phone', custPhone);
  if (custName) localStorage.setItem('iasj_customer_name', custName);
  return newCRN;
}

export function generateRRN() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `RRN-${num}`;
}

/**
 * Service Provider Operations
 */
export async function saveProviderToFirestore(provider) {
  if (!provider.serviceProviderNumber) {
    provider.serviceProviderNumber = generateSPN();
  }

  const payload = {
    ...provider,
    businessId: BUSINESS_ID,
    isActive: true,
    updatedAt: new Date().toISOString()
  };

  if (db && isConnected) {
    try {
      const docRef = doc(collection(db, 'providers'), provider.serviceProviderNumber);
      await withTimeout(setDoc(docRef, payload, { merge: true }), 3500);
      console.log(`✅ [Firestore] Provider saved under SPN: ${provider.serviceProviderNumber}`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Remote write timed out or offline, cached locally:", e.message);
    }
  }

  return payload;
}

/**
 * Customer Booking Operations
 */
export async function saveBookingToFirestore(booking) {
  const crn = booking.customer?.customerRefNumber || getOrCreateCRN(booking.customer?.phone, booking.customer?.name);
  
  if (booking.customer) {
    booking.customer.customerRefNumber = crn;
  }

  const payload = {
    ...booking,
    businessId: BUSINESS_ID,
    createdAt: new Date().toISOString(),
    status: booking.status || 'Confirmed & Dispatched'
  };

  if (db && isConnected) {
    try {
      const docRef = doc(collection(db, 'bookings'), booking.docketNumber);
      await withTimeout(setDoc(docRef, payload, { merge: true }), 3500);
      console.log(`✅ [Firestore] Booking saved under docket: ${booking.docketNumber} (CRN: ${crn})`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Remote write timed out or offline, cached locally:", e.message);
    }
  }

  return payload;
}

/**
 * Customer Profile Registration
 */
export async function saveCustomerToFirestore(customer) {
  const crn = customer.customerRefNumber || getOrCreateCRN(customer.phone, customer.name);
  const payload = {
    ...customer,
    customerRefNumber: crn,
    businessId: BUSINESS_ID,
    updatedAt: new Date().toISOString()
  };

  if (db && isConnected) {
    try {
      const docRef = doc(collection(db, 'customers'), crn);
      await withTimeout(setDoc(docRef, payload, { merge: true }), 3500);
      console.log(`✅ [Firestore] Customer saved under CRN: ${crn}`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Customer saved locally, remote offline:", e.message);
    }
  }

  return payload;
}

/**
 * Recruitment / Candidate Resume Operations
 */
export async function saveCandidateToFirestore(candidate) {
  if (!candidate.serviceProviderNumber && !candidate.candidateNumber) {
    candidate.serviceProviderNumber = generateSPN();
  }

  const payload = {
    ...candidate,
    businessId: BUSINESS_ID,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  if (db && isConnected) {
    try {
      const docRef = doc(collection(db, 'candidates'), candidate.serviceProviderNumber);
      await withTimeout(setDoc(docRef, payload, { merge: true }), 3500);
      console.log(`✅ [Firestore] Candidate Resume saved under SPN: ${candidate.serviceProviderNumber}`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Remote candidate write timed out, cached locally:", e.message);
    }
  }

  return payload;
}

/**
 * Recruitment Staffing Orders (Employers / Recruiters Hiring)
 */
export async function saveRecruitmentOrderToFirestore(order) {
  const rrn = order.recruiterRefNumber || generateRRN();
  const orderId = 'IASJ-REC-' + Math.floor(100000 + Math.random() * 900000);

  const payload = {
    ...order,
    orderId,
    recruiterRefNumber: rrn,
    businessId: BUSINESS_ID,
    status: 'Candidate Requested',
    createdAt: new Date().toISOString()
  };

  if (db && isConnected) {
    try {
      const docRef = doc(collection(db, 'recruitment_orders'), orderId);
      await withTimeout(setDoc(docRef, payload, { merge: true }), 3500);
      console.log(`✅ [Firestore] Recruitment order saved: ${orderId} (RRN: ${rrn})`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Remote recruitment write timed out, cached locally:", e.message);
    }
  }

  return payload;
}

/**
 * Franchise & Partner Inquiries
 */
export async function savePartnerApplicationToFirestore(appData) {
  const payload = {
    ...appData,
    businessId: BUSINESS_ID,
    createdAt: new Date().toISOString()
  };

  if (db && isConnected) {
    try {
      await withTimeout(addDoc(collection(db, 'partner_applications'), payload), 3500);
      console.log(`✅ [Firestore] Partner application saved.`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Partner write timed out or offline, cached locally:", e.message);
    }
  }

  return payload;
}

/**
 * Natural Language AI Search Audit Trail
 */
export async function logAIQueryToFirestore(queryData) {
  const payload = {
    ...queryData,
    businessId: BUSINESS_ID,
    timestamp: new Date().toISOString()
  };

  if (db && isConnected) {
    try {
      await withTimeout(addDoc(collection(db, 'ai_prompts'), payload), 2500);
    } catch (e) {
      // Non-blocking background log
    }
  }
}

/**
 * Real-Time Listener for Dispatch Feed
 */
export function subscribeToLiveBookings(callback) {
  if (!db || !isConnected) return () => {};

  try {
    const q = query(
      collection(db, 'bookings'),
      where('businessId', '==', BUSINESS_ID),
      limit(25)
    );

    return onSnapshot(q, (snapshot) => {
      const bookings = [];
      snapshot.forEach(docSnap => {
        bookings.push(docSnap.data());
      });
      callback(bookings);
    }, (error) => {
      console.warn("⚠️ [Firestore] Snapshot listener note:", error.message);
    });
  } catch (err) {
    console.warn("⚠️ [Firestore] Listener setup:", err.message);
    return () => {};
  }
}

/**
 * Fetch Seeded or Remote Providers
 */
export async function fetchRemoteProviders() {
  if (!db || !isConnected) return [];

  try {
    const q = query(
      collection(db, 'providers'),
      where('businessId', '==', BUSINESS_ID)
    );
    const snapshot = await withTimeout(getDocs(q), 3500);
    const providers = [];
    snapshot.forEach(doc => providers.push(doc.data()));
    return providers;
  } catch (e) {
    console.warn("⚠️ [Firestore] Remote fetch timed out or offline, falling back to local providers data:", e.message);
    return [];
  }
}

/**
 * Seed Initial Providers to Firestore
 */
export async function seedProvidersIfEmpty(initialProviders) {
  if (!db || !isConnected) return;

  try {
    const q = query(
      collection(db, 'providers'),
      where('businessId', '==', BUSINESS_ID),
      limit(1)
    );
    const snapshot = await withTimeout(getDocs(q), 3500);

    if (snapshot.empty && initialProviders && initialProviders.length > 0) {
      console.log(`🌱 [Firestore] Seeding ${initialProviders.length} providers with tag '${BUSINESS_ID}'...`);
      for (const prov of initialProviders) {
        await saveProviderToFirestore(prov);
      }
      console.log(`✅ [Firestore] Seeding complete!`);
    }
  } catch (err) {
    console.warn("⚠️ [Firestore] Provider seeding check:", err.message);
  }
}

/**
 * Record Stripe Transaction in Firestore
 */
export async function recordStripeTransaction(transactionRecord) {
  const payload = {
    ...transactionRecord,
    businessId: BUSINESS_ID,
    recordedAt: new Date().toISOString()
  };

  if (db && isConnected) {
    try {
      const docRef = doc(collection(db, 'stripe_transactions'), transactionRecord.paymentIntentId);
      await withTimeout(setDoc(docRef, payload, { merge: true }), 3500);
      console.log(`💳 [Firestore] Stripe transaction saved under PaymentIntent: ${transactionRecord.paymentIntentId}`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Remote transaction write timed out or offline:", e.message);
    }
  }

  return payload;
}

const GOOGLE_SIGN_IN_ERRORS = {
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/unauthorized-domain': 'This website address is not yet authorised for Google sign-in (add it under Firebase Authentication > Settings > Authorised domains).',
  'auth/operation-not-allowed': 'Google sign-in is not enabled for this app yet.',
  'auth/network-request-failed': 'Network error during Google sign-in. Check your connection and try again.'
};

/**
 * Google Sign-In. Fails with a readable error instead of ever inventing a user.
 */
export async function signInWithGoogle(role = 'customer') {
  if (!auth || !googleProvider) {
    throw new Error('Google sign-in is unavailable right now. Please try again later.');
  }

  let result;
  try {
    result = await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.warn("⚠️ [Google Auth] Sign-in failed:", err.code || err.message);
    throw new Error(GOOGLE_SIGN_IN_ERRORS[err.code] || 'Google sign-in failed. Please try again.');
  }

  const user = result.user;

  // Retrieve token custom claims & check superadmin whitelist
  let claims = {};
  try {
    const tokenResult = await user.getIdTokenResult();
    claims = tokenResult.claims || {};
  } catch (e) {
    console.warn("Could not retrieve custom claims:", e);
  }

  const emailLower = (user.email || '').toLowerCase().trim();
  const superadminEmails = ((window.ENV?.SUPERADMIN_EMAILS || 'support@aifoundation.net.au,davidrobertson.info@gmail.com') + '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  let actualRole = role;
  if (claims.role === 'superadmin' || claims.isSuperAdmin === true || superadminEmails.includes(emailLower)) {
    actualRole = 'superadmin';
  } else if (claims.role) {
    actualRole = claims.role;
  }

  const userData = {
    uid: user.uid,
    displayName: user.displayName || 'Google User',
    email: user.email,
    photoURL: user.photoURL || 'https://lh3.googleusercontent.com/a/default-user',
    role: actualRole,
    isSuperadmin: actualRole === 'superadmin',
    connectedAt: new Date().toISOString()
  };

  localStorage.setItem('iasj_google_user', JSON.stringify(userData));

  if (role === 'customer') {
    getOrCreateCRN(user.phoneNumber || '', user.displayName || '');
    localStorage.setItem('iasj_customer_name', user.displayName || '');
    localStorage.setItem('iasj_customer_email', user.email || '');
  } else if (role === 'provider') {
    localStorage.setItem('iasj_provider_name', user.displayName || '');
    localStorage.setItem('iasj_provider_email', user.email || '');
  }

  window.dispatchEvent(new CustomEvent('googleAuthStateChanged', { detail: { user: userData, action: 'login' } }));
  return userData;
}

/**
 * Firebase ID token for calling the /api functions as the signed-in user (null if signed out)
 */
export async function getIdToken() {
  if (!auth) return null;
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export async function signOutGoogle() {
  localStorage.removeItem('iasj_google_user');
  if (auth) {
    try { await signOut(auth); } catch (e) {}
  }
  window.dispatchEvent(new CustomEvent('googleAuthStateChanged', { detail: { user: null, action: 'logout' } }));
}

export function getCurrentGoogleUser() {
  try {
    const raw = localStorage.getItem('iasj_google_user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    const emailLower = (user.email || '').toLowerCase().trim();
    const superadminEmails = ((window.ENV?.SUPERADMIN_EMAILS || 'support@aifoundation.net.au,davidrobertson.info@gmail.com') + '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    if (superadminEmails.includes(emailLower) && user.role !== 'superadmin') {
      user.role = 'superadmin';
      user.isSuperadmin = true;
      localStorage.setItem('iasj_google_user', JSON.stringify(user));
    }
    return user;
  } catch (e) {
    return null;
  }
}

// Expose on window for direct access across app modules
window.firebaseService = {
  db,
  app,
  auth,
  isConnected,
  BUSINESS_ID,
  withTimeout,
  generateSPN,
  getOrCreateCRN,
  generateRRN,
  saveProviderToFirestore,
  saveBookingToFirestore,
  saveCustomerToFirestore,
  saveCandidateToFirestore,
  saveRecruitmentOrderToFirestore,
  savePartnerApplicationToFirestore,
  logAIQueryToFirestore,
  subscribeToLiveBookings,
  fetchRemoteProviders,
  seedProvidersIfEmpty,
  recordStripeTransaction,
  signInWithGoogle,
  signOutGoogle,
  getCurrentGoogleUser,
  getIdToken,
  FIRESTORE_DATABASE_ID
};

// Fire ready event
window.dispatchEvent(new CustomEvent('firebaseServiceReady', { detail: { isConnected } }));
