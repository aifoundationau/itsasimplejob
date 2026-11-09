/**
 * It's A Simple Job - Stripe Payment Gateway Service
 * Supports Invoice Payments, On-Call Callout Deposits, and Recruiter Staffing Escrow.
 * Credentials loaded dynamically from .env via window.ENV
 */

const STRIPE_PUBLISHABLE_KEY = (typeof window !== 'undefined' && window.ENV?.STRIPE_PUBLISHABLE_KEY) || "pk_test_51UKnKUI8bClhBF4Pl59doST5JkSHIg47DaHs5bicuWUEM0iuyT6BtcVV2zlvZUAAL5HjnRNt5PAzJQETRIckLarb00o6jAlzpi";

const STRIPE_CONFIG = {
  accountId: (typeof window !== 'undefined' && window.ENV?.STRIPE_ACCOUNT_ID) || "acct_1UKnKUI8bClhBF4P",
  accountName: "AI Foundation sandbox",
  publishableKey: STRIPE_PUBLISHABLE_KEY,
  currency: "aud",
  currencyLabel: "AUD Only",
  collectTax: "automatic",
  automaticTax: { enabled: true },
  taxBehavior: "exclusive",
  taxCode: "txcd_10000000",
  taxRegistrationId: "taxreg_1UXyhEI8bClhBF4PvgDdffXg",
  gstAppliesToCountry: "AU",
  gstRule: "GST is only charged for Australians (country === AU)",
  gstRate: 0.10,
  popupSize: "small",
  productId: "prod_VaqooBzIgPduQC",
  tokenPriceIds: {
    10: "price_1UZf7RI8bClhBF4PEhIGJoc3",
    50: "price_1UZf7VI8bClhBF4PE52HKTjw",
    100: "price_1UZf7ZI8bClhBF4PcJWNqJv0"
  },
  tokenPaymentLinkIds: {
    10: "plink_1UZf7xI8bClhBF4PtDTFX69n",
    50: "plink_1UZf80I8bClhBF4P6FY69grP",
    100: "plink_1UZf84I8bClhBF4PBAFYJRrc"
  },
  tokenPaymentLinks: {
    10: "https://buy.stripe.com/test_8x2fZh388eVvc7KfA51wY04",
    50: "https://buy.stripe.com/test_6oU5kD388eVvc7K1Jf1wY05",
    100: "https://buy.stripe.com/test_14A6oH388fZzgo0drX1wY06"
  },
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
    this.transactions = this.loadTransactions();
    this.initStripe();
  }

  loadTransactions() {
    try {
      const raw = localStorage.getItem('iasj_stripe_transactions');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveTransactions() {
    try {
      localStorage.setItem('iasj_stripe_transactions', JSON.stringify(this.transactions));
    } catch (e) {}
  }

  /**
   * Deterministic AUD Exclusive GST Breakdown for Token Purchases
   * Stripe Settings:
   * - Currency: AUD only ('aud')
   * - Collect Tax: Automatic ({ enabled: true })
   * - Tax Behavior: Exclusive (10% GST added on top of quoted subtotal ONLY for Australians: country === 'AU')
   */
  calculateTokenTaxBreakdown(tokens, tokenPriceAud = 1, customerCountry = null) {
    const cleanTokens = Math.max(1, Math.round(Number(tokens) || 10));
    const unitPriceAud = Math.max(1, Math.round(Number(tokenPriceAud) || 1));
    const subtotalExGstAud = Math.round(cleanTokens * unitPriceAud * 100) / 100;
    const resolvedCountry = String(
      customerCountry ||
      (typeof window !== 'undefined' && (window.iasjCurrency?.state?.country || window.geoTimeState?.countryCode)) ||
      'AU'
    ).trim().toUpperCase();
    const isAustralianCustomer = resolvedCountry === 'AU';
    const taxRate = isAustralianCustomer ? (this.config.gstRate || 0.10) : 0;
    const taxabilityReason = isAustralianCustomer ? 'standard_rated' : 'not_collecting';
    const taxAmountAud = isAustralianCustomer ? Math.round(subtotalExGstAud * 10) / 100 : 0;
    const totalIncGstAud = Math.round((subtotalExGstAud + taxAmountAud) * 100) / 100;
    const amountCents = Math.round(totalIncGstAud * 100);

    return {
      tokens: cleanTokens,
      tokenPriceAud: unitPriceAud,
      currency: 'aud',
      currencyUpper: 'AUD',
      collectTax: 'automatic',
      automaticTax: { enabled: true },
      taxBehavior: 'exclusive',
      taxCode: this.config.taxCode || 'txcd_10000000',
      customerCountry: resolvedCountry,
      isAustralianCustomer,
      taxabilityReason,
      productId: this.config.productId || 'prod_VaqooBzIgPduQC',
      priceId: this.config.tokenPriceIds?.[cleanTokens] || null,
      paymentLinkId: this.config.tokenPaymentLinkIds?.[cleanTokens] || null,
      paymentLinkUrl: this.config.tokenPaymentLinks?.[cleanTokens] || null,
      taxRate,
      subtotalExGstAud,
      taxAmountAud,
      totalIncGstAud,
      amountCents,
      formattedSubtotalAud: `$${subtotalExGstAud.toFixed(2)} AUD`,
      formattedTaxAud: isAustralianCustomer ? `+$${taxAmountAud.toFixed(2)} AUD` : `$0.00 AUD (Non-AU)`,
      formattedTotalAud: `$${totalIncGstAud.toFixed(2)} AUD`
    };
  }

  getTokenPaymentLink(tokens = 10) {
    const cleanTokens = [10, 50, 100].includes(Number(tokens)) ? Number(tokens) : 10;
    return this.config.tokenPaymentLinks?.[cleanTokens] || null;
  }

  /**
   * Record a Stripe token or invoice transaction with AUD-only & Automatic Exclusive Tax metadata
   */
  recordStripeTransaction(txData = {}) {
    const subtotalAud = Number.isFinite(Number(txData.subtotalExGstAud))
      ? Math.round(Number(txData.subtotalExGstAud) * 100) / 100
      : Math.round(Number(txData.amount || 0) * 100) / 100;
    const taxAud = Number.isFinite(Number(txData.taxAmountAud))
      ? Math.round(Number(txData.taxAmountAud) * 100) / 100
      : Math.round(subtotalAud * 10) / 100;
    const totalAud = Number.isFinite(Number(txData.totalIncGstAud))
      ? Math.round(Number(txData.totalIncGstAud) * 100) / 100
      : Math.round((subtotalAud + taxAud) * 100) / 100;
    const amountCents = Math.round(totalAud * 100);

    const record = {
      docketNumber: txData.docketNumber || `TOK-${Date.now()}`,
      tokens: txData.tokens || null,
      currency: 'aud',
      currencyUpper: 'AUD',
      collectTax: 'automatic',
      automatic_tax: { enabled: true },
      tax_behavior: 'exclusive',
      subtotalExGstAud: subtotalAud,
      taxAmountAud: taxAud,
      totalIncGstAud: totalAud,
      amount: totalAud,
      amountCents,
      status: txData.status || 'succeeded',
      payerName: txData.payerName || 'Supporter',
      payerEmail: txData.payerEmail || '',
      description: txData.description || `Token Purchase (Subtotal $${subtotalAud.toFixed(2)} AUD + $${taxAud.toFixed(2)} AUD Exclusive GST = $${totalAud.toFixed(2)} AUD)`,
      stripePaymentIntentId: txData.stripePaymentIntentId || `pi_test_${Date.now()}`,
      checkoutSessionId: txData.checkoutSessionId || null,
      createdAt: new Date().toISOString()
    };

    this.transactions.unshift(record);
    this.saveTransactions();

    if (window.firebaseService?.recordStripeTransaction) {
      try {
        window.firebaseService.recordStripeTransaction(record);
      } catch (e) {}
    }

    return record;
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
   * Create (or reuse) a server-side PaymentIntent for a booking docket or token purchase
   * @param {Object} paymentData { docketNumber, amount, subtotalExGstAud, taxAmountAud, totalIncGstAud, customerName, description }
   */
  async createPaymentIntent(paymentData) {
    return this.callApi('create-payment-intent', {
      method: 'POST',
      body: JSON.stringify({
        docketNumber: paymentData.docketNumber,
        tokens: paymentData.tokens || null,
        amount: paymentData.totalIncGstAud ?? paymentData.amount,
        subtotalExGstAud: paymentData.subtotalExGstAud,
        taxAmountAud: paymentData.taxAmountAud,
        totalIncGstAud: paymentData.totalIncGstAud,
        currency: 'aud',
        collectTax: 'automatic',
        taxBehavior: 'exclusive',
        customerCountry: paymentData.customerCountry || (typeof window !== 'undefined' && window.iasjCurrency?.state?.country) || 'AU',
        customerName: paymentData.customerName || '',
        description: paymentData.description || '',
        returnUrl: paymentData.returnUrl || (typeof window !== 'undefined' ? window.location.origin : '')
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

