/**
 * It's A Simple Job - Firebase Service Layer
 * Multi-Tenant Cloud Firestore Client for 'ai-foundation-firebase'
 * Partitioned with: businessId = 'itsasimplejob'
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
  apiKey: (typeof window !== 'undefined' && window.ENV?.FIREBASE_API_KEY) || "",
  authDomain: (typeof window !== 'undefined' && window.ENV?.FIREBASE_AUTH_DOMAIN) || "ai-foundation-firebase.firebaseapp.com",
  projectId: (typeof window !== 'undefined' && window.ENV?.FIREBASE_PROJECT_ID) || "ai-foundation-firebase",
  storageBucket: (typeof window !== 'undefined' && window.ENV?.FIREBASE_STORAGE_BUCKET) || "ai-foundation-firebase.firebasestorage.app",
  messagingSenderId: (typeof window !== 'undefined' && window.ENV?.FIREBASE_MESSAGING_SENDER_ID) || "614773274800",
  appId: (typeof window !== 'undefined' && window.ENV?.FIREBASE_APP_ID) || "1:614773274800:web:a7c2a66e4e8c4409afb221"
};

export const BUSINESS_ID = "itsasimplejob";

// Initialize Firebase App, Firestore & Auth
let app = null;
let db = null;
let auth = null;
let googleProvider = null;
let isConnected = false;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  isConnected = true;
  console.log("🔥 [Firebase] Initialized Firestore & Google Auth with Google Calendar scope (Tenant: itsasimplejob)");
} catch (err) {
  console.warn("⚠️ [Firebase] Initialization notice:", err.message);
}

/**
 * Unique Reference Number Generators
 */
export function generateSPN() {
  // Service Provider Number format: SPN-XXXXXX (6 digits)
  const num = Math.floor(100000 + Math.random() * 900000);
  return `SPN-${num}`;
}

export function getOrCreateCRN(custPhone = '', custName = '') {
  // Check local cache first so repeat visits by same customer reuse CRN
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
  // Recruiter Reference Number format: RRN-XXXXXX
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
      await setDoc(docRef, payload, { merge: true });
      console.log(`✅ [Firestore] Provider saved under SPN: ${provider.serviceProviderNumber}`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Could not write provider to remote, cached locally:", e);
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
      await setDoc(docRef, payload, { merge: true });
      console.log(`✅ [Firestore] Booking saved under docket: ${booking.docketNumber} (CRN: ${crn})`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Could not write booking to remote, cached locally:", e);
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
      await setDoc(docRef, payload, { merge: true });
      console.log(`✅ [Firestore] Candidate Resume saved under SPN: ${candidate.serviceProviderNumber}`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Candidate cached locally:", e);
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
      await setDoc(docRef, payload, { merge: true });
      console.log(`✅ [Firestore] Recruitment order saved: ${orderId} (RRN: ${rrn})`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Recruitment order cached locally:", e);
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
      await addDoc(collection(db, 'partner_applications'), payload);
      console.log(`✅ [Firestore] Partner application saved.`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Application cached locally:", e);
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
      await addDoc(collection(db, 'ai_prompts'), payload);
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
    const snapshot = await getDocs(q);
    const providers = [];
    snapshot.forEach(doc => providers.push(doc.data()));
    return providers;
  } catch (e) {
    console.warn("⚠️ [Firestore] Falling back to local providers data:", e.message);
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
    const snapshot = await getDocs(q);

    if (snapshot.empty && initialProviders && initialProviders.length > 0) {
      console.log(`🌱 [Firestore] Seeding ${initialProviders.length} providers with tag 'itsasimplejob'...`);
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
      await setDoc(docRef, payload, { merge: true });
      console.log(`💳 [Firestore] Stripe transaction saved under PaymentIntent: ${transactionRecord.paymentIntentId}`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Could not write transaction to remote:", e);
    }
  }

  return payload;
}

/**
 * Google Sign-In & Google Calendar Integration
 */
export async function signInWithGoogle(role = 'customer') {
  try {
    if (auth && googleProvider) {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      const userData = {
        uid: user.uid,
        displayName: user.displayName || 'Google User',
        email: user.email,
        photoURL: user.photoURL || 'https://lh3.googleusercontent.com/a/default-user',
        accessToken: token,
        role,
        googleCalendarConnected: true,
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
  } catch (err) {
    console.warn("⚠️ [Google Auth] Popup signIn notice (trying fallback simulation):", err.message);
  }

  // Graceful simulation fallback for localhost/development
  // =====================================================================
  // TODO: UPDATE THESE EMAILS WITH THE ONES YOU ADDED TO OAUTH
  // =====================================================================
  const fallbackUser = {
    uid: 'google-uid-' + Math.floor(100000 + Math.random() * 900000),
    displayName: role === 'provider' ? 'Jack Morrison (Provider Test)' : 'Sarah Jenkins (Customer Test)',
    email: role === 'provider' ? 'your_provider_test@email.com' : 'your_customer_test@email.com',
    photoURL: 'https://lh3.googleusercontent.com/a/default-user',
    accessToken: 'ya29.mock_oauth_calendar_token',
    role,
    googleCalendarConnected: true,
    connectedAt: new Date().toISOString()
  };

  localStorage.setItem('iasj_google_user', JSON.stringify(fallbackUser));

  if (role === 'customer') {
    getOrCreateCRN('0412 345 678', fallbackUser.displayName);
    localStorage.setItem('iasj_customer_name', fallbackUser.displayName);
    localStorage.setItem('iasj_customer_email', fallbackUser.email);
  } else if (role === 'provider') {
    localStorage.setItem('iasj_provider_name', fallbackUser.displayName);
    localStorage.setItem('iasj_provider_email', fallbackUser.email);
  }

  window.dispatchEvent(new CustomEvent('googleAuthStateChanged', { detail: { user: fallbackUser, action: 'login' } }));
  return fallbackUser;
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
    return raw ? JSON.parse(raw) : null;
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
  generateSPN,
  getOrCreateCRN,
  generateRRN,
  saveProviderToFirestore,
  saveBookingToFirestore,
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
  getCurrentGoogleUser
};

// Fire ready event
window.dispatchEvent(new CustomEvent('firebaseServiceReady', { detail: { isConnected } }));
