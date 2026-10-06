
// ==========================================
// Franchise Admin Logic
// ==========================================
function openFranchiseRegisterModal() {
  const panel = document.getElementById('franchise-register-modal');
  if (panel) panel.classList.add('active');
}

function closeFranchiseRegisterModal() {
  const panel = document.getElementById('franchise-register-modal');
  if (panel) panel.classList.remove('active');
}

function openFranchiseDashboard() {
  const panel = document.getElementById('franchise-dashboard-modal');
  const user = window.firebaseService?.getCurrentGoogleUser?.() || JSON.parse(localStorage.getItem('iasj_google_user'));
  if (user && user.franchiseName) {
    const title = document.getElementById('dashboard-franchise-name');
    if (title) title.textContent = user.franchiseName;
  }
  renderFranchiseStaff();
  if (panel) panel.classList.add('active');
}

function closeFranchiseDashboard() {
  const panel = document.getElementById('franchise-dashboard-modal');
  if (panel) panel.classList.remove('active');
}

function handleFranchiseRegisterSubmit(e) {
  e.preventDefault();
  const franchiseName = document.getElementById('franchise-name').value.trim();
  const adminName = document.getElementById('franchise-admin-name').value.trim();
  const adminEmail = document.getElementById('franchise-admin-email').value.trim();

  const user = {
    uid: 'franchise-' + Date.now(),
    displayName: adminName,
    email: adminEmail,
    role: 'franchise_admin',
    franchiseName: franchiseName,
    photoURL: 'assets/images/tradie_worker.jpg'
  };

  localStorage.setItem('iasj_google_user', JSON.stringify(user));
  
  // Register with Stripe if required (stubbed for now)
  
  closeFranchiseRegisterModal();
  showToast(`✅ Franchise '${franchiseName}' registered successfully!`);
  
  // Trigger UI update
  window.dispatchEvent(new CustomEvent('googleAuthStateChanged', { detail: { user: user, action: 'login' } }));
}

function handleAddStaffSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('staff-name').value.trim();
  const email = document.getElementById('staff-email').value.trim();
  const payId = document.getElementById('staff-payid').value.trim();

  let staffList = JSON.parse(localStorage.getItem('iasj_franchise_staff') || '[]');
  
  const newStaff = {
    id: 'staff-' + Date.now(),
    name,
    email,
    payId,
    addedAt: new Date().toISOString()
  };

  staffList.push(newStaff);
  localStorage.setItem('iasj_franchise_staff', JSON.stringify(staffList));
  
  // Also register staff as a provider globally so they appear in searches
  // Generate random coords nearby for the map
  const lat = -28.0 + (Math.random() * 0.1 - 0.05);
  const lng = 153.4 + (Math.random() * 0.1 - 0.05);
  
  const providerProfile = {
    serviceProviderNumber: 'SPN-' + Math.floor(100000 + Math.random() * 900000),
    name: name,
    businessName: newStaff.name + ' (Franchise Staff)',
    phone: '0400 000 000',
    email: email,
    location: { lat, lng },
    radiusKm: 20,
    services: ['Handyman', 'Plumbing'],
    status: 'Available',
    bankDetails: {
      payId: payId,
      bsb: '',
      account: ''
    }
  };

  // Add to global provider DB
  if (window.addProviderToDatabase) {
    window.addProviderToDatabase(providerProfile);
  }

  // Sync to Stripe if service exists
  if (window.stripePaymentService && window.stripePaymentService.registerProviderUser) {
    window.stripePaymentService.registerProviderUser(providerProfile).catch(err => console.warn('Stripe register staff error:', err));
  }
  
  document.getElementById('franchise-add-staff-form').reset();
  showToast(`✅ Staff member '${name}' added successfully!`);
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
    <div style="background:#fff; border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:1rem; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h4 style="margin:0; color:var(--primary-navy); font-size:1rem; font-weight:700;">${staff.name}</h4>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
          <i class="fa-solid fa-envelope"></i> ${staff.email} <span style="margin:0 0.5rem;">|</span> <i class="fa-solid fa-money-check-dollar"></i> ${staff.payId}
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
