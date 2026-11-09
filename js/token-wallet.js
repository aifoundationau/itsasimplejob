/**
 * It's A Simple Job - Token Wallet
 * Shows the signed-in user's balance and lets them buy tokens with Stripe.
 * Balances live on the server (/api/wallet); this module only displays them and starts purchases.
 *
 * 1 token = A$1 by default (the superadmin sets the token price). Tokens are always charged in
 * Australian Dollars. Visitors in Australia and New Zealand see AUD; everyone else also sees a
 * USD conversion at today's rate. Whole tokens only.
 */

const LEDGER_LABELS = {
  purchase: 'Tokens purchased',
  hold: 'Held for a job',
  release: 'Released to provider',
  refund: 'Refunded',
  earning: 'Earned from a job',
  payout: 'Cash-out',
  message: 'Message sent'
};

const MAX_TOKENS = 10000;
const cur = () => window.iasjCurrency;

class TokenWallet {
  constructor() {
    this.wallet = null;
    this.quoteInfo = null;
    this.selectedTokens = 25;
    this.checkout = null;
  }

  async api(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const idToken = await window.firebaseService?.getIdToken?.();
      if (!idToken) throw new Error('Please sign in with Google to use tokens.');
      headers.Authorization = `Bearer ${idToken}`;
    }

    let response;
    try {
      response = await fetch(`/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (err) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    let data = null;
    try { data = await response.json(); } catch (e) {}
    if (!response.ok || !data) throw new Error(data?.error || `Server unavailable (HTTP ${response.status}).`);
    return data;
  }

  // "$25 AUD" in Australia / New Zealand, "≈ $18 USD" elsewhere
  formatPrice(totalAud) {
    return cur().formatMoney(totalAud);
  }

  tokenRateLabel() {
    return `1 token = ${cur().formatAud(cur().tokenPriceAud())}`;
  }

  init() {
    this.renderChip();
    this.renderModal();
    window.addEventListener('googleAuthStateChanged', () => this.refreshBalance());
    window.addEventListener('iasjPricingChanged', () => this.onPricingChanged());
    this.refreshBalance();
  }

  isOpen() {
    return document.getElementById('token-wallet-modal')?.classList.contains('active');
  }

  onPricingChanged() {
    document.getElementById('token-wallet-chip')?.setAttribute('title', `Your token wallet (${this.tokenRateLabel()})`);
    const rateLabel = document.getElementById('token-wallet-rate-label');
    if (rateLabel) rateLabel.textContent = `${this.tokenRateLabel()} • used to pay for every job`;
    const disclaimer = document.getElementById('token-wallet-disclaimer');
    if (disclaimer) disclaimer.innerHTML = cur().disclaimerHtml({ compact: true });
    if (this.isOpen() && !this.checkout) this.loadQuotes().catch(err => this.setMessage(err.message));
  }

  renderChip() {
    if (document.getElementById('nav-token-wallet-btn')) {
      return;
    }
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'token-wallet-chip';
    chip.title = `Your token wallet (${this.tokenRateLabel()})`;
    chip.setAttribute('data-agent-id', 'token-wallet-chip');
    chip.setAttribute('data-testid', 'token-wallet-chip');
    chip.setAttribute('aria-label', 'Open token wallet');
    chip.innerHTML = '<i class="fa-solid fa-coins"></i> <span id="token-wallet-chip-label">Tokens</span>';
    chip.addEventListener('click', () => this.open());

    const navSlot = document.getElementById('google-auth-nav-container');
    if (navSlot) {
      chip.className = 'btn-google-nav';
      chip.style.marginRight = '0.5rem';
      navSlot.parentNode.insertBefore(chip, navSlot);
    } else {
      // Pages without the main nav get a floating wallet button
      chip.style.cssText = 'position:fixed; left:1rem; bottom:1rem; z-index:900; background:#0B192C; color:#FCD34D; border:none; border-radius:999px; padding:0.6rem 1rem; font-weight:700; box-shadow:0 4px 14px rgba(0,0,0,0.25); cursor:pointer;';
      document.body.appendChild(chip);
    }
  }

  renderModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'token-wallet-modal';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:520px;">
        <div class="modal-header" style="background:#F8FAFC; border-bottom:1px solid var(--border-light); padding:1rem 1.25rem;">
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <div style="width:34px; height:34px; border-radius:8px; background:#0B192C; color:#FCD34D; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-coins"></i></div>
            <div>
              <h4 style="margin:0; font-size:1.1rem; color:var(--primary-navy); font-weight:800;">Token Wallet</h4>
              <span id="token-wallet-rate-label" style="font-size:0.75rem; color:var(--text-muted);">${this.tokenRateLabel()} &bull; used to pay for every job</span>
            </div>
          </div>
          <button type="button" class="modal-close-btn" data-wallet-action="close" data-agent-id="token-wallet-close" data-testid="token-wallet-close" aria-label="Close token wallet">&times;</button>
        </div>
        <div class="modal-body" style="padding:1.25rem;">
          <div id="token-wallet-signed-out" style="display:none; text-align:center; padding:1rem 0;">
            <p style="color:var(--text-muted); margin-bottom:1rem;">Sign in with Google to see your balance and buy tokens.</p>
            <button type="button" class="btn btn-primary" data-wallet-action="sign-in" data-agent-id="token-wallet-sign-in" data-testid="token-wallet-sign-in" aria-label="Sign in with Google"><i class="fa-brands fa-google"></i> Sign in with Google</button>
          </div>

          <div id="token-wallet-signed-in" style="display:none;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
              <div style="background:#0B192C; color:#fff; border-radius:var(--radius-sm); padding:0.85rem 1rem;">
                <div style="font-size:0.72rem; color:#CBD5E1; text-transform:uppercase; letter-spacing:0.5px;">Available</div>
                <div style="font-size:1.6rem; font-weight:900; color:#FCD34D;"><span id="token-wallet-available">0</span> <span style="font-size:0.85rem;">tokens</span></div>
              </div>
              <div style="background:#F1F5F9; border-radius:var(--radius-sm); padding:0.85rem 1rem;">
                <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Held for jobs</div>
                <div style="font-size:1.6rem; font-weight:900; color:var(--primary-navy);"><span id="token-wallet-held">0</span> <span style="font-size:0.85rem;">tokens</span></div>
              </div>
            </div>

            <div id="token-wallet-buy-step">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <strong style="color:var(--primary-navy);">Buy tokens</strong>
                <span style="font-size:0.72rem; font-weight:700; color:#065F46; background:#ECFDF5; border:1px solid #A7F3D0; border-radius:999px; padding:0.2rem 0.6rem;">Charged in AUD</span>
              </div>
              <div id="token-wallet-packs" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0.5rem; margin-bottom:0.6rem;"></div>
              <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.6rem;">
                <label for="token-wallet-custom" style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap;">Or enter amount:</label>
                <input type="number" id="token-wallet-custom" class="form-control" min="1" max="${MAX_TOKENS}" step="1" inputmode="numeric" placeholder="e.g. 40" style="max-width:120px;" data-agent-id="token-wallet-custom" data-testid="token-wallet-custom" aria-label="Number of tokens to buy (whole tokens only)">
              </div>
              <div id="token-wallet-rate-note" style="font-size:0.74rem; color:var(--text-muted); margin-bottom:0.85rem;"></div>
              <button type="button" class="btn btn-primary" data-wallet-action="checkout" id="token-wallet-checkout-btn" data-agent-id="token-wallet-checkout" data-testid="token-wallet-checkout" aria-label="Continue to payment" style="width:100%; background:#635BFF; border-color:#635BFF; font-weight:700;">Continue to payment</button>
            </div>

            <div id="token-wallet-pay-step" style="display:none;">
              <div id="token-wallet-pay-summary" style="background:#EEF2FF; border:1px solid #C7D2FE; border-radius:var(--radius-sm); padding:0.75rem 1rem; margin-bottom:0.85rem; font-weight:700; color:#1E1B4B;"></div>
              <div id="token-wallet-payment-element" style="min-height:120px; margin-bottom:0.85rem;"></div>
              <div id="token-wallet-test-hint" style="display:none; background:#FFFBEB; border:1px solid #FDE68A; color:#92400E; border-radius:var(--radius-sm); padding:0.55rem 0.85rem; font-size:0.76rem; margin-bottom:0.85rem;">
                <i class="fa-solid fa-flask"></i> <strong>Test mode:</strong> use card 4242 4242 4242 4242, any future expiry and any CVC.
              </div>
              <button type="button" class="btn btn-primary" data-wallet-action="pay" id="token-wallet-pay-btn" disabled data-agent-id="token-wallet-pay" data-testid="token-wallet-pay" aria-label="Pay for tokens" style="width:100%; background:#635BFF; border-color:#635BFF; font-weight:700;">Pay</button>
              <button type="button" class="btn btn-outline btn-sm" data-wallet-action="back" data-agent-id="token-wallet-back" data-testid="token-wallet-back" aria-label="Back to token amounts" style="width:100%; margin-top:0.5rem;">Back</button>
            </div>

            <div id="token-wallet-disclaimer" style="margin-top:0.85rem;">${cur().disclaimerHtml({ compact: true })}</div>

            <div id="token-wallet-message" role="alert" style="display:none; border-radius:var(--radius-sm); padding:0.6rem 0.85rem; font-size:0.8rem; margin-top:0.85rem;"></div>

            <div style="margin-top:1.1rem;">
              <strong style="font-size:0.85rem; color:var(--primary-navy);">Recent activity</strong>
              <div id="token-wallet-activity" style="margin-top:0.4rem; font-size:0.8rem;"></div>
            </div>

            <p style="font-size:0.72rem; color:var(--text-muted); margin-top:1rem; margin-bottom:0;">
              Tokens give you flexible payment: one payment can be shared between several service providers on a job.
              <a href="/terms.html#tokens" target="_blank" rel="noopener">How tokens work</a>
            </p>
            <p style="font-size:0.72rem; color:var(--text-muted); margin-top:0.4rem; margin-bottom:0;">
              Refunds must be requested in writing by sending a message to the superadmin from the
              <a href="/customer-admin.html?view=messages" data-agent-id="token-wallet-refund-messages" data-testid="token-wallet-refund-messages" aria-label="Open Messages to write to the superadmin">Messages</a> panel on your Admin Page, or by email to
              <a href="mailto:support@aifoundation.net.au?subject=Refund%20request" data-agent-id="token-wallet-refund-email" data-testid="token-wallet-refund-email" aria-label="Email the superadmin to request a refund">support@aifoundation.net.au</a>. Messages to the superadmin are free.
              <a href="/terms.html#refunds" target="_blank" rel="noopener">Refund terms</a>
            </p>
          </div>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) return this.close();
      const action = e.target.closest('[data-wallet-action]')?.dataset.walletAction;
      const pack = e.target.closest('[data-wallet-pack]')?.dataset.walletPack;
      if (action === 'close') this.close();
      else if (action === 'sign-in') this.signIn();
      else if (action === 'checkout') this.startCheckout();
      else if (action === 'pay') this.pay();
      else if (action === 'back') this.showBuyStep();
      else if (pack) this.selectTokens(Number(pack));
    });

    let customTimer;
    modal.querySelector('#token-wallet-custom').addEventListener('input', (e) => {
      clearTimeout(customTimer);
      // Whole tokens only: anything else is rounded up
      const tokens = cur().wholeUp(e.target.value);
      if (tokens >= 1 && tokens <= MAX_TOKENS) customTimer = setTimeout(() => this.selectTokens(tokens), 400);
    });

    document.body.appendChild(modal);
  }

  setMessage(text, kind = 'error') {
    const box = document.getElementById('token-wallet-message');
    if (!box) return;
    box.textContent = text || '';
    box.style.display = text ? 'block' : 'none';
    box.style.background = kind === 'success' ? '#ECFDF5' : '#FEF2F2';
    box.style.border = `1px solid ${kind === 'success' ? '#A7F3D0' : '#FECACA'}`;
    box.style.color = kind === 'success' ? '#065F46' : '#991B1B';
  }

  async refreshBalance() {
    const label = document.getElementById('token-wallet-chip-label');
    const idToken = await window.firebaseService?.getIdToken?.();
    if (!idToken) {
      this.wallet = null;
      if (label) label.textContent = 'Tokens';
      return null;
    }
    try {
      this.wallet = await this.api('wallet', { auth: true });
      if (label) label.textContent = `${cur().formatWhole(this.wallet.available)} tokens`;
      this.renderBalance();
      return this.wallet;
    } catch (err) {
      console.warn('🪙 [Wallet] Could not load balance:', err.message);
      if (label) label.textContent = 'Tokens';
      throw err;
    }
  }

  renderBalance() {
    if (!this.wallet) return;
    document.getElementById('token-wallet-available').textContent = cur().formatWhole(this.wallet.available);
    document.getElementById('token-wallet-held').textContent = cur().formatWhole(this.wallet.held);

    const activity = document.getElementById('token-wallet-activity');
    const entries = this.wallet.activity || [];
    activity.innerHTML = entries.length === 0
      ? '<span style="color:var(--text-muted);">No activity yet.</span>'
      : entries.slice(0, 8).map(entry => `
          <div style="display:flex; justify-content:space-between; padding:0.35rem 0; border-bottom:1px solid #F1F5F9;">
            <span>${LEDGER_LABELS[entry.type] || 'Adjustment'} <span style="color:var(--text-muted);">&bull; ${new Date(entry.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span></span>
            <strong style="color:${entry.tokens >= 0 ? '#059669' : '#B91C1C'};">${entry.tokens >= 0 ? '+' : ''}${Number(entry.tokens)}</strong>
          </div>
        `).join('');
  }

  async open() {
    document.getElementById('token-wallet-modal').classList.add('active');
    this.setMessage('');
    this.showBuyStep();
    this.onPricingChanged();

    const signedIn = !!(await window.firebaseService?.getIdToken?.());
    document.getElementById('token-wallet-signed-out').style.display = signedIn ? 'none' : 'block';
    document.getElementById('token-wallet-signed-in').style.display = signedIn ? 'block' : 'none';
    if (!signedIn) return;

    try {
      await Promise.all([this.refreshBalance(), this.loadQuotes()]);
    } catch (err) {
      this.setMessage(err.message);
    }
  }

  close() {
    document.getElementById('token-wallet-modal').classList.remove('active');
    window.stripePaymentService?.unmountPaymentElement();
    this.checkout = null;
  }

  async signIn() {
    try {
      await window.firebaseService.signInWithGoogle('customer');
      await this.open();
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message);
    }
  }

  async loadQuotes() {
    this.quoteInfo = await this.api('token-quote');
    this.renderPacks();
    await this.selectTokens(this.selectedTokens);
  }

  renderPacks() {
    const info = this.quoteInfo;
    if (!info) return;
    const showUsd = !cur().isAud();

    document.getElementById('token-wallet-packs').innerHTML = info.quotes.map(q => `
      <button type="button" data-wallet-pack="${q.tokens}" data-agent-id="token-wallet-pack-${q.tokens}" data-testid="token-wallet-pack-${q.tokens}" aria-label="Buy ${q.tokens} tokens for ${cur().formatAud(q.totalAud)}" title="${cur().moneyTitle(q.totalAud)}" style="border:2px solid ${q.tokens === this.selectedTokens ? '#635BFF' : 'var(--border-light)'}; background:#fff; border-radius:var(--radius-sm); padding:0.55rem 0.25rem; cursor:pointer;">
        <div style="font-weight:900; color:var(--primary-navy);">${cur().formatWhole(q.tokens)}</div>
        <div style="font-size:0.72rem; color:var(--text-muted);">${cur().formatAud(q.totalAud)}</div>
        ${showUsd ? `<div style="font-size:0.66rem; color:var(--text-muted);">${this.formatPrice(q.totalAud)}</div>` : ''}
      </button>
    `).join('');
  }

  async selectTokens(tokens) {
    this.selectedTokens = tokens;
    const info = this.quoteInfo;
    if (!info) return;

    let quote = info.quotes.find(q => q.tokens === tokens);
    if (!quote) {
      const single = await this.api(`token-quote?tokens=${tokens}`);
      quote = single.quotes[0];
    }
    this.renderPacks();

    const aud = cur().formatAud(quote.totalAud);
    const note = cur().isAud()
      ? `${cur().formatWhole(quote.tokens)} tokens = ${aud}.`
      : `${cur().formatWhole(quote.tokens)} tokens = ${aud} (${this.formatPrice(quote.totalAud)} at today's rate, ${cur().rateText()}). You will be charged ${aud}.`;
    document.getElementById('token-wallet-rate-note').textContent = note;
    document.getElementById('token-wallet-checkout-btn').textContent = `Continue to payment (${aud})`;
  }

  showBuyStep() {
    document.getElementById('token-wallet-buy-step').style.display = 'block';
    document.getElementById('token-wallet-pay-step').style.display = 'none';
    window.stripePaymentService?.unmountPaymentElement();
    this.checkout = null;
  }

  async startCheckout() {
    const stripeService = window.stripePaymentService;
    if (!stripeService?.isAvailable()) {
      this.setMessage('Card payments are unavailable right now. Please try again later.');
      return;
    }

    const button = document.getElementById('token-wallet-checkout-btn');
    button.disabled = true;
    this.setMessage('');

    try {
      const purchaseId = (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      this.checkout = await this.api('token-purchase', {
        method: 'POST',
        auth: true,
        body: { tokens: this.selectedTokens, purchaseId }
      });

      const aud = cur().formatAud(this.checkout.totalAud);
      document.getElementById('token-wallet-buy-step').style.display = 'none';
      document.getElementById('token-wallet-pay-step').style.display = 'block';
      document.getElementById('token-wallet-pay-summary').textContent = cur().isAud()
        ? `${cur().formatWhole(this.checkout.tokens)} tokens — ${aud}`
        : `${cur().formatWhole(this.checkout.tokens)} tokens — ${aud} (${this.formatPrice(this.checkout.totalAud)})`;
      document.getElementById('token-wallet-test-hint').style.display = stripeService.config.isTestMode ? 'block' : 'none';

      const payButton = document.getElementById('token-wallet-pay-btn');
      payButton.disabled = true;
      payButton.textContent = `Pay ${aud}`;

      const element = stripeService.mountPaymentElement(document.getElementById('token-wallet-payment-element'), this.checkout.clientSecret);
      element.on('ready', () => { payButton.disabled = false; });
    } catch (err) {
      this.setMessage(err.message);
    } finally {
      button.disabled = false;
    }
  }

  async pay() {
    if (!this.checkout) return;
    const payButton = document.getElementById('token-wallet-pay-btn');
    const originalText = payButton.textContent;
    payButton.disabled = true;
    payButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing payment...';
    this.setMessage('');

    try {
      const intent = await window.stripePaymentService.confirmPayment();
      // The server checks the payment with Stripe before adding tokens
      const result = await this.api('token-purchase-confirm', {
        method: 'POST',
        auth: true,
        body: { paymentIntentId: intent.id }
      });

      if (result.status === 'credited') {
        this.showBuyStep();
        await this.refreshBalance();
        this.setMessage(`${result.tokens} tokens added to your wallet.`, 'success');
        if (typeof showToast === 'function') showToast(`🪙 ${result.tokens} tokens added to your wallet!`);
      } else if (result.status === 'processing') {
        this.showBuyStep();
        this.setMessage('Your payment is processing. Tokens will appear as soon as Stripe confirms it.', 'success');
      } else {
        throw new Error(`The payment was not completed (status: ${result.status}).`);
      }
    } catch (err) {
      this.setMessage(err.message);
      payButton.disabled = false;
      payButton.textContent = originalText;
    }
  }
}

window.tokenWallet = new TokenWallet();
window.openTokenWallet = () => window.tokenWallet.open();

document.addEventListener('DOMContentLoaded', () => window.tokenWallet.init());
