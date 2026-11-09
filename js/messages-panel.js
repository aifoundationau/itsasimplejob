/**
 * It's A Simple Job - Messages panel (Admin Page > Messages).
 * Every signed-in user can send messages to other users (by email) and to the superadmin.
 * Messages to the superadmin are free. Messages to other users cost the superadmin's
 * price-list amount in tokens (shown before sending), charged by the server when sent.
 * Superadmins see the shared superadmin inbox and their messages are free.
 */

const cur = () => window.iasjCurrency;

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const newClientId = () => (crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

const formatDate = iso => {
  try {
    return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};

const SUBJECT_MAX = 120;
const BODY_MAX = 2000;
const POLL_MS = 60 * 1000;

class MessagesPanel {
  constructor() {
    this.root = null;
    this.folder = 'inbox';
    this.data = null;          // last GET response
    this.openId = null;        // expanded message
    this.composeOpen = false;
    this.clientMessageId = newClientId();
    this.loading = false;
    this.pollTimer = null;
  }

  init() {
    this.root = document.getElementById('messages-panel-root');
    if (!this.root) return;
    this.renderShell();
    window.addEventListener('googleAuthStateChanged', () => this.refresh());
    window.addEventListener('iasjPricingChanged', () => this.updateCostLine());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.isVisible()) this.refresh(); });
    this.refresh();
  }

  isVisible() {
    return !!this.root && this.root.offsetParent !== null;
  }

  // Called by the Admin Page tab switcher when the Messages tab opens
  onShow() {
    this.refresh();
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.isVisible() && document.visibilityState === 'visible' && !this.composeOpen) this.refresh({ quiet: true });
    }, POLL_MS);
  }

  async api(method = 'GET', { query = '', body } = {}) {
    const idToken = await window.firebaseService?.getIdToken?.();
    if (!idToken) {
      const err = new Error('Please sign in with Google to use messages.');
      err.signedOut = true;
      throw err;
    }
    let response;
    try {
      response = await fetch(`/api/messages${query}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    let data = null;
    try { data = await response.json(); } catch (e) {}
    if (!response.ok || !data) {
      const err = new Error(data?.error || `Messages are unavailable right now (HTTP ${response.status}).`);
      err.status = response.status;
      throw err;
    }
    return data;
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="admin-card" data-agent-id="messages-panel" data-testid="messages-panel">
        <div class="admin-card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <h3 class="admin-card-title" style="margin:0;"><i class="fa-solid fa-envelope" style="color:var(--brand-orange);"></i> Messages <span id="msg-mailbox-label" style="font-size:0.75rem; font-weight:700; color:var(--text-muted);"></span></h3>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" class="btn btn-outline btn-sm" data-msg-action="refresh" data-agent-id="msg-refresh" data-testid="msg-refresh" aria-label="Refresh messages"><i class="fa-solid fa-rotate"></i> Refresh</button>
            <button type="button" class="btn btn-primary btn-sm" data-msg-action="compose" data-agent-id="msg-compose" data-testid="msg-compose" aria-label="Write a new message"><i class="fa-solid fa-pen"></i> New message</button>
          </div>
        </div>

        <div class="msg-free-note" id="msg-price-note" role="note"></div>

        <div id="msg-signed-out" style="display:none; text-align:center; padding:1.5rem 0;">
          <p style="color:var(--text-muted); margin-bottom:0.85rem;">Sign in with Google to send and receive messages.</p>
          <button type="button" class="btn btn-primary btn-sm" data-msg-action="sign-in" data-agent-id="msg-sign-in" data-testid="msg-sign-in" aria-label="Sign in with Google to use messages"><i class="fa-brands fa-google"></i> Sign in with Google</button>
        </div>

        <div id="msg-signed-in" style="display:none;">
          <form id="msg-compose-form" class="msg-compose" style="display:none;" novalidate data-agent-id="msg-compose-form" data-testid="msg-compose-form">
            <div class="msg-field">
              <span class="msg-label">To</span>
              <div class="msg-to-options" role="radiogroup" aria-label="Who is this message to?">
                <label id="msg-to-superadmin-option"><input type="radio" name="msg-to-type" value="superadmin" checked data-agent-id="msg-to-superadmin" data-testid="msg-to-superadmin" aria-label="Send to the superadmin (free)"> Superadmin <span class="msg-free-pill">Free</span></label>
                <label><input type="radio" name="msg-to-type" value="user" data-agent-id="msg-to-user" data-testid="msg-to-user" aria-label="Send to another user by email"> Another user</label>
              </div>
              <input type="email" id="msg-to-email" class="form-control" placeholder="Their email address" autocomplete="email" style="display:none; margin-top:0.4rem;" data-agent-id="msg-to-email" data-testid="msg-to-email" aria-label="Email address of the user you are messaging">
            </div>
            <div class="msg-field">
              <label class="msg-label" for="msg-subject">Subject</label>
              <input type="text" id="msg-subject" class="form-control" maxlength="${SUBJECT_MAX}" placeholder="e.g. Refund request for docket IASJ-123456" data-agent-id="msg-subject" data-testid="msg-subject" aria-label="Message subject">
            </div>
            <div class="msg-field">
              <label class="msg-label" for="msg-body">Message</label>
              <textarea id="msg-body" class="form-control" rows="5" maxlength="${BODY_MAX}" placeholder="Write your message" data-agent-id="msg-body" data-testid="msg-body" aria-label="Message text"></textarea>
              <div style="text-align:right; font-size:0.7rem; color:var(--text-muted);"><span id="msg-body-count">0</span> / ${BODY_MAX}</div>
            </div>
            <div id="msg-cost-line" class="msg-cost-line" role="status"></div>
            <div style="display:flex; gap:0.5rem; justify-content:flex-end; flex-wrap:wrap;">
              <button type="button" class="btn btn-outline btn-sm" data-msg-action="cancel" data-agent-id="msg-cancel" data-testid="msg-cancel" aria-label="Cancel message">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm" id="msg-send-btn" data-agent-id="msg-send" data-testid="msg-send" aria-label="Send message"><i class="fa-solid fa-paper-plane"></i> Send</button>
            </div>
          </form>

          <div class="msg-folder-tabs" role="tablist" aria-label="Message folders">
            <button type="button" role="tab" class="msg-folder-btn active" data-msg-folder="inbox" data-agent-id="msg-folder-inbox" data-testid="msg-folder-inbox" aria-label="Inbox">Inbox <span class="msg-unread-badge" id="msg-unread-inline" style="display:none;"></span></button>
            <button type="button" role="tab" class="msg-folder-btn" data-msg-folder="sent" data-agent-id="msg-folder-sent" data-testid="msg-folder-sent" aria-label="Sent messages">Sent</button>
          </div>

          <div id="msg-list" class="msg-list" aria-live="polite"></div>
        </div>

        <div id="msg-status" role="alert" style="display:none;"></div>
      </div>
    `;

    this.root.addEventListener('click', (e) => {
      const action = e.target.closest('[data-msg-action]')?.dataset.msgAction;
      const folder = e.target.closest('[data-msg-folder]')?.dataset.msgFolder;
      const open = e.target.closest('[data-msg-open]')?.dataset.msgOpen;
      const reply = e.target.closest('[data-msg-reply]')?.dataset.msgReply;
      if (action === 'refresh') this.refresh();
      else if (action === 'compose') this.openCompose();
      else if (action === 'cancel') this.closeCompose();
      else if (action === 'sign-in') window.signUpWithGoogle?.('customer');
      else if (action === 'wallet') window.openTokenWallet?.();
      else if (folder) this.setFolder(folder);
      else if (reply) this.reply(reply);
      else if (open) this.toggleOpen(open);
    });

    this.root.querySelector('#msg-compose-form').addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    this.root.querySelectorAll('input[name="msg-to-type"]').forEach(r => r.addEventListener('change', () => this.onToTypeChange()));
    const body = this.root.querySelector('#msg-body');
    body.addEventListener('input', () => { this.root.querySelector('#msg-body-count').textContent = body.value.length; });
  }

  setStatus(text, kind = 'error', { walletButton = false } = {}) {
    const box = this.root.querySelector('#msg-status');
    if (!text) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.className = `msg-status msg-status-${kind}`;
    box.innerHTML = `${escapeHtml(text)}${walletButton ? ' <button type="button" class="btn btn-sm btn-outline" data-msg-action="wallet" data-agent-id="msg-open-wallet" data-testid="msg-open-wallet" aria-label="Open token wallet" style="margin-left:0.4rem;"><i class="fa-solid fa-coins"></i> Token Wallet</button>' : ''}`;
    box.style.display = 'block';
  }

  messagePrice() {
    if (this.data?.isSuperadmin) return 0;
    const fromServer = this.data?.messagePriceTokens;
    if (Number.isInteger(fromServer)) return fromServer;
    return cur()?.getPricing?.().fees?.message ?? 1;
  }

  priceText(tokens) {
    if (tokens <= 0) return 'free';
    return `${cur().formatTokens(tokens)} (${cur().formatMoney(cur().audForTokens(tokens))})`;
  }

  renderPriceNote() {
    const note = this.root.querySelector('#msg-price-note');
    const label = this.root.querySelector('#msg-mailbox-label');
    if (this.data?.isSuperadmin) {
      label.textContent = '• Superadmin inbox';
      note.innerHTML = '<i class="fa-solid fa-crown" style="color:#F59E0B;"></i> You are viewing the shared superadmin inbox. Messages to and from the superadmin are <strong>free</strong>.';
      return;
    }
    label.textContent = '';
    const price = this.messagePrice();
    note.innerHTML = `<i class="fa-solid fa-gift"></i> <strong>Messages to the superadmin are free.</strong> ${price > 0 ? `A message to another user costs ${escapeHtml(this.priceText(price))}.` : 'Messages to other users are free too.'} Refund requests must be sent in writing to the superadmin.`;
  }

  updateCostLine() {
    if (!this.root) return;
    this.renderPriceNote();
    const line = this.root.querySelector('#msg-cost-line');
    if (!line) return;
    const toSuperadmin = !this.data?.isSuperadmin && this.root.querySelector('input[name="msg-to-type"]:checked')?.value === 'superadmin';
    const price = toSuperadmin ? 0 : this.messagePrice();
    const sendBtn = this.root.querySelector('#msg-send-btn');
    if (price <= 0) {
      line.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#059669;"></i> This message is <strong>free</strong>${toSuperadmin ? ' — messages to the superadmin are always free' : ''}.`;
      sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send (free)';
      return;
    }
    const balance = window.tokenWallet?.wallet?.available;
    line.innerHTML = `<i class="fa-solid fa-coins" style="color:#B45309;"></i> This message costs <strong>${escapeHtml(this.priceText(price))}</strong>, taken from your Token Wallet when you send it.${Number.isInteger(balance) ? ` You have ${escapeHtml(cur().formatTokens(balance))}.` : ''}`;
    sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send (${escapeHtml(cur().formatTokens(price))})`;
  }

  onToTypeChange() {
    const toUser = this.root.querySelector('input[name="msg-to-type"]:checked')?.value === 'user';
    const email = this.root.querySelector('#msg-to-email');
    email.style.display = toUser ? 'block' : 'none';
    if (toUser) email.focus();
    this.updateCostLine();
  }

  openCompose({ to = 'superadmin', email = '', subject = '' } = {}) {
    if (!this.data) {
      this.setStatus('Please sign in with Google to use messages.');
      return;
    }
    const isSa = !!this.data.isSuperadmin;
    const form = this.root.querySelector('#msg-compose-form');
    // Superadmins write to users by email; everyone else can pick the superadmin (free) or a user
    this.root.querySelector('#msg-to-superadmin-option').style.display = isSa ? 'none' : '';
    const toType = isSa ? 'user' : to;
    this.root.querySelector(`input[name="msg-to-type"][value="${toType}"]`).checked = true;
    this.root.querySelector('#msg-to-email').value = email;
    this.root.querySelector('#msg-subject').value = subject;
    this.root.querySelector('#msg-body').value = '';
    this.root.querySelector('#msg-body-count').textContent = '0';
    this.clientMessageId = newClientId();
    form.style.display = 'block';
    this.composeOpen = true;
    this.onToTypeChange();
    this.setStatus('');
    (subject ? this.root.querySelector('#msg-body') : this.root.querySelector('#msg-subject')).focus();
  }

  closeCompose() {
    this.root.querySelector('#msg-compose-form').style.display = 'none';
    this.composeOpen = false;
  }

  reply(messageId) {
    const m = (this.data?.messages || []).find(x => x.id === messageId);
    if (!m) return;
    const other = this.folder === 'sent' ? m.to : m.from;
    const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
    if (other.role === 'superadmin') this.openCompose({ to: 'superadmin', subject: subject.slice(0, SUBJECT_MAX) });
    else this.openCompose({ to: 'user', email: other.email || '', subject: subject.slice(0, SUBJECT_MAX) });
  }

  setFolder(folder, { keepStatus = false } = {}) {
    this.folder = folder;
    this.openId = null;
    this.root.querySelectorAll('[data-msg-folder]').forEach(b => {
      const active = b.dataset.msgFolder === folder;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.refresh({ keepStatus });
  }

  async refresh({ quiet = false, keepStatus = false } = {}) {
    if (!this.root) return;
    if (this.loading) { this.refreshQueued = true; return; } // e.g. folder switched mid-load
    this.loading = true;
    const list = this.root.querySelector('#msg-list');
    if (!quiet && list) list.innerHTML = '<p class="msg-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading messages...</p>';
    try {
      this.data = await this.api('GET', { query: `?folder=${this.folder}` });
      this.root.querySelector('#msg-signed-out').style.display = 'none';
      this.root.querySelector('#msg-signed-in').style.display = 'block';
      if (!quiet && !keepStatus) this.setStatus('');
      this.renderList();
    } catch (err) {
      if (err.signedOut || err.status === 401) {
        this.data = null;
        this.root.querySelector('#msg-signed-out').style.display = 'block';
        this.root.querySelector('#msg-signed-in').style.display = 'none';
        this.setStatus('');
      } else {
        if (list) list.innerHTML = '';
        this.setStatus(err.message);
      }
    } finally {
      this.loading = false;
      this.updateBadges();
      this.updateCostLine();
      if (this.refreshQueued) {
        this.refreshQueued = false;
        this.refresh({ quiet: true });
      }
    }
  }

  updateBadges() {
    const unread = this.data?.unread || 0;
    document.querySelectorAll('.msg-unread-badge').forEach(b => {
      b.textContent = unread > 99 ? '99+' : String(unread);
      b.style.display = unread > 0 ? 'inline-flex' : 'none';
    });
  }

  renderList() {
    const list = this.root.querySelector('#msg-list');
    const messages = this.data?.messages || [];
    if (messages.length === 0) {
      list.innerHTML = `<p class="msg-empty">${this.folder === 'inbox' ? 'No messages yet.' : 'You have not sent any messages yet.'}</p>`;
      return;
    }
    list.innerHTML = messages.map(m => {
      const other = this.folder === 'sent' ? m.to : m.from;
      const who = other.role === 'superadmin' ? 'Superadmin' : (other.name || other.email || 'User');
      const unread = this.folder === 'inbox' && !m.read;
      const open = this.openId === m.id;
      const cost = m.tokensCharged > 0 ? `${cur().formatTokens(m.tokensCharged)}` : 'Free';
      const safeId = escapeHtml(m.id);
      return `
        <div class="msg-item${unread ? ' unread' : ''}${open ? ' open' : ''}">
          <button type="button" class="msg-item-head" data-msg-open="${safeId}" aria-expanded="${open}" data-agent-id="msg-item" data-testid="msg-item" aria-label="${escapeHtml(`${this.folder === 'sent' ? 'To' : 'From'} ${who}: ${m.subject}`)}">
            <span class="msg-dot" aria-hidden="true"></span>
            <span class="msg-who">${this.folder === 'sent' ? 'To: ' : ''}${escapeHtml(who)}${other.role === 'superadmin' ? ' <i class="fa-solid fa-crown" style="color:#F59E0B;" title="Superadmin"></i>' : ''}</span>
            <span class="msg-subject">${escapeHtml(m.subject)}</span>
            <span class="msg-meta"><span class="msg-cost ${m.tokensCharged > 0 ? 'paid' : 'free'}">${escapeHtml(cost)}</span> ${escapeHtml(formatDate(m.createdAt))}</span>
          </button>
          ${open ? `
            <div class="msg-item-body">
              ${other.email && other.role !== 'superadmin' ? `<div class="msg-address">${this.folder === 'sent' ? 'To' : 'From'}: ${escapeHtml(other.name || '')} &lt;${escapeHtml(other.email)}&gt;</div>` : ''}
              <div class="msg-text">${escapeHtml(m.body)}</div>
              <button type="button" class="btn btn-outline btn-sm" data-msg-reply="${safeId}" data-agent-id="msg-reply" data-testid="msg-reply" aria-label="Reply to this message"><i class="fa-solid fa-reply"></i> Reply</button>
            </div>` : ''}
        </div>`;
    }).join('');
  }

  async toggleOpen(messageId) {
    this.openId = this.openId === messageId ? null : messageId;
    const m = (this.data?.messages || []).find(x => x.id === messageId);
    if (m && this.openId && this.folder === 'inbox' && !m.read) {
      m.read = true;
      this.data.unread = Math.max(0, (this.data.unread || 1) - 1);
      this.updateBadges();
      this.api('PATCH', { body: { id: messageId } })
        .then(r => { if (this.data && Number.isInteger(r.unread)) { this.data.unread = r.unread; this.updateBadges(); } })
        .catch(err => console.warn('✉️ [Messages] Could not mark as read:', err.message));
    }
    this.renderList();
  }

  async send() {
    const toType = this.data?.isSuperadmin ? 'user' : this.root.querySelector('input[name="msg-to-type"]:checked')?.value;
    const email = this.root.querySelector('#msg-to-email').value.trim();
    const subject = this.root.querySelector('#msg-subject').value.trim();
    const body = this.root.querySelector('#msg-body').value.trim();

    if (toType === 'user' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return this.setStatus('Enter the email address of the person you want to message.');
    if (!subject) return this.setStatus('Please add a subject.');
    if (!body) return this.setStatus('Please write a message.');

    const button = this.root.querySelector('#msg-send-btn');
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    this.setStatus('');

    try {
      // The same clientMessageId is reused if this draft is retried, so it is never sent or charged twice
      const result = await this.api('POST', {
        body: { to: toType === 'user' ? email : 'superadmin', subject, body, clientMessageId: this.clientMessageId }
      });
      this.closeCompose();
      const note = result.free ? 'Message sent (free).' : `Message sent. ${cur().formatTokens(result.tokensCharged)} used.`;
      this.setStatus(note, 'success');
      window.showToast?.(`✉️ ${note}`);
      if (!result.free) window.tokenWallet?.refreshBalance?.().catch(() => {});
      this.setFolder('sent', { keepStatus: true });
    } catch (err) {
      this.setStatus(err.message, 'error', { walletButton: err.status === 402 });
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      this.updateCostLine();
    }
  }
}

window.messagesPanel = new MessagesPanel();
document.addEventListener('DOMContentLoaded', () => window.messagesPanel.init());
