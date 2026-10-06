
// ==========================================
// Franchise Admin Logic (Embedded Form Navigation)
// ==========================================
function openFranchiseRegisterModal(user = null) {
  if (typeof switchTab === 'function') {
    switchTab('franchise-application-tab');
    setTimeout(() => {
      const embeddedCard = document.querySelector('#franchise-application-tab .embedded-form-card') || document.getElementById('franchise-application-tab');
      if (embeddedCard) {
        embeddedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  } else if (!window.location.pathname.endsWith('franchise.html')) {
    window.location.href = 'franchise.html';
  }
}

function closeFranchiseRegisterModal() {
  // Retained for backward-compatibility; no modal overlay needed as registration is embedded
}

function openFranchiseDashboard() {
  if (window.location.pathname.endsWith('franchise.html')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.location.href = 'franchise.html';
  }
}

function closeFranchiseDashboard() {
  // Modal removed - franchise.html is the dedicated page
}

// Only define fallback handleFranchiseRegisterSubmit if app.js has not already defined the comprehensive version
if (!window.handleFranchiseRegisterSubmit) {
  window.handleFranchiseRegisterSubmit = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof switchTab === 'function') {
      switchTab('franchise-application-tab');
    }
  };
}

function handleAddStaffSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('staff-name')?.value.trim();
  const email = document.getElementById('staff-email')?.value.trim();
  const payId = document.getElementById('staff-payid')?.value.trim();
  const bizName = document.getElementById('staff-biz-name')?.value.trim() || '';
  const bizCodeType = document.getElementById('staff-biz-code-type')?.value || 'ABN';
  const bizNumber = document.getElementById('staff-biz-number')?.value.trim() || '';
  const bizStructure = document.getElementById('staff-biz-structure')?.value || 'sole_trader';
  const bizGst = document.getElementById('staff-biz-gst')?.value || 'yes';
  const bizAddress = document.getElementById('staff-biz-address')?.value.trim() || '';
  const category = document.getElementById('staff-category')?.value || 'handyman';
  if (!name) return;

  let staffList = JSON.parse(localStorage.getItem('iasj_franchise_staff') || '[]');
  
  const spn = window.firebaseService?.generateSPN?.() || ('SPN-' + Math.floor(100000 + Math.random() * 900000));
  const newStaff = {
    id: spn,
    name,
    email,
    payId,
    category,
    tradeTitle: `${category.charAt(0).toUpperCase() + category.slice(1)} Specialist`,
    bizName,
    bizCodeType,
    bizNumber,
    bizStructure,
    bizGst,
    abn: bizNumber,
    bizAddress,
    is24_7: true,
    status: 'active',
    addedAt: new Date().toISOString()
  };

  staffList.push(newStaff);
  localStorage.setItem('iasj_franchise_staff', JSON.stringify(staffList));
  
  // Also register staff as a provider globally so they appear in searches
  const lat = -28.0 + (Math.random() * 0.1 - 0.05);
  const lng = 153.4 + (Math.random() * 0.1 - 0.05);
  
  const providerProfile = {
    id: spn,
    serviceProviderNumber: spn,
    name: name,
    businessName: bizName || (newStaff.name + ' (Franchise Staff)'),
    businessLegalName: bizName,
    businessNumber: bizNumber,
    businessCodeType: bizCodeType,
    abn: bizNumber,
    businessStructure: bizStructure,
    gstRegistered: bizGst === 'yes',
    businessAddress: bizAddress,
    phone: '0400 000 000',
    email: email,
    location: { lat, lng },
    radiusKm: 20,
    category: category,
    tradeTitle: `${category.charAt(0).toUpperCase() + category.slice(1)} Specialist (Franchise Staff)`,
    services: [category],
    status: 'Available',
    bankDetails: {
      payId: payId,
      bsb: '084-004',
      account: '12345678'
    }
  };

  // Add to global provider DB
  if (window.addProviderToDatabase) {
    window.addProviderToDatabase(providerProfile);
  } else if (window.providerDB) {
    window.providerDB.addProvider(providerProfile);
  }

  // Sync to Stripe if service exists
  if (window.stripePaymentService && window.stripePaymentService.registerProviderUser) {
    window.stripePaymentService.registerProviderUser(providerProfile).catch(err => console.warn('Stripe register staff error:', err));
  }
  
  document.getElementById('franchise-add-staff-form')?.reset();
  showToast(`✅ Staff member '${name}' added successfully (${bizCodeType}: ${bizNumber || 'Registered'})!`);
  renderFranchiseStaff();
  
  // Re-filter contractors map
  if (window.filterContractors) window.filterContractors();
}

function renderFranchiseStaff() {
  const container = document.getElementById('franchise-staff-list');
  if (!container) return;

  const staffList = JSON.parse(localStorage.getItem('iasj_franchise_staff') || '[]');
  
  if (staffList.length === 0) {
    container.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.85rem; border:1px dashed var(--border-light); border-radius:var(--radius-md);">No staff added yet.</div>`;
    return;
  }

  container.innerHTML = staffList.map(staff => `
    <div style="background:#fff; border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:1rem 1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
      <div>
        <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
          <h4 style="margin:0; color:var(--primary-navy); font-size:1rem; font-weight:800;">${staff.name}</h4>
          ${staff.bizNumber ? `<span style="font-size:0.72rem; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; padding:0.12rem 0.5rem; border-radius:6px; font-weight:700;"><i class="fa-solid fa-briefcase"></i> ${staff.bizCodeType || 'ABN'}: ${staff.bizNumber}</span>` : ''}
        </div>
        ${staff.bizName ? `<div style="font-size:0.78rem; font-weight:700; color:#475569; margin-top:0.2rem;"><i class="fa-solid fa-building"></i> ${staff.bizName}</div>` : ''}
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
          <i class="fa-solid fa-envelope"></i> ${staff.email} <span style="margin:0 0.5rem;">|</span> <i class="fa-solid fa-money-check-dollar"></i> ${staff.payId || 'Bank'}
        </div>
      </div>
      <span class="badge-status online">Active</span>
    </div>
  `).join('');
}

window.openFranchiseRegisterModal = openFranchiseRegisterModal;
window.closeFranchiseRegisterModal = closeFranchiseRegisterModal;
window.openFranchiseDashboard = openFranchiseDashboard;
window.closeFranchiseDashboard = closeFranchiseDashboard;
window.handleFranchiseRegisterSubmit = handleFranchiseRegisterSubmit;
window.handleAddStaffSubmit = handleAddStaffSubmit;
