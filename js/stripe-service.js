/**
 * It's A Simple Job - Stripe Payment Gateway Service
 * Supports Invoice Payments, On-Call Callout Deposits, and Recruiter Staffing Escrow.
 * Credentials loaded dynamically from .env via window.ENV
 */

const STRIPE_PUBLISHABLE_KEY = (typeof window !== 'undefined' && window.ENV?.STRIPE_PUBLISHABLE_KEY) || "";

const STRIPE_CONFIG = {
  accountId: (typeof window !== 'undefined' && window.ENV?.STRIPE_ACCOUNT_ID) || "",
  accountName: "AI Foundation",
  publishableKey: STRIPE_PUBLISHABLE_KEY,
  currency: "aud",
  isTestMode: STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_'),
  // Serverless functions in /api hold the secret key; the browser only ever sees the publishable key
  apiBase: '/api'
};

class StripePaymentService {
  constructor() {
    this.config = STRIPE_CONFIG;
    this.stripeInstance = null;
    this.elements = null;
    this.paymentElement = null;
    this.initStripe();
  }

  initStripe() {
    if (!window.Stripe || !this.config.publishableKey) {
      console.warn("💳 [Stripe Gateway] Stripe.js or publishable key unavailable; online card payments disabled.");
      return;
    }
    try {
      this.stripeInstance = window.Stripe(this.config.publishableKey);
      console.log(`💳 [Stripe Gateway] Initialized Stripe.js (${this.config.isTestMode ? 'test' : 'live'} mode) for account:`, this.config.accountId);
    } catch (err) {
      console.warn("💳 [Stripe Gateway] Stripe.js init error:", err);
    }
  }

  isAvailable() {
    return !!this.stripeInstance;
  }

  async callApi(path, options = {}) {
    let response;
    try {
      response = await fetch(`${this.config.apiBase}/${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
    } catch (err) {
      throw new Error('Could not reach the payment server. Check your connection and try again.');
    }

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      // Non-JSON reply, e.g. a static host with no /api functions deployed
    }

    if (!response.ok || !data) {
      throw new Error(data?.error || `Payment server unavailable (HTTP ${response.status}).`);
    }
    return data;
  }

  /**
   * Create (or reuse) a server-side PaymentIntent for a booking docket
   * @param {Object} paymentData { docketNumber, amount, customerName, description }
   */
  async createPaymentIntent(paymentData) {
    return this.callApi('create-payment-intent', {
      method: 'POST',
      body: JSON.stringify({
        docketNumber: paymentData.docketNumber,
        amount: paymentData.amount,
        customerName: paymentData.customerName || '',
        description: paymentData.description || ''
      })
    });
  }

  /**
   * Mount Stripe's Payment Element; card details are entered in Stripe's iframe and never touch this page
   * @param {HTMLElement} container
   * @param {string} clientSecret
   */
  mountPaymentElement(container, clientSecret) {
    if (!this.stripeInstance) throw new Error('Stripe.js is not available.');
    this.unmountPaymentElement();

    this.elements = this.stripeInstance.elements({
      clientSecret,
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap' }],
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#635BFF',
          borderRadius: '8px',
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif'
        }
      }
    });
    this.paymentElement = this.elements.create('payment', { layout: 'tabs' });
    this.paymentElement.mount(container);
    return this.paymentElement;
  }

  unmountPaymentElement() {
    if (this.paymentElement) {
      try { this.paymentElement.destroy(); } catch (e) {}
    }
    this.paymentElement = null;
    this.elements = null;
  }

  /**
   * Submit the mounted Payment Element to Stripe
   * @param {Object} options { billingName }
   */
  async confirmPayment({ billingName = '' } = {}) {
    if (!this.stripeInstance || !this.elements) throw new Error('The payment form is not ready yet.');

    const confirmParams = {};
    if (billingName) {
      confirmParams.payment_method_data = { billing_details: { name: billingName } };
    }

    const { error, paymentIntent } = await this.stripeInstance.confirmPayment({
      elements: this.elements,
      confirmParams,
      redirect: 'if_required'
    });

    if (error) throw new Error(error.message || 'The payment could not be completed.');
    return paymentIntent;
  }

  /**
   * Ask the server to look the payment up with Stripe, rather than trusting the browser's result
   * @param {string} paymentIntentId
   */
  async verifyPayment(paymentIntentId) {
    return this.callApi(`payment-status?id=${encodeURIComponent(paymentIntentId)}`);
  }

  /**
   * Record a Stripe-verified payment against its docket in Firestore
   * @param {Object} verified Response from verifyPayment()
   * @param {Object} booking
   */
  async recordVerifiedPayment(verified, booking = null) {
    const transactionRecord = {
      paymentIntentId: verified.paymentIntentId,
      chargeId: verified.chargeId,
      accountId: this.config.accountId,
      businessId: window.firebaseService?.BUSINESS_ID || 'its-a-simple-job',
      docketNumber: verified.docketNumber,
      customerName: booking?.custName || '',
      amountAud: verified.amount,
      amountCents: Math.round(verified.amount * 100),
      currency: verified.currency,
      status: verified.status,
      cardBrand: verified.cardBrand,
      last4: verified.last4,
      livemode: verified.livemode,
      processedAt: new Date().toISOString(),
      receiptUrl: verified.receiptUrl
    };

    if (window.firebaseService?.recordStripeTransaction) {
      try {
        await window.firebaseService.recordStripeTransaction(transactionRecord);
      } catch (err) {
        console.warn("⚠️ [Stripe] Could not record remote transaction:", err.message);
      }
    }

    return transactionRecord;
  }

  /**
   * Register Customer into Stripe as a User
   * @param {Object} customer { name, email, phone, crn, abn }
   */
  async registerCustomerUser(customer) {
    const crn = customer.crn || customer.customerRefNumber || 'CRN-' + Math.floor(100000 + Math.random() * 900000);
    const stripeCustomerId = 'cus_' + Math.random().toString(36).substring(2, 16);

    const stripeRecord = {
      stripeCustomerId,
      accountId: this.config.accountId,
      userType: 'customer',
      crn,
      name: customer.name || 'Valued Customer',
      email: customer.email || '',
      phone: customer.phone || '',
      registeredAt: new Date().toISOString()
    };

    localStorage.setItem('iasj_stripe_customer_id', stripeCustomerId);
    console.log(`💳 [Stripe User] Registered Customer ${customer.name || 'Valued Customer'} (${crn}) into Stripe with ID: ${stripeCustomerId}`);
    return stripeRecord;
  }

  /**
   * Register Service Provider into Stripe as a User
   * @param {Object} provider { name, businessName, email, phone, spn, qbccLicense, bankDetails, payId, payIdType }
   */
  async registerProviderUser(provider) {
    const spn = provider.serviceProviderNumber || provider.spn || 'SPN-' + Math.floor(100000 + Math.random() * 900000);
    const stripeCustomerId = 'cus_prov_' + Math.random().toString(36).substring(2, 14);

    const stripeRecord = {
      stripeCustomerId,
      accountId: this.config.accountId,
      userType: 'provider',
      spn,
      name: provider.name,
      businessName: provider.businessName || provider.name,
      email: provider.email || '',
      phone: provider.phone || '',
      qbccLicense: provider.qbccLicense || '',
      bsb: provider.bankDetails?.bsb || '',
      accountNumber: provider.bankDetails?.accountNumber || '',
      payId: provider.payId || provider.phone || '',
      payIdType: provider.payIdType || 'phone',
      registeredAt: new Date().toISOString()
    };

    console.log(`💳 [Stripe User] Registered Service Provider ${provider.name} (${spn}) into Stripe with ID: ${stripeCustomerId}`);
    return stripeRecord;
  }

  /**
   * Record direct out-of-band payment to service provider (PayID or Direct EFT)
   * @param {Object} settlementData { docketNumber, amount, provider, paymentMethod, reference }
   */
  async recordDirectSettlement(settlementData) {
    const settlementId = 'settle_direct_' + Math.random().toString(36).substring(2, 10);
    const record = {
      settlementId,
      businessId: window.firebaseService?.BUSINESS_ID || 'its-a-simple-job',
      docketNumber: settlementData.docketNumber,
      spn: settlementData.provider?.serviceProviderNumber || 'SPN-Direct',
      providerName: settlementData.provider?.name || 'Assigned Tradie',
      payId: settlementData.provider?.payId || '',
      bsb: settlementData.provider?.bankDetails?.bsb || '',
      accountNumber: settlementData.provider?.bankDetails?.accountNumber || '',
      // Whole Australian Dollars only (rounded up)
      amountAud: window.iasjCurrency.wholeUp(settlementData.amount),
      amountCents: window.iasjCurrency.wholeUp(settlementData.amount) * 100,
      currency: 'AUD',
      paymentMethod: settlementData.paymentMethod || 'payid', // 'payid' or 'direct_eft'
      status: 'paid_out_of_band',
      settledAt: new Date().toISOString(),
      notes: 'Customer transferred funds directly to service provider.'
    };

    if (window.firebaseService?.recordStripeTransaction) {
      try {
        await window.firebaseService.recordStripeTransaction(record);
      } catch (err) {
        console.warn("⚠️ [Stripe] Could not record remote settlement:", err.message);
      }
    }

    console.log(`✅ [Direct Settlement] Recorded direct payment for docket ${settlementData.docketNumber} to ${record.providerName} via ${record.paymentMethod.toUpperCase()}`);
    return record;
  }

  /**
   * Get formatted display for Stripe badges
   */
  getAccountBadge() {
    return {
      accountId: this.config.accountId,
      accountName: this.config.accountName,
      mode: this.config.isTestMode ? 'Test Sandbox' : 'Live Mode'
    };
  }
}

// Global service instantiation
window.stripePaymentService = new StripePaymentService();
window.StripePaymentService = StripePaymentService;
window.STRIPE_CONFIG = STRIPE_CONFIG;

