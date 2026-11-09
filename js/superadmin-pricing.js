/**
 * It's A Simple Job - Superadmin Price List editor.
 * Lets a superadmin set the token amount for every service and product sold, the price of one
 * token in AUD (default A$1) and the token packs customers can buy. Whole numbers only: anything
 * else is rounded up. Saved to the server (PUT /api/pricing), which checks the superadmin role
 * again and validates every value before it goes live for all visitors.
 */

const cur = () => window.iasjCurrency;

const slug = path => `sa-price-${path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;
const getPath = (obj, path) => path.split('.').reduce((node, key) => node?.[key], obj);

function setPath(obj, path, value) {
  const keys = path.split('.');
  let node = obj;
  keys.slice(0, -1).forEach(key => { node[key] = node[key] || {}; node = node[key]; });
  node[keys[keys.length - 1]] = value;
}

const isTokenUnit = unit => unit.startsWith('tokens');

class SuperadminPricing {
  ensureModal() {
    if (document.getElementById('superadmin-pricing-modal')) return;

    const fields = cur().PRICING_FIELDS;
    const groups = [...new Set(fields.map(f => f.group))];

    const fieldRow = f => `
      <div class="sa-price-row">
        <label for="${slug(f.path)}">${f.label}</label>
        <div class="sa-price-input">
          <input type="number" id="${slug(f.path)}" data-price-path="${f.path}" data-price-unit="${f.unit}" min="${f.min}" max="${f.max}" step="1" inputmode="numeric" required
            data-agent-id="${slug(f.path)}" data-testid="${slug(f.path)}" aria-label="${f.label} (${f.unit})">
          <span class="sa-price-unit">${f.unit}</span>
        </div>
        <span class="sa-price-aud" data-aud-for="${f.path}"></span>
      </div>`;

    const packRows = Array.from({ length: cur().TOKEN_PACK_COUNT }, (_, i) => `
      <div class="sa-price-row">
        <label for="sa-price-pack-${i}">Token pack ${i + 1}</label>
        <div class="sa-price-input">
          <input type="number" id="sa-price-pack-${i}" data-pack-index="${i}" min="1" max="10000" step="1" inputmode="numeric" required
            data-agent-id="sa-price-pack-${i}" data-testid="sa-price-pack-${i}" aria-label="Token pack ${i + 1} (tokens)">
          <span class="sa-price-unit">tokens</span>
        </div>
        <span class="sa-price-aud" data-aud-for-pack="${i}"></span>
      </div>`).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'superadmin-pricing-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'sa-pricing-title');
    modal.innerHTML = `
      <div class="modal-box" style="max-width:680px;">
        <div class="modal-header" style="background:#FFFBEB; border-bottom:1px solid #FDE68A; padding:1rem 1.25rem;">
          <div>
            <h4 id="sa-pricing-title" style="margin:0; font-size:1.1rem; color:#92400E; font-weight:800;"><i class="fa-solid fa-crown" style="color:#F59E0B;"></i> Superadmin Price List</h4>
            <span style="font-size:0.76rem; color:#92400E;">Set the token amount for every service and product sold. All prices are in Australian Dollars. Whole numbers only — anything else is rounded up.</span>
          </div>
          <button type="button" class="modal-close-btn" data-sa-action="close" data-agent-id="sa-pricing-close" data-testid="sa-pricing-close" aria-label="Close price list">&times;</button>
        </div>
        <form class="modal-body" id="sa-pricing-form" novalidate style="padding:1.1rem 1.25rem; max-height:65vh; overflow-y:auto;">
          <div id="sa-pricing-meta" style="font-size:0.76rem; color:var(--text-muted); margin-bottom:0.75rem;"></div>
          ${groups.map(group => `
            <fieldset class="sa-price-group">
              <legend>${group}</legend>
              ${fields.filter(f => f.group === group).map(fieldRow).join('')}
            </fieldset>`).join('')}
          <fieldset class="sa-price-group">
            <legend>Token packs (products sold in the Token Wallet)</legend>
            ${packRows}
          </fieldset>
          <div id="sa-pricing-message" role="alert" style="display:none; border-radius:var(--radius-sm); padding:0.6rem 0.85rem; font-size:0.8rem; margin-top:0.5rem;"></div>
        </form>
        <div style="display:flex; justify-content:space-between; gap:0.5rem; padding:0.85rem 1.25rem; border-top:1px solid var(--border-light); flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" data-sa-action="defaults" data-agent-id="sa-pricing-defaults" data-testid="sa-pricing-defaults" aria-label="Fill in the default prices">Fill in defaults</button>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" class="btn btn-outline btn-sm" data-sa-action="close" data-agent-id="sa-pricing-cancel" data-testid="sa-pricing-cancel" aria-label="Cancel">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" data-sa-action="save" id="sa-pricing-save-btn" data-agent-id="sa-pricing-save" data-testid="sa-pricing-save" aria-label="Save price list"><i class="fa-solid fa-floppy-disk"></i> Save price list</button>
          </div>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) return this.close();
      const action = e.target.closest('[data-sa-action]')?.dataset.saAction;
      if (action === 'close') this.close();
      else if (action === 'defaults') this.fill(cur().DEFAULT_PRICING, 'Default prices filled in. Press Save to apply them.');
      else if (action === 'save') this.save();
    });
    modal.addEventListener('input', () => this.updateAudHints());
    // Round decimals up as soon as the superadmin leaves a field
    modal.addEventListener('change', (e) => {
      if (e.target.matches('input[type="number"]') && e.target.value !== '') e.target.value = cur().wholeUp(e.target.value);
      this.updateAudHints();
    });

    document.body.appendChild(modal);
  }

  open() {
    const user = window.firebaseService?.getCurrentGoogleUser?.();
    if (!user || !window.checkIsSuperadmin?.(user)) {
      window.showToast?.('Only a superadmin can change prices. Please sign in with your superadmin Google account.');
      return;
    }
    this.ensureModal();
    this.fill(cur().getPricing());
    const updated = cur().state.pricingUpdatedAt;
    document.getElementById('sa-pricing-meta').textContent = updated
      ? `Live price list, last saved ${new Date(updated).toLocaleString('en-AU')}.`
      : 'Showing the built-in default prices (no price list has been saved yet).';
    document.getElementById('superadmin-pricing-modal').classList.add('active');
  }

  close() {
    document.getElementById('superadmin-pricing-modal')?.classList.remove('active');
  }

  fill(pricing, message = '') {
    document.querySelectorAll('#sa-pricing-form [data-price-path]').forEach(input => {
      input.value = getPath(pricing, input.dataset.pricePath);
    });
    document.querySelectorAll('#sa-pricing-form [data-pack-index]').forEach(input => {
      input.value = pricing.tokenPacks[Number(input.dataset.packIndex)];
    });
    this.setMessage(message, 'info');
    this.updateAudHints();
  }

  readForm() {
    const pricing = {};
    document.querySelectorAll('#sa-pricing-form [data-price-path]').forEach(input => {
      setPath(pricing, input.dataset.pricePath, input.value === '' ? null : cur().wholeUp(input.value));
    });
    pricing.tokenPacks = [...document.querySelectorAll('#sa-pricing-form [data-pack-index]')]
      .map(input => (input.value === '' ? null : cur().wholeUp(input.value)));
    return pricing;
  }

  // Show what each token amount costs in AUD at the token price being edited
  updateAudHints() {
    const priceInput = document.querySelector('#sa-pricing-form [data-price-path="tokenPriceAud"]');
    const tokenPrice = Math.max(1, cur().wholeUp(priceInput?.value || 1));
    const audText = tokens => (tokens === '' ? '' : `= ${cur().formatAud(cur().wholeUp(tokens) * tokenPrice)}`);

    document.querySelectorAll('#sa-pricing-form [data-price-path]').forEach(input => {
      const hint = document.querySelector(`[data-aud-for="${input.dataset.pricePath}"]`);
      if (!hint) return;
      if (input.dataset.pricePath === 'tokenPriceAud') hint.textContent = 'per token';
      else hint.textContent = isTokenUnit(input.dataset.priceUnit) ? audText(input.value) : '';
    });
    document.querySelectorAll('#sa-pricing-form [data-pack-index]').forEach(input => {
      const hint = document.querySelector(`[data-aud-for-pack="${input.dataset.packIndex}"]`);
      if (hint) hint.textContent = audText(input.value);
    });
  }

  setMessage(text, kind = 'error') {
    const box = document.getElementById('sa-pricing-message');
    if (!box) return;
    const colours = {
      error: ['#FEF2F2', '#FECACA', '#991B1B'],
      success: ['#ECFDF5', '#A7F3D0', '#065F46'],
      info: ['#EFF6FF', '#BFDBFE', '#1E40AF']
    }[kind];
    box.textContent = text || '';
    box.style.display = text ? 'block' : 'none';
    [box.style.background, box.style.borderColor, box.style.color] = colours;
    box.style.border = `1px solid ${colours[1]}`;
  }

  async save() {
    const button = document.getElementById('sa-pricing-save-btn');
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    this.setMessage('');

    try {
      await cur().savePricing(this.readForm());
      this.close();
      window.showToast?.('👑 Price list saved. New prices are live for every visitor.');
    } catch (err) {
      this.setMessage(err.message);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}

window.superadminPricing = new SuperadminPricing();
window.openSuperadminPricing = () => window.superadminPricing.open();
