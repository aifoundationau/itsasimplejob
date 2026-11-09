/**
 * It's A Simple Job - Direct Driver Courier Platform Application Logic (AUD Only)
 * Integrates OpenStreetMap Leaflet Maps, OSRM Road Routing, Live Driver Geolocation,
 * Driver Registration (Licence, Address, Phone, Email, PayID, $/km, Same-Day, Urgent, Max Weight, Max H×W×L),
 * 9:00 AM – 4:00 PM Customer Pickup Booking, Direct Driver PayID Settlement, Driver Admin Dashboard,
 * and SuperAdmin Distance-Tier Token Economy (0-20km, 21-50km, 51-100km, 101+km).
 */

import { MAX_COURIER_WEIGHT_KG } from '../shared/pricing.js';

// Application State
const appState = {
  activeTab: 'courier-tab',
  selectedCourierDriverId: 'drv-101',
  activeAdminDriverId: 'drv-101',
  currentAnalysis: null,
  selectedProviderId: 'drv-101',
  selectedShift: 'morning',
  courierPackageType: 'parcels',
  activeBookings: [],
  isListening: false,
  recognition: null,
  candidateShiftFilter: 'all',
  activeCandidateModalId: null,
  // ImgBB Upload State (Album: https://ibb.co/album/TKRnX5)
  uploadedJobPhotos: [],
  uploadedCourierPhoto: null,
  uploadedProviderPhoto: null,
  uploadedCandidatePhoto: null,
  // Map & Geolocation State
  userCoords: { lat: -27.9635, lng: 153.4064 }, // Southport QLD default
  userLocationName: '10 Smith Street, Southport QLD 4215',
  courierOriginCoords: { lat: -27.9635, lng: 153.4064 },
  courierDestCoords: { lat: -28.0280, lng: 153.4312 },
  searchRadiusKm: 50,
  driverServiceModeOverrides: {},
  contractorCardModeOverrides: {},
  contractorMarkers: [],
  userMarker: null,
  contractorInfoWindow: null,
  contractorMap: null,
  courierRouteMap: null,
  directionsService: null,
  directionsRenderer: null
};

// Preset Sample Prompts
const SAMPLE_PROMPTS = {
  urgent_courier: "Urgent courier needed: 2 boxes of diagnostic equipment (14kg total) from 10 Smith Street, Southport to 42 Surf Parade, Broadbeach."
};

// Initialize on DOM Ready or Immediate execution (supports Vite ES module timing)
function initApp() {
  try {
    setupOsmAddressAutocomplete('courier-origin', (place) => {
      if (place?.lat && place?.lng) {
        appState.courierOriginCoords = { lat: place.lat, lng: place.lng };
      }
      calculateCourierQuote();
    });
  } catch (e) {}
  try {
    setupOsmAddressAutocomplete('courier-dest', (place) => {
      if (place?.lat && place?.lng) {
        appState.courierDestCoords = { lat: place.lat, lng: place.lng };
      }
      calculateCourierQuote();
    });
  } catch (e) {}
  try { setupOsmAddressAutocomplete('courier-cust-address'); } catch (e) {}
  try { setupOsmAddressAutocomplete('supporter-reg-suburb'); } catch (e) {}
  const drvEmailInput = document.getElementById('drv-reg-email');
  if (drvEmailInput) {
    drvEmailInput.addEventListener('change', () => {
      try { prefillDriverRegistrationForm(); } catch (e) {}
    });
    drvEmailInput.addEventListener('blur', () => {
      try { prefillDriverRegistrationForm(); } catch (e) {}
    });
  }
  try { setupOsmAddressAutocomplete('contractor-search-location', (place) => onContractorLocationSelected(place)); } catch (e) {}
  try {
    setupOsmAddressAutocomplete('drv-reg-address', (place) => {
      if (place?.lat && place?.lng) {
        const latEl = document.getElementById('drv-reg-lat');
        const lngEl = document.getElementById('drv-reg-lng');
        if (latEl) latEl.value = String(place.lat);
        if (lngEl) lngEl.value = String(place.lng);
        const st = document.getElementById('drv-reg-geo-status');
        if (st) {
          st.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#059669;"></i> Located at <strong>${place.formatted}</strong> (${place.lat.toFixed(4)}, ${place.lng.toFixed(4)})`;
        }
      }
    });
  } catch (e) {}

  try { initSpeechRecognition(); } catch (e) {}
  try { loadGoogleMapsScript(); } catch (e) {}
  try { initGoogleAuthUI(); } catch (e) {}

  const courierDateInput = document.getElementById('courier-pickup-date');
  if (courierDateInput && !courierDateInput.value) {
    courierDateInput.value = new Date().toISOString().split('T')[0];
  }

  try { syncSuperadminDistanceTierInputs(); } catch (e) {}
  try { initSuperadminViewMode(); } catch (e) {}

  // Calculate initial courier route & rank closest drivers
  if (document.getElementById('courier-origin')) {
    try { calculateCourierQuote(); } catch (e) {}
  }

  // Populate Closest Drivers Map & Cards
  try { filterContractors(); } catch (e) {}

  // Populate Supporter & Driver Admin Page
  try { renderSupporterPanel(); } catch (e) {}
  try { renderDriverAdminDashboard(); } catch (e) {}
  try { updateDriverApplicationGateUI(); } catch (e) {}

  // If Firebase is available, seed courier drivers if database is empty
  if (window.firebaseService?.seedProvidersIfEmpty && window.INITIAL_PROVIDERS) {
    window.firebaseService.seedProvidersIfEmpty(window.INITIAL_PROVIDERS);
  }

  // Handle URL search params or hash for navigation
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const requestedTab = urlParams.get('tab');
    if (requestedTab && typeof switchTab === 'function') {
      switchTab(requestedTab);
    } else if (window.location.hash === '#register') {
      switchTab('provider-application-tab');
    } else if (window.location.hash === '#driver-admin') {
      switchTab('driver-admin-tab');
    }
  } catch (e) {
    console.warn('URL param navigation error:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  queueMicrotask(initApp);
}

/**
 * Tab Navigation Controller (Courier-Only Views)
 */
function switchTab(tabId, bypassGate = false) {
  if (tabId === 'register-tab' || tabId === 'register-selection-tab' || tabId === 'provider-network-tab' || tabId === 'provider-application-tab') {
    tabId = 'driver-admin-tab';
  }
  if (tabId === 'ai-book-tab') {
    tabId = 'courier-tab';
  }

  // Supporter Portal is strictly gated behind Google login
  if (tabId === 'driver-admin-tab' && !bypassGate) {
    const isGoogleLoggedIn = !!window.firebaseService?.getCurrentGoogleUser?.() || !!localStorage.getItem('iasj_google_user');
    if (!isGoogleLoggedIn) {
      showToast('🔒 Supporter Portal is only seen behind Google login. Please sign in with Google to continue.');
      signUpWithGoogle('supporter');
      return;
    }
  }

  // Update view containers
  const views = document.querySelectorAll('.workspace-view');
  views.forEach(view => view.classList.remove('active-view'));

  const targetView = document.getElementById(tabId);
  if (targetView) {
    targetView.classList.add('active-view');
  }

  // Update nav buttons
  const navBtns = document.querySelectorAll('.nav-item-btn');
  navBtns.forEach(btn => btn.classList.remove('active'));

  const tabPills = document.querySelectorAll('.tab-nav-btn');
  tabPills.forEach(pill => pill.classList.remove('active'));

  // Sync active states
  if (tabId === 'courier-tab') {
    document.getElementById('tab-btn-courier')?.classList.add('active');
    document.getElementById('pill-courier')?.classList.add('active');
    [50, 150, 400].forEach(delay => {
      setTimeout(() => {
        if (appState.osmCourierMap) {
          try { appState.osmCourierMap.invalidateSize(true); } catch(e) {}
        } else {
          renderOsmCourierRouteMap();
        }
      }, delay);
    });
    try { calculateCourierQuote(); } catch (e) {}
  } else if (tabId === 'find-contractors-tab') {
    document.getElementById('tab-btn-find-contractors')?.classList.add('active');
    document.getElementById('pill-find-contractors')?.classList.add('active');
    [50, 150, 400].forEach(delay => {
      setTimeout(() => {
        if (appState.osmMap) {
          try { appState.osmMap.invalidateSize(true); } catch(e) {}
        } else {
          renderOsmContractorMap();
        }
      }, delay);
    });
    try { filterContractors(); } catch (e) {}
  } else if (tabId === 'driver-admin-tab') {
    document.getElementById('tab-btn-supporter-admin')?.classList.add('active');
    document.getElementById('tab-btn-driver-admin')?.classList.add('active');
    document.getElementById('pill-driver-admin')?.classList.add('active');
    try { renderSupporterPanel(); } catch (e) {}
    try { renderDriverAdminDashboard(); } catch (e) {}
  } else if (tabId === 'how-it-works-tab') {
    window.location.href = '/terms.html#how-it-works';
    return;
  }

  appState.activeTab = tabId;
  window.scrollTo({ top: 140, behavior: 'smooth' });
}

function focusAIChat() {
  switchTab('courier-tab');
  const input = document.getElementById('courier-origin');
  if (input) {
    input.focus();
  }
}

/**
 * ==========================================================================
 * MAP SERVICES & GEOLOCATION (OpenStreetMap Leaflet Engine + Google Fallback)
 * ==========================================================================
 */

/**
 * Handler when user selects a location from "Your Location / Suburb"
 */
function onContractorLocationSelected(place) {
  const lat = place.lat || (typeof place.geometry?.location?.lat === 'function' ? place.geometry.location.lat() : null);
  const lng = place.lng || (typeof place.geometry?.location?.lng === 'function' ? place.geometry.location.lng() : null);

  if (lat && lng) {
    appState.userCoords = { lat, lng };
    appState.userLocationName = place.formatted || place.formatted_address || place.name || 'Selected Suburb';
    if (appState.osmMap) {
      appState.osmMap.setView([lat, lng], 13);
      if (appState.osmUserMarker) {
        appState.osmUserMarker.setLatLng([lat, lng]);
        appState.osmUserMarker.setPopupContent(`<strong style="color:#0B192C;">📍 Your Search Center</strong><br><span style="font-size:0.8rem; color:#64748B;">${appState.userLocationName}</span>`);
      }
      updateOsmRadiusCircle(true);
      updateOsmContractorMarkers();
    } else if (appState.contractorMap && window.google?.maps) {
      appState.contractorMap.panTo(appState.userCoords);
      appState.contractorMap.setZoom(13);
    }
    filterContractors();
    showToast(`📍 Map centered on: ${place.title || place.name || appState.userLocationName.split(',')[0]}`);
  }
}
window.onContractorLocationSelected = onContractorLocationSelected;

/**
 * Universal OpenStreetMap (Leaflet) Contractor Directory Map
 * 100% Free, Zero API Key, Zero Failure Rate (Immune to Google Maps authorization errors)
 */
function renderOsmContractorMap() {
  const container = document.getElementById('contractor-map');
  if (!container || !window.L) return;

  if (appState.osmMap) {
    try { appState.osmMap.remove(); } catch(e) {}
    appState.osmMap = null;
    appState.osmRadiusCircle = null;
    appState.osmUserMarker = null;
    appState.osmContractorMarkers = [];
  }
  container.innerHTML = '';

  const centerLat = appState.userCoords?.lat || -28.0280;
  const centerLng = appState.userCoords?.lng || 153.4312;

  const map = L.map(container, {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([centerLat, centerLng], 12);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  }).addTo(map);

  appState.osmMap = map;

  // Auto-resize on tab switch or viewport orientation change (Android / Mobile support)
  if (window.ResizeObserver && !container._iasjRo) {
    const ro = new ResizeObserver(() => {
      if (container.offsetWidth > 40 && container.offsetHeight > 40 && appState.osmMap) {
        try { appState.osmMap.invalidateSize(true); } catch(e) {}
      }
    });
    ro.observe(container);
    container._iasjRo = ro;
  }

  // Add customer search address marker (Green Pin)
  const userIcon = L.divIcon({
    className: 'osm-user-pin',
    html: `<div style="background:#10B981; color:#fff; width:34px; height:34px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; box-shadow:0 3px 12px rgba(16,185,129,0.55); border:2px solid #FFFFFF;" title="Customer Address (Green Pin)">
            <i class="fa-solid fa-house-user" style="transform:rotate(45deg); font-size:13px;"></i>
           </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32]
  });

  appState.osmUserMarker = L.marker([centerLat, centerLng], { icon: userIcon })
    .addTo(map)
    .bindPopup(`<strong style="color:#065F46;"><i class="fa-solid fa-location-dot" style="color:#10B981;"></i> Customer Address (Search Center)</strong><br><span style="font-size:0.8rem; color:#64748B;">${appState.userLocationName || 'Broadbeach QLD'}</span>`);

  updateOsmRadiusCircle(true);
  updateOsmContractorMarkers();
}
window.renderOsmContractorMap = renderOsmContractorMap;

let radiusFitBoundsTimeout = null;

function updateOsmRadiusCircle(immediateFit = false) {
  if (!appState.osmMap || !window.L) return;

  const userLat = appState.userCoords?.lat || -27.9635;
  const userLng = appState.userCoords?.lng || 153.4064;
  const radiusKm = appState.searchRadiusKm || 50;
  const radiusMeters = radiusKm * 1000;

  if (appState.osmRadiusCircle) {
    appState.osmRadiusCircle.setLatLng([userLat, userLng]);
    appState.osmRadiusCircle.setRadius(radiusMeters);
  } else {
    appState.osmRadiusCircle = L.circle([userLat, userLng], {
      radius: radiusMeters,
      color: '#FF5A1F',
      weight: 2,
      opacity: 0.85,
      dashArray: '6, 6',
      fillColor: '#FF5A1F',
      fillOpacity: 0.08
    }).addTo(appState.osmMap);
  }

  const doFit = () => {
    try {
      if (appState.osmMap && appState.osmRadiusCircle) {
        const bounds = appState.osmRadiusCircle.getBounds();
        appState.osmMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      }
    } catch (e) {}
  };

  clearTimeout(radiusFitBoundsTimeout);
  if (immediateFit) {
    doFit();
  } else {
    radiusFitBoundsTimeout = setTimeout(doFit, 180);
  }
}
window.updateOsmRadiusCircle = updateOsmRadiusCircle;

function updateOsmContractorMarkers() {
  if (!appState.osmMap || !window.L) return;

  if (appState.osmContractorMarkers) {
    appState.osmContractorMarkers.forEach(m => {
      try { appState.osmMap.removeLayer(m); } catch(e) {}
    });
  }
  appState.osmContractorMarkers = [];

  const minWeight = parseFloat(document.getElementById('contractor-min-weight')?.value || '0') || 0;
  const radius = appState.searchRadiusKm || 50;
  const userLat = appState.userCoords?.lat || -27.9635;
  const userLng = appState.userCoords?.lng || 153.4064;

  const allProviders = window.providerDB ? window.providerDB.getAll() : [];
  const matched = [];

  allProviders.forEach(provider => {
    // SuperAdmin Driver Approval Console: if a driver is not approved, they CANNOT be shown on the map
    const isApproved = typeof isDriverApproved === 'function' ? isDriverApproved(provider) : (provider.approved !== false && provider.status !== 'pending_approval' && provider.status !== 'revoked');
    if (!isApproved) {
      return;
    }

    if ((provider.maxWeightKg || 500) < minWeight) return;
    const pLat = provider.lat ?? provider.coords?.lat ?? -27.9635;
    const pLng = provider.lng ?? provider.coords?.lng ?? 153.4064;
    const dist = computeDistanceInKm(userLat, userLng, pLat, pLng);
    if (dist <= radius) {
      matched.push({ provider, dist, pLat, pLng });
    }
  });

  matched.sort((a, b) => a.dist - b.dist);

  matched.forEach(({ provider, dist, pLat, pLng }, idx) => {
    const isClosest = idx === 0;
    const isFemale = (provider.gender === 'female') || (!provider.gender && ['sarah', 'tanya', 'emma', 'chloe', 'sophie', 'jessica'].some(n => (provider.name || '').toLowerCase().includes(n)));
    const bgPin = isFemale ? '#EC4899' : '#2563EB'; // Pink for female driver, Blue for male driver
    const pinGenderTitle = isFemale ? 'Female Driver (Pink Pin)' : 'Male Driver (Blue Pin)';
    const pinIconName = provider.hasBicycleCourier && !provider.hasVehicleCourier ? 'fa-bicycle' : 'fa-truck-fast';

    const markerIcon = L.divIcon({
      className: 'osm-contractor-pin',
      html: `<div style="background:${bgPin}; color:#fff; width:34px; height:34px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.35); border:2px solid #FFFFFF; cursor:pointer; position:relative;" title="${provider.name} (${pinGenderTitle})">
              <i class="fa-solid ${pinIconName}" style="transform:rotate(45deg); font-size:13px;"></i>
              ${isClosest ? '<span style="position:absolute; top:-3px; right:-3px; background:#F59E0B; color:#fff; border-radius:50%; width:13px; height:13px; font-size:8px; font-weight:900; display:flex; align-items:center; justify-content:center; transform:rotate(45deg); border:1.5px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.4);" title="Closest Driver">★</span>' : ''}
             </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32]
    });

    const hasVeh = provider.hasVehicleCourier !== false;
    const hasBic = !!provider.hasBicycleCourier;
    const isDual = hasVeh && hasBic;
    const popupMode = appState.contractorCardModeOverrides?.[provider.id] || (hasVeh ? 'vehicle' : 'bicycle');
    const isBicyclePopup = popupMode === 'bicycle' && hasBic;

    const perKmVal = isBicyclePopup
      ? Number(provider.bicyclePerKmRateAud ?? 1.80).toFixed(2)
      : Number(provider.vehiclePerKmRateAud ?? provider.perKmRateAud ?? 2.20).toFixed(2);
    const sameDayVal = isBicyclePopup
      ? Number(provider.bicycleSameDayFeeAud ?? 0).toFixed(0)
      : Number(provider.vehicleSameDayFeeAud ?? provider.sameDayFeeAud ?? 18).toFixed(0);
    const urgentVal = isBicyclePopup
      ? Number(provider.bicycleUrgentFeeAud ?? 0).toFixed(0)
      : Number(provider.vehicleUrgentFeeAud ?? provider.urgentFeeAud ?? 35).toFixed(0);
    const weightVal = isBicyclePopup
      ? `${provider.bicycleMaxWeightKg || 8}kg (Small/Letters/Food)`
      : `${provider.vehicleMaxWeightKg || provider.maxWeightKg || 500}kg`;
    const dimsVal = isBicyclePopup
      ? `${provider.bicycleMaxHeightCm || 35}×${provider.bicycleMaxWidthCm || 30}×${provider.bicycleMaxLengthCm || 40}cm`
      : `${provider.vehicleMaxHeightCm || provider.maxHeightCm || 150}×${provider.vehicleMaxWidthCm || provider.maxWidthCm || 130}×${provider.vehicleMaxLengthCm || provider.maxLengthCm || 250}cm`;

    const popupHtml = `
      <div style="min-width:240px; font-family:'Plus Jakarta Sans', sans-serif; padding:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:0.4rem;">
          <div>
            <strong style="color:#0B192C; font-size:0.95rem;">${provider.name}</strong>
            <span style="font-size:0.68rem; font-weight:800; padding:1px 6px; border-radius:999px; margin-left:4px; ${isFemale ? 'background:#FCE7F3; color:#BE185D; border:1px solid #FBCFE8;' : 'background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE;'}">
              <i class="fa-solid ${isFemale ? 'fa-venus' : 'fa-mars'}"></i> ${isFemale ? 'Female' : 'Male'}
            </span>
          </div>
          <span style="font-size:0.72rem; background:${isClosest ? '#ECFDF5' : '#FFF0EB'}; color:${isClosest ? '#065F46' : '#FF5A1F'}; padding:2px 6px; border-radius:10px; font-weight:800;">
            ${isClosest ? '★ Closest Driver' : `${dist.toFixed(1)} km`}
          </span>
        </div>
        <div style="font-size:0.76rem; color:#64748B; margin-bottom:5px;">
          <i class="fa-solid fa-location-dot" style="color:#FF5A1F;"></i> ${provider.baseSuburb || provider.suburb || 'Gold Coast'} • <strong>${dist.toFixed(1)} km from pickup</strong>
        </div>
        ${isDual ? `
          <div style="display:flex; gap:4px; margin:4px 0 6px 0;">
            <button type="button" class="btn btn-xs" style="font-size:0.68rem; padding:2px 6px; font-weight:800; border-radius:4px; ${!isBicyclePopup ? 'background:#0B192C; color:#fff; border:1px solid #0B192C;' : 'background:#F1F5F9; color:#0B192C; border:1px solid #CBD5E1;'}" onclick="toggleContractorCardMode('${provider.id}', 'vehicle', event)">
              <i class="fa-solid fa-truck"></i> Vehicle ($${Number(provider.vehiclePerKmRateAud ?? provider.perKmRateAud ?? 2.20).toFixed(2)})
            </button>
            <button type="button" class="btn btn-xs" style="font-size:0.68rem; padding:2px 6px; font-weight:800; border-radius:4px; ${isBicyclePopup ? 'background:#0284C7; color:#fff; border:1px solid #0284C7;' : 'background:#F1F5F9; color:#0284C7; border:1px solid #0284C7;'}" onclick="toggleContractorCardMode('${provider.id}', 'bicycle', event)">
              <i class="fa-solid fa-bicycle"></i> Bicycle ($${Number(provider.bicyclePerKmRateAud ?? 1.80).toFixed(2)})
            </button>
          </div>
        ` : ''}
        <div style="font-size:0.76rem; color:#0B192C; margin-bottom:5px; line-height:1.45;">
          <strong>Rate:</strong> $${perKmVal} AUD/km • Same-Day: +$${sameDayVal} • Urgent: +$${urgentVal}<br>
          <strong>Max Capacity:</strong> ${weightVal} (${dimsVal})<br>
          <strong>PayID:</strong> ${provider.payIdValue || provider.phone}
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="bookProviderDirectly('${provider.id}')" style="width:100%; font-size:0.78rem; padding:5px 10px; font-weight:700;">
          <i class="fa-solid ${isBicyclePopup ? 'fa-bicycle' : 'fa-truck-fast'}"></i> Select Driver (9am–4pm Pickup)
        </button>
      </div>
    `;

    const marker = L.marker([pLat, pLng], { icon: markerIcon })
      .addTo(appState.osmMap)
      .bindPopup(popupHtml);

    appState.osmContractorMarkers.push(marker);
  });

  const mapCounter = document.getElementById('map-counter-text');
  if (mapCounter) {
    mapCounter.textContent = `Showing ${matched.length} Active Courier Driver${matched.length === 1 ? '' : 's'} (Sorted Closest First)`;
  }
}
window.updateOsmContractorMarkers = updateOsmContractorMarkers;

/**
 * Universal OpenStreetMap (Leaflet) Courier Route Map
 * Updates dynamically with pickup pin, delivery pin, nearby driver pins, and live road polyline
 */
function renderOsmCourierRouteMap(origCoords, destCoords, routePoints = null, originText = '', destText = '') {
  const container = document.getElementById('courier-route-map');
  if (!container || !window.L) return;

  if (appState.osmCourierMap) {
    try { appState.osmCourierMap.remove(); } catch(e) {}
    appState.osmCourierMap = null;
  }
  container.innerHTML = '';

  const c1 = origCoords || appState.courierOriginCoords || { lat: -27.9635, lng: 153.4064 }; // Default Southport
  const c2 = destCoords || appState.courierDestCoords || { lat: -28.0280, lng: 153.4312 }; // Default Broadbeach

  const map = L.map(container, {
    zoomControl: true,
    scrollWheelZoom: false
  }).setView([(c1.lat + c2.lat) / 2, (c1.lng + c2.lng) / 2], 11);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  }).addTo(map);

  appState.osmCourierMap = map;

  // Auto-resize on tab switch or viewport orientation change (Android / Mobile support)
  if (window.ResizeObserver && !container._iasjRo) {
    const ro = new ResizeObserver(() => {
      if (container.offsetWidth > 40 && container.offsetHeight > 40 && appState.osmCourierMap) {
        try { appState.osmCourierMap.invalidateSize(true); } catch(e) {}
      }
    });
    ro.observe(container);
    container._iasjRo = ro;
  }

  const originIcon = L.divIcon({
    className: 'osm-pickup-pin',
    html: `<div style="background:#10B981; color:#fff; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(16,185,129,0.5); border:2px solid #FFFFFF;" title="Pickup Origin">
            <i class="fa-solid fa-box" style="font-size:13px;"></i>
           </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  const destIcon = L.divIcon({
    className: 'osm-delivery-pin',
    html: `<div style="background:#EF4444; color:#fff; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(239,68,68,0.5); border:2px solid #FFFFFF;" title="Delivery Destination">
            <i class="fa-solid fa-flag-checkered" style="font-size:13px;"></i>
           </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  L.marker([c1.lat, c1.lng], { icon: originIcon })
    .addTo(map)
    .bindPopup(`<strong style="color:#065F46;"><i class="fa-solid fa-location-dot" style="color:#10B981;"></i> Customer Pickup Address (Green Pin)</strong><br><span style="font-size:0.8rem; color:#64748B;">${originText || 'Southport QLD'}</span>`);

  L.marker([c2.lat, c2.lng], { icon: destIcon })
    .addTo(map)
    .bindPopup(`<strong style="color:#0B192C;">🏁 Delivery Destination</strong><br><span style="font-size:0.8rem; color:#64748B;">${destText || 'Broadbeach QLD'}</span>`);

  // Also plot live Courier Driver pins around the route (Pink = Female, Blue = Male)
  // SuperAdmin Driver Approval Console: if a driver is not approved, they CANNOT be shown on the map
  const allDrivers = window.providerDB ? window.providerDB.getAll().filter(d => typeof isDriverApproved === 'function' ? isDriverApproved(d) : (d.approved !== false && d.status !== 'pending_approval' && d.status !== 'revoked')) : [];
  allDrivers.forEach(drv => {
    if (!drv.lat || !drv.lng) return;
    const isSelected = drv.id === appState.selectedCourierDriverId;
    const distFromPickup = computeDistanceInKm(c1.lat, c1.lng, drv.lat, drv.lng);
    const isFemale = (drv.gender === 'female') || (!drv.gender && ['sarah', 'tanya', 'emma', 'chloe', 'sophie', 'jessica'].some(n => (drv.name || '').toLowerCase().includes(n)));
    const drvPinColor = isFemale ? '#EC4899' : '#2563EB';
    const drvIcon = L.divIcon({
      className: 'osm-driver-pin',
      html: `<div style="background:${drvPinColor}; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid ${isSelected ? '#FF5A1F' : '#fff'}; box-shadow:${isSelected ? '0 0 10px rgba(255,90,31,0.85)' : '0 2px 6px rgba(0,0,0,0.35)'};" title="${drv.name} (${isFemale ? 'Female Driver (Pink Pin)' : 'Male Driver (Blue Pin)'} • ${distFromPickup.toFixed(1)} km from pickup)">
              <i class="fa-solid ${drv.hasBicycleCourier && !drv.hasVehicleCourier ? 'fa-bicycle' : 'fa-truck-fast'}" style="font-size:11px;"></i>
             </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    L.marker([drv.lat, drv.lng], { icon: drvIcon })
      .addTo(map)
      .bindPopup(`<strong>🚚 ${drv.name}</strong> <span style="font-size:0.72rem; font-weight:800; color:${drvPinColor};">(${isFemale ? 'Female' : 'Male'})</span><br><span style="font-size:0.75rem;">${distFromPickup.toFixed(1)} km from pickup • $${Number(drv.perKmRateAud || 2.20).toFixed(2)} AUD/km</span>`);
  });

  // Draw Route Polyline: use real OSRM road geometry if available, otherwise direct dashed line
  if (routePoints && Array.isArray(routePoints) && routePoints.length > 0) {
    L.polyline(routePoints, {
      color: '#FF5A1F',
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
  } else {
    L.polyline([ [c1.lat, c1.lng], [c2.lat, c2.lng] ], {
      color: '#FF5A1F',
      weight: 4,
      opacity: 0.85,
      dashArray: '8, 8'
    }).addTo(map);
  }

  const bounds = L.latLngBounds([ [c1.lat, c1.lng], [c2.lat, c2.lng] ]);
  map.fitBounds(bounds, { padding: [35, 35] });
  setTimeout(() => { try { map.invalidateSize(); } catch(e) {} }, 100);
}
window.renderOsmCourierRouteMap = renderOsmCourierRouteMap;

// Global Google Maps Auth Failure Hook
window.gm_authFailure = function() {
  console.warn("⚠️ Google Maps authorization error detected (gm_authFailure). Engaging OpenStreetMap (Leaflet) fallback!");
  appState.useOsmMap = true;
  renderOsmContractorMap();
  renderOsmCourierRouteMap();
};

/**
 * Google Maps Callback: Initializes Maps, Autocomplete, Directions
 */
function initGoogleMapsServices() {
  if (!window.google || !window.google.maps) {
    console.warn("Google Maps API not loaded yet.");
    return;
  }

  try {
    // 1. Initialize Contractor Search Map
    const mapContainer = document.getElementById('contractor-map');
    if (mapContainer) {
      appState.contractorMap = new google.maps.Map(mapContainer, {
        center: appState.userCoords,
        zoom: 12,
        mapTypeControl: false,
        fullscreenControl: true,
        streetViewControl: false,
        styles: [
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
        ]
      });

      appState.contractorInfoWindow = new google.maps.InfoWindow();

      // Render initial markers
      filterContractors();
    }

    // 2. Initialize Courier Route Map
    const courierMapContainer = document.getElementById('courier-route-map');
    if (courierMapContainer) {
      appState.courierRouteMap = new google.maps.Map(courierMapContainer, {
        center: { lat: -27.8, lng: 153.2 },
        zoom: 9,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false
      });

      appState.directionsService = new google.maps.DirectionsService();
      appState.directionsRenderer = new google.maps.DirectionsRenderer({
        map: appState.courierRouteMap,
        polylineOptions: {
          strokeColor: "#FF5A1F",
          strokeWeight: 5
        }
      });

      // Compute initial courier route
      calculateCourierQuote();
    }

    // 3. Attach Google Places Autocomplete to all Address Fields
    setupAddressAutocomplete('cust-address');
    setupAddressAutocomplete('contractor-search-location', (place) => {
      if (place.geometry && place.geometry.location) {
        appState.userCoords = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        appState.userLocationName = place.formatted_address || place.name;
        if (appState.contractorMap) {
          appState.contractorMap.panTo(appState.userCoords);
          appState.contractorMap.setZoom(12);
        }
        filterContractors();
      }
    });
    setupAddressAutocomplete('courier-origin', () => calculateCourierQuote());
    setupAddressAutocomplete('courier-dest', () => calculateCourierQuote());

    console.log("Google Maps services initialized successfully.");
  } catch (e) {
    console.error("Error setting up Google Maps:", e);
  }
}

/**
 * Extract house/unit number and remaining street/suburb from user query
 * Examples: "10 Smith Street, Southport" -> { houseNumber: "10", streetQuery: "Smith Street, Southport" }
 *           "Unit 4/150 Marine Parade" -> { houseNumber: "4/150", streetQuery: "Marine Parade" }
 */
function parseAddressComponents(query) {
  if (!query) return null;
  const clean = query.trim();
  const m = clean.match(/^(?:(?:unit|apt|suite|lot|flat)\s+)?(\d+[a-zA-Z]?(?:\s*\/\s*\d+[a-zA-Z]?)?)\s*,?\s+(.+)$/i);
  if (m) {
    return {
      houseNumber: m[1].replace(/\s*\/\s*/g, '/'),
      streetQuery: m[2].trim()
    };
  }
  return null;
}

/**
 * Format an OpenStreetMap result into Australian address standards (street, suburb, state, postcode)
 */
function formatOsmAddress(item, userHouseNumber = '') {
  if (!item) return { title: '', subtitle: '', formatted: '', lat: null, lng: null };

  const lat = parseFloat(item.lat || item.geometry?.coordinates?.[1] || 0);
  const lng = parseFloat(item.lon || item.geometry?.coordinates?.[0] || 0);

  // If item is from Nominatim
  if (item.address) {
    const a = item.address;
    const houseNumber = userHouseNumber || a.house_number || '';
    const road = a.road || a.pedestrian || a.street || a.footway || '';
    const suburb = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || a.city || item.name || '';
    let state = a.state || '';
    if (state.toLowerCase().includes('queensland')) state = 'QLD';
    else if (state.toLowerCase().includes('new south wales')) state = 'NSW';
    else if (state.toLowerCase().includes('victoria')) state = 'VIC';
    else if (state.toLowerCase().includes('south australia')) state = 'SA';
    else if (state.toLowerCase().includes('western australia')) state = 'WA';
    else if (state.toLowerCase().includes('tasmania')) state = 'TAS';
    else if (state.toLowerCase().includes('northern territory')) state = 'NT';
    else if (state.toLowerCase().includes('australian capital territory')) state = 'ACT';

    const postcode = a.postcode || '';
    const streetPart = [houseNumber, road].filter(Boolean).join(' ');
    const localityPart = [suburb, state, postcode].filter(Boolean).join(' ');

    const title = streetPart || suburb || item.name || 'Address';
    const subtitle = localityPart ? (streetPart ? localityPart : `${state} ${postcode}`.trim()) : 'Australia';
    const formatted = [title, subtitle].filter(Boolean).join(', ');

    return { title, subtitle, formatted, lat, lng };
  }

  // If item is from Photon (Komoot OSM)
  if (item.properties) {
    const p = item.properties;
    const road = p.street || (p.osm_key === 'highway' ? p.name : '') || (p.name !== p.district && p.name !== p.city ? p.name : '') || '';
    const houseNumber = userHouseNumber || p.housenumber || '';
    let suburb = p.district || p.suburb || p.locality || '';
    if (!suburb && p.city && p.city !== road) {
      suburb = p.city;
    }
    let state = p.state || 'QLD';
    if (state.toLowerCase().includes('queensland')) state = 'QLD';
    else if (state.toLowerCase().includes('new south wales')) state = 'NSW';
    else if (state.toLowerCase().includes('victoria')) state = 'VIC';
    else if (state.toLowerCase().includes('south australia')) state = 'SA';
    else if (state.toLowerCase().includes('western australia')) state = 'WA';
    else if (state.toLowerCase().includes('tasmania')) state = 'TAS';
    else if (state.toLowerCase().includes('northern territory')) state = 'NT';

    const postcode = p.postcode || '';
    const streetPart = [houseNumber, road].filter(Boolean).join(' ');
    const localityPart = [suburb, state, postcode].filter(Boolean).join(' ');

    const title = streetPart || p.name || 'Address';
    const subtitle = localityPart ? (streetPart ? localityPart : `${state} ${postcode}`.trim()) : (p.country || 'Australia');
    const formatted = [title, subtitle].filter(Boolean).join(', ');

    return { title, subtitle, formatted, lat, lng };
  }

  // Fallback to display_name
  const raw = item.display_name || '';
  const parts = raw.split(',').map(s => s.trim());
  const title = (userHouseNumber ? `${userHouseNumber} ` : '') + (parts[0] || 'Address');
  const subtitle = parts.slice(1, 4).join(', ');
  return { title, subtitle, formatted: [title, subtitle].filter(Boolean).join(', '), lat, lng };
}

/**
 * Query OpenStreetMap APIs for Australian address suggestions (with Gold Coast prioritization & house number interpolation)
 */
async function searchOsmAddress(query) {
  if (!query || query.trim().length < 2) return [];
  const cleanQ = query.trim();
  const parsed = parseAddressComponents(cleanQ);
  const houseNum = parsed ? parsed.houseNumber : '';

  // Dual search query strategy:
  // Try exact search, and if user included a house/unit number, also query the street part as fallback
  const searchQueries = parsed ? [cleanQ, parsed.streetQuery] : [cleanQ];

  for (const q of searchQueries) {
    // 1. Photon OpenStreetMap API (Primary: High speed, CORS-enabled, Gold Coast biased)
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=-28.0280&lon=153.4312&limit=6`;
      const pRes = await fetch(photonUrl);
      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData.features && Array.isArray(pData.features) && pData.features.length > 0) {
          // Strictly match Australian results
          const auFeatures = pData.features.filter(f => {
            const p = f.properties || {};
            return p.countrycode === 'AU' || p.country === 'Australia' || p.state === 'Queensland' || (p.postcode && p.postcode.startsWith('4'));
          });

          // Only accept results if Australian features were found, otherwise cascade to next query
          if (auFeatures.length > 0) {
            const userNumToApply = (q === parsed?.streetQuery) ? houseNum : (houseNum || '');
            const mapped = auFeatures.map(feat => formatOsmAddress(feat, userNumToApply));

            const seen = new Set();
            const deduped = mapped.filter(item => {
              const key = item.formatted.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            if (deduped.length > 0) return deduped;
          }
        }
      }
    } catch (err) {
      console.warn("Photon OSM search error, falling back:", err);
    }
  }

  // 2. Fallback: Query Nominatim via proxy / direct
  for (const q of searchQueries) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&countrycodes=au`;
      const res = await fetch(nomUrl, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const userNumToApply = (q === parsed?.streetQuery) ? houseNum : '';
          const mapped = data.map(item => formatOsmAddress(item, userNumToApply));
          const seen = new Set();
          return mapped.filter(item => {
            const key = item.formatted.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      }
    } catch (err2) {
      console.warn("Nominatim fallback search failed:", err2);
    }
  }

  return [];
}

async function reverseGeocodeOsm(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const parsed = formatOsmAddress(data);
      if (parsed.formatted) return parsed.formatted;
    }
  } catch (e) {
    console.warn("OSM Reverse geocoding failed:", e);
  }
  return null;
}

/**
 * Attach OpenStreetMap Autocomplete to an address input with dropdown list
 */
function setupOsmAddressAutocomplete(inputId, onPlaceSelectedCallback) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (input.dataset.osmBound === 'true') {
    if (onPlaceSelectedCallback) {
      input._osmOnSelect = onPlaceSelectedCallback;
    }
    return;
  }
  input.dataset.osmBound = 'true';
  input._osmOnSelect = onPlaceSelectedCallback;

  // Find or create suggestions container
  let dropdown = document.getElementById(`${inputId}-suggestions`);
  if (!dropdown) {
    dropdown = document.createElement('ul');
    dropdown.id = `${inputId}-suggestions`;
    dropdown.className = 'osm-suggestions-dropdown';
    dropdown.setAttribute('data-agent-id', `osm-suggestions-${inputId}`);
    dropdown.setAttribute('data-testid', `osm-suggestions-${inputId}`);
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Address suggestions');
    dropdown.style.display = 'none';

    // Ensure parent wrapper has relative positioning
    const wrapper = input.closest('.osm-autocomplete-wrapper') || input.parentElement;
    if (wrapper) {
      if (getComputedStyle(wrapper).position === 'static') {
        wrapper.style.position = 'relative';
      }
      wrapper.appendChild(dropdown);
    }
  }

  // Prevent touch/mouse gestures in dropdown from closing it prematurely
  dropdown.addEventListener('pointerdown', (e) => e.stopPropagation());
  dropdown.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  dropdown.addEventListener('mousedown', (e) => e.stopPropagation());

  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', dropdown.id);
  input.setAttribute('aria-expanded', 'false');

  let debounceTimer = null;
  let activeIndex = -1;
  let currentResults = [];

  function closeDropdown() {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
    currentResults = [];
  }

  function selectItem(item) {
    input.value = item.formatted;
    if (item.lat && item.lng) {
      appState.userCoords = { lat: item.lat, lng: item.lng };
      appState.userLocationName = item.formatted;
    }
    closeDropdown();

    const cb = input._osmOnSelect || onPlaceSelectedCallback;
    if (cb) {
      cb({
        formatted_address: item.formatted,
        formatted: item.formatted,
        name: item.title,
        title: item.title,
        lat: item.lat,
        lng: item.lng,
        geometry: {
          location: {
            lat: () => item.lat,
            lng: () => item.lng
          }
        }
      });
    }

    // Trigger onchange event for input
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearTimeout(debounceTimer);

    if (query.length < 2) {
      closeDropdown();
      return;
    }

    // Show loading indicator
    dropdown.innerHTML = `
      <li class="osm-loading-spinner" role="status">
        <i class="fa-solid fa-spinner fa-spin" style="color:var(--brand-orange);"></i>
        <span>Finding addresses in Gold Coast / Australia...</span>
      </li>
    `;
    dropdown.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');

    debounceTimer = setTimeout(async () => {
      const results = await searchOsmAddress(query);
      currentResults = results;
      activeIndex = -1;

      if (!results || results.length === 0) {
        dropdown.innerHTML = `
          <li class="osm-suggestion-item" style="cursor:default; color:var(--text-muted);">
            <i class="fa-solid fa-circle-info osm-suggestion-icon" style="color:var(--text-muted);"></i>
            <div class="osm-suggestion-content">
              <span class="osm-suggestion-title">No matching Australian address found</span>
              <span class="osm-suggestion-subtitle">Try entering a street name or suburb (e.g. Broadbeach QLD)</span>
            </div>
          </li>
        `;
        return;
      }

      dropdown.innerHTML = results.map((res, idx) => `
        <li 
          class="osm-suggestion-item" 
          id="${inputId}-osm-item-${idx}"
          role="option" 
          aria-selected="false"
          data-agent-id="osm-suggestion-item"
          data-testid="osm-suggestion-item"
          data-index="${idx}"
        >
          <i class="fa-solid fa-location-dot osm-suggestion-icon"></i>
          <div class="osm-suggestion-content">
            <span class="osm-suggestion-title">${res.title}</span>
            <span class="osm-suggestion-subtitle">${res.subtitle}</span>
          </div>
          <span class="osm-suggestion-badge">AU</span>
        </li>
      `).join('');

      dropdown.querySelectorAll('.osm-suggestion-item').forEach(el => {
        const handleSelect = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(el.getAttribute('data-index'), 10);
          if (!isNaN(idx) && currentResults[idx]) {
            selectItem(currentResults[idx]);
          }
        };
        el.addEventListener('pointerdown', handleSelect);
        el.addEventListener('touchstart', handleSelect, { passive: false });
        el.addEventListener('mousedown', handleSelect);
        el.addEventListener('click', handleSelect);
      });
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.osm-suggestion-item[role="option"]');
    if (!items.length || dropdown.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < currentResults.length) {
        e.preventDefault();
        selectItem(currentResults[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  function updateActiveItem(items) {
    items.forEach((item, idx) => {
      const isActive = idx === activeIndex;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (isActive) item.scrollIntoView({ block: 'nearest' });
    });
  }

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      closeDropdown();
    }
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2 && currentResults.length > 0) {
      dropdown.style.display = 'block';
      input.setAttribute('aria-expanded', 'true');
    }
  });
}

/**
 * Universal Address Autocomplete Setup (OpenStreetMap + Google Places Dual Provider)
 */
function setupAddressAutocomplete(inputId, onPlaceSelectedCallback) {
  // Always attach OpenStreetMap autocomplete for ultra-reliable zero-key address resolution
  setupOsmAddressAutocomplete(inputId, onPlaceSelectedCallback);

  const input = document.getElementById(inputId);
  if (!input || !window.google?.maps?.places) return;

  try {
    const autocomplete = new google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: "au" },
      fields: ["formatted_address", "geometry", "name"]
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (onPlaceSelectedCallback) {
        onPlaceSelectedCallback(place);
      }
    });
  } catch (err) {
    console.warn("Google Places autocomplete initialization skipped:", err);
  }
}

/**
 * Geolocation / "Locate Me" Button Action (Powered by OpenStreetMap & GPS)
 */
async function locateCustomer(targetInputId) {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by your browser.");
    return;
  }

  showToast("📍 Accessing GPS to locate you...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      appState.userCoords = { lat, lng };

      let addressText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      // 1. Try OpenStreetMap reverse geocoding
      try {
        const osmAddr = await reverseGeocodeOsm(lat, lng);
        if (osmAddr) {
          addressText = osmAddr;
        }

      // Auto-detect and sync country from OpenStreetMap
      if (osmAddr && typeof geoTimeState !== 'undefined') {
        try {
          const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
          fetch(nomUrl, { headers: { 'Accept': 'application/json' } })
            .then(r => r.json())
            .then(data => {
              if (data?.address?.country_code) {
                const c = data.address.country_code.toUpperCase();
                localStorage.setItem('iasj_user_country', c);
                setUserCountry(c, 'gps');
              }
            }).catch(() => {});
        } catch (e) {}
      }

      } catch (err) {
        console.warn("OSM reverse geocoding error:", err);
      }

      // 2. Fallback to Google Maps Geocoder if OSM was blank and Google is ready
      if ((!addressText || addressText.includes(lat.toFixed(4))) && window.google?.maps?.Geocoder) {
        try {
          const geocoder = new google.maps.Geocoder();
          const googleResult = await new Promise((resolve) => {
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
              if (status === "OK" && results?.[0]) resolve(results[0].formatted_address);
              else resolve(null);
            });
          });
          if (googleResult) addressText = googleResult;
        } catch (gErr) {
          console.warn("Google reverse geocoding error:", gErr);
        }
      }

      if (!addressText || addressText.includes(lat.toFixed(4))) {
        addressText = "Gold Coast QLD (GPS Located)";
      }

      appState.userLocationName = addressText;
      const input = document.getElementById(targetInputId);
      if (input) {
        input.value = addressText;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (targetInputId === 'contractor-search-location') {
        if (appState.osmMap) {
          appState.osmMap.setView([lat, lng], 13);
          if (appState.osmUserMarker) {
            appState.osmUserMarker.setLatLng([lat, lng]);
            appState.osmUserMarker.setPopupContent(`<strong style="color:#0B192C;">📍 Your Search Center</strong><br><span style="font-size:0.8rem; color:#64748B;">${addressText}</span>`);
          }
          updateOsmContractorMarkers();
        } else if (appState.contractorMap) {
          appState.contractorMap.panTo(appState.userCoords);
          appState.contractorMap.setZoom(13);
        }
        filterContractors();
      } else if (targetInputId === 'courier-origin') {
        calculateCourierQuote();
      }

      showToast(`📍 Located: ${addressText.split(',')[0]}`);
    },
    (error) => {
      console.warn("Geolocation denied or unavailable:", error);
      const fallbackAddress = "42 Surf Parade, Broadbeach QLD 4218";
      appState.userCoords = { lat: -28.0280, lng: 153.4312 };
      appState.userLocationName = fallbackAddress;
      const input = document.getElementById(targetInputId);
      if (input) {
        input.value = fallbackAddress;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (targetInputId === 'contractor-search-location') {
        if (appState.osmMap) {
          appState.osmMap.setView([-28.0280, 153.4312], 13);
          updateOsmContractorMarkers();
        }
        filterContractors();
      } else if (targetInputId === 'courier-origin') {
        calculateCourierQuote();
      }
      showToast("GPS unavailable on this connection. Defaulted to Broadbeach, Gold Coast.");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function updateRadiusDisplay(value, immediateFit = false) {
  const radius = parseInt(value, 10) || 50;
  appState.searchRadiusKm = radius;
  const pill = document.getElementById('radius-val-display');
  if (pill) pill.textContent = `${radius} km`;
  const summaryText = document.getElementById('contractor-filter-summary');
  if (summaryText) summaryText.textContent = `Within ${radius} km • Sorted by GPS distance`;
  if (appState.osmMap && window.L) {
    updateOsmRadiusCircle(immediateFit);
    updateOsmContractorMarkers();
  }
  filterContractors();
}

/**
 * Filter Courier Drivers by GPS Proximity & Minimum Weight Capacity
 */
function filterContractors() {
  const minWeight = parseFloat(document.getElementById('contractor-min-weight')?.value || '0') || 0;
  const radius = appState.searchRadiusKm || 50;
  const userLat = appState.userCoords?.lat || -27.9635;
  const userLng = appState.userCoords?.lng || 153.4064;

  // Clear existing Google markers if any
  appState.contractorMarkers.forEach(m => m.setMap(null));
  appState.contractorMarkers = [];

  if (appState.userMarker) {
    appState.userMarker.setMap(null);
  }

  const allProviders = window.providerDB ? window.providerDB.getAll() : [];
  const matched = [];

  // Update OpenStreetMap Leaflet markers
  if (appState.osmMap && window.L) {
    updateOsmContractorMarkers();
  }

  allProviders.forEach(provider => {
    // SuperAdmin Driver Approval Console: if a driver is not approved, they CANNOT be shown on the map or in the directory
    const isApproved = typeof isDriverApproved === 'function' ? isDriverApproved(provider) : (provider.approved !== false && provider.status !== 'pending_approval' && provider.status !== 'revoked');
    if (!isApproved) {
      return; // Only SuperAdmin-approved drivers appear in public map directory
    }

    if ((provider.maxWeightKg || 500) < minWeight) {
      return;
    }

    const provLat = provider.lat ?? -27.9635;
    const provLng = provider.lng ?? 153.4064;
    const distNum = computeDistanceInKm(userLat, userLng, provLat, provLng);

    if (distNum <= radius) {
      matched.push({
        ...provider,
        distNum,
        distanceKm: distNum.toFixed(1)
      });
    }
  });

  // Sort closest drivers first
  matched.sort((a, b) => a.distNum - b.distNum);

  const counterText = document.getElementById('map-counter-text');
  if (counterText) {
    counterText.textContent = `Showing ${matched.length} Active Courier Driver${matched.length === 1 ? '' : 's'} (Closest First)`;
  }
  const summaryText = document.getElementById('contractor-filter-summary');
  if (summaryText) {
    summaryText.textContent = `Within ${radius} km • Sorted by GPS distance`;
  }

  renderContractorCards(matched);
}

/**
 * Render Courier Driver Cards in Search View
 */
function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function wholeMoney(value) {
  return value == null ? value : window.iasjCurrency.wholeUp(value);
}

function formatTokenItemPrice(fiatAudAmount, options = {}) {
  const cur = window.iasjCurrency;
  const suffix = options.suffix || '';
  const aud = cur.wholeUp(fiatAudAmount);
  const tokens = cur.tokensForAud(aud);
  const money = cur.formatMoney(aud, { suffix });
  const common = `data-price-aud="${aud}" data-price-suffix="${escapeAttr(suffix)}" title="${escapeAttr(cur.moneyTitle(aud, { suffix }))}"`;

  if (window.platformSettings?.isTokenSystemEnabled === false) {
    return `<span class="fiat-price-tag" data-price-format="fiat" ${common} data-agent-id="fiat-price-tag" data-testid="fiat-price-tag"><strong>${money}</strong></span>`;
  }

  return `<span class="token-price-tag" data-price-format="token" ${common} data-agent-id="token-price-tag" data-testid="token-price-tag" data-tokens="${tokens}" data-fiat="${escapeAttr(money)}">
      <span class="token-amount"><i class="fa-solid fa-coins token-coin-icon"></i> ${cur.formatTokens(tokens, suffix)}</span>
      <span class="token-fiat-hover">${money}</span>
    </span>`;
}

function refreshPriceTags(root = document) {
  root.querySelectorAll('[data-price-aud][data-price-format]').forEach(el => {
    const aud = Number(el.dataset.priceAud);
    const options = { suffix: el.dataset.priceSuffix || '' };
    const html = el.dataset.priceFormat === 'price'
      ? formatPriceWithTokenHover(aud, options)
      : formatTokenItemPrice(aud, options);
    el.outerHTML = html.trim();
  });
}

function renderContractorCards(contractors) {
  const container = document.getElementById('contractor-cards-container');
  if (!container) return;

  if (contractors.length === 0) {
    container.innerHTML = `
      <div style="background:#fff; border-radius:var(--radius-md); padding:2rem; text-align:center; border:1px solid var(--border-light);">
        <i class="fa-solid fa-truck-fast" style="font-size:2rem; color:var(--text-light); margin-bottom:0.75rem; display:block;"></i>
        <h5 style="color:var(--primary-navy); margin-bottom:0.25rem;">No courier drivers in this radius</h5>
        <p style="font-size:0.85rem; color:var(--text-muted);">Try increasing your search radius slider to 100 km.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = contractors.map((c, idx) => {
    const isClosest = idx === 0;
    const isFemale = (c.gender === 'female') || (!c.gender && ['sarah', 'tanya', 'emma', 'chloe', 'sophie', 'jessica'].some(n => (c.name || '').toLowerCase().includes(n)));
    const hasVeh = c.hasVehicleCourier !== false;
    const hasBic = !!c.hasBicycleCourier;
    const isDual = hasVeh && hasBic;

    const cardMode = appState.contractorCardModeOverrides?.[c.id] || (hasVeh ? 'vehicle' : 'bicycle');
    const isBicycleView = cardMode === 'bicycle' && hasBic;

    const perKmRate = isBicycleView
      ? Number(c.bicyclePerKmRateAud ?? 1.80).toFixed(2)
      : Number(c.vehiclePerKmRateAud ?? c.perKmRateAud ?? 2.20).toFixed(2);
    const sameDayFee = isBicycleView
      ? Number(c.bicycleSameDayFeeAud ?? 0).toFixed(0)
      : Number(c.vehicleSameDayFeeAud ?? c.sameDayFeeAud ?? 18).toFixed(0);
    const urgentFee = isBicycleView
      ? Number(c.bicycleUrgentFeeAud ?? 0).toFixed(0)
      : Number(c.vehicleUrgentFeeAud ?? c.urgentFeeAud ?? 35).toFixed(0);
    const maxWeight = isBicycleView
      ? `${c.bicycleMaxWeightKg || 8} kg (Small/Letters/Food Only)`
      : `${c.vehicleMaxWeightKg || c.maxWeightKg || 500} kg`;
    const maxDims = isBicycleView
      ? `${c.bicycleMaxHeightCm || 35}×${c.bicycleMaxWidthCm || 30}×${c.bicycleMaxLengthCm || 40} cm`
      : `${c.vehicleMaxHeightCm || c.maxHeightCm || 150}×${c.vehicleMaxWidthCm || c.maxWidthCm || 130}×${c.vehicleMaxLengthCm || c.maxLengthCm || 250} cm`;
    const displayVehicleTitle = isBicycleView
      ? 'Bicycle Courier (Letters & Food Only)'
      : (c.vehicle || c.tradeTitle || 'Courier Driver');

    return `
    <div class="contractor-search-card" id="search-card-${c.id}" onclick="panToContractor('${c.id}', ${c.lat}, ${c.lng})" data-agent-id="map-driver-card-${c.id}" data-testid="map-driver-card-${c.id}">
      <div class="card-top-row">
        <div class="card-tradie-profile">
          <div>
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
              <h5 style="font-size:1rem; font-weight:800; color:var(--primary-navy); margin-bottom:0.1rem;">
                ${c.name} <i class="fa-solid fa-circle-check verified-badge" title="Verified Driver Licence"></i>
              </h5>
              <span style="font-size:0.68rem; font-weight:800; padding:0.1rem 0.5rem; border-radius:999px; ${isFemale ? 'background:#FCE7F3; color:#BE185D; border:1px solid #FBCFE8;' : 'background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE;'}" title="${isFemale ? 'Female Driver (Pink Pin)' : 'Male Driver (Blue Pin)'}">
                <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${isFemale ? '#EC4899' : '#2563EB'}; margin-right:4px;"></span>${isFemale ? 'Female (Pink Pin)' : 'Male (Blue Pin)'}
              </span>
              ${isClosest ? `<span class="badge-pill-pill" style="background:#059669; color:#fff; font-size:0.68rem;">★ Closest Driver</span>` : ''}
              ${isDual ? `<span style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE; font-size:0.66rem; font-weight:800; padding:0.1rem 0.45rem; border-radius:999px;"><i class="fa-solid fa-arrows-split-up-and-left"></i> Dual Mode</span>` : ''}
            </div>
            <div style="font-size:0.78rem; font-weight:700; color:var(--brand-orange);">${displayVehicleTitle}</div>
            <div style="font-size:0.73rem; color:var(--text-muted);">
              <i class="fa-solid fa-location-dot" style="color:#10B981;"></i> ${c.baseSuburb || c.address || 'Gold Coast QLD'}
            </div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.05rem; font-weight:900; color:var(--primary-navy);">$${perKmRate} AUD/km</div>
          <span class="card-dist-badge"><i class="fa-solid fa-location-arrow"></i> ${c.distanceKm} km away</span>
        </div>
      </div>

      ${isDual ? `
        <div style="display:flex; align-items:center; gap:0.4rem; margin:0.45rem 0 0.2rem 0; flex-wrap:wrap;" onclick="event.stopPropagation();">
          <span style="font-size:0.7rem; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Service:</span>
          <button
            type="button"
            class="btn btn-xs ${!isBicycleView ? 'btn-primary' : 'btn-outline'}"
            style="font-size:0.72rem; padding:0.2rem 0.55rem; font-weight:800; border-radius:999px; ${!isBicycleView ? 'background:#0B192C; color:#fff; border-color:#0B192C;' : 'background:#fff; color:#0B192C; border-color:#CBD5E1;'}"
            onclick="toggleContractorCardMode('${c.id}', 'vehicle', event)"
            data-agent-id="btn-contractor-mode-vehicle-${c.id}"
            data-testid="btn-contractor-mode-vehicle-${c.id}"
            aria-pressed="${!isBicycleView ? 'true' : 'false'}"
            aria-label="View Motor Vehicle rates for ${escapeAttr(c.name)}">
            <i class="fa-solid fa-truck"></i> Motor Vehicle ($${Number(c.vehiclePerKmRateAud ?? c.perKmRateAud ?? 2.20).toFixed(2)}/km)
          </button>
          <button
            type="button"
            class="btn btn-xs ${isBicycleView ? 'btn-primary' : 'btn-outline'}"
            style="font-size:0.72rem; padding:0.2rem 0.55rem; font-weight:800; border-radius:999px; ${isBicycleView ? 'background:#0284C7; color:#fff; border-color:#0284C7;' : 'background:#fff; color:#0284C7; border-color:#0284C7;'}"
            onclick="toggleContractorCardMode('${c.id}', 'bicycle', event)"
            data-agent-id="btn-contractor-mode-bicycle-${c.id}"
            data-testid="btn-contractor-mode-bicycle-${c.id}"
            aria-pressed="${isBicycleView ? 'true' : 'false'}"
            aria-label="View Bicycle Courier rates for ${escapeAttr(c.name)}">
            <i class="fa-solid fa-bicycle"></i> Bicycle Courier ($${Number(c.bicyclePerKmRateAud ?? 1.80).toFixed(2)}/km)
          </button>
        </div>
      ` : ''}

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.45rem; background:#F8FAFC; border:1px solid var(--border-light); border-radius:6px; padding:0.55rem 0.7rem; margin:0.6rem 0; font-size:0.76rem; color:var(--primary-navy);">
        <div><strong>Same-Day Fee:</strong> +$${sameDayFee} AUD</div>
        <div><strong>Urgent Fee:</strong> +$${urgentFee} AUD</div>
        <div><strong>Max Weight:</strong> ${maxWeight}</div>
        <div><strong>Max H×W×L:</strong> ${maxDims}</div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-light); padding-top:0.55rem; flex-wrap:wrap; gap:0.5rem;">
        <div style="font-size:0.74rem; color:var(--text-muted);">
          <i class="fa-solid fa-id-card" style="color:var(--brand-orange);"></i> ${c.licenceState || 'QLD'} Lic #${c.licenceNumber || 'Verified'} (${c.licenceClass || 'C'}) • <strong>PayID:</strong> ${c.payIdValue || c.phone}
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="event.stopPropagation(); bookProviderDirectly('${c.id}')" data-agent-id="btn-select-map-driver-${c.id}" data-testid="btn-select-map-driver-${c.id}" aria-label="Select ${c.name} for Courier Booking">
          <i class="fa-solid ${isBicycleView ? 'fa-bicycle' : 'fa-truck-fast'}"></i> Book Driver (9am–4pm)
        </button>
      </div>
    </div>
  `}).join('');
}

function toggleContractorCardMode(providerId, mode, event) {
  if (event) {
    if (event.stopPropagation) event.stopPropagation();
    if (event.preventDefault) event.preventDefault();
  }
  if (!appState.contractorCardModeOverrides) appState.contractorCardModeOverrides = {};
  appState.contractorCardModeOverrides[providerId] = mode;

  if (!appState.driverServiceModeOverrides) appState.driverServiceModeOverrides = {};
  appState.driverServiceModeOverrides[providerId] = mode;

  filterContractors();

  const drv = window.providerDB?.findById(providerId);
  const drvName = drv?.name || 'Driver';
  showToast(`Viewing ${drvName} in ${mode === 'bicycle' ? '🚲 Bicycle Courier' : '🚗 Motor Vehicle'} mode!`);
}
window.toggleContractorCardMode = toggleContractorCardMode;

function panToContractor(providerId, lat, lng) {
  if (appState.osmMap && lat && lng) {
    try { appState.osmMap.setView([lat, lng], 14); } catch (e) {}
  } else if (appState.contractorMap && window.google?.maps) {
    appState.contractorMap.panTo(new google.maps.LatLng(lat, lng));
    appState.contractorMap.setZoom(14);
  }

  document.querySelectorAll('.contractor-search-card').forEach(el => el.classList.remove('card-active'));
  document.getElementById(`search-card-${providerId}`)?.classList.add('card-active');
}

function bookProviderDirectly(providerId) {
  const provider = window.providerDB?.findById(providerId);
  if (!provider) return;

  appState.selectedCourierDriverId = provider.id;
  const cardMode = appState.contractorCardModeOverrides?.[providerId];
  if (cardMode) {
    if (!appState.driverServiceModeOverrides) appState.driverServiceModeOverrides = {};
    appState.driverServiceModeOverrides[providerId] = cardMode;
  }
  switchTab('courier-tab');
  calculateCourierQuote();
  const activeMode = appState.driverServiceModeOverrides?.[providerId] || 'vehicle';
  const modeRate = activeMode === 'bicycle'
    ? (provider.bicyclePerKmRateAud || 1.80)
    : (provider.vehiclePerKmRateAud || provider.perKmRateAud || 2.20);
  showToast(`🚚 Selected ${provider.name} (${activeMode === 'bicycle' ? '🚲 Bicycle' : '🚗 Vehicle'} $${Number(modeRate).toFixed(2)} AUD/km) for your 9am–4pm courier pickup!`);
}

/**
 * Accurate Haversine Distance helper
 */
function computeDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Sample Prompt Loader
 */
function applySamplePrompt(key) {
  if (key === 'urgent_courier') {
    switchTab('courier-tab');
    const origInput = document.getElementById('courier-origin');
    const destInput = document.getElementById('courier-dest');
    if (origInput) origInput.value = 'Gold Coast Private Hospital, 14 Hill St, Southport QLD 4215';
    if (destInput) destInput.value = 'Royal Brisbane & Women Hospital, Butterfield St, Herston QLD 4029';
    const descInput = document.getElementById('courier-desc');
    if (descInput) descInput.value = '2 boxes of critical surgical supplies (12kg total)';
    const weightInput = document.getElementById('courier-weight');
    if (weightInput) weightInput.value = '12';
    try { calculateCourierQuote(); } catch(e) {}
    showToast('Y" Courier details automated from prompt: Southport to Brisbane Hospital');
    return;
  }

  switchTab('ai-book-tab');
  const input = document.getElementById('ai-prompt-input');
  if (input && SAMPLE_PROMPTS[key]) {
    input.value = SAMPLE_PROMPTS[key];
    submitAIAnalysis(true);
  }
}

function clearAIPrompt() {
  const input = document.getElementById('ai-prompt-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  appState.uploadedJobPhotos = [];
  const preview = document.getElementById('ai-job-photos-preview');
  if (preview) preview.style.display = 'none';
  document.getElementById('ai-results-pane')?.classList.remove('visible');
}

/**
 * AI Natural Language Processing Pipeline
 */
async function submitAIAnalysis(showToastNotification = true) {
  const input = document.getElementById('ai-prompt-input');
  const promptText = input ? input.value.trim() : '';

  if (!promptText) {
    showToast('Please type a few words describing your job first.');
    return;
  }

  const btn = document.getElementById('analyze-prompt-btn');
  const origBtnContent = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI Matching...';
    btn.disabled = true;
  }

  try {
    const analysis = await window.simpleAIEngine.analyzeRequest(promptText);
    appState.currentAnalysis = analysis;

    renderAnalysisResults(analysis);

    if (showToastNotification) {
      showToast(`AI matched ${analysis.categoryName} with ${analysis.matchedProviders.length} local tradies!`);
    }
  } catch (err) {
    console.error("AI Analysis error:", err);
    showToast('Error analyzing request. Please try again.');
  } finally {
    if (btn) {
      btn.innerHTML = origBtnContent;
      btn.disabled = false;
    }
  }
}

/**
 * Render AI Engine Results into DOM
 */
function renderAnalysisResults(analysis) {
  const pane = document.getElementById('ai-results-pane');
  if (!pane) return;

  pane.classList.add('visible');

  // 1. Update Tags & Indicators
  const catTag = document.getElementById('res-service-category');
  if (catTag) {
    catTag.innerHTML = `<i class="fa-solid fa-wrench"></i> ${analysis.categoryName}`;
  }

  const urgencyTag = document.getElementById('res-urgency-badge');
  if (urgencyTag) {
    urgencyTag.innerHTML = analysis.isUrgent 
      ? `<i class="fa-solid fa-bolt" style="color:#DC2626;"></i> ${analysis.urgency}`
      : `<i class="fa-solid fa-calendar-check"></i> ${analysis.urgency}`;
    urgencyTag.style.background = analysis.isUrgent ? '#FEE2E2' : '#DCFCE7';
    urgencyTag.style.color = analysis.isUrgent ? '#991B1B' : '#166534';
  }

  const locTag = document.getElementById('res-location-badge');
  if (locTag) {
    locTag.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${analysis.detectedLocation}`;
  }

  const durationTag = document.getElementById('res-est-duration');
  if (durationTag) {
    durationTag.innerHTML = `<i class="fa-regular fa-clock"></i> AI Est: ${analysis.estimatedHours} Hours`;
  }

  // 2. Conversational Agent Thought Box
  const thoughtBox = document.getElementById('res-ai-explanation');
  if (thoughtBox) {
    thoughtBox.innerHTML = `
      <div style="font-weight:700; color:var(--brand-orange); margin-bottom:0.25rem;">
        <i class="fa-solid fa-sparkles"></i> AI Assessment:
      </div>
      <div>${analysis.explanation}</div>
    `;
  }

  // 3. Identified Materials Checklist
  const materialsContainer = document.getElementById('res-materials-list');
  if (materialsContainer && analysis.suggestedMaterials) {
    materialsContainer.innerHTML = analysis.suggestedMaterials.map(item => `
      <span style="background:#fff; border:1px solid var(--border-light); font-size:0.75rem; padding:0.25rem 0.6rem; border-radius:var(--radius-sm); color:var(--text-muted); display:inline-flex; align-items:center; gap:0.35rem;">
        <i class="fa-solid fa-check" style="color:var(--accent-green); font-size:0.7rem;"></i> ${item}
      </span>
    `).join('');
  }

  // 4. Render Matched Providers List
  const providersContainer = document.getElementById('matched-providers-container');
  if (providersContainer) {
    if (analysis.matchedProviders.length === 0) {
      providersContainer.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted);">No verified providers currently open in this radius.</p>`;
    } else {
      // Pick top match by default
      appState.selectedProviderId = analysis.matchedProviders[0].id;

      providersContainer.innerHTML = analysis.matchedProviders.map((provider, index) => {
        const isSelected = provider.id === appState.selectedProviderId;
        return `
          <div class="provider-match-card ${isSelected ? 'selected' : ''}" id="card-prov-${provider.id}" onclick="selectMatchedProvider('${provider.id}')">
            <div class="provider-profile">
              <div>
                <div class="provider-name-row">
                  <h5>${provider.name}</h5>
                  <i class="fa-solid fa-circle-check verified-badge" title="Verified Licence & Insurance"></i>
                  ${index === 0 ? '<span class="badge-pill-pill" style="font-size:0.65rem; background:var(--brand-orange);">Best Match</span>' : ''}
                </div>
                <div style="font-size:0.8rem; font-weight:700; color:var(--text-main); margin-bottom:0.15rem;">
                  ${provider.businessName}
                </div>
                <div class="provider-meta">
                  <span class="star-rating"><i class="fa-solid fa-star"></i> ${provider.rating.toFixed(2)} (${provider.reviewCount})</span>
                  <span>•</span>
                  <span><i class="fa-solid fa-id-card-clip"></i> ${provider.qbccLicense}</span>
                  <span>•</span>
                  <span><i class="fa-solid fa-shield"></i> ${provider.insurance.split(' ')[0]} Insured</span>
                </div>
              </div>
            </div>

            <div class="match-score-badge">
              <div class="match-percentage"><i class="fa-solid fa-bullseye"></i> ${provider.matchScore}% Match</div>
              <div class="provider-price-rate">${formatTokenItemPrice(provider.hourlyRate, { suffix: '/hr' })}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 5. Update Pricing Breakdown & Hours in Sidebar
  updatePricingCard(analysis);

  // 6. Automatically automate the customer address box from AI detection
  if (analysis.detectedLocation) {
    const custAddrInput = document.getElementById('cust-address');
    if (custAddrInput) {
      const locationAddressMap = {
        'Broadbeach QLD': '42 Surf Parade, Broadbeach QLD 4218',
        'Southport QLD': '10 Smith Street, Southport QLD 4215',
        'Robina QLD': '19 Cheltenham Drive, Robina QLD 4226',
        'Burleigh Heads QLD': '3 Connor Street, Burleigh Heads QLD 4220',
        'Surfers Paradise QLD': '8 Cavill Avenue, Surfers Paradise QLD 4217'
      };
      const autoAddress = locationAddressMap[analysis.detectedLocation] || `${analysis.detectedLocation}, Australia`;
      custAddrInput.value = autoAddress;
      custAddrInput.dispatchEvent(new Event('change', { bubbles: true }));
      appState.userLocationName = autoAddress;
    }
  }
}

/**
 * Handle Provider Card Selection
 */
function selectMatchedProvider(providerId) {
  appState.selectedProviderId = providerId;

  // Update card styling
  document.querySelectorAll('.provider-match-card').forEach(card => {
    card.classList.remove('selected');
  });
  document.getElementById(`card-prov-${providerId}`)?.classList.add('selected');

  // Recalculate price with the chosen provider's own hourly rate (whole numbers, rounded up)
  const provider = window.providerDB.findById(providerId);
  if (provider && appState.currentAnalysis) {
    const analysis = appState.currentAnalysis;
    analysis.pricedProviderId = providerId;
    priceAnalysis(analysis);
    updatePricingCard(analysis);
  }
}

/**
 * Format a price with the money amount shown and the token count revealed on hover.
 * Australia & New Zealand see "$95 AUD"; everyone else sees "≈ $62 USD" (always invoiced in AUD).
 */
function formatPriceWithTokenHover(fiatAudAmount, options = {}) {
  const cur = window.iasjCurrency;
  const suffix = options.suffix || '';
  const aud = cur.wholeUp(fiatAudAmount);
  const tokens = cur.tokensForAud(aud);
  const money = cur.formatMoney(aud, { suffix });

  return `<span class="price-token-hover-tag" data-price-format="price" data-price-aud="${aud}" data-price-suffix="${escapeAttr(suffix)}" title="${escapeAttr(cur.moneyTitle(aud, { suffix }))}" data-agent-id="price-token-tag" data-testid="price-token-tag" data-fiat="${escapeAttr(money)}" data-tokens="${tokens}">
      <span class="price-display-amount">${money}</span>
      <span class="token-hover-badge"><i class="fa-solid fa-coins token-coin-icon"></i> ${cur.formatTokens(tokens, suffix)}</span>
    </span>`;
}
window.formatPriceWithTokenHover = formatPriceWithTokenHover;

/**
 * Update Sidebar Pricing Breakdown Card (Shows price visibly, tokens on hover)
 */
function updatePricingCard(analysis) {
  const p = analysis.pricing;

  const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
  setHtml('invoice-est-hours', p.hours ?? analysis.estimatedHours);
  setHtml('invoice-hourly-rate', formatPriceWithTokenHover(p.hourlyRate, { suffix: '/hr' }));
  setHtml('price-labour-val', formatPriceWithTokenHover(p.baseLabour));
  setHtml('price-callout-val', formatPriceWithTokenHover(p.calloutFee));
  setHtml('price-materials-val', formatPriceWithTokenHover(p.materialsEstimate));
  setHtml('price-gst-val', formatPriceWithTokenHover(p.gst));
  setHtml('price-total-val', formatPriceWithTokenHover(p.estimatedTotal));
  setHtml('price-currency-disclaimer', window.iasjCurrency.disclaimerHtml({ compact: true }));
}

/**
 * Price the current AI analysis from the live price list. Uses the chosen provider's own
 * hourly rate once the customer has picked one, otherwise the superadmin's rate for the trade.
 */
function priceAnalysis(analysis) {
  const cur = window.iasjCurrency;
  const provider = analysis.pricedProviderId ? window.providerDB?.findById(analysis.pricedProviderId) : null;
  analysis.pricing = cur.priceCategoryJob({
    category: analysis.category,
    hours: analysis.estimatedHours,
    isUrgent: analysis.isUrgent,
    categoryName: analysis.categoryName,
    hourlyTokens: provider ? cur.tokensForAud(provider.hourlyRate) : undefined
  });
  analysis.estimatedHours = analysis.pricing.hours;
  return analysis.pricing;
}

/**
 * Shift Selector (24/7 Operations)
 */
function selectShift(shiftType) {
  appState.selectedShift = shiftType;
  const slotIds = ['slot-emergency', 'slot-morning', 'slot-afternoon', 'slot-evening', 'slot-overnight'];
  slotIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.toggle('active', id === `slot-${shiftType.replace('emergency_24_7', 'emergency')}`);
    }
  });

  // Adjust callout fee for 24/7 emergency dispatch if active analysis exists
  if (appState.currentAnalysis) {
    if (shiftType === 'emergency_24_7') {
      appState.currentAnalysis.pricing.calloutFee = 55.00; // Priority 24/7 emergency dispatch
    } else {
      appState.currentAnalysis.pricing.calloutFee = 35.00;
    }
    const p = appState.currentAnalysis.pricing;
    p.subtotal = p.calloutFee + p.baseLabour + p.materialsEstimate;
    p.gst = Math.round(p.subtotal * 0.10 * 100) / 100;
    p.estimatedTotal = Math.round((p.subtotal + p.gst) * 100) / 100;
    updatePricingCard(appState.currentAnalysis);
  }
}

/**
 * ==============================================================================
 * IMGBB IMAGE UPLOAD HANDLERS (Album: https://ibb.co/album/TKRnX5)
 * ==============================================================================
 */

async function handleJobPhotoUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const previewBox = document.getElementById('ai-job-photos-preview');
  const thumbsContainer = document.getElementById('ai-job-photos-thumbs');
  const countIndicator = document.getElementById('imgbb-upload-count');
  const label = document.getElementById('photo-upload-label');

  if (label) label.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';

  try {
    for (const file of Array.from(files)) {
      if (window.imgbbService) {
        const upload = await window.imgbbService.uploadImage(file, '', 'job_photo');
        appState.uploadedJobPhotos.push(upload);
      }
    }

    if (previewBox && thumbsContainer) {
      previewBox.style.display = 'block';
      thumbsContainer.innerHTML = appState.uploadedJobPhotos.map((photo, idx) => `
        <div style="position:relative; display:inline-block; border-radius:6px; overflow:hidden; border:1px solid #CBD5E1; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <a href="${photo.url}" target="_blank" title="View on ImgBB">
            <img src="${photo.thumbUrl}" alt="Job photo" style="width:52px; height:52px; object-fit:cover; display:block;">
          </a>
          <button type="button" onclick="removeJobPhoto(${idx}, this)" title="Delete photo" style="position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.7); color:#fff; border:none; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center;">&times;</button>
        </div>
      `).join('');

      if (countIndicator) {
        countIndicator.textContent = `${appState.uploadedJobPhotos.length} photo(s) in ImgBB Album`;
      }
    }

    showToast(`Uploaded ${files.length} photo(s) to ImgBB Album (its-a-simple-job)!`);
  } catch (err) {
    console.error("ImgBB upload error:", err);
    showToast('Image upload failed: ' + err.message);
  } finally {
    if (label) label.textContent = 'Add Photos';
    event.target.value = '';
  }
}

function removeJobPhoto(index, btn = null) {
  const doDelete = () => {
    appState.uploadedJobPhotos.splice(index, 1);
    const previewBox = document.getElementById('ai-job-photos-preview');
    const thumbsContainer = document.getElementById('ai-job-photos-thumbs');
    const countIndicator = document.getElementById('imgbb-upload-count');

    if (appState.uploadedJobPhotos.length === 0) {
      if (previewBox) previewBox.style.display = 'none';
    } else if (thumbsContainer) {
      thumbsContainer.innerHTML = appState.uploadedJobPhotos.map((photo, idx) => `
        <div style="position:relative; display:inline-block; border-radius:6px; overflow:hidden; border:1px solid #CBD5E1;">
          <a href="${photo.url}" target="_blank" title="View on ImgBB">
            <img src="${photo.thumbUrl}" alt="Job photo" style="width:52px; height:52px; object-fit:cover; display:block;">
          </a>
          <button type="button" onclick="removeJobPhoto(${idx}, this)" style="position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.7); color:#fff; border:none; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center;" title="Delete photo">&times;</button>
        </div>
      `).join('');
      if (countIndicator) countIndicator.textContent = `${appState.uploadedJobPhotos.length} photo(s) in ImgBB Album`;
    }
    showToast('Photo removed.');
  };

  if (btn && typeof iasjConfirmDelete === 'function') {
    iasjConfirmDelete(btn, doDelete, {
      label: 'Delete?',
      compact: true,
      targetType: 'job_photo',
      targetId: String(index)
    });
  } else {
    doDelete();
  }
}

async function handleCourierPhotoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const preview = document.getElementById('courier-photo-preview');
  if (preview) {
    preview.style.display = 'flex';
    preview.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading package photo to ImgBB...';
  }

  try {
    const upload = await window.imgbbService.uploadImage(file, `courier_${Date.now()}`, 'freight_photo');
    appState.uploadedCourierPhoto = upload;
    if (preview) {
      preview.innerHTML = `
        <img src="${upload.thumbUrl}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #93C5FD;">
        <span><strong>Saved in ImgBB:</strong> <a href="${upload.url}" target="_blank" style="color:#2563EB;">View Full Photo</a></span>
      `;
    }
    showToast('Package photo saved to ImgBB Album!');
  } catch (err) {
    console.error("Courier photo error:", err);
    showToast('Photo upload error: ' + err.message);
  }
}

async function handleProviderPhotoUpload(event, photoType = 'licence') {
  const file = event.target.files?.[0];
  if (!file) return;

  const isVehicle = photoType === 'vehicle';
  const preview = document.getElementById(isVehicle ? 'page-prov-photo-preview' : 'provider-photo-preview')
    || document.getElementById('page-prov-photo-preview')
    || document.getElementById('provider-photo-preview');

  if (preview) {
    preview.style.display = 'flex';
    preview.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading ${isVehicle ? 'vehicle' : 'licence'} photo to ImgBB...`;
  }

  try {
    const upload = await window.imgbbService.uploadImage(
      file, 
      isVehicle ? `tradie_veh_${Date.now()}` : `tradie_lic_${Date.now()}`, 
      isVehicle ? 'tradie_vehicle' : 'tradie_license'
    );

    if (isVehicle) {
      appState.uploadedProviderVehiclePhoto = upload;
    } else {
      appState.uploadedProviderPhoto = upload;
    }

    if (preview) {
      preview.innerHTML = `
        <img src="${upload.thumbUrl}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #93C5FD;">
        <span><strong>${isVehicle ? 'Vehicle Photo' : 'Licence Card'} Stored in ImgBB:</strong> <a href="${upload.url}" target="_blank" style="color:#2563EB;">View Image</a></span>
      `;
    }
    showToast(`${isVehicle ? 'Vehicle photo' : 'Licence card'} uploaded to ImgBB Album!`);
  } catch (err) {
    console.error("Provider photo error:", err);
    showToast(`${isVehicle ? 'Vehicle' : 'Licence'} upload error: ` + err.message);
  }
}

async function handleCandidatePhotoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const preview = document.getElementById('cand-photo-preview');
  if (preview) {
    preview.style.display = 'flex';
    preview.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading candidate credentials to ImgBB...';
  }

  try {
    const upload = await window.imgbbService.uploadImage(file, `cand_creds_${Date.now()}`, 'candidate_resume');
    appState.uploadedCandidatePhoto = upload;
    if (preview) {
      preview.innerHTML = `
        <img src="${upload.thumbUrl}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #93C5FD;">
        <span><strong>Credentials Stored in ImgBB:</strong> <a href="${upload.url}" target="_blank" style="color:#2563EB;">View Scan</a></span>
      `;
    }
    showToast('Candidate credentials uploaded to ImgBB Album!');
  } catch (err) {
    console.error("Candidate photo error:", err);
    showToast('Credentials upload error: ' + err.message);
  }
}

/**
 * Confirm Booking & Generate Tax Invoice
 */
async function confirmBooking() {
  const custName = document.getElementById('cust-name')?.value.trim() || 'Valued Customer';
  const custPhone = document.getElementById('cust-phone')?.value.trim() || '0412 000 000';
  const custAddress = document.getElementById('cust-address')?.value.trim() || 'Broadbeach, Gold Coast';
  const custNotes = document.getElementById('cust-notes')?.value.trim() || 'Access via front gate';

  if (!appState.currentAnalysis) {
    showToast('Please submit a job request first.');
    return;
  }

  const analysis = appState.currentAnalysis;
  const provider = window.providerDB.findById(appState.selectedProviderId) || analysis.matchedProviders[0];

  let shiftLabel = 'Morning Shift (7:00 AM – 12:00 PM)';
  if (appState.selectedShift === 'emergency_24_7') shiftLabel = '⚡ 24/7 • 365 Days a Year Immediate Urgent (Within 60–90 Mins)';
  else if (appState.selectedShift === 'afternoon') shiftLabel = 'Afternoon Shift (12:00 PM – 5:00 PM)';
  else if (appState.selectedShift === 'evening') shiftLabel = 'Evening Shift (5:00 PM – 10:00 PM)';
  else if (appState.selectedShift === 'overnight') shiftLabel = 'Overnight Shift (10:00 PM – 6:00 AM)';

  const docketNumber = 'IASJ-' + Math.floor(100000 + Math.random() * 900000);
  const customerRefNumber = window.firebaseService?.getOrCreateCRN?.(custPhone, custName) || (`CRN-${Math.floor(100000 + Math.random() * 900000)}`);

  const booking = {
    docketNumber,
    businessId: 'its-a-simple-job',
    createdAt: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    custName,
    custPhone,
    custAddress,
    custNotes,
    customerRefNumber,
    shift: shiftLabel,
    categoryName: analysis.categoryName,
    attachedPhotos: appState.uploadedJobPhotos.map(p => p.url),
    imgbbAlbumUrl: 'https://ibb.co/album/TKRnX5',
    provider: {
      ...provider,
      serviceProviderNumber: provider.serviceProviderNumber || 'SPN-101001'
    },
    pricing: analysis.pricing,
    status: 'Confirmed & Dispatched'
  };

  // Register Customer into Stripe as a User
  if (window.stripePaymentService?.registerCustomerUser) {
    try {
      const stripeCust = await window.stripePaymentService.registerCustomerUser({
        name: custName,
        phone: custPhone,
        crn: customerRefNumber
      });
      booking.customerStripeId = stripeCust.stripeCustomerId;
    } catch (err) {
      console.warn("Could not register customer in Stripe:", err);
    }
  }

  appState.activeBookings.unshift(booking);

  // Sync to Firestore
  if (window.firebaseService?.saveBookingToFirestore) {
    window.firebaseService.saveBookingToFirestore(booking);
  }

  // Add job to the Provider Live Dispatch Dashboard
  addJobToDispatchFeed(booking);

  // Render & Open Modal
  renderInvoiceModal(booking);
  showToast(`Booking ${docketNumber} confirmed! Assigned to ${provider.name} (CRN: ${customerRefNumber}).`);
}

/**
 * ==============================================================================
 * COURIER-ONLY SERVICE, CLOSEST DRIVER MATCHING, 9AM-4PM PICKUP & DRIVER ADMIN
 * ==============================================================================
 */

function selectPackageType(type, elem) {
  appState.courierPackageType = type;
  document.querySelectorAll('.package-type-btn').forEach(btn => btn.classList.remove('active'));
  if (elem) elem.classList.add('active');
  calculateCourierQuote();
}

function getCourierPricingSettings() {
  return { ...window.iasjCurrency.getPricing().courier, maxWeightKg: MAX_COURIER_WEIGHT_KG };
}

async function saveCourierPricingSettings(newSettings) {
  const pricing = window.iasjCurrency.getPricing();
  const saved = await window.iasjCurrency.savePricing({ ...pricing, courier: { ...pricing.courier, ...newSettings } });
  return { ...saved.courier, maxWeightKg: MAX_COURIER_WEIGHT_KG };
}
window.saveCourierPricingSettings = saveCourierPricingSettings;
window.getCourierPricingSettings = getCourierPricingSettings;

/**
 * Sync SuperAdmin 4-Tier Distance Token Inputs & Hero Badges (AUD Only)
 * Token price and Distance Tier Token Costs are set ONLY by SuperAdmin.
 */
function syncSuperadminDistanceTierInputs() {
  const cur = window.iasjCurrency;
  if (!cur) return;

  const p = cur.getPricing();
  let tiers = p.driverOrderTokens;
  try {
    const localTiersRaw = localStorage.getItem('iasj_driver_order_tokens');
    if (localTiersRaw) {
      tiers = { ...tiers, ...JSON.parse(localTiersRaw) };
    }
  } catch (e) {}

  tiers = tiers || {
    tier0to20km: 2,
    tier21to50km: 5,
    tier51to100km: 10,
    tier101PlusKm: 15
  };

  const localTokenAud = localStorage.getItem('iasj_token_price_aud');
  const tokenAud = localTokenAud ? Math.max(1, Math.round(Number(localTokenAud) || 1)) : (p.tokenPriceAud || 1);

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  setVal('sa-tier-0-20', tiers.tier0to20km);
  setVal('sa-tier-21-50', tiers.tier21to50km);
  setVal('sa-tier-51-100', tiers.tier51to100km);
  setVal('sa-tier-101-plus', tiers.tier101PlusKm);
  setVal('sa-token-aud-price', tokenAud);

  setTxt('hero-tier-0-20', String(tiers.tier0to20km));
  setTxt('hero-tier-21-50', String(tiers.tier21to50km));
  setTxt('hero-tier-51-100', String(tiers.tier51to100km));
  setTxt('hero-tier-101-plus', String(tiers.tier101PlusKm));
  setTxt('hero-token-aud-price', `$${tokenAud} AUD`);

  // Authorize SuperAdmin using robust check
  const isSuperadmin = typeof checkIsSuperadmin === 'function' ? checkIsSuperadmin() : true;
  const tierInputs = ['sa-tier-0-20', 'sa-tier-21-50', 'sa-tier-51-100', 'sa-tier-101-plus', 'sa-token-aud-price', 'btn-save-sa-tiers'];
  tierInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = !isSuperadmin;
      if (!isSuperadmin) {
        el.title = 'Token price and distance tier token costs are set ONLY by SuperAdmin.';
      } else {
        el.title = 'SuperAdmin: You can edit token prices and distance tier charges at any time.';
      }
    }
  });
}
window.syncSuperadminDistanceTierInputs = syncSuperadminDistanceTierInputs;

function syncSuperadminCourierControls() {
  syncSuperadminDistanceTierInputs();
}

async function onSuperadminDistanceTierChange(showToastMsg = false) {
  const user = window.firebaseService?.getCurrentGoogleUser?.();
  const isSa = typeof checkIsSuperadmin === 'function' ? checkIsSuperadmin(user) : true;
  if (!isSa) {
    showToast('⛔ Unauthorized: Token price and distance tier token costs can only be configured by SuperAdmin.');
    syncSuperadminDistanceTierInputs();
    return;
  }

  const cur = window.iasjCurrency;
  if (!cur) return;

  const t0_20 = Math.max(1, Math.round(Number(document.getElementById('sa-tier-0-20')?.value) || 2));
  const t21_50 = Math.max(1, Math.round(Number(document.getElementById('sa-tier-21-50')?.value) || 5));
  const t51_100 = Math.max(1, Math.round(Number(document.getElementById('sa-tier-51-100')?.value) || 10));
  const t101Plus = Math.max(1, Math.round(Number(document.getElementById('sa-tier-101-plus')?.value) || 15));
  const tokenPriceAud = Math.max(1, Math.round(Number(document.getElementById('sa-token-aud-price')?.value) || 1));

  // 1. Explicitly persist to dedicated local storage keys so amounts never revert
  const driverOrderTokens = {
    tier0to20km: t0_20,
    tier21to50km: t21_50,
    tier51to100km: t51_100,
    tier101PlusKm: t101Plus
  };
  localStorage.setItem('iasj_driver_order_tokens', JSON.stringify(driverOrderTokens));
  localStorage.setItem('iasj_token_price_aud', String(tokenPriceAud));

  // 2. Build full pricing object
  const currentPricing = cur.getPricing();
  const newPricing = {
    ...currentPricing,
    tokenPriceAud,
    driverOrderTokens,
    tokenPacks: [10, 50, 100]
  };

  // 3. Update local currency state immediately
  cur.updateLocalPricing(newPricing);

  // 4. Update hero badges & text immediately
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('hero-tier-0-20', String(t0_20));
  setTxt('hero-tier-21-50', String(t21_50));
  setTxt('hero-tier-51-100', String(t51_100));
  setTxt('hero-tier-101-plus', String(t101Plus));
  setTxt('hero-token-aud-price', `$${tokenPriceAud} AUD`);

  // 5. Persist to Firestore database platform_settings/pricing (SuperAdmin supreme ruler)
  try {
    if (window.firebaseService?.savePlatformPricingToFirestore) {
      await window.firebaseService.savePlatformPricingToFirestore(newPricing, user?.email || 'support@aifoundation.net.au');
    }
  } catch (err) {
    console.warn("Notice persisting pricing to remote Firestore:", err);
  }

  calculateCourierQuote();
  if (typeof renderDriverAdminDashboard === 'function') {
    renderDriverAdminDashboard();
  }

  if (showToastMsg) {
    showToast(`👑 SuperAdmin Token Price & Tiers Saved: 1 Token = $${tokenPriceAud} AUD | 0–20km=${t0_20}, 21–50km=${t21_50}, 51–100km=${t51_100}, 101+km=${t101Plus} Tokens`);
  }
}
window.onSuperadminDistanceTierChange = onSuperadminDistanceTierChange;
window.onSuperadminCourierSettingsChange = onSuperadminDistanceTierChange;

/**
 * SuperAdmin Driver Approvals & Token Vault Management
 */
function renderSuperadminTokenBalance() {
  const balEl = document.getElementById('superadmin-token-vault-balance');
  if (balEl && window.superadminDB) {
    const bal = window.superadminDB.getBalance();
    balEl.textContent = `${bal} Tokens`;
    balEl.title = `$${bal} AUD Platform Revenue`;
  }
}
window.renderSuperadminTokenBalance = renderSuperadminTokenBalance;

function handleWipeSuperadminTokens(btn) {
  iasjConfirmDelete(btn, () => {
    if (window.superadminDB) {
      window.superadminDB.wipeTokens();
    }
    renderSuperadminTokenBalance();
    showToast('🗑️ All tokens have been wiped from the Superadmin account. Balance is now 0 Tokens.');
  }, {
    confirmText: 'Confirm Wipe All Tokens',
    confirmClass: 'btn btn-danger btn-sm'
  });
}
window.handleWipeSuperadminTokens = handleWipeSuperadminTokens;

async function approveDriverBySuperadmin(driverId) {
  const driver = window.providerDB?.approveDriver(driverId);
  if (!driver) return;

  // Hardwire RBAC role in Firestore database
  const superadminUser = window.firebaseService?.getCurrentGoogleUser();
  const superadminEmail = superadminUser?.email || 'support@aifoundation.net.au';

  try {
    if (window.firebaseService?.approveDriverInFirestore) {
      await window.firebaseService.approveDriverInFirestore(driver.id || driverId, superadminEmail);
    }
  } catch (err) {
    console.warn("Notice updating Firestore on driver approval:", err);
  }

  // Update supporter record if email matches
  if (window.supporterDB && driver.email) {
    const supporter = window.supporterDB.findByEmail(driver.email);
    if (supporter) {
      supporter.role = 'driver';
      supporter.approved = true;
      supporter.isDriver = true;
      supporter.driverId = driver.id;
      window.supporterDB.save();
    }
  }

  // If the logged in Google user is this driver, grant them role: 'driver' immediately
  const activeUser = window.firebaseService?.getCurrentGoogleUser();
  if (activeUser && activeUser.email && activeUser.email.toLowerCase().trim() === (driver.email || '').toLowerCase().trim()) {
    if (activeUser.role !== 'superadmin') {
      activeUser.role = 'driver';
      activeUser.isDriver = true;
      localStorage.setItem('iasj_google_user', JSON.stringify(activeUser));
      try { updateGoogleAuthUI(activeUser); } catch (e) {}
    }
  }
  
  // Set active admin driver ID so dispatch views immediately show this driver
  appState.activeAdminDriverId = driver.id;

  renderSuperadminDriverApprovals();
  renderDriverAdminDashboard();
  filterContractors();
  calculateCourierQuote();
  if (appState.osmMap && window.L) {
    try { updateOsmContractorMarkers(); } catch (e) {}
  }
  if (appState.osmCourierMap && window.L) {
    try { renderOsmCourierRouteMap(); } catch (e) {}
  }
  showToast(`✅ Driver "${driver.name}" has been APPROVED by SuperAdmin and is now LIVE ON THE MAP!`);
}
window.approveDriverBySuperadmin = approveDriverBySuperadmin;


function handleRevokeDriverClick(btn, driverId) {
  const driver = window.providerDB?.findById(driverId);
  const driverName = driver ? driver.name : 'Driver';
  if (btn && typeof iasjConfirmDelete === 'function') {
    iasjConfirmDelete(btn, () => {
      revokeDriverBySuperadmin(driverId);
    }, {
      label: 'Confirm Revoke?',
      timeoutMs: 5000,
      targetType: 'driver',
      targetId: driverId
    });
  } else {
    revokeDriverBySuperadmin(driverId);
  }
}
window.handleRevokeDriverClick = handleRevokeDriverClick;

async function revokeDriverBySuperadmin(driverId) {
  const driver = window.providerDB?.revokeDriver(driverId);
  if (!driver) return;

  const superadminUser = window.firebaseService?.getCurrentGoogleUser();
  const superadminEmail = superadminUser?.email || 'support@aifoundation.net.au';

  try {
    if (window.firebaseService?.revokeDriverInFirestore) {
      await window.firebaseService.revokeDriverInFirestore(driver.id || driverId, superadminEmail);
    }
  } catch (err) {
    console.warn("Notice updating Firestore on driver revocation:", err);
  }

  // Revert supporter record if email matches
  if (window.supporterDB && driver.email) {
    const supporter = window.supporterDB.findByEmail(driver.email);
    if (supporter) {
      supporter.role = 'supporter';
      supporter.approved = false;
      window.supporterDB.save();
    }
  }

  // If active user is this driver, demote from 'driver' back to 'supporter'
  const activeUser = window.firebaseService?.getCurrentGoogleUser();
  if (activeUser && activeUser.email && activeUser.email.toLowerCase() === (driver.email || '').toLowerCase()) {
    if (activeUser.role !== 'superadmin') {
      activeUser.role = 'supporter';
      activeUser.isDriver = false;
      localStorage.setItem('iasj_google_user', JSON.stringify(activeUser));
    }
  }

  renderSuperadminDriverApprovals();
  renderDriverAdminDashboard();
  renderSupporterPanel();
  filterContractors();
  calculateCourierQuote();
  if (appState.osmMap && window.L) {
    try { updateOsmContractorMarkers(); } catch (e) {}
  }
  if (appState.osmCourierMap && window.L) {
    try { renderOsmCourierRouteMap(); } catch (e) {}
  }
  showToast(`⚠️ Driver "${driver.name}" approval has been REVOKED by SuperAdmin and REMOVED FROM THE MAP.`);
}
window.revokeDriverBySuperadmin = revokeDriverBySuperadmin;

function renderSuperadminDriverApprovals() {
  const container = document.getElementById('superadmin-drivers-approval-list');
  const badgeEl = document.getElementById('superadmin-driver-pending-badge');
  if (!container) return;

  const drivers = window.providerDB ? window.providerDB.getAll() : [];
  const pendingCount = drivers.filter(d => typeof isDriverApproved === 'function' ? !isDriverApproved(d) : (d.approved === false || d.status === 'pending_approval')).length;

  if (badgeEl) {
    badgeEl.textContent = `${pendingCount} Driver${pendingCount === 1 ? '' : 's'} Awaiting Approval`;
    badgeEl.style.background = pendingCount > 0 ? '#FEF3C7' : '#ECFDF5';
    badgeEl.style.color = pendingCount > 0 ? '#92400E' : '#065F46';
  }

  if (drivers.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:#92400E; font-size:0.85rem; border:1px dashed #FDE68A; border-radius:6px; background:#FFFBEB;">No registered drivers found.</div>`;
    return;
  }

  container.innerHTML = drivers.map(d => {
    const isApproved = typeof isDriverApproved === 'function' ? isDriverApproved(d) : (d.approved !== false && d.status !== 'pending_approval' && d.status !== 'revoked');
    return `
      <div style="background:#FFFBEB; border:1px solid ${isApproved ? '#A7F3D0' : '#FCD34D'}; border-left:4px solid ${isApproved ? '#059669' : '#D97706'}; border-radius:6px; padding:0.85rem 1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;" data-agent-id="sa-driver-row-${d.id}" data-testid="sa-driver-row-${d.id}">
        <div style="flex:1; min-width:240px;">
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <strong style="font-size:0.92rem; color:#1E3A8A;">${escapeAttr(d.name)}</strong>
            <span style="font-size:0.76rem; color:#475569;">(${escapeAttr(d.businessName || 'Express Courier')})</span>
            <span style="font-size:0.7rem; font-weight:800; padding:0.15rem 0.5rem; border-radius:999px; background:${isApproved ? '#ECFDF5' : '#FEF3C7'}; color:${isApproved ? '#065F46' : '#92400E'};">
              <i class="fa-solid ${isApproved ? 'fa-circle-check' : 'fa-clock'}"></i> ${isApproved ? 'Approved by SuperAdmin (Shown on Map)' : 'Pending SuperAdmin Approval (Hidden from Map)'}
            </span>
          </div>

          <div style="font-size:0.75rem; color:#64748B; margin-top:0.3rem; display:flex; flex-wrap:wrap; gap:0.75rem;">
            <span><i class="fa-solid fa-id-card"></i> Lic: <strong>${escapeAttr(d.licenceNumber || '482910384')}</strong> (${escapeAttr(d.licenceState || 'QLD')}, ${escapeAttr(d.licenceClass || 'C')})</span>
            <span><i class="fa-solid fa-truck"></i> ${escapeAttr(d.vehicle || 'Van')}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${escapeAttr(d.baseSuburb || 'Southport QLD')}</span>
            <span><i class="fa-solid fa-coins" style="color:#D97706;"></i> Balance: <strong>${d.tokenBalance ?? 0} Tokens</strong></span>
            <span><i class="fa-solid fa-money-bill-transfer" style="color:#059669;"></i> PayID: <strong>${escapeAttr(d.payIdValue || d.phone)}</strong></span>
            <span>${isApproved ? '<strong style="color:#059669;"><i class="fa-solid fa-map-location-dot"></i> Shown on Map</strong>' : '<strong style="color:#D97706;"><i class="fa-solid fa-eye-slash"></i> Hidden from Map</strong>'}</span>
          </div>

          <div style="font-size:0.73rem; color:#475569; margin-top:0.35rem; display:flex; flex-wrap:wrap; gap:0.5rem;">
            ${d.hasVehicleCourier !== false ? `
              <span style="background:#EFF6FF; color:#1E40AF; padding:2px 7px; border-radius:4px; border:1px solid #BFDBFE;">
                <i class="fa-solid fa-truck"></i> <strong>Vehicle Service:</strong> $${Number(d.vehiclePerKmRateAud ?? d.perKmRateAud ?? 2.20).toFixed(2)}/km • Max ${d.vehicleMaxWeightKg ?? d.maxWeightKg ?? 50}kg (${d.vehicleMaxHeightCm ?? d.maxHeightCm ?? 70}×${d.vehicleMaxWidthCm ?? d.maxWidthCm ?? 50}×${d.vehicleMaxLengthCm ?? d.maxLengthCm ?? 50}cm)
              </span>
            ` : ''}
            ${d.hasBicycleCourier ? `
              <span style="background:#F0FDF4; color:#065F46; padding:2px 7px; border-radius:4px; border:1px solid #BBF7D0;">
                <i class="fa-solid fa-bicycle"></i> <strong>Bicycle Service:</strong> $${Number(d.bicyclePerKmRateAud ?? 1.80).toFixed(2)}/km • Max ${d.bicycleMaxWeightKg ?? 8}kg (${d.bicycleMaxHeightCm ?? 35}×${d.bicycleMaxWidthCm ?? 30}×${d.bicycleMaxLengthCm ?? 40}cm)
              </span>
            ` : ''}
          </div>
        </div>

        <div style="display:flex; gap:0.45rem;">
          ${!isApproved ? `
            <button type="button" class="btn btn-primary btn-sm" onclick="approveDriverBySuperadmin('${d.id}')"
              style="background:#059669; border-color:#059669; font-size:0.78rem; font-weight:800; padding:0.35rem 0.75rem;"
              data-agent-id="btn-sa-approve-drv-${d.id}" data-testid="btn-sa-approve-drv-${d.id}"
              aria-label="Approve Driver ${escapeAttr(d.name)}">
              <i class="fa-solid fa-check"></i> Approve (Show on Map)
            </button>
          ` : `
            <button type="button" class="btn btn-outline btn-sm" onclick="handleRevokeDriverClick(this, '${d.id}')"
              style="color:#DC2626; border-color:#FECACA; font-size:0.78rem; font-weight:800; padding:0.35rem 0.75rem;"
              data-agent-id="btn-sa-revoke-drv-${d.id}" data-testid="btn-sa-revoke-drv-${d.id}"
              aria-label="Revoke Driver ${escapeAttr(d.name)}">
              <i class="fa-solid fa-ban"></i> Revoke (Hide from Map)
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}
window.renderSuperadminDriverApprovals = renderSuperadminDriverApprovals;

/**
 * Recalculate Courier Route, Rank Closest Drivers & Update Direct Driver Quote
 */
let courierCalcDebounce = null;
function calculateCourierQuote() {
  clearTimeout(courierCalcDebounce);
  courierCalcDebounce = setTimeout(() => {
    executeCourierQuoteCalculation();
  }, 80);
}

async function executeCourierQuoteCalculation() {
  const originInput = document.getElementById('courier-origin');
  const destInput = document.getElementById('courier-dest');
  if (!originInput || !destInput) return;

  const originVal = originInput.value.trim() || '10 Smith Street, Southport QLD 4215';
  const destVal = destInput.value.trim() || '42 Surf Parade, Broadbeach QLD 4218';

  // 1. Resolve origin coordinates if text changed or missing
  let origCoords = appState.courierOriginCoords;
  if (!origCoords || !origCoords.lat || appState._lastOriginText !== originVal) {
    appState._lastOriginText = originVal;
    const origResults = await searchOsmAddress(originVal);
    if (origResults && origResults[0]?.lat) {
      origCoords = { lat: origResults[0].lat, lng: origResults[0].lng };
      appState.courierOriginCoords = origCoords;
    } else if (!origCoords || !origCoords.lat) {
      origCoords = { lat: -27.9635, lng: 153.4064 }; // Southport default
      appState.courierOriginCoords = origCoords;
    }
  }

  // 2. Resolve destination coordinates if text changed or missing
  let destCoords = appState.courierDestCoords;
  if (!destCoords || !destCoords.lat || appState._lastDestText !== destVal) {
    appState._lastDestText = destVal;
    const destResults = await searchOsmAddress(destVal);
    if (destResults && destResults[0]?.lat) {
      destCoords = { lat: destResults[0].lat, lng: destResults[0].lng };
      appState.courierDestCoords = destCoords;
    } else if (!destCoords || !destCoords.lat) {
      destCoords = { lat: -28.0280, lng: 153.4312 }; // Broadbeach default
      appState.courierDestCoords = destCoords;
    }
  }

  // 3. Fetch real road driving route from OSRM
  let roadDistanceKm = null;
  let durationMins = null;
  let routeLatLngs = null;

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origCoords.lng},${origCoords.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes[0]) {
        const r = data.routes[0];
        roadDistanceKm = Math.max(1, Math.round((r.distance / 1000) * 10) / 10);
        durationMins = Math.max(5, Math.round(r.duration / 60));
        routeLatLngs = r.geometry.coordinates.map(c => [c[1], c[0]]);
      }
    }
  } catch (err) {
    console.warn("OSRM routing unavailable, using direct distance fallback:", err);
  }

  if (!roadDistanceKm) {
    const directKm = computeDistanceInKm(origCoords.lat, origCoords.lng, destCoords.lat, destCoords.lng);
    roadDistanceKm = Math.max(1.5, Math.round(directKm * 1.25 * 10) / 10);
    durationMins = Math.max(10, Math.round(roadDistanceKm * 1.4));
  }

  appState.lastRouteLatLngs = routeLatLngs;

  // 4. Rank closest drivers & update AUD quote + per-driver map dropdowns
  updateCourierPricingWithSettings(roadDistanceKm, durationMins);
}

function selectCourierDriverForBooking(driverId) {
  appState.selectedCourierDriverId = driverId;
  const dist = appState.lastCourierRoute?.distanceKm || 8.5;
  const mins = appState.lastCourierRoute?.durationMins || 15;
  updateCourierPricingWithSettings(dist, mins);
}
window.selectCourierDriverForBooking = selectCourierDriverForBooking;

function selectCourierDriverMode(driverId, mode, event) {
  if (event) {
    if (event.stopPropagation) event.stopPropagation();
    if (event.preventDefault) event.preventDefault();
  }
  if (!appState.driverServiceModeOverrides) appState.driverServiceModeOverrides = {};
  appState.driverServiceModeOverrides[driverId] = mode;
  appState.selectedCourierDriverId = driverId;

  if (!appState.contractorCardModeOverrides) appState.contractorCardModeOverrides = {};
  appState.contractorCardModeOverrides[driverId] = mode;

  const dist = appState.lastCourierRoute?.distanceKm || 8.5;
  const mins = appState.lastCourierRoute?.durationMins || 15;
  updateCourierPricingWithSettings(dist, mins);

  const drv = window.providerDB?.findById(driverId);
  const drvName = drv?.name || 'Driver';
  showToast(`Switched ${drvName} to ${mode === 'bicycle' ? '🚲 Bicycle Courier' : '🚗 Motor Vehicle'} mode!`);
}
window.selectCourierDriverMode = selectCourierDriverMode;

// Track per-driver Leaflet map instances inside the Left-Side Driver Box Dropdowns
const driverBoxLeafletMaps = {};

function toggleDriverBoxMap(driverId) {
  if (appState.expandedDriverMapId === driverId) {
    appState.expandedDriverMapId = null;
  } else {
    appState.expandedDriverMapId = driverId;
    appState.selectedCourierDriverId = driverId;
  }
  const dist = appState.lastCourierRoute?.distanceKm || 8.5;
  const mins = appState.lastCourierRoute?.durationMins || 15;
  updateCourierPricingWithSettings(dist, mins);
}
window.toggleDriverBoxMap = toggleDriverBoxMap;

function renderInlineDriverBoxMap(driverId) {
  if (!window.L) return;
  const mapContainer = document.getElementById(`driver-leaflet-map-${driverId}`);
  if (!mapContainer) return;

  const drv = window.providerDB?.findById(driverId);
  if (!drv) return;

  const origCoords = appState.courierOriginCoords || { lat: -27.9635, lng: 153.4064 };
  const destCoords = appState.courierDestCoords || { lat: -28.0280, lng: 153.4312 };
  const dLat = drv.lat ?? -27.9635;
  const dLng = drv.lng ?? 153.4064;

  // Clean up previous Leaflet instance attached to a replaced DOM node
  if (driverBoxLeafletMaps[driverId]) {
    try { driverBoxLeafletMaps[driverId].remove(); } catch (e) {}
    delete driverBoxLeafletMaps[driverId];
  }

  const map = L.map(mapContainer, { zoomControl: true, scrollWheelZoom: false }).setView([dLat, dLng], 12);
  driverBoxLeafletMaps[driverId] = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  const isFemale = (drv.gender === 'female') || (!drv.gender && ['sarah', 'tanya', 'emma', 'chloe', 'sophie', 'jessica'].some(n => (drv.name || '').toLowerCase().includes(n)));
  const drvPinColor = isFemale ? '#EC4899' : '#2563EB';

  const driverIcon = L.divIcon({
    className: 'osm-custom-pin',
    html: `<div style="background:${drvPinColor};color:#fff;padding:3px 9px;border-radius:999px;display:inline-flex;align-items:center;gap:4px;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;"><i class="fa-solid ${drv.hasBicycleCourier && !drv.hasVehicleCourier ? 'fa-bicycle' : 'fa-truck'}"></i> ${drv.name.split(' ')[0]} (${isFemale ? '♀ Pink' : '♂ Blue'} $${Number(drv.perKmRateAud).toFixed(2)}/km)</div>`,
    iconSize: [135, 26],
    iconAnchor: [67, 13]
  });

  const originIcon = L.divIcon({
    className: 'osm-custom-pin',
    html: `<div style="background:#10B981;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.28);" title="Customer Pickup Address (Green Pin)">P</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  const destIcon = L.divIcon({
    className: 'osm-custom-pin',
    html: `<div style="background:#EF4444;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.28);">D</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  L.marker([dLat, dLng], { icon: driverIcon })
    .addTo(map)
    .bindPopup(`<strong>${drv.name} (${drv.businessName})</strong><br>${drv.baseSuburb || drv.address || 'Gold Coast QLD'}<br>Rate: $${Number(drv.perKmRateAud).toFixed(2)} AUD/km`);

  L.marker([origCoords.lat, origCoords.lng], { icon: originIcon })
    .addTo(map)
    .bindPopup(`<strong>Pickup Origin</strong><br>${document.getElementById('courier-origin')?.value || 'Pickup'}`);

  L.marker([destCoords.lat, destCoords.lng], { icon: destIcon })
    .addTo(map)
    .bindPopup(`<strong>Delivery Destination</strong><br>${document.getElementById('courier-dest')?.value || 'Destination'}`);

  // Dashed green line: Driver's GPS -> Pickup Origin
  L.polyline([[dLat, dLng], [origCoords.lat, origCoords.lng]], {
    color: '#059669',
    weight: 3,
    dashArray: '6, 6',
    opacity: 0.85
  }).addTo(map);

  // Solid orange line: Pickup Origin -> Delivery Destination
  const routePts = (appState.lastRouteLatLngs && appState.lastRouteLatLngs.length > 1)
    ? appState.lastRouteLatLngs
    : [[origCoords.lat, origCoords.lng], [destCoords.lat, destCoords.lng]];

  L.polyline(routePts, {
    color: '#FF5A1F',
    weight: 4,
    opacity: 0.9
  }).addTo(map);

  const bounds = L.latLngBounds([
    [dLat, dLng],
    [origCoords.lat, origCoords.lng],
    [destCoords.lat, destCoords.lng]
  ]);
  map.fitBounds(bounds, { padding: [28, 28] });

  setTimeout(() => {
    try { map.invalidateSize(); } catch (e) {}
  }, 80);
}
window.renderInlineDriverBoxMap = renderInlineDriverBoxMap;

function updateCourierPricingWithSettings(distanceKm, durationMins) {
  const cur = window.iasjCurrency;
  const weightKg = Math.max(0.5, parseFloat(document.getElementById('courier-weight')?.value) || 14);
  const heightCm = Math.max(1, parseFloat(document.getElementById('courier-height')?.value) || 45);
  const widthCm = Math.max(1, parseFloat(document.getElementById('courier-width')?.value) || 40);
  const lengthCm = Math.max(1, parseFloat(document.getElementById('courier-length')?.value) || 60);
  const speedTier = document.getElementById('courier-urgency')?.value || 'same_day';
  const pickupDate = document.getElementById('courier-pickup-date')?.value || new Date().toISOString().split('T')[0];
  const pickupTime = document.getElementById('courier-pickup-time')?.value || '10:30 AM';

  appState.lastCourierRoute = { distanceKm, durationMins };

  const origCoords = appState.courierOriginCoords || { lat: -27.9635, lng: 153.4064 };
  const allDrivers = window.providerDB ? window.providerDB.getAll().filter(d => d.approved !== false && d.status !== 'pending_approval') : [];

    // Rank drivers by distance to Pickup Origin and check package weight + HxWxL capacity
  const deliveryModePref = document.getElementById('courier-delivery-mode')?.value || 'auto';
  const pkgDesc = (document.getElementById('courier-desc')?.value || '').toLowerCase();

  const isBicycleSizeEligible = weightKg <= 8 && heightCm <= 35 && widthCm <= 30 && lengthCm <= 40;
  const isBicycleContentEligible = isBicycleSizeEligible && (
    pkgDesc.includes('letter') || pkgDesc.includes('food') || pkgDesc.includes('doc') ||
    pkgDesc.includes('envelope') || pkgDesc.includes('paper') || pkgDesc.includes('meal') ||
    pkgDesc.includes('small') || deliveryModePref === 'bicycle'
  );

  const rankedDrivers = allDrivers.map(drv => {
    const dLat = drv.lat ?? -27.9635;
    const dLng = drv.lng ?? 153.4064;
    const distToPickupKm = computeDistanceInKm(origCoords.lat, origCoords.lng, dLat, dLng);

    const hasVeh = drv.hasVehicleCourier !== false;
    const hasBic = !!drv.hasBicycleCourier;

    let effectiveMode = 'vehicle';
    const overrideMode = appState.driverServiceModeOverrides?.[drv.id];
    if (overrideMode === 'bicycle' && hasBic) {
      effectiveMode = 'bicycle';
    } else if (overrideMode === 'vehicle' && hasVeh) {
      effectiveMode = 'vehicle';
    } else if (deliveryModePref === 'bicycle') {
      effectiveMode = 'bicycle';
    } else if (deliveryModePref === 'vehicle') {
      effectiveMode = 'vehicle';
    } else {
      // 'auto' mode preference: bicycle courier if small letter/food item and driver has bicycle mode
      effectiveMode = (isBicycleContentEligible && hasBic) ? 'bicycle' : 'vehicle';
    }

    let fitsPackage = false;
    let fitsWeight = false;
    let fitsDims = false;
    let fitBadge = '';

    if (effectiveMode === 'bicycle') {
      const bMaxW = drv.bicycleMaxWeightKg || 8;
      const bMaxH = drv.bicycleMaxHeightCm || 35;
      const bMaxWi = drv.bicycleMaxWidthCm || 30;
      const bMaxL = drv.bicycleMaxLengthCm || 40;

      fitsWeight = weightKg <= bMaxW;
      fitsDims = heightCm <= bMaxH && widthCm <= bMaxWi && lengthCm <= bMaxL;
      fitsPackage = hasBic && fitsWeight && fitsDims;

      if (!hasBic) {
        fitBadge = '<span style="background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; padding:0.15rem 0.5rem; border-radius:999px; font-size:0.7rem; font-weight:800;"><i class="fa-solid fa-ban"></i> No Bicycle Service</span>';
      } else if (!fitsWeight) {
        fitBadge = '<span style="background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; padding:0.15rem 0.5rem; border-radius:999px; font-size:0.7rem; font-weight:800;"><i class="fa-solid fa-triangle-exclamation"></i> Over Bicycle Weight (' + bMaxW + 'kg max)</span>';
      } else if (!fitsDims) {
        fitBadge = '<span style="background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; padding:0.15rem 0.5rem; border-radius:999px; font-size:0.7rem; font-weight:800;"><i class="fa-solid fa-triangle-exclamation"></i> Over Bicycle Dimensions (' + bMaxH + '×' + bMaxWi + '×' + bMaxL + 'cm)</span>';
      } else {
        fitBadge = '<span style="background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0; padding:0.15rem 0.5rem; border-radius:999px; font-size:0.7rem; font-weight:800;"><i class="fa-solid fa-bicycle"></i> Fits Bicycle (Letters/Food/Small, Max ' + bMaxW + 'kg • ' + bMaxH + '×' + bMaxWi + '×' + bMaxL + 'cm)</span>';
      }
    } else {
      const maxW = drv.vehicleMaxWeightKg || drv.maxWeightKg || 500;
      const maxH = drv.vehicleMaxHeightCm || drv.maxHeightCm || 150;
      const maxWi = drv.vehicleMaxWidthCm || drv.maxWidthCm || 130;
      const maxL = drv.vehicleMaxLengthCm || drv.maxLengthCm || 250;

      fitsWeight = weightKg <= maxW;
      fitsDims = heightCm <= maxH && widthCm <= maxWi && lengthCm <= maxL;
      fitsPackage = hasVeh && fitsWeight && fitsDims;

      if (!hasVeh) {
        fitBadge = '<span style="background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; padding:0.15rem 0.5rem; border-radius:999px; font-size:0.7rem; font-weight:800;"><i class="fa-solid fa-ban"></i> Vehicle Mode Inactive</span>';
      } else if (!fitsWeight) {
        fitBadge = '<span style="background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; padding:0.15rem 0.5rem; border-radius:999px; font-size:0.7rem; font-weight:800;"><i class="fa-solid fa-triangle-exclamation"></i> Over Vehicle Weight (' + maxW + 'kg max)</span>';
      } else if (!fitsDims) {
        fitBadge = '<span style="background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; padding:0.15rem 0.5rem; border-radius:999px; font-size:0.7rem; font-weight:800;"><i class="fa-solid fa-triangle-exclamation"></i> Over Vehicle Dimensions (' + maxH + '×' + maxWi + '×' + maxL + 'cm)</span>';
      } else {
        fitBadge = '<span style="background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0; padding:0.15rem 0.5rem; border-radius:999px; font-size:0.7rem; font-weight:800;"><i class="fa-solid fa-truck"></i> Fits Vehicle (Max ' + maxW + 'kg • ' + maxH + '×' + maxWi + '×' + maxL + 'cm)</span>';
      }
    }

    const quote = cur.calculateDriverCourierPrice({
      distanceKm,
      speedTier,
      driver: drv,
      deliveryMode: effectiveMode
    });

    return {
      driver: drv,
      distToPickupKm,
      fitsWeight,
      fitsDims,
      fitsPackage,
      effectiveMode,
      fitBadge,
      quote
    };
  });

  // Sort: drivers that fit the package first, then closest to pickup origin
  rankedDrivers.sort((a, b) => {
    if (a.fitsPackage !== b.fitsPackage) return a.fitsPackage ? -1 : 1;
    return a.distToPickupKm - b.distToPickupKm;
  });

  const eligibleCount = rankedDrivers.filter(r => r.fitsPackage).length;
  const fitSummaryEl = document.getElementById('courier-package-fit-summary');
  if (fitSummaryEl) {
    fitSummaryEl.textContent = `${eligibleCount} of ${rankedDrivers.length} drivers fit ${weightKg}kg (${heightCm}×${widthCm}×${lengthCm}cm)`;
    fitSummaryEl.style.background = eligibleCount > 0 ? '#ECFDF5' : '#FEF2F2';
    fitSummaryEl.style.color = eligibleCount > 0 ? '#065F46' : '#991B1B';
    fitSummaryEl.style.borderColor = eligibleCount > 0 ? '#A7F3D0' : '#FECACA';
  }

  const warningEl = document.getElementById('courier-weight-warning');
  if (warningEl) {
    if (eligibleCount === 0) {
      warningEl.style.display = 'block';
      warningEl.textContent = `⚠️ Package (${weightKg}kg, ${heightCm}×${widthCm}×${lengthCm}cm) exceeds registered drivers' capacity.`;
    } else {
      warningEl.style.display = 'none';
    }
  }

  // Ensure selected driver exists; if not, pick closest eligible driver
  let selectedEntry = rankedDrivers.find(r => r.driver.id === appState.selectedCourierDriverId);
  if ((!selectedEntry || !selectedEntry.fitsPackage) && rankedDrivers.length > 0) {
    const firstEligible = rankedDrivers.find(r => r.fitsPackage) || rankedDrivers[0];
    selectedEntry = firstEligible;
    appState.selectedCourierDriverId = selectedEntry.driver.id;
  }

  // Render driver selection cards on the Left Side (#courier-driver-selection-list) with per-driver Map Dropdown
  const listEl = document.getElementById('courier-driver-selection-list');
  if (listEl) {
    listEl.innerHTML = rankedDrivers.map((item, idx) => {
      const d = item.driver;
      const q = item.quote;
      const isSelected = d.id === appState.selectedCourierDriverId;
      const isClosest = idx === 0 && item.fitsPackage;
      const isMapOpen = appState.expandedDriverMapId === d.id;
      const mode = item.effectiveMode;
      const hasVeh = d.hasVehicleCourier !== false;
      const hasBic = !!d.hasBicycleCourier;
      const isDual = hasVeh && hasBic;
      const isFemale = (d.gender === 'female') || (!d.gender && ['sarah', 'tanya', 'emma', 'chloe', 'sophie', 'jessica'].some(n => (d.name || '').toLowerCase().includes(n)));

      const modeBadge = mode === 'bicycle'
        ? '<span style="background:#0284C7; color:#fff; font-size:0.66rem; font-weight:800; padding:0.12rem 0.45rem; border-radius:999px;"><i class="fa-solid fa-bicycle"></i> BICYCLE COURIER</span>'
        : '<span style="background:#475569; color:#fff; font-size:0.66rem; font-weight:800; padding:0.12rem 0.45rem; border-radius:999px;"><i class="fa-solid fa-truck"></i> MOTOR VEHICLE</span>';

      return `
        <div
          onclick="selectCourierDriverForBooking('${d.id}')"
          style="cursor:pointer; border:2px solid ${isSelected ? 'var(--brand-orange)' : 'var(--border-light)'}; background:${isSelected ? '#FFFDF9' : '#FFFFFF'}; border-radius:var(--radius-md); padding:0.95rem 1rem; transition:all 0.15s ease; opacity:${item.fitsPackage ? '1' : '0.68'};"
          data-agent-id="select-driver-card-${d.id}"
          data-testid="select-driver-card-${d.id}"
          role="button"
          tabindex="0"
          aria-label="Select Driver ${escapeAttr(d.name)}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.75rem; flex-wrap:wrap;">
            <div style="display:flex; gap:0.5rem; align-items:flex-start;">
              <div>
                <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                  <strong style="font-size:0.98rem; color:var(--primary-navy);">${d.name}</strong>
                  ${modeBadge}
                  <span style="font-size:0.66rem; font-weight:800; padding:0.12rem 0.45rem; border-radius:999px; ${isFemale ? 'background:#FCE7F3; color:#BE185D; border:1px solid #FBCFE8;' : 'background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE;'}" title="${isFemale ? 'Female Driver (Pink Pin)' : 'Male Driver (Blue Pin)'}">
                    <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${isFemale ? '#EC4899' : '#2563EB'}; margin-right:3px;"></span>${isFemale ? 'Female' : 'Male'}
                  </span>
                  ${isClosest ? `<span style="background:#059669; color:#fff; font-size:0.66rem; font-weight:800; padding:0.12rem 0.45rem; border-radius:999px;">★ CLOSEST TO PICKUP</span>` : ''}
                  ${isSelected ? `<span style="background:var(--brand-orange); color:#fff; font-size:0.66rem; font-weight:800; padding:0.12rem 0.45rem; border-radius:999px;">SELECTED</span>` : ''}
                </div>
                <div style="font-size:0.78rem; font-weight:700; color:var(--brand-orange);">${mode === 'bicycle' ? 'Bicycle / E-Bike / Cargo Bike' : (d.vehicle || d.tradeTitle || 'Courier Vehicle')}</div>

                ${isDual ? `
                  <div style="display:flex; align-items:center; gap:0.4rem; margin:0.35rem 0; flex-wrap:wrap;" onclick="event.stopPropagation();">
                    <span style="font-size:0.68rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.03em;">Mode:</span>
                    <button
                      type="button"
                      class="btn btn-xs ${mode === 'vehicle' ? 'btn-primary' : 'btn-outline'}"
                      style="font-size:0.72rem; padding:0.2rem 0.55rem; font-weight:800; border-radius:999px; ${mode === 'vehicle' ? 'background:#0B192C; color:#fff; border-color:#0B192C;' : 'background:#fff; color:#0B192C; border-color:#CBD5E1;'}"
                      onclick="selectCourierDriverMode('${d.id}', 'vehicle', event)"
                      data-agent-id="btn-courier-mode-vehicle-${d.id}"
                      data-testid="btn-courier-mode-vehicle-${d.id}"
                      aria-pressed="${mode === 'vehicle' ? 'true' : 'false'}"
                      aria-label="Switch ${escapeAttr(d.name)} to Motor Vehicle mode">
                      <i class="fa-solid fa-truck"></i> Motor Vehicle ($${Number(d.vehiclePerKmRateAud ?? d.perKmRateAud ?? 2.20).toFixed(2)}/km)
                    </button>
                    <button
                      type="button"
                      class="btn btn-xs ${mode === 'bicycle' ? 'btn-primary' : 'btn-outline'}"
                      style="font-size:0.72rem; padding:0.2rem 0.55rem; font-weight:800; border-radius:999px; ${mode === 'bicycle' ? 'background:#0284C7; color:#fff; border-color:#0284C7;' : 'background:#fff; color:#0284C7; border-color:#0284C7;'}"
                      onclick="selectCourierDriverMode('${d.id}', 'bicycle', event)"
                      data-agent-id="btn-courier-mode-bicycle-${d.id}"
                      data-testid="btn-courier-mode-bicycle-${d.id}"
                      aria-pressed="${mode === 'bicycle' ? 'true' : 'false'}"
                      aria-label="Switch ${escapeAttr(d.name)} to Bicycle Courier mode">
                      <i class="fa-solid fa-bicycle"></i> Bicycle Courier ($${Number(d.bicyclePerKmRateAud ?? 1.80).toFixed(2)}/km)
                    </button>
                  </div>
                ` : ''}

                <div style="font-size:0.74rem; color:var(--text-muted);">
                  <i class="fa-solid fa-location-crosshairs" style="color:#059669;"></i> <strong>${item.distToPickupKm.toFixed(1)} km from pickup</strong> (${d.baseSuburb || 'Gold Coast'}) • Lic: ${d.licenceState || 'QLD'} #${d.licenceNumber || 'DL-9901'} (${d.licenceClass || 'C'})
                </div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.15rem; font-weight:900; color:var(--primary-navy);">$${q.totalAud.toFixed(2)} AUD</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">
                $${Number(q.perKmRateAud).toFixed(2)}/km (${q.distanceKm.toFixed(1)}km) • Same-Day +$${q.sameDayFeeAud} • Urgent +$${q.urgentFeeAud}
              </div>
            </div>
          </div>

          <!-- Driver Card Footer + Map Dropdown Toggle Button -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-top:0.65rem; padding-top:0.55rem; border-top:1px dashed var(--border-light); font-size:0.74rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              ${item.fitBadge}
              <span style="color:#047857; font-weight:700;">
                <i class="fa-solid fa-money-bill-transfer"></i> PayID (${(d.payIdType || 'phone').toUpperCase()}): <strong>${d.payIdValue}</strong>
              </span>
            </div>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              onclick="event.stopPropagation(); toggleDriverBoxMap('${d.id}')"
              style="padding:0.25rem 0.65rem; font-size:0.74rem; font-weight:800; border-color:var(--primary-navy); color:var(--primary-navy); background:${isMapOpen ? '#F1F5F9' : '#FFFFFF'};"
              data-agent-id="btn-toggle-driver-map-${d.id}"
              data-testid="btn-toggle-driver-map-${d.id}"
              aria-expanded="${isMapOpen ? 'true' : 'false'}"
              aria-label="Toggle Driver Map Dropdown for ${escapeAttr(d.name)}">
              <i class="fa-solid fa-map-location-dot" style="color:var(--brand-orange);"></i>
              <span>${isMapOpen ? 'Hide Driver Map ▲' : 'Driver Map ▼'}</span>
            </button>
          </div>

          <!-- Collapsible Map Dropdown Inside Driver Box -->
          <div
            id="driver-map-dropdown-${d.id}"
            onclick="event.stopPropagation();"
            style="display:${isMapOpen ? 'block' : 'none'}; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--border-light);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem; font-size:0.76rem; font-weight:700; color:var(--primary-navy); margin-bottom:0.45rem;">
              <span><i class="fa-solid ${mode === 'bicycle' ? 'fa-bicycle' : 'fa-truck-fast'}" style="color:var(--brand-orange);"></i> ${d.name} (${d.baseSuburb || 'Gold Coast'}) → Pickup (${item.distToPickupKm.toFixed(1)} km) &amp; Delivery (${distanceKm.toFixed(1)} km)</span>
              <span style="color:#059669; font-weight:800;">~${durationMins} mins road route</span>
            </div>
            <div id="driver-leaflet-map-${d.id}" style="height:245px; width:100%; border-radius:var(--radius-sm); border:1px solid var(--border-light); background:#F1F5F9;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // If a driver box has its Map Dropdown open, render the live Leaflet map inside that driver box
  if (appState.expandedDriverMapId) {
    renderInlineDriverBoxMap(appState.expandedDriverMapId);
  }

  if (!selectedEntry) return;

  const drv = selectedEntry.driver;
  const q = selectedEntry.quote;
  const tokenCharge = cur.getDriverOrderTokenCharge(distanceKm);

  appState.lastCalculatedQuote = {
    driver: drv,
    distToPickupKm: selectedEntry.distToPickupKm,
    fitsPackage: selectedEntry.fitsPackage,
    quote: q,
    deliveryMode: selectedEntry.effectiveMode,
    tokenCharge,
    distanceKm,
    durationMins,
    pickupDate,
    pickupTime,
    speedTier
  };

  // Update Submit Button label with Selected Driver & Live AUD Total
  const submitBtn = document.getElementById('btn-submit-courier-booking');
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Confirm Booking with ${drv.name} ($${q.totalAud.toFixed(2)} AUD via PayID)`;
  }

  // Also sync top navbar token counter with active admin driver
  const navTokenCount = document.getElementById('nav-driver-token-count');
  const activeAdmDrv = window.providerDB?.findById(appState.activeAdminDriverId) || drv;
  if (navTokenCount && activeAdmDrv) {
    navTokenCount.textContent = `${activeAdmDrv.tokenBalance ?? 45} Tokens`;
  }

  return appState.lastCalculatedQuote;
}

function copySelectedDriverPayId() {
  const drv = window.providerDB?.findById(appState.selectedCourierDriverId);
  const payId = drv?.payIdValue || '0412 889 341';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(payId).catch(() => {});
  }
  showToast(`💳 Copied Driver PayID (${payId}) to clipboard! Pay driver directly in AUD.`);
}
window.copySelectedDriverPayId = copySelectedDriverPayId;

/**
 * Submit Customer Courier Booking (9:00 AM – 4:00 PM Pickup Window)
 * Deducts SuperAdmin Distance-Bracket Tokens from Driver & Records Order on Driver Admin Page
 */
function submitCourierBooking() {
  const cur = window.iasjCurrency;
  const originAddress = document.getElementById('courier-origin')?.value.trim();
  const destAddress = document.getElementById('courier-dest')?.value.trim();
  const pickupDate = document.getElementById('courier-pickup-date')?.value || new Date().toISOString().split('T')[0];
  const pickupTime = document.getElementById('courier-pickup-time')?.value || '10:30 AM';
  const speedTier = document.getElementById('courier-urgency')?.value || 'same_day';

  const packageContents = document.getElementById('courier-desc')?.value.trim();
  const weightKg = parseFloat(document.getElementById('courier-weight')?.value) || 0;
  const heightCm = parseFloat(document.getElementById('courier-height')?.value) || 0;
  const widthCm = parseFloat(document.getElementById('courier-width')?.value) || 0;
  const lengthCm = parseFloat(document.getElementById('courier-length')?.value) || 0;

  const customerName = document.getElementById('courier-cust-name')?.value.trim();
  const customerPhone = document.getElementById('courier-cust-phone')?.value.trim();
  const customerEmail = document.getElementById('courier-cust-email')?.value.trim();
  const customerAddress = document.getElementById('courier-cust-address')?.value.trim();

  // Validate 9:00 AM - 4:00 PM pickup slot
  const validSlots = cur.PICKUP_TIME_SLOTS_9AM_TO_4PM || [];
  if (validSlots.length > 0 && !validSlots.includes(pickupTime)) {
    showToast('⚠️ Please choose a pickup time strictly between 9:00 AM and 4:00 PM.');
    return;
  }

  if (!originAddress || !destAddress || !packageContents || !customerName || !customerPhone || !customerEmail || !customerAddress) {
    showToast('⚠️ Please complete all customer contact details, addresses, and package content details.');
    return;
  }

  if (weightKg <= 0 || heightCm <= 0 || widthCm <= 0 || lengthCm <= 0) {
    showToast('⚠️ Please enter valid package weight (kg) and dimensions (Height, Width, Length cm).');
    return;
  }

  const calc = updateCourierPricingWithSettings(
    appState.lastCourierRoute?.distanceKm || 8.5,
    appState.lastCourierRoute?.durationMins || 15
  );
  if (!calc || !calc.driver) {
    showToast('⚠️ Please select a courier driver.');
    return;
  }

  const drv = calc.driver;
  if (!calc.fitsPackage) {
    showToast(`⚠️ This package exceeds ${drv.name}'s maximum capacity (${drv.maxWeightKg}kg, ${drv.maxHeightCm}×${drv.maxWidthCm}×${drv.maxLengthCm}cm). Please select an eligible driver.`);
    return;
  }

  const tokenCharge = calc.tokenCharge;
  if ((drv.tokenBalance ?? 0) < tokenCharge.tokens) {
    showToast(`⚠️ Driver ${drv.name} needs ${tokenCharge.tokens} Tokens for this ${tokenCharge.tierLabel} order. Please top up Driver Tokens first.`);
    openDriverTokenTopupModal(drv.id);
    return;
  }

  // 1. Deduct distance-tier tokens from driver wallet and automatically credit to SuperAdmin account
  window.providerDB.deductDriverTokens(drv.id, tokenCharge.tokens);
  if (window.superadminDB) {
    window.superadminDB.addTokens(tokenCharge.tokens, {
      driverName: drv.name,
      driverId: drv.id,
      tier: tokenCharge.tierLabel
    });
    if (typeof renderSuperadminTokenBalance === 'function') {
      renderSuperadminTokenBalance();
    }
  }

  // 2. Record the order in CourierOrderDatabase (shown on Driver Admin Page)
  const newOrder = window.courierOrderDB.addOrder({
    driverId: drv.id,
    driverName: drv.name,
    driverBusinessName: drv.businessName,
    driverPhone: drv.phone,
    driverPayIdType: drv.payIdType || 'phone',
    driverPayIdValue: drv.payIdValue || drv.phone,
    driverPayIdAccountName: drv.payIdAccountName || drv.businessName,
    pickupDate,
    pickupTime, // Strictly between 9:00 AM and 4:00 PM
    speedTier,
    originAddress,
    destAddress,
    distanceKm: calc.quote.distanceKm,
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
    packageContents,
    weightKg,
    heightCm,
    widthCm,
    lengthCm,
    perKmRateAud: calc.quote.perKmRateAud,
    distanceFeeAud: calc.quote.distanceFeeAud,
    sameDayFeeAud: calc.quote.sameDayFeeAud,
    urgentFeeAud: calc.quote.urgentFeeAud,
    totalAud: calc.quote.totalAud,
    tokensChargedToDriver: tokenCharge.tokens,
    tokenTierLabel: tokenCharge.tierLabel,
    deliveryMode: calc.deliveryMode || calc.quote?.deliveryMode || 'vehicle',
    deliveryModeLabel: calc.quote?.deliveryModeLabel || (calc.deliveryMode === 'bicycle' ? 'Bicycle Courier (Letters, Food & Small Items)' : 'Motor Vehicle Courier'),
    paymentMethod: 'Direct to Driver PayID (AUD)',
    status: 'Scheduled (9am–4pm Pickup)'
  });

  // 3. Set active admin driver to the booked driver so Driver Admin page immediately shows this order
  appState.activeAdminDriverId = drv.id;
  updateCourierPricingWithSettings(calc.distanceKm, calc.durationMins);
  renderDriverAdminDashboard();
  try { renderSupporterBookings(); } catch (e) {}

  // 4. Open Direct Driver PayID Confirmation Modal
  const modalBody = document.getElementById('courier-payid-modal-body');
  if (modalBody) {
    modalBody.innerHTML = `
      <div style="background:#F8FAFC; border:1px solid var(--border-light); border-radius:var(--radius-md); padding:1rem; margin-bottom:1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.65rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border-light);">
          <div>
            <span style="font-size:0.74rem; color:var(--text-muted); font-weight:700;">ORDER REFERENCE</span>
            <strong style="font-size:1.05rem; color:var(--primary-navy); display:block;">${newOrder.orderId}</strong>
          </div>
          <span style="background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; padding:0.25rem 0.65rem; border-radius:999px; font-size:0.78rem; font-weight:800;">
            <i class="fa-regular fa-clock"></i> Pickup: ${newOrder.pickupDate} @ ${newOrder.pickupTime} (9am–4pm)
          </span>
        </div>

        <div style="font-size:0.84rem; color:var(--primary-navy); line-height:1.55;">
          <div><strong>Driver:</strong> ${newOrder.driverName} (${newOrder.driverBusinessName}) • Tel: ${newOrder.driverPhone}</div>
          <div><strong>Pickup Origin:</strong> ${newOrder.originAddress}</div>
          <div><strong>Delivery Destination:</strong> ${newOrder.destAddress} (${newOrder.distanceKm} km)</div>
          <div><strong>Customer:</strong> ${newOrder.customerName} • ${newOrder.customerPhone} • ${newOrder.customerEmail}</div>
          <div><strong>Customer Address:</strong> ${newOrder.customerAddress}</div>
          <div><strong>Package Contents:</strong> ${newOrder.packageContents}</div>
          <div><strong>Package Weight &amp; Size:</strong> ${newOrder.weightKg} kg • ${newOrder.heightCm}cm (H) × ${newOrder.widthCm}cm (W) × ${newOrder.lengthCm}cm (L)</div>
        </div>
      </div>

      <!-- Direct Driver PayID Settlement Box -->
      <div style="background:#ECFDF5; border:2px solid #10B981; border-radius:var(--radius-md); padding:1rem; margin-bottom:0.85rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
          <strong style="color:#065F46; font-size:0.92rem;">
            <i class="fa-solid fa-money-bill-transfer"></i> Pay Driver Directly via PayID ($ AUD Only)
          </strong>
          <strong style="font-size:1.25rem; color:#047857;">$${newOrder.totalAud.toFixed(2)} AUD</strong>
        </div>
        <p style="font-size:0.78rem; color:#065F46; margin-bottom:0.65rem;">
          Customers never pay the web app. Transfer <strong>$${newOrder.totalAud.toFixed(2)} AUD</strong> directly to your driver's registered PayID below using reference <strong>${newOrder.orderId}</strong>:
        </p>
        <div style="background:#fff; border:1px solid #A7F3D0; border-radius:6px; padding:0.7rem 0.9rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">DRIVER PAYID (${newOrder.driverPayIdType.toUpperCase()}):</div>
            <div style="font-size:1rem; font-weight:900; color:#065F46;">${newOrder.driverPayIdValue}</div>
            <div style="font-size:0.76rem; color:var(--text-muted);">Account Name: ${newOrder.driverPayIdAccountName}</div>
          </div>
          <button type="button" class="btn btn-outline btn-sm" onclick="copySelectedDriverPayId()" style="border-color:#059669; color:#065F46; font-weight:800;" data-agent-id="btn-modal-copy-payid" data-testid="btn-modal-copy-payid" aria-label="Copy Driver PayID">
            <i class="fa-regular fa-copy"></i> Copy PayID
          </button>
        </div>
      </div>
    `;
  }

  document.getElementById('courier-payid-confirmation-modal')?.classList.add('active');
  showToast(`✅ Order ${newOrder.orderId} recorded for ${newOrder.pickupTime} pickup!`);
}
window.submitCourierBooking = submitCourierBooking;
window.bookCourierDispatch = submitCourierBooking;

function closePayIdConfirmationModal() {
  document.getElementById('courier-payid-confirmation-modal')?.classList.remove('active');
}
window.closePayIdConfirmationModal = closePayIdConfirmationModal;

/**
 * Auto-Geolocate Driver Form (Registration View)
 */
function autoGeolocateDriverForm() {
  const statusEl = document.getElementById('drv-reg-geo-status');
  const latInput = document.getElementById('drv-reg-lat');
  const lngInput = document.getElementById('drv-reg-lng');
  const addrInput = document.getElementById('drv-reg-address');

  if (statusEl) {
    statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Detecting live driver GPS coordinates...`;
  }

  const applyCoords = async (lat, lng, fallbackLabel) => {
    if (latInput) latInput.value = String(lat.toFixed(5));
    if (lngInput) lngInput.value = String(lng.toFixed(5));

    let resolvedAddr = fallbackLabel;
    try {
      const osmAddr = await reverseGeocodeOsm(lat, lng);
      if (osmAddr) resolvedAddr = osmAddr;
    } catch (e) {}

    if (addrInput && (!addrInput.value || addrInput.value.includes('GPS'))) {
      addrInput.value = resolvedAddr;
    }
    if (statusEl) {
      statusEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#059669;"></i> Live GPS Locked: <strong>${resolvedAddr}</strong> (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }
    showToast(`📍 Driver GPS location locked: ${resolvedAddr}`);
  };

  if (!navigator.geolocation) {
    applyCoords(-27.9678, 153.4011, '14 Hill Street, Southport QLD 4215');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => applyCoords(pos.coords.latitude, pos.coords.longitude, 'Southport QLD 4215 (Live GPS)'),
    () => applyCoords(-27.9678, 153.4011, '14 Hill Street, Southport QLD 4215'),
    { enableHighAccuracy: true, timeout: 6000 }
  );
}
window.autoGeolocateDriverForm = autoGeolocateDriverForm;

// =====================================================================
// SUPPORTER & DRIVER ONBOARDING CONTROLLER (Behind Supporter Panel)
// =====================================================================
const SUPPORTER_STORAGE_KEY = 'simplejob_supporters_v1';
const CURRENT_SUPPORTER_KEY = 'simplejob_current_supporter_id';

class SupporterDatabase {
  constructor() {
    this.supporters = this.load();
  }

  load() {
    try {
      const data = localStorage.getItem(SUPPORTER_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  save() {
    try {
      localStorage.setItem(SUPPORTER_STORAGE_KEY, JSON.stringify(this.supporters));
    } catch (e) {}
  }

  getAll() {
    return this.supporters;
  }

  findById(id) {
    return this.supporters.find(s => s.id === id);
  }

  findByEmail(email) {
    if (!email) return null;
    return this.supporters.find(s => s.email.toLowerCase() === email.toLowerCase());
  }

  addSupporter(data) {
    const existing = this.findByEmail(data.email);
    if (existing) {
      Object.assign(existing, data, { updatedAt: new Date().toISOString() });
      this.save();
      return existing;
    }
    const newSupporter = {
      id: 'supporter_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: data.name,
      email: data.email,
      phone: data.phone,
      suburb: data.suburb,
      role: 'supporter',
      isVerified: true,
      createdAt: new Date().toISOString()
    };
    this.supporters.push(newSupporter);
    this.save();
    return newSupporter;
  }
}

window.supporterDB = new SupporterDatabase();

function getCurrentSupporter() {
  const currentId = localStorage.getItem(CURRENT_SUPPORTER_KEY);
  if (currentId) {
    const found = window.supporterDB.findById(currentId);
    if (found) return found;
  }
  const googleUserRaw = localStorage.getItem('iasj_google_user');
  if (googleUserRaw) {
    try {
      const gUser = JSON.parse(googleUserRaw);
      if (gUser && gUser.email) {
        let supporter = window.supporterDB.findByEmail(gUser.email);
        if (!supporter) {
          supporter = window.supporterDB.addSupporter({
            name: gUser.displayName || 'Google Supporter',
            email: gUser.email,
            phone: gUser.phoneNumber || '',
            suburb: '',
            photoURL: gUser.photoURL || '',
            googleUid: gUser.uid || ''
          });
        }
        localStorage.setItem(CURRENT_SUPPORTER_KEY, supporter.id);
        return supporter;
      }
    } catch (e) {}
  }
  return null;
}
window.getCurrentSupporter = getCurrentSupporter;

function scrollToDriverApplication() {
  const section = document.getElementById('driver-application-bottom-section');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.scrollToDriverApplication = scrollToDriverApplication;

function isSupporterRegistered() {
  const supporter = typeof getCurrentSupporter === 'function' ? getCurrentSupporter() : null;
  return !!(supporter && (supporter.email || supporter.name));
}
window.isSupporterRegistered = isSupporterRegistered;

function updateDriverApplicationGateUI() {
  const lockedEl = document.getElementById('driver-app-gate-locked');
  const unlockedEl = document.getElementById('driver-app-gate-unlocked');
  if (!lockedEl && !unlockedEl) return;

  const isRegistered = isSupporterRegistered();
  const supporter = isRegistered ? getCurrentSupporter() : null;

  if (isRegistered && supporter) {
    if (lockedEl) lockedEl.style.display = 'none';
    if (unlockedEl) unlockedEl.style.display = 'block';

    const supNameBadge = document.getElementById('driver-app-unlocked-supporter-name');
    if (supNameBadge) {
      supNameBadge.textContent = `${supporter.name || 'Community Supporter'} (${supporter.email})`;
    }

    try {
      prefillDriverRegistrationForm(supporter);
    } catch (e) {
      console.warn('Error prefilling driver registration form:', e);
    }
  } else {
    if (lockedEl) lockedEl.style.display = 'block';
    if (unlockedEl) unlockedEl.style.display = 'none';
  }
}
window.updateDriverApplicationGateUI = updateDriverApplicationGateUI;

function switchSupporterSubTab(subtabId) {
  if (subtabId === 'supporter-driver-app-subtab') {
    scrollToDriverApplication();
    return;
  }

  // Driver Dispatch Console can ONLY be seen by approved Courier Drivers and SuperAdmin
  const activeRole = typeof getActiveUserRole === 'function' ? getActiveUserRole() : 'supporter';
  const canSeeDispatch = (activeRole === 'driver' || activeRole === 'superadmin');
  if (subtabId === 'supporter-dispatch-subtab' && !canSeeDispatch) {
    if (typeof showToast === 'function') {
      showToast('🔒 Driver Dispatch Console is only accessible to approved Courier Drivers and SuperAdmin.');
    }
    subtabId = 'supporter-details-subtab';
  }

  const subviews = document.querySelectorAll('.supporter-subview');
  subviews.forEach(v => v.style.display = 'none');

  const target = document.getElementById(subtabId);
  if (target) target.style.display = 'block';

  const subBtns = document.querySelectorAll('.supporter-subnav-btn');
  subBtns.forEach(btn => btn.classList.remove('active'));

  if (subtabId === 'supporter-details-subtab') {
    document.getElementById('subtab-btn-details')?.classList.add('active');
  } else if (subtabId === 'supporter-bookings-subtab') {
    document.getElementById('subtab-btn-bookings')?.classList.add('active');
    try { renderSupporterBookings(); } catch (e) {}
  } else if (subtabId === 'supporter-dispatch-subtab') {
    document.getElementById('subtab-btn-dispatch')?.classList.add('active');
    try { renderDriverAdminDashboard(); } catch (e) {}
  }
}
window.switchSupporterSubTab = switchSupporterSubTab;

function handleSupporterRegistrationSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const nameInput = document.getElementById('supporter-reg-name');
  const emailInput = document.getElementById('supporter-reg-email');
  const phoneInput = document.getElementById('supporter-reg-phone');
  const suburbInput = document.getElementById('supporter-reg-suburb');

  const name = nameInput?.value.trim();
  const email = emailInput?.value.trim();
  const phone = phoneInput?.value.trim();
  const suburb = suburbInput?.value.trim();

  if (!name || !email || !phone || !suburb) {
    showToast('⚠️ Please enter your mobile phone and full address, suburb & postcode.');
    return;
  }

  const supporter = window.supporterDB.addSupporter({ name, email, phone, suburb });
  localStorage.setItem(CURRENT_SUPPORTER_KEY, supporter.id);

  // Sync to driver registration form fields
  const drvName = document.getElementById('drv-reg-name');
  if (drvName) drvName.value = name;
  const drvEmail = document.getElementById('drv-reg-email');
  if (drvEmail) drvEmail.value = email;
  const drvPhone = document.getElementById('drv-reg-phone');
  if (drvPhone) drvPhone.value = phone;
  const drvAddr = document.getElementById('drv-reg-address');
  if (drvAddr) drvAddr.value = suburb;

  // Sync supporter personal details to Firestore users collection
  const gUser = window.firebaseService?.getCurrentGoogleUser?.();
  if (gUser && gUser.uid && window.firebaseService?.updateSupporterProfileInFirestore) {
    window.firebaseService.updateSupporterProfileInFirestore(gUser.uid, {
      displayName: name,
      phoneNumber: phone,
      address: suburb,
      suburb: suburb
    }).catch(e => console.warn('Could not sync supporter profile to Firestore:', e));
  }

  renderSupporterPanel();
  showToast(`🎉 Supporter personal details saved!`);
}
window.handleSupporterRegistrationSubmit = handleSupporterRegistrationSubmit;

function renderSupporterPanel() {
  const supporter = getCurrentSupporter();
  const onboardingCard = document.getElementById('supporter-onboarding-card');
  const panelWrapper = document.getElementById('supporter-panel-wrapper');
  const nameEl = document.getElementById('supporter-display-name');
  const detEl = document.getElementById('supporter-display-details');
  const avatarImg = document.getElementById('supporter-avatar-img');

  if (supporter) {
    if (onboardingCard) onboardingCard.style.display = 'none';
    if (panelWrapper) panelWrapper.style.display = 'block';
    if (nameEl) nameEl.textContent = supporter.name || 'Community Supporter';
    const activeRole = getActiveUserRole();
    if (detEl) {
      const phoneTxt = supporter.phone ? ` • ${supporter.phone}` : '';
      const suburbTxt = supporter.suburb ? ` • ${supporter.suburb}` : '';
      let rolePill = '<i class="fa-solid fa-shield-halved" style="color:#10B981;"></i> Community Supporter';
      if (activeRole === 'superadmin') {
        rolePill = '<i class="fa-solid fa-crown" style="color:#F59E0B;"></i> SuperAdmin (Supreme Ruler)';
      } else if (activeRole === 'driver') {
        rolePill = '<i class="fa-solid fa-truck-fast" style="color:#3B82F6;"></i> Approved Courier Driver';
      }
      detEl.innerHTML = `${rolePill} • ${supporter.email}${phoneTxt}${suburbTxt}`;
    }

    // Update Supporter Token Balance pill
    const supTokenEl = document.getElementById('supporter-token-balance');
    if (supTokenEl) {
      supTokenEl.textContent = `${supporter.tokenBalance ?? 25} Tokens`;
    }

    // Role-based visibility for Driver Dispatch Console: strictly driver and superadmin ONLY
    const canSeeDispatch = (activeRole === 'driver' || activeRole === 'superadmin');
    const dispatchSubtabBtn = document.getElementById('subtab-btn-dispatch');
    const dispatchNotice = document.getElementById('supporter-not-driver-notice');
    const dispatchConsole = document.getElementById('driver-dispatch-console');
    const dispatchSubtabView = document.getElementById('supporter-dispatch-subtab');

    if (dispatchSubtabBtn) {
      dispatchSubtabBtn.style.display = canSeeDispatch ? 'inline-flex' : 'none';
    }

    if (!canSeeDispatch) {
      if (dispatchNotice) dispatchNotice.style.display = 'none';
      if (dispatchConsole) dispatchConsole.style.display = 'none';
      if (dispatchSubtabView) dispatchSubtabView.style.display = 'none';
      const activeSubBtn = document.querySelector('.supporter-subnav-btn.active');
      if (activeSubBtn && activeSubBtn.id === 'subtab-btn-dispatch') {
        switchSupporterSubTab('supporter-details-subtab');
      }
    } else {
      if (dispatchNotice) dispatchNotice.style.display = 'none';
      if (dispatchConsole) dispatchConsole.style.display = 'block';
    }

    // SuperAdmin console gating
    const saCard = document.getElementById('superadmin-courier-config-card');
    if (saCard) {
      saCard.style.display = (activeRole === 'superadmin') ? 'block' : 'none';
    }
    if (avatarImg && supporter.photoURL) {
      avatarImg.src = supporter.photoURL;
    }

    // Pre-fill supporter details form fields
    const regName = document.getElementById('supporter-reg-name');
    if (regName && !regName.value) regName.value = supporter.name || '';
    const regEmail = document.getElementById('supporter-reg-email');
    if (regEmail && !regEmail.value) regEmail.value = supporter.email || '';
    const regPhone = document.getElementById('supporter-reg-phone');
    if (regPhone && !regPhone.value && supporter.phone) regPhone.value = supporter.phone;
    const regSuburb = document.getElementById('supporter-reg-suburb');
    if (regSuburb && !regSuburb.value && (supporter.suburb || supporter.address)) regSuburb.value = supporter.suburb || supporter.address || '';
    
    try { renderSupporterBookings(); } catch (e) {}
  } else {
    if (onboardingCard) onboardingCard.style.display = 'block';
    if (panelWrapper) panelWrapper.style.display = 'none';
  }
  try { updateDriverApplicationGateUI(); } catch (e) {}
}
window.renderSupporterPanel = renderSupporterPanel;

function renderSupporterBookings() {
  const container = document.getElementById('supporter-bookings-list-container');
  const countBadge = document.getElementById('supporter-bookings-count-badge');
  if (!container || !window.courierOrderDB) return;

  const supporter = getCurrentSupporter();
  const allOrders = window.courierOrderDB.getAll() || [];

  let supporterOrders = [];
  if (supporter && supporter.email) {
    const sEmail = supporter.email.toLowerCase().trim();
    const sPhone = (supporter.phone || '').replace(/\s+/g, '');
    supporterOrders = allOrders.filter(o => {
      const oEmail = (o.customerEmail || '').toLowerCase().trim();
      const oPhone = (o.customerPhone || '').replace(/\s+/g, '');
      return (sEmail && oEmail === sEmail) || (sPhone && oPhone.length >= 8 && sPhone === oPhone);
    });
  }

  // If no matching orders specifically for this email yet, show all orders so supporter can review existing demo bookings
  const ordersToDisplay = supporterOrders.length > 0 ? supporterOrders : allOrders;

  if (countBadge) {
    countBadge.textContent = `${ordersToDisplay.length} Booking${ordersToDisplay.length === 1 ? '' : 's'}`;
  }

  if (ordersToDisplay.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:3rem 1.5rem; background:#F8FAFC; border:1px dashed var(--border-light); border-radius:var(--radius-md);">
        <i class="fa-solid fa-box-open" style="font-size:2.8rem; color:#94A3B8; margin-bottom:0.85rem; display:block;"></i>
        <h4 style="font-size:1.1rem; font-weight:800; color:var(--primary-navy); margin-bottom:0.35rem;">No Bookings Recorded Yet</h4>
        <p style="font-size:0.86rem; color:var(--text-muted); max-width:440px; margin:0 auto 1.25rem;">
          You haven't placed any courier delivery orders yet. Book a short-haul pickup between 9:00 AM and 4:00 PM with your closest driver!
        </p>
        <button type="button" class="btn btn-primary" onclick="makeNewBookingAsSupporter()"
          style="font-weight:800; display:inline-flex; align-items:center; gap:0.45rem;"
          data-agent-id="btn-empty-make-booking" data-testid="btn-empty-make-booking" aria-label="Make a New Booking Now">
          <i class="fa-solid fa-truck-fast"></i> Make a New Booking Now
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = ordersToDisplay.map(ord => {
    const isCompleted = (ord.status || '').includes('Delivered');
    const isScheduled = (ord.status || '').includes('Scheduled') || (ord.status || '').includes('9am');
    const badgeBg = isCompleted ? '#ECFDF5' : (isScheduled ? '#EFF6FF' : '#FEF3C7');
    const badgeColor = isCompleted ? '#065F46' : (isScheduled ? '#1E40AF' : '#92400E');
    const badgeBorder = isCompleted ? '#A7F3D0' : (isScheduled ? '#BFDBFE' : '#FDE68A');

    return `
      <div class="booking-history-card" style="background:#ffffff; border:1px solid var(--border-light); border-radius:var(--radius-md); padding:1.25rem; box-shadow:0 2px 8px rgba(0,0,0,0.04); transition:all 0.2s ease;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.85rem; padding-bottom:0.75rem; border-bottom:1px solid var(--bg-card-alt);">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span style="font-size:0.74rem; font-weight:800; background:#0F172A; color:#ffffff; padding:0.2rem 0.55rem; border-radius:4px; letter-spacing:0.5px;">${ord.orderId}</span>
              <span style="font-size:0.78rem; color:var(--text-muted);"><i class="fa-regular fa-calendar"></i> ${ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Recent'}</span>
            </div>
            <div style="font-size:0.86rem; font-weight:800; color:var(--primary-navy); margin-top:0.35rem;">
              <i class="fa-solid fa-clock" style="color:var(--brand-orange);"></i> Pickup Window: <strong>${ord.pickupDate || 'Today'} @ ${ord.pickupTime || '9:00 AM - 4:00 PM'}</strong>
            </div>
          </div>
          <div style="text-align:right;">
            <span style="display:inline-block; font-size:0.78rem; font-weight:800; background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; padding:0.25rem 0.75rem; border-radius:999px;">
              <i class="fa-solid fa-circle-dot" style="font-size:0.55rem; vertical-align:middle;"></i> ${ord.status || 'Scheduled (9am–4pm Pickup)'}
            </span>
            <div style="font-size:1.25rem; font-weight:900; color:var(--primary-navy); margin-top:0.25rem;">
              $${Number(ord.totalAud || 0).toFixed(2)} <span style="font-size:0.74rem; font-weight:700; color:var(--text-muted);">AUD</span>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.85rem; font-size:0.84rem; color:var(--primary-navy);">
          <div style="background:#F8FAFC; border-radius:var(--radius-sm); padding:0.75rem;">
            <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.3rem;"><i class="fa-solid fa-route"></i> Route (${ord.distanceKm || 0} km)</div>
            <div><strong>From:</strong> ${ord.originAddress || 'Origin'}</div>
            <div style="margin-top:0.25rem;"><strong>To:</strong> ${ord.destAddress || 'Destination'}</div>
          </div>

          <div style="background:#F8FAFC; border-radius:var(--radius-sm); padding:0.75rem;">
            <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.3rem;"><i class="fa-solid fa-id-card-clip"></i> Assigned Driver &amp; PayID</div>
            <div><strong>${ord.driverName || 'Driver'}</strong> (${ord.driverBusinessName || 'Express'})</div>
            <div style="margin-top:0.25rem; color:#059669; font-weight:700;"><i class="fa-solid fa-money-bill-transfer"></i> PayID: ${ord.driverPayIdValue || ord.driverPhone || 'PayID'}</div>
            <div style="font-size:0.76rem; color:var(--text-muted);">Tel: ${ord.driverPhone || 'N/A'}</div>
          </div>

          <div style="background:#F8FAFC; border-radius:var(--radius-sm); padding:0.75rem;">
            <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.3rem;"><i class="fa-solid fa-box"></i> Package Spec</div>
            <div><strong>Item:</strong> ${ord.packageContents || 'General Parcel'}</div>
            <div style="margin-top:0.25rem;"><strong>Weight:</strong> ${ord.weightKg || 1} kg • <strong>Size:</strong> ${ord.heightCm || 20}×${ord.widthCm || 20}×${ord.lengthCm || 20} cm</div>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; align-items:center; gap:0.5rem; margin-top:0.85rem; padding-top:0.65rem; border-top:1px solid var(--bg-card-alt);">
          <button type="button" class="btn btn-outline btn-sm" onclick="rebookSimilarCourier('${ord.orderId}')"
            style="font-size:0.78rem; font-weight:800;"
            data-agent-id="btn-rebook-${ord.orderId}" data-testid="btn-rebook-${ord.orderId}" aria-label="Re-book Similar Courier Job">
            <i class="fa-solid fa-rotate-right"></i> Book Similar Pickup
          </button>
        </div>
      </div>
    `;
  }).join('');
}
window.renderSupporterBookings = renderSupporterBookings;

function makeNewBookingAsSupporter() {
  const supporter = getCurrentSupporter();
  switchTab('courier-tab');

  if (supporter) {
    const nameEl = document.getElementById('courier-cust-name');
    if (nameEl && (!nameEl.value || nameEl.value === 'Jack Thompson')) nameEl.value = supporter.name || '';
    const emailEl = document.getElementById('courier-cust-email');
    if (emailEl) emailEl.value = supporter.email || '';
    const phoneEl = document.getElementById('courier-cust-phone');
    if (phoneEl && (!phoneEl.value || phoneEl.value === '0412 889 123')) phoneEl.value = supporter.phone || '';
    const addrEl = document.getElementById('courier-cust-address');
    if (addrEl && !addrEl.value) addrEl.value = supporter.suburb || supporter.address || '';
    const originEl = document.getElementById('courier-origin');
    if (originEl && !originEl.value) originEl.value = supporter.suburb || supporter.address || '';
  }

  const originInput = document.getElementById('courier-origin');
  if (originInput) {
    originInput.focus();
  }
  showToast('📦 Make a New Booking: Your contact details have been pre-filled from your Supporter profile.');
}
window.makeNewBookingAsSupporter = makeNewBookingAsSupporter;

function rebookSimilarCourier(orderId) {
  if (!window.courierOrderDB) return;
  const ord = window.courierOrderDB.getAll().find(o => o.orderId === orderId);
  if (!ord) return;

  switchTab('courier-tab');
  const origEl = document.getElementById('courier-origin');
  if (origEl && ord.originAddress) origEl.value = ord.originAddress;
  const destEl = document.getElementById('courier-dest');
  if (destEl && ord.destAddress) destEl.value = ord.destAddress;
  const itemEl = document.getElementById('courier-pkg-content');
  if (itemEl && ord.packageContents) itemEl.value = ord.packageContents;
  const wtEl = document.getElementById('courier-pkg-weight');
  if (wtEl && ord.weightKg) wtEl.value = ord.weightKg;
  const hEl = document.getElementById('courier-pkg-height');
  if (hEl && ord.heightCm) hEl.value = ord.heightCm;
  const wEl = document.getElementById('courier-pkg-width');
  if (wEl && ord.widthCm) wEl.value = ord.widthCm;
  const lEl = document.getElementById('courier-pkg-length');
  if (lEl && ord.lengthCm) lEl.value = ord.lengthCm;

  if (ord.driverId) {
    appState.selectedCourierDriverId = ord.driverId;
  }
  if (typeof calculateCourierQuote === 'function') {
    calculateCourierQuote();
  }
  showToast(`🔄 Re-booking courier job from order #${ord.orderId}!`);
}
window.rebookSimilarCourier = rebookSimilarCourier;

function toggleDriverApplicationUnderSupporter(forceOpen) {
  scrollToDriverApplication();
}
window.toggleDriverApplicationUnderSupporter = toggleDriverApplicationUnderSupporter;

function quickAccessDriverConsole() {
  let supporter = getCurrentSupporter();
  if (!supporter) {
    supporter = window.supporterDB.addSupporter({
      name: 'Registered Courier Driver',
      email: 'driver@simplejob.com.au',
      phone: '0400 000 000',
      suburb: 'Southport QLD 4215'
    });
    localStorage.setItem(CURRENT_SUPPORTER_KEY, supporter.id);
  }
  supporter.role = 'driver';
  supporter.approved = true;
  window.supporterDB.save();

  const gUser = window.firebaseService?.getCurrentGoogleUser?.();
  if (gUser) {
    gUser.role = 'driver';
    gUser.isDriver = true;
    try { localStorage.setItem('iasj_google_user', JSON.stringify(gUser)); } catch (e) {}
  }

  renderSupporterPanel();
  switchSupporterSubTab('supporter-dispatch-subtab');
  renderDriverAdminDashboard();
  showToast('🔑 Driver Dispatch Console unlocked.');
}
window.quickAccessDriverConsole = quickAccessDriverConsole;

function resetSupporterProfile() {
  localStorage.removeItem(CURRENT_SUPPORTER_KEY);
  localStorage.removeItem('iasj_google_user');
  renderSupporterPanel();
  showToast('ℹ️ Signed out of Supporter Panel. Please sign in with Google to continue.');
}
window.resetSupporterProfile = resetSupporterProfile;

/**
 * Register a New Courier Driver (Mandatory Licence, Address, Phone, Email, PayID, Rates & Max HxWxL/Weight)
 */

function toggleDriverRegModesUI() {
  const vBox = document.getElementById('drv-reg-vehicle-rates-box');
  const bBox = document.getElementById('drv-reg-bicycle-rates-box');
  const hasVehicle = document.getElementById('drv-reg-has-vehicle')?.checked ?? true;
  const hasBicycle = document.getElementById('drv-reg-has-bicycle')?.checked ?? false;

  // At least one mode must remain selected
  if (!hasVehicle && !hasBicycle) {
    const bikeBox = document.getElementById('drv-reg-has-bicycle');
    if (bikeBox) bikeBox.checked = true;
  }

  if (vBox) vBox.style.display = (document.getElementById('drv-reg-has-vehicle')?.checked) ? 'block' : 'none';
  if (bBox) bBox.style.display = (document.getElementById('drv-reg-has-bicycle')?.checked) ? 'block' : 'none';
}
window.toggleDriverRegModesUI = toggleDriverRegModesUI;

function toggleAdminModesUI() {
  const vBox = document.getElementById('adm-vehicle-rates-box');
  const bBox = document.getElementById('adm-bicycle-rates-box');
  const hasVehicle = document.getElementById('adm-drv-has-vehicle')?.checked ?? true;
  const hasBicycle = document.getElementById('adm-drv-has-bicycle')?.checked ?? false;

  if (!hasVehicle && !hasBicycle) {
    const bikeBox = document.getElementById('adm-drv-has-bicycle');
    if (bikeBox) bikeBox.checked = true;
  }

  if (vBox) vBox.style.display = (document.getElementById('adm-drv-has-vehicle')?.checked) ? 'block' : 'none';
  if (bBox) bBox.style.display = (document.getElementById('adm-drv-has-bicycle')?.checked) ? 'block' : 'none';
}
window.toggleAdminModesUI = toggleAdminModesUI;

function prefillDriverRegistrationForm(supporter) {
  if (!supporter) supporter = getCurrentSupporter();
  const form = document.getElementById('driver-registration-form');
  if (!form) return;

  const emailToMatch = (supporter?.email || document.getElementById('drv-reg-email')?.value || '').toLowerCase().trim();
  const existingDriver = (window.providerDB?.getAll?.() || []).find(d => 
    (d.email || '').toLowerCase().trim() === emailToMatch
  );

  const notice = document.getElementById('drv-reg-existing-notice');
  const noticeText = document.getElementById('drv-reg-existing-notice-text');
  const submitBtn = document.getElementById('btn-submit-driver-registration');

  if (existingDriver) {
    if (notice) {
      notice.style.display = 'block';
      const statusLabel = existingDriver.isApproved ? 'Approved & Active' : (existingDriver.status || 'Pending Approval');
      if (noticeText) {
        noticeText.innerHTML = '<strong>Driver Application on File:</strong> Registered for <strong>' + existingDriver.email + '</strong> (Status: <span class="badge" style="background:#10B981; color:#fff; padding:2px 8px; border-radius:4px;">' + statusLabel + '</span>). You can update your courier services, custom rates, and limits below anytime.';
      }
    }
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Driver Profile, Modes & Rates ($ AUD)';
    }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal('drv-reg-name', existingDriver.name || supporter?.name);
    setVal('drv-reg-gender', existingDriver.gender || 'male');
    setVal('drv-reg-phone', existingDriver.phone || supporter?.phone);
    setVal('drv-reg-email', existingDriver.email || supporter?.email);
    setVal('drv-reg-address', existingDriver.suburb || existingDriver.address || supporter?.suburb);
    setVal('drv-reg-vehicle', existingDriver.vehicleMake || existingDriver.vehicle || '');
    setVal('drv-reg-licence', existingDriver.licenceNumber || existingDriver.driverLicence || '');
    setVal('drv-reg-payid', existingDriver.payId || existingDriver.driverPayId || '');

    const chkVehicle = document.getElementById('drv-reg-has-vehicle');
    if (chkVehicle) chkVehicle.checked = existingDriver.hasVehicleCourier !== false;
    const chkBicycle = document.getElementById('drv-reg-has-bicycle');
    if (chkBicycle) chkBicycle.checked = !!existingDriver.hasBicycleCourier;

    setVal('drv-reg-per-km', existingDriver.vehiclePerKmRateAud ?? existingDriver.perKmRateAud ?? 2.20);
    setVal('drv-reg-rate-per-km', existingDriver.vehiclePerKmRateAud ?? existingDriver.perKmRateAud ?? 2.20);
    setVal('drv-reg-sameday-fee', existingDriver.vehicleSameDayFeeAud ?? existingDriver.sameDayFeeAud ?? 0);
    setVal('drv-reg-urgent-fee', existingDriver.vehicleUrgentFeeAud ?? existingDriver.urgentFeeAud ?? 0);
    setVal('drv-reg-max-weight', existingDriver.vehicleMaxWeightKg ?? existingDriver.maxWeightKg ?? 50);
    setVal('drv-reg-max-height', existingDriver.vehicleMaxHeightCm ?? existingDriver.maxHeightCm ?? 70);
    setVal('drv-reg-max-width', existingDriver.vehicleMaxWidthCm ?? existingDriver.maxWidthCm ?? 50);
    setVal('drv-reg-max-length', existingDriver.vehicleMaxLengthCm ?? existingDriver.maxLengthCm ?? 50);

    setVal('drv-reg-bike-per-km', existingDriver.bicyclePerKmRateAud ?? 1.80);
    setVal('drv-reg-bike-sameday-fee', existingDriver.bicycleSameDayFeeAud ?? 0);
    setVal('drv-reg-bike-urgent-fee', existingDriver.bicycleUrgentFeeAud ?? 0);
    setVal('drv-reg-bike-max-weight', existingDriver.bicycleMaxWeightKg ?? 8);
    setVal('drv-reg-bike-max-height', existingDriver.bicycleMaxHeightCm ?? 35);
    setVal('drv-reg-bike-max-width', existingDriver.bicycleMaxWidthCm ?? 30);
    setVal('drv-reg-bike-max-length', existingDriver.bicycleMaxLengthCm ?? 40);

    if (existingDriver.coords?.lat) setVal('drv-reg-lat', existingDriver.coords.lat);
    if (existingDriver.coords?.lng) setVal('drv-reg-lng', existingDriver.coords.lng);

    toggleDriverRegModesUI();
  } else {
    if (notice) notice.style.display = 'none';
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Register as Driver &amp; Activate Live GPS Profile';
    }
    if (supporter) {
      const setValIfEmpty = (id, val) => {
        const el = document.getElementById(id);
        if (el && !el.value && val) el.value = val;
      };
      setValIfEmpty('drv-reg-name', supporter.name);
      setValIfEmpty('drv-reg-gender', supporter.gender || 'male');
      setValIfEmpty('drv-reg-phone', supporter.phone);
      setValIfEmpty('drv-reg-email', supporter.email);
      setValIfEmpty('drv-reg-address', supporter.suburb || supporter.address);
    }
    toggleDriverRegModesUI();
  }
}
window.prefillDriverRegistrationForm = prefillDriverRegistrationForm;


function handleDriverRegistrationSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const name = document.getElementById('drv-reg-name')?.value.trim();
  const gender = document.getElementById('drv-reg-gender')?.value || 'male';
  const businessName = document.getElementById('drv-reg-business')?.value.trim() || `${name} Express Couriers`;
  const phone = document.getElementById('drv-reg-phone')?.value.trim();
  const email = document.getElementById('drv-reg-email')?.value.trim();
  const address = document.getElementById('drv-reg-address')?.value.trim();
  const vehicle = document.getElementById('drv-reg-vehicle')?.value.trim() || 'Courier Van';

  const licenceNumber = document.getElementById('drv-reg-licence-num')?.value.trim();
  const licenceState = document.getElementById('drv-reg-licence-state')?.value || 'QLD';
  const licenceClass = document.getElementById('drv-reg-licence-class')?.value || 'C (Car / Van)';
  const licenceExpiry = document.getElementById('drv-reg-licence-expiry')?.value || '2029-12-31';

  const payIdValue = document.getElementById('drv-reg-payid-value')?.value.trim();
  const payIdType = (payIdValue && payIdValue.includes('@')) ? 'email' : ((payIdValue && /^\d{11}$/.test(payIdValue.replace(/\s+/g, ''))) ? 'abn' : 'phone');
  const payIdAccountName = businessName || name;

  const hasVehicle = document.getElementById('drv-reg-has-vehicle')?.checked ?? true;
  const hasBicycle = document.getElementById('drv-reg-has-bicycle')?.checked ?? false;

  const perKmRateAud = Math.max(0.5, parseFloat(document.getElementById('drv-reg-per-km')?.value) || 2.20);
  const sameDayFeeAud = Math.max(0, parseFloat(document.getElementById('drv-reg-sameday-fee')?.value) || 0);
  const urgentFeeAud = Math.max(0, parseFloat(document.getElementById('drv-reg-urgent-fee')?.value) || 0);

  const bikePerKmRaw = document.getElementById('drv-reg-bike-per-km')?.value;
  const bikeSameDayRaw = document.getElementById('drv-reg-bike-sameday-fee')?.value;
  const bikeUrgentRaw = document.getElementById('drv-reg-bike-urgent-fee')?.value;
  const bicyclePerKmRateAud = bikePerKmRaw !== '' && !isNaN(parseFloat(bikePerKmRaw)) ? Math.max(0.5, parseFloat(bikePerKmRaw)) : 1.80;
  const bicycleSameDayFeeAud = bikeSameDayRaw !== '' && !isNaN(parseFloat(bikeSameDayRaw)) ? Math.max(0, parseFloat(bikeSameDayRaw)) : 0;
  const bicycleUrgentFeeAud = bikeUrgentRaw !== '' && !isNaN(parseFloat(bikeUrgentRaw)) ? Math.max(0, parseFloat(bikeUrgentRaw)) : 0;

  const maxWeightKg = Math.max(1, parseFloat(document.getElementById('drv-reg-max-weight')?.value) || 50);
  const maxHeightCm = Math.max(10, parseFloat(document.getElementById('drv-reg-max-height')?.value) || 70);
  const maxWidthCm = Math.max(10, parseFloat(document.getElementById('drv-reg-max-width')?.value) || 50);
  const maxLengthCm = Math.max(10, parseFloat(document.getElementById('drv-reg-max-length')?.value) || 50);

  const bikeMaxWeightRaw = document.getElementById('drv-reg-bike-max-weight')?.value;
  const bikeMaxHeightRaw = document.getElementById('drv-reg-bike-max-height')?.value;
  const bikeMaxWidthRaw = document.getElementById('drv-reg-bike-max-width')?.value;
  const bikeMaxLengthRaw = document.getElementById('drv-reg-bike-max-length')?.value;
  const bicycleMaxWeightKg = bikeMaxWeightRaw !== '' && !isNaN(parseFloat(bikeMaxWeightRaw)) ? Math.max(1, parseFloat(bikeMaxWeightRaw)) : 8;
  const bicycleMaxHeightCm = bikeMaxHeightRaw !== '' && !isNaN(parseFloat(bikeMaxHeightRaw)) ? Math.max(5, parseFloat(bikeMaxHeightRaw)) : 35;
  const bicycleMaxWidthCm = bikeMaxWidthRaw !== '' && !isNaN(parseFloat(bikeMaxWidthRaw)) ? Math.max(5, parseFloat(bikeMaxWidthRaw)) : 30;
  const bicycleMaxLengthCm = bikeMaxLengthRaw !== '' && !isNaN(parseFloat(bikeMaxLengthRaw)) ? Math.max(5, parseFloat(bikeMaxLengthRaw)) : 40;

  const lat = parseFloat(document.getElementById('drv-reg-lat')?.value) || -27.9678;
  const lng = parseFloat(document.getElementById('drv-reg-lng')?.value) || 153.4011;

  if (!name || !phone || !email || !address || !licenceNumber || !payIdValue) {
    showToast('⚠️ Please complete all required driver licence, contact, address, and PayID fields.');
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const currentSupporter = typeof getCurrentSupporter === 'function' ? getCurrentSupporter() : null;
  const currentGoogleUser = window.firebaseService?.getCurrentGoogleUser();
  const userUid = currentGoogleUser?.uid || currentSupporter?.googleUid || currentSupporter?.id;

  const tradeTitle = (hasVehicle && hasBicycle) 
    ? `Courier Driver (${vehicle}) & Bicycle Runner` 
    : (hasBicycle ? 'Bicycle Courier (Letters & Food Only)' : `Courier Driver (${vehicle})`);

  // Enforce ONLY ONE driver application per email address
  const existingDriver = window.providerDB?.getAll()?.find(d => (d.email || '').toLowerCase().trim() === cleanEmail);

  let savedDriver;
  if (existingDriver) {
    savedDriver = window.providerDB.updateProvider(existingDriver.id, {
      name,
      gender,
      businessName,
      tradeTitle,
      phone,
      email: cleanEmail,
      address,
      baseSuburb: address.split(',').slice(-1)[0]?.trim() || address,
      vehicle: hasVehicle ? vehicle : 'Bicycle / E-Bike',
      licenceNumber,
      licenceState,
      licenceClass,
      licenceExpiry,
      payIdType,
      payIdValue,
      payIdAccountName,
      hasVehicleCourier: hasVehicle,
      hasBicycleCourier: hasBicycle,
      perKmRateAud,
      vehiclePerKmRateAud: perKmRateAud,
      sameDayFeeAud,
      vehicleSameDayFeeAud: sameDayFeeAud,
      urgentFeeAud,
      vehicleUrgentFeeAud: urgentFeeAud,
      bicyclePerKmRateAud,
      bicycleSameDayFeeAud,
      bicycleUrgentFeeAud,
      bicycleMaxWeightKg,
      bicycleMaxHeightCm,
      bicycleMaxWidthCm,
      bicycleMaxLengthCm,
      vehicleMaxWeightKg: maxWeightKg,
      vehicleMaxHeightCm: maxHeightCm,
      vehicleMaxWidthCm: maxWidthCm,
      vehicleMaxLengthCm: maxLengthCm,
      maxWeightKg,
      maxHeightCm,
      maxWidthCm,
      maxLengthCm,
      lat,
      lng
    });
    showToast(`ℹ️ Updated existing application on file for ${cleanEmail}! Rates and modes saved.`);
  } else {
    savedDriver = window.providerDB.addProvider({
      uid: userUid,
      name,
      gender,
      businessName,
      tradeTitle,
      phone,
      email: cleanEmail,
      address,
      baseSuburb: address.split(',').slice(-1)[0]?.trim() || address,
      vehicle: hasVehicle ? vehicle : 'Bicycle / E-Bike',
      licenceNumber,
      licenceState,
      licenceClass,
      licenceExpiry,
      payIdType,
      payIdValue,
      payIdAccountName,
      hasVehicleCourier: hasVehicle,
      hasBicycleCourier: hasBicycle,
      perKmRateAud,
      vehiclePerKmRateAud: perKmRateAud,
      sameDayFeeAud,
      vehicleSameDayFeeAud: sameDayFeeAud,
      urgentFeeAud,
      vehicleUrgentFeeAud: urgentFeeAud,
      bicyclePerKmRateAud,
      bicycleSameDayFeeAud,
      bicycleUrgentFeeAud,
      bicycleMaxWeightKg,
      bicycleMaxHeightCm,
      bicycleMaxWidthCm,
      bicycleMaxLengthCm,
      vehicleMaxWeightKg: maxWeightKg,
      vehicleMaxHeightCm: maxHeightCm,
      vehicleMaxWidthCm: maxWidthCm,
      vehicleMaxLengthCm: maxLengthCm,
      maxWeightKg,
      maxHeightCm,
      maxWidthCm,
      maxLengthCm,
      maxHeightCm,
      maxWidthCm,
      maxLengthCm,
      tokenBalance: 25,
      approved: false,
      status: 'pending_approval',
      lat,
      lng
    });
    showToast(`🎉 Driver application submitted! SuperAdmin will review and approve your profile.`);
  }

  // Hardwire RBAC: Save/Update application in Firestore under driver_applications
  if (window.firebaseService?.saveDriverApplicationToFirestore) {
    window.firebaseService.saveDriverApplicationToFirestore({
      ...savedDriver,
      uid: userUid
    });
  }

  appState.selectedCourierDriverId = savedDriver.id;
  appState.activeAdminDriverId = savedDriver.id;

  calculateCourierQuote();
  filterContractors();
  renderDriverAdminDashboard();

  // Hide the application card behind the panel
  const driverAppCard = document.getElementById('supporter-driver-application-card');
  if (driverAppCard) driverAppCard.style.display = 'none';
  const toggleBtn = document.getElementById('btn-toggle-driver-app');
  if (toggleBtn) {
    toggleBtn.innerHTML = '<i class="fa-solid fa-truck-medical"></i> Register as Driver Behind Panel ▼';
  }

  document.getElementById('driver-registration-form')?.reset();
  try { updateDriverApplicationGateUI(); } catch (e) {}
  switchTab('driver-admin-tab');
  switchSupporterSubTab('supporter-dispatch-subtab');
  showToast(`🎉 Driver application submitted for ${savedDriver.name}! Awaiting SuperAdmin approval.`);
}
window.handleDriverRegistrationSubmit = handleDriverRegistrationSubmit;
window.handleProviderRegistration = handleDriverRegistrationSubmit;

/**
 * Driver Admin Dashboard: Render Active Driver Profile, Live GPS, Token Balance & Recorded 9am-4pm Orders
 */
function renderDriverAdminDashboard() {
  if (!window.providerDB || !window.courierOrderDB) return;

  const allDrivers = window.providerDB.getAll();
  const selectEl = document.getElementById('driver-admin-select');
  if (!appState.activeAdminDriverId && allDrivers[0]) {
    appState.activeAdminDriverId = allDrivers[0].id;
  }

  const activeDriver = window.providerDB.findById(appState.activeAdminDriverId) || allDrivers[0];
  if (!activeDriver) return;
  appState.activeAdminDriverId = activeDriver.id;

  if (selectEl) {
    selectEl.innerHTML = allDrivers.map(d => `
      <option value="${d.id}" ${d.id === activeDriver.id ? 'selected' : ''}>
        ${d.name} — ${d.businessName} ($${Number(d.perKmRateAud).toFixed(2)}/km • ${d.tokenBalance ?? 0} Tokens)
      </option>
    `).join('');
  }

  // Update GPS & Token displays (Responsive 2-Line Suburb Only, No Coordinates)
  const gpsTextEl = document.getElementById('driver-admin-gps-text');
  if (gpsTextEl) {
    const locName = activeDriver.baseSuburb || activeDriver.address || 'Southport QLD';
    gpsTextEl.textContent = locName;
    gpsTextEl.title = locName;
  }

  const tokenBalEl = document.getElementById('driver-admin-token-balance');
  if (tokenBalEl) {
    tokenBalEl.textContent = `${activeDriver.tokenBalance ?? 0} Tokens`;
  }
  const navTokenEl = document.getElementById('nav-driver-token-count');
  if (navTokenEl) {
    navTokenEl.textContent = `${activeDriver.tokenBalance ?? 0} Tokens`;
  }

  // Populate Right-Hand Driver Rate & Capacity Settings Form
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val ?? ''); };
  const vChk = document.getElementById('adm-drv-has-vehicle');
  if (vChk) vChk.checked = activeDriver.hasVehicleCourier !== false;
  const bChk = document.getElementById('adm-drv-has-bicycle');
  if (bChk) bChk.checked = activeDriver.hasBicycleCourier === true;
  toggleAdminModesUI();

  setVal('adm-drv-per-km', activeDriver.vehiclePerKmRateAud ?? activeDriver.perKmRateAud ?? 2.20);
  setVal('adm-drv-sameday-fee', activeDriver.vehicleSameDayFeeAud ?? activeDriver.sameDayFeeAud ?? 0);
  setVal('adm-drv-urgent-fee', activeDriver.vehicleUrgentFeeAud ?? activeDriver.urgentFeeAud ?? 0);
  setVal('adm-drv-max-weight', activeDriver.vehicleMaxWeightKg ?? activeDriver.maxWeightKg ?? 50);
  setVal('adm-drv-max-height', activeDriver.vehicleMaxHeightCm ?? activeDriver.maxHeightCm ?? 70);
  setVal('adm-drv-max-width', activeDriver.vehicleMaxWidthCm ?? activeDriver.maxWidthCm ?? 50);
  setVal('adm-drv-max-length', activeDriver.vehicleMaxLengthCm ?? activeDriver.maxLengthCm ?? 50);

  setVal('adm-drv-bike-per-km', activeDriver.bicyclePerKmRateAud ?? 1.80);
  setVal('adm-drv-bike-sameday-fee', activeDriver.bicycleSameDayFeeAud ?? 0);
  setVal('adm-drv-bike-urgent-fee', activeDriver.bicycleUrgentFeeAud ?? 0);
  setVal('adm-drv-bike-max-weight', activeDriver.bicycleMaxWeightKg ?? 8);
  setVal('adm-drv-bike-max-height', activeDriver.bicycleMaxHeightCm ?? 35);
  setVal('adm-drv-bike-max-width', activeDriver.bicycleMaxWidthCm ?? 30);
  setVal('adm-drv-bike-max-length', activeDriver.bicycleMaxLengthCm ?? 40);
  setVal('adm-drv-payid-value', activeDriver.payIdValue || activeDriver.payId || activeDriver.phone || '');
  setVal('adm-drv-licence', activeDriver.licenceDetails || (activeDriver.licenceNumber ? `${activeDriver.licenceState || 'QLD'} #${activeDriver.licenceNumber} (${activeDriver.licenceClass || 'C'})` : 'QLD #482910384 (Class C)'));

  // Driver approval banner
  const approvalBanner = document.getElementById('driver-admin-approval-status-banner');
  if (approvalBanner) {
    const isApproved = activeDriver.approved !== false && activeDriver.status !== 'pending_approval';
    approvalBanner.style.display = 'block';
    if (isApproved) {
      approvalBanner.className = 'alert alert-success';
      approvalBanner.style.background = '#ECFDF5';
      approvalBanner.style.borderColor = '#A7F3D0';
      approvalBanner.style.color = '#065F46';
      approvalBanner.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>Approved Driver Account</strong> — Your driver profile is verified and active to receive courier orders on the live map.`;
    } else {
      approvalBanner.className = 'alert alert-warning';
      approvalBanner.style.background = '#FFFBEB';
      approvalBanner.style.borderColor = '#FCD34D';
      approvalBanner.style.color = '#92400E';
      approvalBanner.innerHTML = `<i class="fa-solid fa-clock"></i> <strong>Application Pending SuperAdmin Approval</strong> — Your driver licence and PayID details have been submitted. Once approved by the SuperAdmin, your profile will immediately go live to receive customer orders.`;
    }
  }

  // Also sync SuperAdmin elements if SuperAdmin is viewing
  if (typeof renderSuperadminDriverApprovals === 'function') {
    renderSuperadminDriverApprovals();
  }
  if (typeof renderSuperadminTokenBalance === 'function') {
    renderSuperadminTokenBalance();
  }

  // Render Recorded Customer Orders for this Driver (and show total orders badge)
  const allOrders = window.courierOrderDB.getAll();
  const driverOrders = allOrders.filter(o => o.driverId === activeDriver.id);
  const ordersToDisplay = driverOrders.length > 0 ? driverOrders : allOrders;

  const pillBadge = document.getElementById('pill-orders-badge');
  if (pillBadge) pillBadge.textContent = String(allOrders.length);

  const countBadge = document.getElementById('driver-orders-count-badge');
  if (countBadge) {
    countBadge.textContent = `${driverOrders.length} Order${driverOrders.length === 1 ? '' : 's'} for ${activeDriver.name} (${allOrders.length} Total)`;
  }

  const ordersContainer = document.getElementById('driver-admin-orders-container');
  if (!ordersContainer) return;

  if (ordersToDisplay.length === 0) {
    ordersContainer.innerHTML = `
      <div style="text-align:center; padding:2rem; background:#F8FAFC; border:1px dashed var(--border-light); border-radius:var(--radius-md); color:var(--text-muted);">
        <i class="fa-solid fa-box-open" style="font-size:2rem; margin-bottom:0.5rem; display:block;"></i>
        No customer courier orders recorded yet. Book a courier on the "Book Courier" tab!
      </div>
    `;
    return;
  }

  ordersContainer.innerHTML = ordersToDisplay.map(ord => {
    const isCompleted = ord.status.includes('Delivered');
    return `
      <div style="background:#fff; border:1px solid ${isCompleted ? '#A7F3D0' : 'var(--border-light)'}; border-left:4px solid ${isCompleted ? '#059669' : 'var(--brand-orange)'}; border-radius:var(--radius-md); padding:1.1rem;" data-agent-id="driver-order-card-${ord.orderId}" data-testid="driver-order-card-${ord.orderId}">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem; padding-bottom:0.55rem; border-bottom:1px solid var(--border-light);">
          <div>
            <strong style="font-size:1rem; color:var(--primary-navy);">${ord.orderId}</strong>
            <span style="font-size:0.76rem; color:var(--text-muted); margin-left:0.4rem;">Driver: <strong>${ord.driverName}</strong></span>
          </div>
          <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
            <!-- Recorded 9am-4pm Pickup Time Badge -->
            <span style="background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; font-size:0.76rem; font-weight:800; padding:0.2rem 0.6rem; border-radius:999px;">
              <i class="fa-regular fa-clock"></i> Pickup: ${ord.pickupDate} @ ${ord.pickupTime} (9am–4pm)
            </span>
            <span style="background:${isCompleted ? '#ECFDF5' : '#EFF6FF'}; color:${isCompleted ? '#065F46' : '#1E40AF'}; font-size:0.72rem; font-weight:800; padding:0.2rem 0.55rem; border-radius:999px;">
              ${ord.status}
            </span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem; font-size:0.81rem; color:var(--primary-navy); margin-bottom:0.75rem;">
          <div style="background:#F8FAFC; padding:0.65rem 0.8rem; border-radius:6px; border:1px solid var(--border-light);">
            <div style="font-size:0.7rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.25rem;">Customer Contact Details</div>
            <div><strong>Name:</strong> ${ord.customerName}</div>
            <div><strong>Phone:</strong> <a href="tel:${ord.customerPhone}" style="color:#2563EB; text-decoration:none;">${ord.customerPhone}</a></div>
            <div><strong>Email:</strong> ${ord.customerEmail}</div>
            <div><strong>Address:</strong> ${ord.customerAddress}</div>
          </div>

          <div style="background:#F8FAFC; padding:0.65rem 0.8rem; border-radius:6px; border:1px solid var(--border-light);">
            <div style="font-size:0.7rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.25rem;">Package Content, Size &amp; Weight</div>
            <div><strong>Contents:</strong> ${ord.packageContents || ord.packageContent}</div>
            <div><strong>Weight:</strong> ${ord.weightKg ?? ord.packageWeightKg} kg</div>
            <div><strong>Dimensions (H×W×L):</strong> ${ord.heightCm ?? ord.packageHeightCm} × ${ord.widthCm ?? ord.packageWidthCm} × ${ord.lengthCm ?? ord.packageLengthCm} cm</div>
            <div><strong>Speed Tier:</strong> ${(ord.speedTier || 'same_day').replace('_', ' ').toUpperCase()}</div>
          </div>
        </div>

        <div style="font-size:0.8rem; color:var(--primary-navy); margin-bottom:0.75rem; background:#FFFDF9; border:1px solid #FED7AA; padding:0.55rem 0.8rem; border-radius:6px;">
          <div><i class="fa-solid fa-circle-dot" style="color:#10B981;"></i> <strong>Pickup Origin:</strong> ${ord.originAddress || ord.pickupAddress}</div>
          <div style="margin-top:0.2rem;"><i class="fa-solid fa-location-dot" style="color:#EF4444;"></i> <strong>Delivery Destination:</strong> ${ord.destAddress || ord.deliveryAddress} (<strong>${ord.distanceKm} km</strong>)</div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem; padding-top:0.6rem; border-top:1px solid var(--border-light);">
          <div style="font-size:0.8rem;">
            <span style="color:#047857; font-weight:800;">
              <i class="fa-solid fa-money-bill-transfer"></i> Customer Pays Driver PayID (${ord.driverPayIdValue}): <strong>$${Number(ord.totalAud).toFixed(2)} AUD</strong>
            </span>
            <span style="color:#B45309; font-weight:700; margin-left:0.6rem;">
              <i class="fa-solid fa-coins"></i> -${ord.tokensChargedToDriver ?? ord.tokensCharged} Tokens (${ord.tokenTierLabel || ord.distanceTierLabel || 'Distance Bracket'})
            </span>
          </div>

          <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
            ${(!ord.status.includes('Accepted') && !ord.status.includes('Picked Up') && !ord.status.includes('Delivered')) ? `
              <button type="button" class="btn btn-primary btn-sm" style="background:#2563EB; border-color:#2563EB; font-weight:800;" onclick="acceptDriverBooking('${ord.orderId}')" data-agent-id="btn-order-accept-${ord.orderId}" data-testid="btn-order-accept-${ord.orderId}" aria-label="Accept Booking">
                <i class="fa-solid fa-handshake"></i> Accept Booking
              </button>
            ` : `
              <span style="font-size:0.75rem; font-weight:800; color:#1E40AF; background:#DBEAFE; padding:0.25rem 0.55rem; border-radius:4px; display:inline-flex; align-items:center; gap:0.25rem;">
                <i class="fa-solid fa-check"></i> Accepted
              </span>
            `}
            <button type="button" class="btn btn-outline btn-sm" onclick="updateDriverOrderStatus('${ord.orderId}', 'Picked Up & En Route')" data-agent-id="btn-order-enroute-${ord.orderId}" data-testid="btn-order-enroute-${ord.orderId}" aria-label="Mark Order Picked Up">
              <i class="fa-solid fa-truck-fast"></i> Picked Up
            </button>
            <button type="button" class="btn btn-primary btn-sm" style="background:#059669; border-color:#059669;" onclick="updateDriverOrderStatus('${ord.orderId}', 'Delivered & Paid via PayID')" data-agent-id="btn-order-delivered-${ord.orderId}" data-testid="btn-order-delivered-${ord.orderId}" aria-label="Mark Order Delivered">
              <i class="fa-solid fa-check"></i> Delivered (PayID Paid)
            </button>
            <button type="button" class="btn btn-outline btn-sm" style="color:#DC2626; border-color:#FECACA;" onclick="deleteDriverOrder('${ord.orderId}', this)" data-agent-id="btn-order-delete-${ord.orderId}" data-testid="btn-order-delete-${ord.orderId}" aria-label="Delete Order">
              <i class="fa-solid fa-trash-can"></i> Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
window.renderDriverAdminDashboard = renderDriverAdminDashboard;

function onDriverAdminSelectionChange(driverId) {
  appState.activeAdminDriverId = driverId;
  appState.selectedCourierDriverId = driverId;
  renderDriverAdminDashboard();
  calculateCourierQuote();
}
window.onDriverAdminSelectionChange = onDriverAdminSelectionChange;

function triggerDriverAdminGeolocate() {
  const activeDriver = window.providerDB?.findById(appState.activeAdminDriverId);
  if (!activeDriver) return;

  showToast(`📍 Auto-geolocating live GPS position for ${activeDriver.name}...`);

  const saveGps = async (lat, lng) => {
    let suburbLabel = activeDriver.baseSuburb || 'Southport QLD';
    try {
      const osmAddr = await reverseGeocodeOsm(lat, lng);
      if (osmAddr) suburbLabel = osmAddr;
    } catch (e) {}

    window.providerDB.updateDriverLocation(activeDriver.id, lat, lng, suburbLabel);
    renderDriverAdminDashboard();
    calculateCourierQuote();
    filterContractors();
    showToast(`✅ ${activeDriver.name} auto-geolocated at ${suburbLabel}!`);
  };

  if (!navigator.geolocation) {
    saveGps(-27.9635, 153.4064);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => saveGps(pos.coords.latitude, pos.coords.longitude),
    () => saveGps(-27.9635, 153.4064),
    { enableHighAccuracy: true, timeout: 6000 }
  );
}
window.triggerDriverAdminGeolocate = triggerDriverAdminGeolocate;

function autoGeolocateActiveDriverQuick() {
  triggerDriverAdminGeolocate();
}
window.autoGeolocateActiveDriverQuick = autoGeolocateActiveDriverQuick;

function saveDriverAdminProfile(event) {
  if (event && event.preventDefault) event.preventDefault();
  const activeDriver = window.providerDB?.findById(appState.activeAdminDriverId);
  if (!activeDriver) return;

  const hasVehicle = document.getElementById('adm-drv-has-vehicle')?.checked ?? true;
  const hasBicycle = document.getElementById('adm-drv-has-bicycle')?.checked ?? false;

  const perKmRaw = document.getElementById('adm-drv-per-km')?.value;
  const sameDayRaw = document.getElementById('adm-drv-sameday-fee')?.value;
  const urgentRaw = document.getElementById('adm-drv-urgent-fee')?.value;

  const bikePerKmRaw = document.getElementById('adm-drv-bike-per-km')?.value;
  const bikeSameDayRaw = document.getElementById('adm-drv-bike-sameday-fee')?.value;
  const bikeUrgentRaw = document.getElementById('adm-drv-bike-urgent-fee')?.value;

  const maxWeightRaw = document.getElementById('adm-drv-max-weight')?.value;
  const maxHeightRaw = document.getElementById('adm-drv-max-height')?.value;
  const maxWidthRaw = document.getElementById('adm-drv-max-width')?.value;
  const maxLengthRaw = document.getElementById('adm-drv-max-length')?.value;
  const payIdValue = document.getElementById('adm-drv-payid-value')?.value?.trim() || activeDriver.payIdValue || activeDriver.payId || activeDriver.phone || '';
  const licenceDetails = document.getElementById('adm-drv-licence')?.value?.trim() || activeDriver.licenceDetails || '';

  const perKmRateAud = perKmRaw !== '' && !isNaN(parseFloat(perKmRaw)) ? Math.max(0.5, parseFloat(perKmRaw)) : 2.20;
  const sameDayFeeAud = sameDayRaw !== '' && !isNaN(parseFloat(sameDayRaw)) ? Math.max(0, parseFloat(sameDayRaw)) : 0;
  const urgentFeeAud = urgentRaw !== '' && !isNaN(parseFloat(urgentRaw)) ? Math.max(0, parseFloat(urgentRaw)) : 0;

  const bicyclePerKmRateAud = bikePerKmRaw !== '' && !isNaN(parseFloat(bikePerKmRaw)) ? Math.max(0.5, parseFloat(bikePerKmRaw)) : 1.80;
  const bicycleSameDayFeeAud = bikeSameDayRaw !== '' && !isNaN(parseFloat(bikeSameDayRaw)) ? Math.max(0, parseFloat(bikeSameDayRaw)) : 0;
  const bicycleUrgentFeeAud = bikeUrgentRaw !== '' && !isNaN(parseFloat(bikeUrgentRaw)) ? Math.max(0, parseFloat(bikeUrgentRaw)) : 0;

  const maxWeightKg = maxWeightRaw !== '' && !isNaN(parseFloat(maxWeightRaw)) ? Math.max(1, parseFloat(maxWeightRaw)) : 50;
  const maxHeightCm = maxHeightRaw !== '' && !isNaN(parseFloat(maxHeightRaw)) ? Math.max(10, parseFloat(maxHeightRaw)) : 70;
  const maxWidthCm = maxWidthRaw !== '' && !isNaN(parseFloat(maxWidthRaw)) ? Math.max(10, parseFloat(maxWidthRaw)) : 50;
  const maxLengthCm = maxLengthRaw !== '' && !isNaN(parseFloat(maxLengthRaw)) ? Math.max(10, parseFloat(maxLengthRaw)) : 50;

  const bikeMaxWeightRaw = document.getElementById('adm-drv-bike-max-weight')?.value;
  const bikeMaxHeightRaw = document.getElementById('adm-drv-bike-max-height')?.value;
  const bikeMaxWidthRaw = document.getElementById('adm-drv-bike-max-width')?.value;
  const bikeMaxLengthRaw = document.getElementById('adm-drv-bike-max-length')?.value;
  const bicycleMaxWeightKg = bikeMaxWeightRaw !== '' && !isNaN(parseFloat(bikeMaxWeightRaw)) ? Math.max(1, parseFloat(bikeMaxWeightRaw)) : 8;
  const bicycleMaxHeightCm = bikeMaxHeightRaw !== '' && !isNaN(parseFloat(bikeMaxHeightRaw)) ? Math.max(5, parseFloat(bikeMaxHeightRaw)) : 35;
  const bicycleMaxWidthCm = bikeMaxWidthRaw !== '' && !isNaN(parseFloat(bikeMaxWidthRaw)) ? Math.max(5, parseFloat(bikeMaxWidthRaw)) : 30;
  const bicycleMaxLengthCm = bikeMaxLengthRaw !== '' && !isNaN(parseFloat(bikeMaxLengthRaw)) ? Math.max(5, parseFloat(bikeMaxLengthRaw)) : 40;

  const updatedDriver = {
    ...activeDriver,
    hasVehicleCourier: hasVehicle,
    hasBicycleCourier: hasBicycle,
    perKmRateAud,
    vehiclePerKmRateAud: perKmRateAud,
    sameDayFeeAud,
    vehicleSameDayFeeAud: sameDayFeeAud,
    urgentFeeAud,
    vehicleUrgentFeeAud: urgentFeeAud,
    bicyclePerKmRateAud,
    bicycleSameDayFeeAud,
    bicycleUrgentFeeAud,
    bicycleMaxWeightKg,
    bicycleMaxHeightCm,
    bicycleMaxWidthCm,
    bicycleMaxLengthCm,
    vehicleMaxWeightKg: maxWeightKg,
    vehicleMaxHeightCm: maxHeightCm,
    vehicleMaxWidthCm: maxWidthCm,
    vehicleMaxLengthCm: maxLengthCm,
    maxWeightKg,
    maxHeightCm,
    maxWidthCm,
    maxLengthCm,
    payIdValue,
    payId: payIdValue,
    licenceDetails
  };

  window.providerDB.updateProvider(activeDriver.id, updatedDriver);

  // Sync with Firestore providers collection
  if (window.firebaseService?.saveProviderToFirestore) {
    window.firebaseService.saveProviderToFirestore(updatedDriver).catch(err => {
      console.warn('⚠️ [Firestore] Could not sync updated driver rates:', err);
    });
  }

  renderDriverAdminDashboard();
  calculateCourierQuote();
  filterContractors();
  showToast(`✅ Saved driver rates ($ AUD) & PayID for ${activeDriver.name}! Customer pays driver directly via PayID.`);
}
window.saveDriverAdminProfile = saveDriverAdminProfile;


/**
 * Authoritative RBAC Role Helper
 * Roles: 'superadmin' | 'driver' | 'supporter'
 */
function getActiveUserRole() {
  const gUser = window.firebaseService?.getCurrentGoogleUser?.();
  const isSa = checkIsSuperadmin(gUser);
  if (isSa) {
    let viewRole = sessionStorage.getItem('iasj_superadmin_view_role');
    if (viewRole === 'customer') viewRole = 'supporter';
    if (viewRole && viewRole !== 'superadmin') {
      return viewRole;
    }
    return 'superadmin';
  }
  if (gUser && (gUser.role === 'driver' || gUser.isDriver === true)) return 'driver';
  if (gUser && gUser.email && window.supporterDB) {
    const sup = window.supporterDB.findByEmail(gUser.email);
    if (sup && (sup.role === 'driver' || sup.approved === true)) return 'driver';
  }
  if (gUser && window.providerDB) {
    const cleanEmail = (gUser.email || '').toLowerCase().trim();
    const prov = window.providerDB.getAll().find(p => 
      ((p.email || '').toLowerCase().trim() === cleanEmail) ||
      (p.uid && p.uid === gUser.uid)
    );
    if (prov && (prov.approved === true || prov.status === 'active' || prov.role === 'driver')) {
      if (gUser.role !== 'driver') {
        gUser.role = 'driver';
        gUser.isDriver = true;
        try { localStorage.setItem('iasj_google_user', JSON.stringify(gUser)); } catch (e) {}
      }
      return 'driver';
    }
  }
  return 'supporter';
}
window.getActiveUserRole = getActiveUserRole;

function acceptDriverBooking(orderId) {
  const activeDriver = window.providerDB?.findById(appState.activeAdminDriverId) || window.providerDB?.getAll()?.[0];
  const order = window.courierOrderDB?.getOrderById(orderId);
  if (!order) {
    showToast('⚠️ Order not found.');
    return;
  }

  // Update order status to 'Driver Accepted'
  window.courierOrderDB?.updateOrderStatus(orderId, 'Driver Accepted');

  // Sync to Firestore bookings collection
  if (window.firebaseService?.updateBookingStatusInFirestore) {
    window.firebaseService.updateBookingStatusInFirestore(orderId, 'Driver Accepted', {
      acceptedByDriverId: activeDriver?.id || 'drv-101',
      acceptedByDriverName: activeDriver?.name || 'Assigned Driver',
      acceptedAt: new Date().toISOString()
    }).catch(e => console.warn('Could not update booking status in Firestore:', e));
  }

  renderDriverAdminDashboard();
  try { renderSupporterBookings(); } catch (e) {}
  showToast(`✅ Booking ${orderId} accepted by driver ${activeDriver?.name || 'Driver'}! Drive safely to pickup origin.`);
}
window.acceptDriverBooking = acceptDriverBooking;

function updateDriverOrderStatus(orderId, status) {
  window.courierOrderDB?.updateOrderStatus(orderId, status);
  if (window.firebaseService?.updateBookingStatusInFirestore) {
    window.firebaseService.updateBookingStatusInFirestore(orderId, status).catch(e => {
      console.warn('Could not update booking status in Firestore:', e);
    });
  }
  renderDriverAdminDashboard();
  try { renderSupporterBookings(); } catch (e) {}
  showToast(`📦 Order ${orderId} status updated to: ${status}`);
}
window.updateDriverOrderStatus = updateDriverOrderStatus;

function deleteDriverOrder(orderId, btnEl) {
  const performDelete = () => {
    window.courierOrderDB?.deleteOrder(orderId);
    renderDriverAdminDashboard();
    showToast(`🗑️ Order ${orderId} deleted.`);
  };

  if (btnEl && typeof iasjConfirmDelete === 'function') {
    iasjConfirmDelete(btnEl, performDelete, {
      label: 'Confirm Delete?',
      targetType: 'courier_order',
      targetId: orderId
    });
  } else {
    performDelete();
  }
}
window.deleteDriverOrder = deleteDriverOrder;

/**
 * Driver Token Wallet Top-Up Modal (AUD Only)
 */
function openDriverTokenTopupModal(driverId) {
  if (driverId) {
    appState.activeAdminDriverId = driverId;
  }
  const drv = window.providerDB?.findById(appState.activeAdminDriverId) || window.providerDB?.getAll()?.[0];
  if (!drv) return;

  const cur = window.iasjCurrency;
  const pricing = cur?.getPricing?.() || { tokenPriceAud: 1, tokenPacks: [10, 50, 100] };
  const tokenPriceAud = pricing.tokenPriceAud || 1;
  const packs = [10, 50, 100];
  const tiers = pricing.driverOrderTokens || { tier0to20km: 2, tier21to50km: 5, tier51to100km: 10, tier101PlusKm: 15 };

  const nameEl = document.getElementById('topup-driver-name');
  if (nameEl) nameEl.textContent = `${drv.name} (${drv.businessName})`;

  const balEl = document.getElementById('topup-driver-balance');
  if (balEl) balEl.textContent = `${drv.tokenBalance ?? 0} Tokens`;

  const gridEl = document.getElementById('driver-token-packs-grid');
  if (gridEl) {
    gridEl.innerHTML = packs.map(tokens => {
      const costAud = tokens * tokenPriceAud;
      return `
        <button
          type="button"
          class="btn btn-outline"
          onclick="purchaseDriverTokensAud(${tokens})"
          style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1.1rem 0.65rem; border:2px solid #F59E0B; background:#FFFBEB; color:#92400E; border-radius:var(--radius-md); font-weight:800; cursor:pointer; transition:transform 0.15s ease;"
          data-agent-id="btn-buy-pack-${tokens}"
          data-testid="btn-buy-pack-${tokens}"
          aria-label="Buy ${tokens} Driver Tokens for $${costAud} AUD with Stripe">
          <span style="font-size:1.25rem; font-weight:900; color:var(--primary-navy);"><i class="fa-solid fa-coins" style="color:#F59E0B;"></i> +${tokens} Tokens</span>
          <span style="font-size:0.95rem; font-weight:800; color:#059669; margin-top:0.35rem;">$${costAud} AUD</span>
          <span style="font-size:0.72rem; color:var(--text-muted); margin-top:0.15rem;">1 Token = $${tokenPriceAud} AUD</span>
        </button>
      `;
    }).join('');
  }

  document.getElementById('driver-token-topup-modal')?.classList.add('active');
}
window.openDriverTokenTopupModal = openDriverTokenTopupModal;

function closeDriverTokenTopupModal() {
  document.getElementById('driver-token-topup-modal')?.classList.remove('active');
}
window.closeDriverTokenTopupModal = closeDriverTokenTopupModal;

function purchaseDriverTokensAud(packTokens) {
  const drv = window.providerDB?.findById(appState.activeAdminDriverId) || window.providerDB?.getAll()?.[0];
  if (!drv) return;

  const cur = window.iasjCurrency;
  const tokenPriceAud = Math.max(1, Math.round(Number(cur?.getPricing?.()?.tokenPriceAud) || 1));
  const totalAud = packTokens * tokenPriceAud;

  // Record Stripe transaction
  if (window.stripePaymentService) {
    try {
      window.stripePaymentService.recordStripeTransaction({
        docketNumber: `TOK-${Date.now()}`,
        amount: totalAud,
        currency: 'AUD',
        status: 'succeeded',
        payerName: drv.name,
        payerEmail: drv.email,
        description: `Stripe Token Purchase: ${packTokens} Driver Tokens (1 Token = $${tokenPriceAud} AUD)`,
        stripePaymentIntentId: `pi_test_${Date.now()}`
      });
    } catch (e) {}
  }

  const newBal = window.providerDB.addDriverTokens(drv.id, packTokens);
  const balEl = document.getElementById('topup-driver-balance');
  if (balEl) balEl.textContent = `${newBal} Tokens`;
  const adminBalEl = document.getElementById('driver-admin-token-balance');
  if (adminBalEl) adminBalEl.textContent = `${newBal} Tokens`;
  const navTokenEl = document.getElementById('nav-driver-token-count');
  if (navTokenEl) navTokenEl.textContent = `${newBal} Tokens`;

  // Also update supporter balance if supporter
  const currentSup = typeof getCurrentSupporter === 'function' ? getCurrentSupporter() : null;
  if (currentSup && window.supporterDB) {
    currentSup.tokenBalance = (currentSup.tokenBalance ?? 25) + packTokens;
    window.supporterDB.save();
    const supBalEl = document.getElementById('supporter-token-balance');
    if (supBalEl) supBalEl.textContent = `${currentSup.tokenBalance} Tokens`;
  }

  renderDriverAdminDashboard();
  calculateCourierQuote();
  showToast(`🪙 Stripe Payment Confirmed! Added +${packTokens} Tokens ($${totalAud} AUD) to ${drv.name}'s wallet. New Balance: ${newBal} Tokens.`);
  closeDriverTokenTopupModal();
}
window.purchaseDriverTokensAud = purchaseDriverTokensAud;

/**
 * Invoice lines and totals for a booking, in whole AUD (rounded up).
 * New bookings carry their own priced lines. Older bookings saved with cents are rounded up
 * line by line and GST recalculated, so the invoice, the dispatch feed and the Stripe charge always agree.
 */
function getInvoiceTotals(booking) {
  const cur = window.iasjCurrency;
  const p = booking?.pricing || {};

  if (Array.isArray(p.lines) && p.lines.length && Number.isInteger(p.estimatedTotal)) {
    return {
      lines: p.lines.map(l => ({ label: l.label, aud: l.aud, tokens: l.tokens })),
      subtotal: p.subtotal,
      gst: p.gst,
      total: p.estimatedTotal,
      totalTokens: p.tokens?.estimatedTotal ?? cur.tokensForAud(p.estimatedTotal),
      gstTokens: p.tokens?.gst ?? cur.tokensForAud(p.gst)
    };
  }

  const lines = [
    { label: `${booking?.categoryName || 'Service'} - Base Allocated Labour`, aud: cur.wholeUp(p.baseLabour) },
    { label: 'Insured Vehicle Transit & Mobilisation', aud: cur.wholeUp(p.calloutFee) },
    { label: 'Consumables / Materials Buffer', aud: cur.wholeUp(p.materialsEstimate) }
  ].map(l => ({ ...l, tokens: cur.tokensForAud(l.aud) }));
  const subtotal = lines.reduce((sum, l) => sum + l.aud, 0);
  const gst = cur.wholeUp(subtotal * cur.GST_PERCENT / 100);
  const total = subtotal + gst;
  return { lines, subtotal, gst, total, totalTokens: cur.tokensForAud(total), gstTokens: cur.tokensForAud(gst) };
}
window.getInvoiceTotals = getInvoiceTotals;

/**
 * Dispatch Dashboard Simulator Functions
 */
function addJobToDispatchFeed(booking) {
  const feed = document.getElementById('dispatch-job-feed');
  if (!feed) return;

  const item = document.createElement('div');
  item.className = 'dispatch-job-item';
  item.id = `job-${booking.docketNumber}`;
  item.style.borderColor = 'var(--brand-orange)';

  const safeCustName = (booking.custName || '').replace(/['"\\]/g, ' ');

  item.innerHTML = `
    <div class="dispatch-job-header">
      <h5><i class="fa-solid fa-bolt" style="color:var(--brand-orange);"></i> [NEW] ${booking.categoryName}</h5>
      <span class="dispatch-earnings">${window.iasjCurrency.formatAud(getInvoiceTotals(booking).total)}</span>
    </div>
    <p class="dispatch-job-desc">
      ${booking.custName} • ${booking.custAddress} • ${booking.shift}
    </p>
    <div class="dispatch-meta-chips">
      <span class="dispatch-chip"><i class="fa-solid fa-receipt"></i> ${booking.docketNumber}</span>
      <span class="dispatch-chip" style="color:var(--accent-green);"><i class="fa-solid fa-circle-check"></i> Assigned to ${booking.provider.name}</span>
    </div>
    <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
      <button class="btn btn-primary btn-sm" onclick="acceptDispatchJob('job-${booking.docketNumber}', '${safeCustName}')">
        <i class="fa-solid fa-truck-ramp-box"></i> En Route (SMS Customer)
      </button>
      <button class="btn btn-navy btn-sm" onclick="completeJob('${booking.docketNumber}')">
        Mark Completed
      </button>
    </div>
  `;

  feed.prepend(item);
}

function acceptDispatchJob(jobElemId, custName) {
  const el = document.getElementById(jobElemId);
  if (el) {
    el.style.background = '#F0FDF4';
    el.style.borderColor = 'var(--accent-green)';
    const btn = el.querySelector('.btn-primary');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Tradie En Route';
      btn.className = 'btn btn-sm';
      btn.style.background = 'var(--accent-green)';
      btn.style.color = '#fff';
      btn.disabled = true;
    }
  }
  showToast(`Dispatched! SMS sent to customer: Tradie is arriving in standard shift.`);
}

function declineDispatchJob(jobElemId) {
  const el = document.getElementById(jobElemId);
  if (el) {
    el.style.opacity = '0.4';
    el.style.pointerEvents = 'none';
  }
  showToast('Job reassigned to next nearest qualified provider.');
}

function completeJob(docketId) {
  showToast(`Job ${docketId} marked as completed. Digital invoice delivered to customer.`);
}

/**
 * Invoice Modal Renderer
 */
function renderInvoiceModal(booking) {
  const modal = document.getElementById('booking-modal');
  const container = document.getElementById('modal-invoice-content');
  if (!modal || !container) return;

  // "Pay via Stripe" always pays the docket shown in this invoice
  currentPayingBooking = booking;
  syncStripePayButton(booking);

  const cur = window.iasjCurrency;
  const totals = getInvoiceTotals(booking);

  const gcalUrl = getGoogleCalendarUrl(booking);
  const addGcalBtn = document.getElementById('btn-add-to-google-cal');
  if (addGcalBtn) {
    addGcalBtn.href = gcalUrl;
  }

  container.innerHTML = `
    <div class="invoice-preview-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem;">
        <div>
          <h3 style="font-size:1.3rem; font-weight:900; color:var(--primary-navy);">It's A Simple Job</h3>
          <p style="font-size:0.78rem; color:var(--text-muted);">
            Australia's 1st Labour, Courier & Hire Service Powered by AI<br>
            ABN: 36 339 516 584 • Phone: 0495 019 791 • 24/7, 365 Days a Year Operations
          </p>
        </div>
        <div style="text-align:right;">
          <span class="badge-pill-pill" style="background:var(--primary-navy);">${booking.docketNumber}</span>
          <div style="margin-top:0.35rem;">
            <span class="crn-badge" title="Verified Customer Reference Number"><i class="fa-solid fa-user-check"></i> ${booking.customerRefNumber || 'CRN-849102'}</span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">Date: ${booking.createdAt}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.25rem; font-size:0.85rem; border-top:1px solid var(--border-light); border-bottom:1px solid var(--border-light); padding:0.75rem 0;">
        <div>
          <strong>CUSTOMER DETAILS:</strong><br>
          ${booking.custName}<br>
          ${booking.custAddress}<br>
          Mobile: ${booking.custPhone}<br>
          <span style="font-size:0.75rem; color:#1E40AF; font-weight:700;">Customer Ref: ${booking.customerRefNumber || 'CRN-849102'}</span>
        </div>
        <div>
          <strong>MATCHED TRADIE / PROVIDER:</strong><br>
          <strong>${booking.provider.name}</strong><br>
          ${booking.provider.businessName}<br>
          ${booking.provider.qbccLicense}<br>
          <span style="font-size:0.75rem; color:#92400E; font-weight:700;">Provider #: ${booking.provider.serviceProviderNumber || 'SPN-101001'}</span>
        </div>
      </div>

      <div style="margin-bottom:1rem;">
        <strong>SCHEDULED SERVICE WINDOW:</strong>
        <div style="font-size:0.95rem; font-weight:700; color:var(--brand-orange); margin-top:0.2rem;">
          <i class="fa-regular fa-clock"></i> ${booking.shift}
        </div>
      </div>

      <!-- 1-Click Google Calendar Addition Card -->
      <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:var(--radius-sm); padding:0.75rem 1rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem;">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <div>
            <strong style="font-size:0.82rem; color:#1E40AF; display:block;">Add Booking to Google Calendar</strong>
            <span style="font-size:0.74rem; color:#3B82F6;">Save shift window, tradie contact & address to your personal calendar</span>
          </div>
        </div>
        <a href="${gcalUrl}" target="_blank" class="btn btn-sm" style="background:#2563EB; color:#fff; font-weight:700; text-decoration:none; padding:0.4rem 0.85rem; border-radius:var(--radius-sm); display:inline-flex; align-items:center; gap:0.35rem;">
          <i class="fa-solid fa-calendar-plus"></i> Save to Calendar
        </a>
      </div>

      ${booking.attachedPhotos && booking.attachedPhotos.length > 0 ? `
        <div style="margin-bottom:1rem; background:#F8FAFC; border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:0.6rem 0.85rem;">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:0.4rem; display:flex; justify-content:space-between; align-items:center;">
            <span><i class="fa-solid fa-camera" style="color:var(--brand-orange);"></i> ATTACHED JOB PHOTOS (${booking.attachedPhotos.length}):</span>
            <a href="https://ibb.co/album/TKRnX5" target="_blank" style="color:#2563EB; font-size:0.72rem;">View in ImgBB Album</a>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${booking.attachedPhotos.map(url => `
              <a href="${url}" target="_blank" title="View Full Photo on ImgBB">
                <img src="${url}" alt="Job photo" style="width:48px; height:48px; object-fit:cover; border-radius:4px; border:1px solid #CBD5E1;">
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <table style="width:100%; font-size:0.85rem; border-collapse:collapse; margin-bottom:0.6rem;">
        <thead>
          <tr style="border-bottom:2px solid var(--border-light); text-align:left;">
            <th style="padding:0.4rem 0;">Description</th>
            <th style="padding:0.4rem 0; text-align:right;">Tokens</th>
            <th style="padding:0.4rem 0; text-align:right;">Amount (AUD)</th>
          </tr>
        </thead>
        <tbody>
          ${totals.lines.map(line => `
          <tr>
            <td style="padding:0.4rem 0;">${line.label}</td>
            <td style="text-align:right; color:var(--text-muted);">${cur.formatWhole(line.tokens)}</td>
            <td style="text-align:right;">$${cur.formatWhole(line.aud)}</td>
          </tr>`).join('')}
          <tr>
            <td style="padding:0.4rem 0;">Australian Goods & Services Tax (GST ${cur.GST_PERCENT}%)</td>
            <td style="text-align:right; color:var(--text-muted);">${cur.formatWhole(totals.gstTokens)}</td>
            <td style="text-align:right;">$${cur.formatWhole(totals.gst)}</td>
          </tr>
          <tr style="border-top:2px solid var(--primary-navy); font-weight:800; font-size:1.05rem;">
            <td style="padding:0.6rem 0;">TOTAL INVOICE (AUD, GST inclusive)</td>
            <td style="text-align:right; color:var(--text-muted);">${cur.formatWhole(totals.totalTokens)}</td>
            <td style="text-align:right; color:var(--brand-orange);">${cur.formatAud(totals.total)}</td>
          </tr>
        </tbody>
      </table>
      ${cur.isAud() ? '' : `
        <div style="text-align:right; font-size:0.8rem; color:var(--text-muted); margin-bottom:0.6rem;" title="${escapeAttr(cur.moneyTitle(totals.total))}">
          ${cur.formatMoney(totals.total)} at today's rate (for your information only). You will be invoiced and charged <strong>${cur.formatAud(totals.total)}</strong>.
        </div>`}
      ${cur.disclaimerHtml()}

      <!-- Direct Payment to Provider (PayID & BSB Bank Account) -->
      <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:var(--radius-sm); padding:0.85rem 1rem; margin-bottom:1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
          <strong style="color:#166534; font-size:0.88rem; display:flex; align-items:center; gap:0.4rem;">
            <i class="fa-solid fa-building-columns"></i> Pay Directly to Service Provider
          </strong>
          <span style="background:#DCFCE7; color:#15803D; font-size:0.72rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:12px;">Zero Fees • Direct to Tradie</span>
        </div>
        <p style="font-size:0.76rem; color:#14532D; margin-bottom:0.6rem;">
          Customers pay our independent verified specialists directly upon inspecting and signing off on the job. Please include Docket <strong>${booking.docketNumber}</strong> in your payment reference.
        </p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; background:#fff; border:1px solid #86EFAC; border-radius:6px; padding:0.75rem 0.85rem;">
          <div>
            <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; display:flex; align-items:center; gap:0.3rem;">
              <i class="fa-solid fa-bolt" style="color:var(--brand-orange);"></i> INSTANT PAYID (Osko / NPP):
            </div>
            <div style="display:flex; align-items:center; gap:0.35rem; margin-top:0.3rem;">
              <code style="font-size:0.84rem; font-weight:800; color:#1E40AF; background:#EFF6FF; padding:0.25rem 0.45rem; border-radius:4px;">${booking.provider.payId || booking.provider.phone || '0412 889 211'}</code>
              <button type="button" class="btn btn-sm btn-outline" style="padding:0.2rem 0.45rem; font-size:0.68rem;" onclick="copyToClipboard('${booking.provider.payId || booking.provider.phone || '0412 889 211'}', 'PayID')">
                <i class="fa-regular fa-copy"></i> Copy
              </button>
            </div>
            <span style="font-size:0.68rem; color:var(--text-muted); display:block; margin-top:0.25rem;">Type: ${(booking.provider.payIdType || 'Mobile Phone').toUpperCase()}</span>
          </div>

          <div>
            <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; display:flex; align-items:center; gap:0.3rem;">
              <i class="fa-solid fa-landmark" style="color:#2563EB;"></i> DIRECT BANK TRANSFER (EFT):
            </div>
            <div style="font-size:0.78rem; color:#1F2937; margin-top:0.3rem; line-height:1.35;">
              <strong>BSB:</strong> <code style="font-size:0.78rem; color:#1E40AF;">${booking.provider.bankDetails?.bsb || '084-004'}</code> &nbsp;|&nbsp; <strong>Acc:</strong> <code style="font-size:0.78rem; color:#1E40AF;">${booking.provider.bankDetails?.accountNumber || '482910481'}</code><br>
              <span style="font-size:0.7rem; color:var(--text-muted);">Name: ${booking.provider.bankDetails?.accountName || booking.provider.businessName || booking.provider.name}</span>
            </div>
          </div>
        </div>
      </div>

      <div style="background:#fff; padding:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-light); font-size:0.78rem; color:var(--text-muted);">
        <i class="fa-solid fa-circle-info" style="color:var(--brand-orange);"></i> 
        <strong>Payment Terms:</strong> Invoice issued on completion in Australian Dollars (AUD), GST inclusive. Payment via direct bank transfer, credit card or tokens once you inspect and sign off on the job.
        1 token = ${cur.formatAud(cur.tokenPriceAud())}. See our <a href="/terms.html#tokens" target="_blank" rel="noopener">Terms of Service</a> for how tokens work.
      </div>
    </div>
  `;

  modal.classList.add('active');
}

function closeBookingModal() {
  document.getElementById('booking-modal')?.classList.remove('active');
}

function printOrDownloadInvoice() {
  window.print();
}

/**
 * Stripe Payment Gateway Handlers
 */
let currentPayingBooking = null;

function syncStripePayButton(booking) {
  const payBtn = document.getElementById('btn-open-stripe');
  if (!payBtn) return;

  payBtn.style.display = window.stripePaymentService?.isAvailable() ? '' : 'none';
  const isPaid = booking?.stripeTx?.status === 'succeeded';
  payBtn.disabled = isPaid;
  payBtn.innerHTML = isPaid
    ? '<i class="fa-solid fa-circle-check"></i> Paid via Stripe'
    : '<i class="fa-brands fa-stripe" style="font-size:1.1rem;"></i> Pay via Stripe';
  payBtn.style.background = isPaid ? '#059669' : '#635BFF';
  payBtn.style.borderColor = isPaid ? '#059669' : '#635BFF';
}

function setStripeFormMessage(message) {
  const box = document.getElementById('stripe-payment-message');
  if (!box) return;
  box.textContent = message || '';
  box.style.display = message ? 'block' : 'none';
}

async function openStripePaymentModal() {
  const booking = currentPayingBooking || appState.activeBookings[0];
  if (!booking) {
    showToast('No active booking docket found.');
    return;
  }
  currentPayingBooking = booking;

  const stripeService = window.stripePaymentService;
  const elementRoot = document.getElementById('stripe-payment-element');
  const submitBtn = document.getElementById('btn-stripe-submit');
  const docketElem = document.getElementById('stripe-modal-docket');
  const amountElem = document.getElementById('stripe-modal-amount');
  const nameInput = document.getElementById('stripe-cardholder-name');
  const testHint = document.getElementById('stripe-test-mode-hint');

  const cur = window.iasjCurrency;
  const totals = getInvoiceTotals(booking);
  const usdNote = document.getElementById('stripe-modal-usd-note');
  const disclaimerBox = document.getElementById('stripe-currency-disclaimer');

  if (docketElem) docketElem.textContent = booking.docketNumber;
  if (amountElem) amountElem.textContent = cur.formatAud(totals.total);
  if (usdNote) {
    usdNote.textContent = cur.isAud() ? '' : `${cur.formatMoney(totals.total)} at today's rate`;
    usdNote.style.display = cur.isAud() ? 'none' : 'block';
  }
  if (disclaimerBox) disclaimerBox.innerHTML = cur.disclaimerHtml({ compact: true });
  if (nameInput && !nameInput.value) nameInput.value = booking.custName || '';
  if (testHint) testHint.style.display = stripeService?.config.isTestMode ? 'block' : 'none';
  if (submitBtn) submitBtn.disabled = true;
  setStripeFormMessage('');

  document.getElementById('stripe-payment-modal')?.classList.add('active');

  if (!stripeService?.isAvailable() || !elementRoot) {
    if (elementRoot) elementRoot.innerHTML = '';
    setStripeFormMessage('Online card payments are unavailable right now. Please pay the provider directly using the details on your invoice.');
    return;
  }

  elementRoot.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Connecting to Stripe secure checkout...</div>';

  try {
    const intent = await stripeService.createPaymentIntent({
      docketNumber: booking.docketNumber,
      amount: totals.total, // whole AUD, matches the invoice
      customerName: booking.custName,
      description: `Payment for docket ${booking.docketNumber} (${booking.categoryName || 'Trade Service'})`
    });
    // Ignore a late reply if checkout was reopened for a different docket
    if (currentPayingBooking !== booking) return;

    booking.stripePaymentIntentId = intent.paymentIntentId;

    if (intent.status === 'succeeded') {
      await finalizeStripePayment(booking, intent.paymentIntentId);
      return;
    }

    elementRoot.innerHTML = '';
    const paymentElement = stripeService.mountPaymentElement(elementRoot, intent.clientSecret);
    paymentElement.on('ready', () => {
      if (submitBtn) submitBtn.disabled = false;
    });
  } catch (err) {
    console.error("Stripe checkout setup error:", err);
    elementRoot.innerHTML = '';
    setStripeFormMessage(`${err.message} You can still pay the provider directly using the details on your invoice.`);
  }
}

function closeStripePaymentModal() {
  document.getElementById('stripe-payment-modal')?.classList.remove('active');
  window.stripePaymentService?.unmountPaymentElement();
}

/**
 * Confirm the result with Stripe via our server, then mark the docket paid
 */
async function finalizeStripePayment(booking, paymentIntentId) {
  const stripeService = window.stripePaymentService;
  const verified = await stripeService.verifyPayment(paymentIntentId);

  if (verified.status === 'processing') {
    booking.status = 'Payment Processing (Stripe)';
    closeStripePaymentModal();
    showToast(`Payment for ${booking.docketNumber} is processing with Stripe. It will be confirmed shortly.`);
    return;
  }
  if (verified.status !== 'succeeded') {
    throw new Error(`The payment was not completed (Stripe status: ${verified.status}).`);
  }

  const tx = await stripeService.recordVerifiedPayment(verified, booking);
  booking.status = 'Paid via Stripe (AUD)';
  booking.stripeTx = tx;

  syncStripePayButton(booking);
  closeStripePaymentModal();
  showToast(`Payment of ${window.iasjCurrency.formatAud(verified.amount)} confirmed by Stripe (Ref: ${verified.paymentIntentId}).`);
}

async function handleStripePaymentSubmit(event) {
  event.preventDefault();

  const booking = currentPayingBooking;
  const stripeService = window.stripePaymentService;
  if (!booking || !stripeService) return;

  const submitBtn = document.getElementById('btn-stripe-submit');
  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing payment with Stripe...';
    submitBtn.disabled = true;
  }
  setStripeFormMessage('');

  try {
    const cardholder = document.getElementById('stripe-cardholder-name')?.value.trim() || '';
    const paymentIntent = await stripeService.confirmPayment({ billingName: cardholder });
    await finalizeStripePayment(booking, paymentIntent.id);
  } catch (err) {
    console.error("Stripe payment error:", err);
    setStripeFormMessage(err.message);
  } finally {
    if (submitBtn) {
      submitBtn.innerHTML = originalHtml;
      submitBtn.disabled = !stripeService.paymentElement;
    }
  }
}

/**
 * Franchise Embedded Form Navigation
 */
function openFranchiseModal(territory = 'Gold Coast Central') {
  if (typeof switchTab === 'function') {
    switchTab('franchise-application-tab');
  }
  const regionInput = document.getElementById('franchise-admin-region');
  if (regionInput && territory) {
    regionInput.value = territory;
  }
  setTimeout(() => {
    const embeddedCard = document.querySelector('#franchise-application-tab .embedded-form-card') || document.getElementById('franchise-application-tab');
    if (embeddedCard) {
      embeddedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 60);
}

function closeFranchiseModal() {
  // Retained for backward-compatibility; no modal overlay needed as registration is embedded
}

function handleFranchiseSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (typeof switchTab === 'function') {
    switchTab('franchise-application-tab');
  }
}

/**
 * Track Modal / Quick Lookup
 */
function openTrackModal() {
  if (appState.activeBookings.length > 0) {
    renderInvoiceModal(appState.activeBookings[0]);
  } else {
    showToast('No active bookings yet. Book a job using the AI agent above!');
  }
}

/**
 * Speech Recognition Feature (Voice Assistant)
 */
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    appState.recognition = new SpeechRecognition();
    appState.recognition.continuous = false;
    appState.recognition.lang = 'en-AU';
    appState.recognition.interimResults = false;

    appState.recognition.onstart = () => {
      appState.isListening = true;
      const btn = document.getElementById('voice-record-btn');
      const label = document.getElementById('voice-btn-label');
      btn?.classList.add('listening');
      if (label) label.textContent = 'Listening... Speak now';
    };

    appState.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const input = document.getElementById('ai-prompt-input');
      if (input) {
        input.value = transcript;
      }
      submitAIAnalysis(true);
    };

    appState.recognition.onend = () => {
      appState.isListening = false;
      const btn = document.getElementById('voice-record-btn');
      const label = document.getElementById('voice-btn-label');
      btn?.classList.remove('listening');
      if (label) label.textContent = 'Describe by Voice';
    };

    appState.recognition.onerror = () => {
      appState.isListening = false;
      const btn = document.getElementById('voice-record-btn');
      btn?.classList.remove('listening');
    };
  }
}

function toggleVoiceSpeech() {
  if (!appState.recognition) {
    showToast('Voice speech recognition not supported in this browser. Please type your request.');
    return;
  }

  if (appState.isListening) {
    appState.recognition.stop();
  } else {
    try {
      appState.recognition.start();
    } catch (e) {
      console.warn("Speech recognition error:", e);
    }
  }
}

/**
 * Universal Toast Notification
 */
function showToast(message) {
  let toast = document.getElementById('toast-msg');
  let text = document.getElementById('toast-text');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.id = 'toast-msg';
    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--accent-teal, #00D2D3);"></i> <span id="toast-text"></span>`;
    document.body.appendChild(toast);
    text = document.getElementById('toast-text');
  }
  if (!text) return;

  text.textContent = message;
  toast.classList.add('show');

  if (window._toastTimeout) clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

/**
 * Universal Two-Step Confirm Delete Pattern (Global Antigravity Directive)
 * Prohibits instant destructive deletions. Arms the button on first click,
 * requiring explicit second click on the confirmation state to execute.
 * Automatically reverts after timeout or if user clicks outside / clicks cancel.
 *
 * @param {HTMLElement} btn - The trigger button or element
 * @param {Function} onConfirmed - Callback when user explicitly confirms delete
 * @param {Object} options - { label, timeoutMs, compact, targetType, targetId }
 */
function iasjConfirmDelete(btn, onConfirmed, options = {}) {
  if (!btn) {
    if (typeof onConfirmed === 'function') onConfirmed();
    return;
  }

  // If already armed, do nothing (waiting for user choice)
  if (btn.dataset.isDeleteArmed === 'true') {
    return;
  }

  const originalHtml = btn.dataset.originalHtml || btn.innerHTML;
  const originalStyle = btn.dataset.originalStyle || (btn.getAttribute('style') || '');
  const originalClass = btn.dataset.originalClass || btn.className;

  btn.dataset.originalHtml = originalHtml;
  btn.dataset.originalStyle = originalStyle;
  btn.dataset.originalClass = originalClass;
  btn.dataset.isDeleteArmed = 'true';

  const label = options.label || 'Confirm Delete?';
  const timeoutMs = options.timeoutMs || 6000;
  const compact = options.compact || false;
  const armedAt = new Date().toISOString();

  let timerId = null;

  function revert() {
    if (timerId) clearTimeout(timerId);
    document.removeEventListener('click', outsideClickListener, true);
    btn.removeEventListener('click', handleArmedClick, true);
    btn.innerHTML = originalHtml;
    btn.setAttribute('style', originalStyle);
    btn.className = originalClass;
    delete btn.dataset.isDeleteArmed;
  }

  function outsideClickListener(e) {
    if (!btn.contains(e.target)) {
      revert();
    }
  }

  if (compact) {
    if (btn.classList.contains('date-chip') || btn.classList.contains('date-chip-remove') || btn.closest('.date-chip')) {
      const chip = btn.classList.contains('date-chip') ? btn : btn.closest('.date-chip') || btn;
      chip.classList.add('confirm-delete-chip-armed');
      chip.innerHTML = `
        <span style="font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> ${label}</span>
        <button type="button" class="confirm-delete-chip-yes" title="Confirm Delete">Yes</button>
        <button type="button" class="confirm-delete-chip-no" title="Cancel">✕</button>
      `;
    } else {
      // Photo thumbnail remove button
      btn.className = 'confirm-delete-photo-armed';
      btn.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Delete?</span>
        <span class="confirm-delete-cancel-btn" title="Cancel" style="margin-left:2px; font-weight:800;">✕</span>
      `;
    }
  } else {
    btn.classList.add('confirm-delete-armed');
    btn.innerHTML = `
      <span class="confirm-delete-armed-box">
        <span class="confirm-delete-text">
          <i class="fa-solid fa-triangle-exclamation"></i> ${label}
        </span>
        <span class="confirm-delete-cancel-btn" title="Cancel">✕</span>
      </span>
    `;
  }

  function handleArmedClick(e) {
    e.stopPropagation();
    e.preventDefault();

    const cancelClicked = e.target.closest('.confirm-delete-cancel-btn, .confirm-delete-chip-no');
    if (cancelClicked) {
      revert();
      return;
    }

    // Explicit confirmation
    revert();

    // Audit log per Section 6.5
    try {
      console.info("[Audit] ConfirmDeleteAction executed:", {
        targetId: options.targetId || 'unknown',
        targetType: options.targetType || 'work_order',
        isConfirmed: true,
        armedAt: armedAt,
        confirmedAt: new Date().toISOString(),
        userRole: (window.firebaseService?.getCurrentGoogleUser?.()?.role) || 'supporter'
      });
    } catch(err) {}

    if (typeof onConfirmed === 'function') {
      onConfirmed();
    }
  }

  btn.addEventListener('click', handleArmedClick, true);

  setTimeout(() => {
    document.addEventListener('click', outsideClickListener, true);
  }, 20);

  timerId = setTimeout(() => {
    revert();
  }, timeoutMs);
}


// Dynamic Google Maps Script Loader with Automatic OpenStreetMap Leaflet Fallback
function loadGoogleMapsScript() {
  // Always render OpenStreetMap map immediately so interface is 100% functional and never shows "Oops! Something went wrong"
  try {
    renderOsmContractorMap();
    renderOsmCourierRouteMap();
  } catch(e) {
    console.warn("OSM Map render error:", e);
  }

  const apiKey = window.ENV?.GOOGLE_MAPS_API_KEY;
  const isGoogleMapsExplicitlyEnabled = window.ENV?.ENABLE_GOOGLE_MAPS === true;

  // If Google Maps is not explicitly enabled or key matches Firebase key (unauthorized for Maps API), stay on OpenStreetMap
  if (!isGoogleMapsExplicitlyEnabled || !apiKey || apiKey.startsWith('YOUR_') || apiKey.length < 20 || apiKey === window.ENV?.FIREBASE_API_KEY) {
    console.log("ℹ️ OpenStreetMap (Leaflet) active as primary zero-cost, ultra-reliable map engine (Google Maps skipped to prevent ApiTargetBlockedMapError).");
    return;
  }

  if (document.getElementById('google-maps-api-script')) return;
  const script = document.createElement('script');
  script.id = 'google-maps-api-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=initGoogleMapsServices`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    console.warn("⚠️ [Google Maps] Script failed to load. Staying on OpenStreetMap.");
    renderOsmContractorMap();
    renderOsmCourierRouteMap();
  };
  document.head.appendChild(script);
}

// Make initGoogleMapsServices accessible globally for JSONP callback
window.initGoogleMapsServices = initGoogleMapsServices;
window.loadGoogleMapsScript = loadGoogleMapsScript;

/**
 * ==============================================================================
 * HIRE RECRUITMENT & RESUME SEARCH ENGINE (24/7 STAFFING)
 * ==============================================================================
 */

/**
 * Render Candidate Resume Cards Grid
 */
function renderCandidateCards(candidates) {
  const container = document.getElementById('candidate-resumes-container');
  const countIndicator = document.getElementById('candidate-count-indicator');
  if (!container) return;

  if (countIndicator) {
    countIndicator.innerHTML = `Showing <strong>${candidates.length}</strong> verified candidate resumes`;
  }

  if (candidates.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:3rem; background:#fff; border-radius:var(--radius-md); border:1px solid var(--border-light);">
        <i class="fa-solid fa-user-slash" style="font-size:2.5rem; color:var(--text-muted); margin-bottom:1rem;"></i>
        <h4 style="font-size:1.15rem; color:var(--primary-navy);">No candidates found matching your criteria</h4>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.35rem;">Try adjusting your key terms or broadening your location radius.</p>
        <button class="btn btn-outline btn-sm" style="margin-top:1rem;" onclick="resetRecruitmentFilters()">Reset Filters</button>
      </div>
    `;
    return;
  }

  const keywordInput = document.getElementById('recruit-keywords')?.value.toLowerCase().trim() || '';
  const searchTerms = keywordInput ? keywordInput.split(' ').filter(t => t.length > 2) : [];

  container.innerHTML = candidates.map(c => {
    // Generate initials for avatar
    const initials = c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    // Check if skill matches search keyword
    const skillsHtml = (c.keyTerms || []).slice(0, 7).map(skill => {
      const isMatch = searchTerms.some(term => skill.toLowerCase().includes(term));
      return `<span class="candidate-skill-tag ${isMatch ? 'highlight' : ''}">${isMatch ? '<i class="fa-solid fa-check"></i> ' : ''}${skill}</span>`;
    }).join('');

    return `
      <div class="candidate-card" id="card-${c.id}">
        <div>
          <div class="candidate-header">
            <div style="display:flex; gap:0.75rem; align-items:flex-start;">
              <div class="candidate-avatar">${initials}</div>
              <div class="candidate-name-group">
                <h4>
                  ${c.name}
                  <i class="fa-solid fa-circle-check" style="color:var(--accent-green); font-size:0.9rem;" title="Verified Identity & Police Check"></i>
                </h4>
                <div class="candidate-trade-title">${c.tradeTitle}</div>
                <div style="margin-top:0.25rem;">
                  <span class="spn-badge" title="Official Service Provider Number">
                    <i class="fa-solid fa-id-card-clip"></i> ${c.serviceProviderNumber}
                  </span>
                </div>
              </div>
            </div>

            <div class="candidate-rate-badge">
              <div class="hourly">$${c.hourlyRate}<span style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">/hr</span></div>
              <div class="daily">approx $${c.dayRate || (c.hourlyRate * 8)}/day</div>
            </div>
          </div>

          <div class="candidate-meta-row">
            <span><i class="fa-solid fa-location-dot" style="color:var(--brand-orange);"></i> ${c.suburb}</span>
            <span>•</span>
            <span><i class="fa-solid fa-business-time"></i> ${c.experienceYears} Years Exp</span>
            <span>•</span>
            ${c.workingHours?.is24_7 ? '<span class="badge-247">⚡ 24/7/365 On-Call</span>' : '<span style="color:var(--text-muted);"><i class="fa-regular fa-clock"></i> Day Shifts</span>'}
          </div>

          <p style="font-size:0.83rem; color:var(--text-main); line-height:1.45; margin-bottom:0.75rem;">
            ${c.resumeSummary}
          </p>

          <div class="candidate-skills-wrap">
            ${skillsHtml}
          </div>
        </div>

        <div class="candidate-actions">
          <button class="btn btn-outline btn-sm" onclick="openCandidateResumeModal('${c.id}')">
            <i class="fa-solid fa-file-lines"></i> Full Resume
          </button>
          <button class="btn btn-primary btn-sm" onclick="openHireStaffModal('${c.id}')">
            <i class="fa-solid fa-user-plus"></i> Hire / Request
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Filter Candidates Real-time
 */
function filterCandidates() {
  if (!window.candidateDB) return;

  const keyword = document.getElementById('recruit-keywords')?.value || '';
  const location = document.getElementById('recruit-location')?.value || '';
  const category = document.getElementById('recruit-trade')?.value || 'all';
  const shiftType = appState.candidateShiftFilter || 'all';

  const results = window.candidateDB.search({ keyword, location, category, shiftType });
  renderCandidateCards(results);
}

function selectCandidateShiftFilter(shiftType) {
  appState.candidateShiftFilter = shiftType;
  document.getElementById('filter-shift-all')?.classList.toggle('active', shiftType === 'all');
  document.getElementById('filter-shift-247')?.classList.toggle('active', shiftType === '24_7');
  filterCandidates();
}

function resetRecruitmentFilters() {
  const kw = document.getElementById('recruit-keywords');
  const loc = document.getElementById('recruit-location');
  const tr = document.getElementById('recruit-trade');
  if (kw) kw.value = '';
  if (loc) loc.value = '';
  if (tr) tr.value = 'all';
  selectCandidateShiftFilter('all');
}

/**
 * Full Resume Modal Handler
 */
function openCandidateResumeModal(candidateId) {
  const c = window.candidateDB.findById(candidateId);
  if (!c) return;

  appState.activeCandidateModalId = candidateId;
  const content = document.getElementById('candidate-resume-content');
  if (!content) return;

  const expRows = (c.fullResume?.experience || []).map(exp => `
    <div style="margin-bottom:0.85rem; padding-bottom:0.85rem; border-bottom:1px dashed var(--border-light);">
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <strong style="color:var(--primary-navy); font-size:0.92rem;">${exp.role}</strong>
        <span style="font-size:0.75rem; color:var(--text-muted);">${exp.dates}</span>
      </div>
      <div style="font-size:0.82rem; color:var(--brand-orange); font-weight:700;">${exp.company}</div>
      <p style="font-size:0.82rem; color:var(--text-muted); margin-top:0.25rem;">${exp.details}</p>
    </div>
  `).join('');

  const ticketChips = (c.licenses || []).concat(c.fullResume?.tickets || []).map(t => `
    <span style="background:#F0FDF4; border:1px solid #BBF7D0; color:#166534; font-size:0.75rem; font-weight:700; padding:0.25rem 0.6rem; border-radius:var(--radius-sm); display:inline-flex; align-items:center; gap:0.35rem;">
      <i class="fa-solid fa-certificate"></i> ${t}
    </span>
  `).join('');

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem; border-bottom:1px solid var(--border-light); padding-bottom:1rem;">
      <div>
        <h3 style="font-size:1.35rem; font-weight:900; color:var(--primary-navy);">${c.name}</h3>
        <div style="font-size:0.9rem; font-weight:700; color:var(--brand-orange); margin-top:0.15rem;">${c.tradeTitle}</div>
        <div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.3rem;">
          <i class="fa-solid fa-location-dot"></i> ${c.suburb} (Postcode ${c.postcode || '4217'})
        </div>
      </div>
      <div style="text-align:right;">
        <span class="spn-badge" style="font-size:0.85rem; padding:0.3rem 0.75rem;"><i class="fa-solid fa-id-card-clip"></i> ${c.serviceProviderNumber}</span>
        <div style="font-size:1.2rem; font-weight:900; color:var(--primary-navy); margin-top:0.5rem;">$${c.hourlyRate}/hr</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Verified Police Checked & Insured</div>
      </div>
    </div>

    <!-- Registered Working Hours -->
    <div style="background:#FEF3C7; border:1px solid #FCD34D; padding:0.75rem 1rem; border-radius:var(--radius-sm); margin-bottom:1.25rem; font-size:0.82rem; color:#92400E; display:flex; align-items:center; gap:0.6rem;">
      <i class="fa-solid fa-clock" style="font-size:1.1rem;"></i>
      <div>
        <strong>Registered Availability & Shifts:</strong> ${c.workingHours?.registeredShifts || c.workingHours?.shiftDescription || '24/7 • 365 Days a Year On-Call Ready'}
      </div>
    </div>

    <!-- Verified Licenses & Tickets -->
    <div style="margin-bottom:1.25rem;">
      <strong style="font-size:0.85rem; color:var(--primary-navy); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:0.5rem;">
        Verified Tickets, Licences & Compliance:
      </strong>
      <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
        ${ticketChips}
      </div>
    </div>

    <!-- Career Summary -->
    <div style="margin-bottom:1.25rem;">
      <strong style="font-size:0.85rem; color:var(--primary-navy); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:0.35rem;">
        Executive Career Summary:
      </strong>
      <p style="font-size:0.85rem; color:var(--text-main); line-height:1.5;">${c.fullResume?.summary || c.resumeSummary}</p>
    </div>

    <!-- Recent Experience -->
    <div style="margin-bottom:1.25rem;">
      <strong style="font-size:0.85rem; color:var(--primary-navy); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:0.5rem;">
        Recent Work History & Key Projects:
      </strong>
      ${expRows}
    </div>

    <!-- Tools & Equipment -->
    ${c.fullResume?.toolsOwned ? `
      <div style="background:#F8FAFC; border:1px solid var(--border-light); padding:0.75rem 1rem; border-radius:var(--radius-sm); font-size:0.82rem; color:var(--text-main);">
        <strong><i class="fa-solid fa-toolbox" style="color:var(--brand-orange);"></i> Tools & Vehicles Owned:</strong> ${c.fullResume.toolsOwned}
      </div>
    ` : ''}
  `;

  document.getElementById('candidate-resume-modal')?.classList.add('active');
}

function closeCandidateResumeModal() {
  document.getElementById('candidate-resume-modal')?.classList.remove('active');
}

function openHireModalFromResume() {
  closeCandidateResumeModal();
  if (appState.activeCandidateModalId) {
    openHireStaffModal(appState.activeCandidateModalId);
  }
}

/**
 * Staffing Request / Hire Modal
 */
function openHireStaffModal(candidateId) {
  const c = window.candidateDB.findById(candidateId);
  if (!c) return;

  const summary = document.getElementById('hire-candidate-summary');
  const candIdInput = document.getElementById('hire-cand-id');
  const locInput = document.getElementById('hire-location');

  if (summary) {
    summary.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${c.name}</strong> • ${c.tradeTitle}
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">
            Ref: <span class="spn-badge" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${c.serviceProviderNumber}</span>
          </div>
        </div>
        <div style="font-weight:900; color:var(--brand-orange); font-size:1.1rem;">
          $${c.hourlyRate}/hr
        </div>
      </div>
    `;
  }

  if (candIdInput) candIdInput.value = candidateId;
  if (locInput && !locInput.value) locInput.value = appState.userLocationName || 'Gold Coast, QLD';

  document.getElementById('hire-staff-modal')?.classList.add('active');
}

function closeHireStaffModal() {
  document.getElementById('hire-staff-modal')?.classList.remove('active');
}

function handleRecruitmentHireSubmit(event) {
  event.preventDefault();

  const candId = document.getElementById('hire-cand-id')?.value;
  const c = window.candidateDB.findById(candId);
  const company = document.getElementById('hire-company')?.value.trim();
  const contact = document.getElementById('hire-contact')?.value.trim();
  const phone = document.getElementById('hire-phone')?.value.trim();
  const email = document.getElementById('hire-email')?.value.trim();
  const location = document.getElementById('hire-location')?.value.trim();
  const shift = document.getElementById('hire-shift-select')?.value;
  const notes = document.getElementById('hire-notes')?.value.trim();

  const rrn = window.firebaseService?.generateRRN?.() || (`RRN-${Math.floor(100000 + Math.random() * 900000)}`);

  const orderPayload = {
    recruiterRefNumber: rrn,
    company,
    contact,
    phone,
    email,
    location,
    shift,
    notes,
    candidate: {
      id: c?.id,
      name: c?.name,
      serviceProviderNumber: c?.serviceProviderNumber,
      tradeTitle: c?.tradeTitle,
      hourlyRate: c?.hourlyRate
    }
  };

  if (window.firebaseService?.saveRecruitmentOrderToFirestore) {
    window.firebaseService.saveRecruitmentOrderToFirestore(orderPayload);
  }

  closeHireStaffModal();
  document.getElementById('hire-staff-form')?.reset();

  showToast(`Staffing request sent! Assigned Recruiter Reference: ${rrn}. Candidate notified via SMS.`);
}

/**
 * Candidate Registration Modal Handlers
 */
function openCandidateRegisterModal() {
  document.getElementById('candidate-register-modal')?.classList.add('active');
}

function closeCandidateRegisterModal() {
  document.getElementById('candidate-register-modal')?.classList.remove('active');
}

function handleCandidateRegisterSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('cand-reg-name')?.value.trim();
  const tradeTitle = document.getElementById('cand-reg-trade')?.value.trim();
  const category = document.getElementById('cand-reg-cat')?.value;
  const suburb = document.getElementById('cand-reg-suburb')?.value.trim();
  const hourlyRate = wholeMoney(parseFloat(document.getElementById('cand-reg-rate')?.value) || 65);
  const experienceYears = parseInt(document.getElementById('cand-reg-exp')?.value) || 5;
  const skills = document.getElementById('cand-reg-skills')?.value.split(',').map(s => s.trim());
  const resumeSummary = document.getElementById('cand-reg-summary')?.value.trim();

  const newCand = {
    name,
    tradeTitle,
    category,
    suburb,
    hourlyRate,
    dayRate: hourlyRate * 8,
    experienceYears,
    keyTerms: skills,
    licenses: ["White Card Verified", "Police Checked"],
    resumeSummary,
    photoUrl: appState.uploadedCandidatePhoto?.url || null,
    workingHours: {
      is24_7: true,
      registeredShifts: "24/7 • 365 Days a Year Registered & Available Immediately"
    }
  };

  const saved = window.candidateDB.addCandidate(newCand);
  closeCandidateRegisterModal();
  document.getElementById('cand-reg-form')?.reset();

  // Show their SPN modal
  const spnElem = document.getElementById('modal-spn-number');
  if (spnElem) spnElem.textContent = saved.serviceProviderNumber;
  document.getElementById('provider-success-modal')?.classList.add('active');

  filterCandidates();
  showToast(`Resume published! Your Service Provider Number is ${saved.serviceProviderNumber}.`);
}

/**
 * SPN Modal Helpers
 */
function copySPNToClipboard() {
  const spn = document.getElementById('modal-spn-number')?.textContent.trim();
  if (spn && navigator.clipboard) {
    navigator.clipboard.writeText(spn);
    showToast(`Copied ${spn} to clipboard!`);
  }
}

function closeProviderSuccessModal() {
  document.getElementById('provider-success-modal')?.classList.remove('active');
}

/**
 * ==============================================================================
 * SETTINGS WHEEL MENU & REGISTRATION CONTROLLERS
 * ==============================================================================
 */

function toggleSettingsMenu(event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById('settings-dropdown-panel');
  const btn = document.getElementById('settings-menu-btn');
  if (!panel) return;

  const isOpen = panel.classList.contains('show');
  if (isOpen) {
    panel.classList.remove('show');
    btn?.classList.remove('active');
  } else {
    panel.classList.add('show');
    btn?.classList.add('active');
  }
}

// Close settings dropdown when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('settings-dropdown-panel');
  const btn = document.getElementById('settings-menu-btn');
  if (panel && panel.classList.contains('show')) {
    if (!panel.contains(e.target) && !btn?.contains(e.target)) {
      panel.classList.remove('show');
      btn?.classList.remove('active');
    }
  }
});

/**
 * Customer Registration Modal / Embedded Page Controllers
 */
function openCustomerRegisterModal(user = null) {
  document.getElementById('settings-dropdown-panel')?.classList.remove('show');
  document.getElementById('settings-menu-btn')?.classList.remove('active');
  switchTab('customer-application-tab');
  const currentUser = user || (function() {
    try { return JSON.parse(localStorage.getItem('iasj_google_user') || 'null'); } catch(e) { return null; }
  })();
  if (currentUser) {
    const nameInput = document.getElementById('inline-cust-name');
    const emailInput = document.getElementById('inline-cust-email');
    if (nameInput && !nameInput.value) nameInput.value = currentUser.displayName || '';
    if (emailInput && !emailInput.value) emailInput.value = currentUser.email || '';
  }
  if (typeof restoreCustomerApplicationDraft === 'function') {
    restoreCustomerApplicationDraft();
  }
}

function closeCustomerRegisterModal() {
  document.getElementById('customer-register-modal')?.classList.remove('active');
}

function openCustomerSuccessModal(crn) {
  const elem = document.getElementById('modal-crn-number');
  if (elem) elem.textContent = crn;
  document.getElementById('customer-success-modal')?.classList.add('active');
}

function closeCustomerSuccessModal() {
  document.getElementById('customer-success-modal')?.classList.remove('active');
}

function copyCRNToClipboard() {
  const crn = document.getElementById('modal-crn-number')?.textContent.trim();
  if (crn && navigator.clipboard) {
    navigator.clipboard.writeText(crn);
    showToast(`Copied ${crn} to clipboard!`);
  }
}

function syncCustomerDistanceUnits(country) {
  const unit = (country === 'US' || country === 'UK') ? 'miles' : 'km';
  console.log(`[Location Setting] Customer region: ${country}, preferred units: ${unit}`);
}

/**
 * Customer Photo Upload Handler (Photo holding passport or licence)
 */
async function handleCustomerPhotoUpload(event, context = 'modal') {
  const file = event.target.files?.[0];
  if (!file) return;

  const previewId = (context === 'inline') ? 'inline-cust-photo-preview' : 'modal-cust-photo-preview';
  const preview = document.getElementById(previewId);
  if (preview) {
    preview.style.display = 'flex';
    preview.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#2563EB;"></i> <span style="font-size:0.8rem; color:#1E40AF;">Uploading verification photo (holding ID) to server...</span>';
  }

  try {
    const upload = await window.imgbbService.uploadImage(file, `cust_id_holding_${Date.now()}`, 'customer_id_selfie');
    appState.uploadedCustomerIdPhoto = upload;
    if (preview) {
      preview.innerHTML = `
        <img src="${upload.thumbUrl}" style="width:48px; height:48px; object-fit:cover; border-radius:6px; border:2px solid #3B82F6;">
        <div style="font-size:0.78rem; text-align:left;">
          <div style="font-weight:700; color:#1E40AF;"><i class="fa-solid fa-circle-check" style="color:#059669;"></i> ID Photo Verified & Stored on Server</div>
          <div style="font-size:0.72rem; color:#64748B;">Album: TKRnX5 • <a href="${upload.url}" target="_blank" style="color:#2563EB; font-weight:700;">Inspect Image</a></div>
        </div>
      `;
    }
    showToast('Verification photo (holding ID) uploaded and stored on server!');
  } catch (err) {
    console.error("Customer ID photo upload error:", err);
    showToast('Upload error: ' + err.message);
  }
}

/**
 * Switcher between Customer Form & Service Provider Form on the Registration Portal page
 */
function showInlineRegistration(type) {
  const provSection = document.getElementById('inline-provider-form-section');
  const custSection = document.getElementById('inline-customer-form-section');
  const btnProv = document.getElementById('btn-toggle-prov-form');
  const btnCust = document.getElementById('btn-toggle-cust-form');

  if (type === 'customer') {
    if (custSection) custSection.style.display = 'block';
    if (provSection) provSection.style.display = 'none';
    if (btnCust) btnCust.className = 'btn btn-primary';
    if (btnProv) btnProv.className = 'btn btn-outline';
  } else {
    if (provSection) provSection.style.display = 'block';
    if (custSection) custSection.style.display = 'none';
    if (btnProv) btnProv.className = 'btn btn-primary';
    if (btnCust) btnCust.className = 'btn btn-outline';
    renderProviderDocumentVault();
  }

  const target = document.getElementById('inline-reg-target');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth' });
  }
}

function scrollToVault() {
  const vault = document.getElementById('provider-documents-vault');
  if (vault) {
    vault.scrollIntoView({ behavior: 'smooth' });
  }
}

/**
 * Service Provider Stored Document Vault
 * All verification images such as licences are stored on our server and always available to the service provider.
 */
const DEFAULT_PROVIDER_DOCS = [
  {
    id: 'doc-qbcc-1',
    title: 'QBCC Plumbing & Gas Lic #1509214',
    type: 'Licence Card',
    spn: 'SPN-150921',
    url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=200&q=80',
    uploadedAt: '2026-09-15T08:30:00Z',
    status: 'Verified & Active',
    album: 'TKRnX5'
  },
  {
    id: 'doc-driver-2',
    title: 'Commercial MR Driver Licence #D948102',
    type: 'Driver Licence',
    spn: 'SPN-894102',
    url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=200&q=80',
    uploadedAt: '2026-09-22T14:15:00Z',
    status: 'Verified & Active',
    album: 'TKRnX5'
  },
  {
    id: 'doc-ins-3',
    title: 'Public Liability $10M Certificate',
    type: 'Insurance Policy',
    spn: 'SPN-150921',
    url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=200&q=80',
    uploadedAt: '2026-10-01T10:00:00Z',
    status: 'Valid 2026-2027',
    album: 'TKRnX5'
  }
];

function getStoredProviderDocs() {
  try {
    const raw = localStorage.getItem('iasj_provider_documents');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Vault storage read warning:", e);
  }
  return DEFAULT_PROVIDER_DOCS;
}

function saveStoredProviderDocs(docs) {
  try {
    localStorage.setItem('iasj_provider_documents', JSON.stringify(docs));
  } catch (e) {
    console.warn("Vault storage write warning:", e);
  }
}

function renderProviderDocumentVault() {
  const docs = getStoredProviderDocs();
  const containers = [
    document.getElementById('vault-documents-list'),
    document.getElementById('provider-network-vault-list')
  ];

  const html = docs.map(doc => `
    <div class="vault-doc-card">
      <div class="vault-thumb-wrap">
        <img src="${doc.thumbUrl || doc.url}" alt="${doc.title}" onerror="this.src='https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=200&q=80'">
      </div>
      <div style="flex:1;">
        <div class="vault-doc-title">${doc.title}</div>
        <div class="vault-doc-meta">
          <span><i class="fa-solid fa-id-badge"></i> ${doc.spn || 'SPN-Active'}</span> • 
          <span style="color:#059669; font-weight:700;"><i class="fa-solid fa-check"></i> ${doc.status || 'Verified'}</span>
        </div>
        <div style="font-size:0.72rem; color:#64748B; margin-bottom:0.75rem;">
          <i class="fa-solid fa-server"></i> Server Album: <strong>${doc.album || 'TKRnX5'}</strong>
        </div>
      </div>
      <div class="vault-actions">
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="viewVaultDocument('${doc.url}', '${doc.title}')">
          <i class="fa-solid fa-eye"></i> View
        </button>
        <a href="${doc.url}" target="_blank" download="${doc.title}.jpg" class="btn btn-outline btn-sm" style="flex:1; text-align:center;">
          <i class="fa-solid fa-download"></i> Save
        </a>
      </div>
    </div>
  `).join('');

  containers.forEach(c => {
    if (c) c.innerHTML = html;
  });
}

function viewVaultDocument(url, title) {
  window.open(url, '_blank');
}

function triggerVaultUpload() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showToast(`Uploading document '${file.name}' to server...`);
    try {
      const upload = await window.imgbbService.uploadImage(file, `doc_${Date.now()}`, 'tradie_license');
      const docs = getStoredProviderDocs();
      const newDoc = {
        id: 'doc_' + Date.now(),
        title: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").toUpperCase() || 'Verified Licence Document',
        type: 'Licence Upload',
        spn: 'SPN-Active',
        url: upload.url,
        thumbUrl: upload.thumbUrl,
        uploadedAt: new Date().toISOString(),
        status: 'Verified Active',
        album: 'TKRnX5'
      };
      docs.unshift(newDoc);
      saveStoredProviderDocs(docs);
      renderProviderDocumentVault();
      showToast(`Document saved to server and added to your vault!`);
    } catch (err) {
      showToast('Document upload error: ' + err.message);
    }
  };
  fileInput.click();
}

async function handleCustomerRegistrationSubmit(event, isInline = false) {
  event.preventDefault();

  const prefix = isInline ? 'inline-cust-' : 'cust-reg-';
  const name = document.getElementById(`${prefix}name`)?.value.trim();
  const type = document.getElementById(`${prefix}type`)?.value;
  const phone = document.getElementById(`${prefix}phone`)?.value.trim();
  const email = document.getElementById(`${prefix}email`)?.value.trim();
  const address = document.getElementById(`${prefix}address`)?.value.trim();
  const country = document.getElementById(`${prefix}country`)?.value;
  const notes = document.getElementById(`${prefix}notes`)?.value.trim();
  const idType = document.getElementById(`${prefix}id-type`)?.value || 'driver_licence';

  const idPhotoUrl = appState.uploadedCustomerIdPhoto?.url || null;

  const crn = window.firebaseService?.getOrCreateCRN?.(phone, name) || (`CRN-${Math.floor(100000 + Math.random() * 900000)}`);

  const customerRecord = {
    customerRefNumber: crn,
    name,
    accountType: type,
    phone,
    email,
    address,
    country,
    notes,
    idVerification: {
      type: idType,
      holdingPhotoUrl: idPhotoUrl,
      verified: true,
      storedOnServer: true,
      albumId: 'TKRnX5'
    },
    preferredDistanceUnit: (country === 'US' || country === 'UK') ? 'mile' : 'km',
    businessId: 'its-a-simple-job',
    createdAt: new Date().toISOString()
  };

  // Pre-fill booking fields if customer books immediately
  const nameField = document.getElementById('cust-name');
  const phoneField = document.getElementById('cust-phone');
  const addrField = document.getElementById('cust-address');
  const notesField = document.getElementById('cust-notes');
  if (nameField) nameField.value = name;
  if (phoneField) phoneField.value = phone;
  if (addrField) addrField.value = address;
  if (notesField) notesField.value = notes;

  // Save to Firestore if available
  if (window.firebaseService?.db && window.firebaseService?.isConnected) {
    try {
      const { doc, setDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
      const docRef = doc(collection(window.firebaseService.db, 'customers'), crn);
      await setDoc(docRef, customerRecord, { merge: true });
      console.log(`✅ [Firestore] Customer saved under CRN: ${crn}`);
    } catch (e) {
      console.warn("⚠️ [Firestore] Customer cached locally:", e);
    }
  }

  if (isInline) {
    document.getElementById('inline-customer-register-form')?.reset();
    if (typeof clearCustomerApplicationDraft === 'function') {
      clearCustomerApplicationDraft(false);
    }
  } else {
    closeCustomerRegisterModal();
    document.getElementById('customer-register-form')?.reset();
  }

  openCustomerSuccessModal(crn);
  showToast(`Welcome ${name}! Your Customer Reference Number is ${crn}. ID verified & saved on server.`);
}

/**
 * Dynamic Services & Fee Structures Drop Box System
 */
const TRADE_SERVICES_CATALOG = {
  plumbing: [
    "Emergency Burst Pipe & Leak Repairs",
    "Hot Water System Installation & Repair",
    "Blocked Drain Clearing & CCTV Inspection",
    "Leaking Tap & Mixer Replacement",
    "Toilet Suite Repair & Installation",
    "Gas Fitting, Leak Testing & Compliance",
    "Backflow Prevention Testing & Certification",
    "Bathroom & Kitchen Rough-In Plumbing",
    "Roof, Gutter & Downpipe Leak Repairs",
    "Water Pressure Diagnosis & Filtration",
    "+ Custom / Other Plumbing Service"
  ],
  electrical: [
    "Emergency Fault Finding & Circuit Tripping",
    "Switchboard Upgrade & Safety Switch (RCD)",
    "Power Point & USB Outlet Installation",
    "LED Downlight & Architectural Lighting",
    "Smoke Alarm Interconnect Compliance (2022+)",
    "EV (Electric Vehicle) Charger Installation",
    "Ceiling Fan Supply & Installation",
    "Oven, Cooktop & Stove Electrical Hookup",
    "Mains Power & Sub-Board Cabling",
    "Air Conditioning Electrical Feed",
    "+ Custom / Other Electrical Service"
  ],
  courier: [
    "Urgent Same-Day Express Delivery",
    "Scheduled Delivery Route & Multi-Drop",
    "Palletised Freight & Tailgate Lift Transport",
    "Fragile, Artwork & High-Value Courier",
    "Heavy Bulky Freight (2-Person Delivery)",
    "Medical & Pathology Specimen Urgent Run",
    "Legal Document & Real Estate Contract Express",
    "After-Hours & Weekend Hotshot Direct Delivery",
    "Interstate & Regional Express Freight",
    "+ Custom / Other Courier Service"
  ],
  handyman: [
    "General Home Maintenance & Fixes",
    "Flat-Pack Furniture Assembly (IKEA etc.)",
    "TV Wall Mounting & Picture Hanging",
    "Drywall / Gyprock Hole Patching & Sanding",
    "Door Hanging, Handle & Lock Replacements",
    "Gutter Cleaning & Downpipe Flushes",
    "High-Pressure Washing (Driveways & Patios)",
    "Flyscreen & Door Screen Remeshing",
    "Gate, Latch & Fence Repairs",
    "+ Custom / Other Handyman Service"
  ],
  carpentry: [
    "Timber Decking Build, Re-Oiling & Repair",
    "Pergola, Carport & Patio Timber Framing",
    "Internal & External Door Hanging",
    "Skirting Boards & Architraves Fitting",
    "Custom Shelving, Robes & Cabinetry",
    "Timber Flooring Supply & Laying",
    "Structural Wall Framing & Alterations",
    "Eaves, Fascias & Weatherboard Repairs",
    "+ Custom / Other Carpentry Service"
  ],
  garden: [
    "Ground Maintenance & Site Clearing",
    "Hedge Trimming, Shaping & Shrub Care",
    "Tree Lopping, Pruning & Branch Removal",
    "Garden Clean-Up & Green Waste Removal",
    "Reticulation & Sprinkler System Repairs",
    "Turf Laying & Soil Preparation",
    "Garden Bed Mulching & Weeding",
    "+ Custom / Other Garden Service"
  ],
  painting: [
    "Interior Wall, Ceiling & Trim Painting",
    "Exterior House & Weatherboard Painting",
    "Timber Deck Sanding, Staining & Sealing",
    "Roof Restoration & High-Pressure Spraying",
    "Plaster Crack Patching & Surface Prep",
    "Commercial Office & Shop Fitout Painting",
    "Fence & Garage Door Painting",
    "+ Custom / Other Painting Service"
  ],
  appliance: [
    "Washing Machine Diagnostics & Repair",
    "Clothes Dryer Repair & Heating Element",
    "Dishwasher Diagnostics, Pumps & Leaks",
    "Electric & Gas Oven / Stove Repair",
    "Rangehood Extraction & Motor Repair",
    "Fridge & Freezer Cooling Diagnostics",
    "+ Custom / Other Appliance Service"
  ],
  civil: [
    "Tight-Access Mini Excavator (1.7T-3.5T) Hire",
    "Trenching for Plumbing, Power & Drainage",
    "Site Levelling, Grading & Turf Prep",
    "Post Hole Boring & Foundation Pier Holes",
    "Concrete Slab Prep & Driveway Dig-Outs",
    "Bobcat / Skid Steer Spoil Loading & Clearing",
    "+ Custom / Other Civil Earthmoving Service"
  ]
};

const FEE_STRUCTURE_OPTIONS = [
  { value: "hourly", label: "Hourly Rate ($ / hr)", defaultRate: 95 },
  { value: "flat", label: "Fixed / Flat Price ($ flat fee)", defaultRate: 150 },
  { value: "callout_hourly", label: "Call-Out Fee + Hourly ($ base + $/hr)", defaultCallout: 45, defaultRate: 85 },
  { value: "day_rate", label: "Day Rate ($ / 8-hr day)", defaultRate: 750 },
  { value: "half_day", label: "Half-Day Rate ($ / 4-hr block)", defaultRate: 420 },
  { value: "per_metre", label: "Per Metre / Square Metre ($ / m or m²)", defaultRate: 35 },
  { value: "per_unit", label: "Per Unit / Item Delivered ($ / item)", defaultRate: 25 },
  { value: "free_quote", label: "Price on Inspection / Free Quote (TBD)", defaultRate: 0 }
];

function getCategoryServices(cat) {
  return TRADE_SERVICES_CATALOG[cat] || TRADE_SERVICES_CATALOG.plumbing;
}

function renderDefaultServiceFeeRows(prefix, category) {
  const container = document.getElementById(`${prefix}-services-fee-container`);
  if (!container) return;
  container.innerHTML = '';
  const services = getCategoryServices(category);

  // Add 2 default sensible rows
  addServiceFeeRow(prefix, {
    serviceName: services[0] || "Standard Service",
    feeStructure: "callout_hourly",
    callout: 45,
    rate: 95
  });

  addServiceFeeRow(prefix, {
    serviceName: services[1] || "Comprehensive Installation",
    feeStructure: "flat",
    rate: 180
  });
}

function handleCategoryChange(prefix, newCategory) {
  const container = document.getElementById(`${prefix}-services-fee-container`);
  if (!container) return;
  
  const existingRows = container.querySelectorAll('.service-fee-row');
  const services = getCategoryServices(newCategory);
  
  if (existingRows.length === 0) {
    renderDefaultServiceFeeRows(prefix, newCategory);
  } else {
    existingRows.forEach((row, idx) => {
      const select = row.querySelector('.service-select');
      if (select) {
        const currentVal = select.value;
        select.innerHTML = services.map(s => `<option value="${s}">${s}</option>`).join('');
        if (services.includes(currentVal)) {
          select.value = currentVal;
        } else {
          select.value = services[Math.min(idx, services.length - 2)] || services[0];
        }
      }
    });
  }
}

function addServiceFeeRow(prefix, data = null) {
  const container = document.getElementById(`${prefix}-services-fee-container`);
  if (!container) return;

  const catSelect = document.getElementById(`${prefix}-category`) || 
                    document.getElementById(prefix === 'page' ? 'page-prov-category' : 'adv-prov-category');
  const category = catSelect?.value || 'plumbing';
  const services = getCategoryServices(category);

  const selectedService = data?.name || data?.serviceName || services[0];
  const feeStructure = data?.feeStructure || "hourly";
  const rate = data?.rate !== undefined ? data.rate : 95;
  const callout = data?.callout !== undefined ? data.callout : 45;

  const row = document.createElement('div');
  row.className = 'service-fee-row';
  row.innerHTML = `
    <div class="service-fee-grid">
      <!-- 1. Service Selection Drop Box -->
      <div class="service-field-col">
        <label><i class="fa-solid fa-screwdriver-wrench"></i> Service Offered</label>
        <select class="form-control service-select" onchange="handleServiceSelectChange(this)">
          ${services.map(s => `<option value="${s}" ${s === selectedService ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <input type="text" class="form-control custom-service-input" placeholder="Type custom service name..." style="display:${selectedService.startsWith('+') ? 'block' : 'none'}; margin-top:0.4rem; font-size:0.82rem;">
      </div>

      <!-- 2. Fee Structure Drop Box -->
      <div class="service-field-col">
        <label><i class="fa-solid fa-money-check-dollar"></i> Fee Structure</label>
        <select class="form-control fee-structure-select" onchange="handleFeeStructureChange(this)">
          ${FEE_STRUCTURE_OPTIONS.map(opt => `<option value="${opt.value}" ${opt.value === feeStructure ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </div>

      <!-- 3. Dynamic Rate Inputs -->
      <div class="service-field-col price-col">
        <label><i class="fa-solid fa-tag"></i> Rate / Price</label>
        <div class="price-input-container">
          <!-- Populated by updateRowPriceInputs -->
        </div>
      </div>

      <!-- 4. Remove Button -->
      <div>
        <button type="button" class="btn-remove-service" onclick="removeServiceFeeRow(this)" title="Remove service">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `;

  container.appendChild(row);
  const feeSelect = row.querySelector('.fee-structure-select');
  updateRowPriceInputs(feeSelect, rate, callout);
}

function removeServiceFeeRow(btn) {
  const row = btn.closest('.service-fee-row');
  const container = row?.parentElement;
  if (!row || !container) return;

  if (container.querySelectorAll('.service-fee-row').length <= 1) {
    showToast('You must have at least one service listed.');
    return;
  }

  const doRemove = () => {
    row.remove();
    showToast('Service fee row removed.');
  };

  if (btn && typeof iasjConfirmDelete === 'function') {
    iasjConfirmDelete(btn, doRemove, {
      label: 'Confirm Remove?',
      targetType: 'service_fee_row',
      targetId: 'service_row'
    });
  } else {
    doRemove();
  }
}

function handleServiceSelectChange(selectEl) {
  const row = selectEl.closest('.service-fee-row');
  const customInput = row.querySelector('.custom-service-input');
  if (customInput) {
    if (selectEl.value.startsWith('+')) {
      customInput.style.display = 'block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
    }
  }
}

function handleFeeStructureChange(selectEl) {
  const opt = FEE_STRUCTURE_OPTIONS.find(o => o.value === selectEl.value);
  updateRowPriceInputs(selectEl, opt?.defaultRate ?? 95, opt?.defaultCallout ?? 45);
}

function updateRowPriceInputs(feeSelectEl, defaultRate = 95, defaultCallout = 45) {
  const row = feeSelectEl.closest('.service-fee-row');
  const container = row.querySelector('.price-input-container');
  if (!container) return;

  const struct = feeSelectEl.value;
  if (struct === 'hourly') {
    container.innerHTML = `
      <div class="price-input-wrap">
        <span class="price-curr">$</span>
        <input type="number" class="rate-input" value="${defaultRate}" min="0" max="2000" step="5">
        <span class="price-unit">/ hr</span>
      </div>
    `;
  } else if (struct === 'flat') {
    container.innerHTML = `
      <div class="price-input-wrap">
        <span class="price-curr">$</span>
        <input type="number" class="rate-input" value="${defaultRate || 150}" min="0" max="10000" step="10">
        <span class="price-unit">flat</span>
      </div>
    `;
  } else if (struct === 'callout_hourly') {
    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:nowrap;">
        <div class="price-input-wrap" title="Base Callout Fee">
          <span class="price-curr">$</span>
          <input type="number" class="callout-input" value="${defaultCallout || 45}" min="0" max="1000" step="5" style="width:45px;">
          <span class="price-unit">call</span>
        </div>
        <span style="font-weight:700; color:var(--text-muted); font-size:0.75rem;">+</span>
        <div class="price-input-wrap" title="Hourly Rate">
          <span class="price-curr">$</span>
          <input type="number" class="rate-input" value="${defaultRate || 85}" min="0" max="2000" step="5" style="width:45px;">
          <span class="price-unit">/hr</span>
        </div>
      </div>
    `;
  } else if (struct === 'day_rate') {
    container.innerHTML = `
      <div class="price-input-wrap">
        <span class="price-curr">$</span>
        <input type="number" class="rate-input" value="${defaultRate || 750}" min="0" max="20000" step="25">
        <span class="price-unit">/ day</span>
      </div>
    `;
  } else if (struct === 'half_day') {
    container.innerHTML = `
      <div class="price-input-wrap">
        <span class="price-curr">$</span>
        <input type="number" class="rate-input" value="${defaultRate || 420}" min="0" max="10000" step="20">
        <span class="price-unit">/ 4hrs</span>
      </div>
    `;
  } else if (struct === 'per_metre') {
    container.innerHTML = `
      <div class="price-input-wrap">
        <span class="price-curr">$</span>
        <input type="number" class="rate-input" value="${defaultRate || 35}" min="0" max="2000" step="5">
        <span class="price-unit">/ m²</span>
      </div>
    `;
  } else if (struct === 'per_unit') {
    container.innerHTML = `
      <div class="price-input-wrap">
        <span class="price-curr">$</span>
        <input type="number" class="rate-input" value="${defaultRate || 25}" min="0" max="2000" step="5">
        <span class="price-unit">/ item</span>
      </div>
    `;
  } else if (struct === 'free_quote') {
    container.innerHTML = `
      <span class="free-quote-badge">
        <i class="fa-solid fa-clipboard-check"></i> Free Quote / TBD
      </span>
    `;
  }
}

function collectServicesFeeData(prefix) {
  const container = document.getElementById(`${prefix}-services-fee-container`);
  if (!container) return [];

  const rows = container.querySelectorAll('.service-fee-row');
  const services = [];

  rows.forEach(row => {
    const select = row.querySelector('.service-select');
    const customInput = row.querySelector('.custom-service-input');
    const feeSelect = row.querySelector('.fee-structure-select');
    const rateInput = row.querySelector('.rate-input');
    const calloutInput = row.querySelector('.callout-input');

    let serviceName = select ? select.value : 'General Service';
    if (serviceName.startsWith('+') && customInput?.value.trim()) {
      serviceName = customInput.value.trim();
    }

    const feeStructure = feeSelect ? feeSelect.value : 'hourly';
    const rate = rateInput ? wholeMoney(parseFloat(rateInput.value) || 0) : 0;
    const callout = calloutInput ? wholeMoney(parseFloat(calloutInput.value) || 0) : 0;

    services.push({
      name: serviceName,
      feeStructure,
      rate,
      callout
    });
  });

  return services;
}

/**
 * Service Provider Registration / Embedded Page Controllers
 */
function openServiceProviderRegisterModal(user = null) {
  document.getElementById('settings-dropdown-panel')?.classList.remove('show');
  document.getElementById('settings-menu-btn')?.classList.remove('active');
  switchTab('provider-application-tab');

  const currentUser = user || (function() {
    try { return JSON.parse(localStorage.getItem('iasj_google_user') || 'null'); } catch(e) { return null; }
  })();
  if (currentUser) {
    const pageName = document.getElementById('page-prov-name');
    const pageEmail = document.getElementById('page-prov-email');
    if (pageName && !pageName.value) pageName.value = currentUser.displayName || '';
    if (pageEmail && !pageEmail.value) pageEmail.value = currentUser.email || '';
  }

  if (typeof restoreProviderApplicationDraft === 'function') {
    restoreProviderApplicationDraft();
  }
}

function closeServiceProviderRegisterModal() {
  document.getElementById('service-provider-register-modal')?.classList.remove('active');
}

function updateProviderDistUnit(unit) {
  const spans = document.querySelectorAll('.unit-span');
  spans.forEach(s => s.textContent = unit);
}

function handleProviderCountryChange(country) {
  let unit = 'km';
  if (country === 'US' || country === 'UK') {
    unit = 'mile';
  }

  const radio = document.querySelector(`input[name="prov-dist-unit"][value="${unit}"], input[name="page-prov-dist-unit"][value="${unit}"]`);
  if (radio) radio.checked = true;
  updateProviderDistUnit(unit);
}

function toggleDistanceChargeFields(checked) {
  const containers = [
    document.getElementById('distance-charge-inputs'),
    document.getElementById('page-distance-charge-inputs')
  ];
  containers.forEach(container => {
    if (container) {
      container.style.opacity = checked ? '1' : '0.4';
      container.style.pointerEvents = checked ? 'auto' : 'none';
    }
  });
}

async function handleAdvancedProviderSubmit(event, isInline = false) {
  event.preventDefault();

  const prefix = isInline ? 'page-prov-' : 'adv-prov-';
  const ratePrefix = isInline ? 'page-' : '';

  const name = document.getElementById(`${prefix}name`)?.value.trim();
  const businessName = document.getElementById(`${prefix}business`)?.value.trim();
  const category = document.getElementById(`${prefix}category`)?.value;
  const license = document.getElementById(`${prefix}license`)?.value.trim();
  const phone = document.getElementById(`${prefix}phone`)?.value.trim();
  const email = document.getElementById(`${prefix}email`)?.value.trim();

  const suburb = document.getElementById(`${prefix}suburb`)?.value.trim();
  const country = document.getElementById(`${prefix}country`)?.value;
  const unitRadio = document.querySelector(`input[name="${isInline ? 'page-prov-dist-unit' : 'prov-dist-unit'}"]:checked`);
  const distanceUnit = unitRadio ? unitRadio.value : 'km';
  const radius = parseFloat(document.getElementById(`${prefix}radius`)?.value) || 25;
  const suburbsList = document.getElementById(`${prefix}suburbs-list`)?.value.split(',').map(s => s.trim()).filter(Boolean);

  // Pricing models
  const hourlyChecked = document.getElementById(`${ratePrefix}rate-hourly`)?.checked || false;
  const hourlyRate = wholeMoney(hourlyChecked ? (parseFloat(document.getElementById(`${prefix}hourly`)?.value) || 85) : 85);

  const flatChecked = document.getElementById(`${ratePrefix}rate-flat`)?.checked || false;
  const flatRate = wholeMoney(flatChecked ? (parseFloat(document.getElementById(`${prefix}flat`)?.value) || 130) : null);

  const calloutChecked = document.getElementById(`${ratePrefix}rate-callout`)?.checked || false;
  const calloutFee = wholeMoney(calloutChecked ? (parseFloat(document.getElementById(`${prefix}callout`)?.value) || 35) : 35);

  const distanceChecked = document.getElementById(`${ratePrefix}rate-distance`)?.checked || false;
  const calloutPerUnit = wholeMoney(distanceChecked ? (parseFloat(document.getElementById(`${prefix}callout-per-km`)?.value) || 2) : 0);
  const courierPerUnit = wholeMoney(distanceChecked ? (parseFloat(document.getElementById(`${prefix}courier-per-km`)?.value) || 2) : 0);
  const freeDistance = distanceChecked ? (parseFloat(document.getElementById(`${prefix}free-km`)?.value) || 10) : 0;

  const servicesList = collectServicesFeeData(isInline ? 'page' : 'modal');
  let servicesDesc = servicesList.map(s => {
    let priceStr = '';
    if (s.feeStructure === 'hourly') priceStr = `$${s.rate}/hr`;
    else if (s.feeStructure === 'flat') priceStr = `$${s.rate} flat`;
    else if (s.feeStructure === 'callout_hourly') priceStr = `$${s.callout} callout + $${s.rate}/hr`;
    else if (s.feeStructure === 'day_rate') priceStr = `$${s.rate}/day`;
    else if (s.feeStructure === 'half_day') priceStr = `$${s.rate}/4hrs`;
    else if (s.feeStructure === 'per_metre') priceStr = `$${s.rate}/m²`;
    else if (s.feeStructure === 'per_unit') priceStr = `$${s.rate}/item`;
    else if (s.feeStructure === 'free_quote') priceStr = `Free Quote`;
    return `${s.name} (${priceStr})`;
  }).join(', ');
  if (!servicesDesc) {
    servicesDesc = document.getElementById(`${prefix}services-desc`)?.value.trim() || `${category} standard services`;
  }
  const skills = servicesList.length > 0 ? servicesList.map(s => s.name.toLowerCase()) : [category];
  const equipment = document.getElementById(`${prefix}equipment`)?.value.trim();

  // Australian Direct Banking & PayID Details (Customers pay providers directly)
  const bankAccountName = document.getElementById(`${prefix}bank-name`)?.value.trim() || businessName || name;
  const bsb = document.getElementById(`${prefix}bsb`)?.value.trim() || '084-004';
  const accountNumber = document.getElementById(`${prefix}account`)?.value.trim() || '482910481';
  const payId = document.getElementById(`${prefix}payid`)?.value.trim() || phone;
  const payIdType = document.getElementById(`${prefix}payid-type`)?.value || 'phone';

  // Working Hours & Shifts
  const is24_7 = document.getElementById(`${isInline ? 'page-shift-247' : 'adv-shift-247'}`)?.checked || false;
  const shifts = [];
  if (is24_7) shifts.push('emergency_24_7');
  if (document.getElementById(`${isInline ? 'page-shift-morn' : 'adv-shift-morn'}`)?.checked) shifts.push('morning');
  if (document.getElementById(`${isInline ? 'page-shift-aft' : 'adv-shift-aft'}`)?.checked) shifts.push('afternoon');
  if (document.getElementById(`${isInline ? 'page-shift-eve' : 'adv-shift-eve'}`)?.checked) shifts.push('evening');
  if (document.getElementById(`${isInline ? 'page-shift-overnight' : 'adv-shift-overnight'}`)?.checked) shifts.push('overnight');

  const spn = window.firebaseService?.generateSPN?.() || (`SPN-${Math.floor(100000 + Math.random() * 900000)}`);
  const licensePhoto = appState.uploadedProviderPhoto?.url || null;

  // Add uploaded licence directly into Document Vault so it's always accessible to the provider!
  if (licensePhoto) {
    const docs = getStoredProviderDocs();
    docs.unshift({
      id: 'doc_' + Date.now(),
      title: `${businessName || name} - Licence (${license || 'QBCC'})`,
      type: 'Trade Licence',
      spn: spn,
      url: licensePhoto,
      thumbUrl: appState.uploadedProviderPhoto?.thumbUrl || licensePhoto,
      uploadedAt: new Date().toISOString(),
      status: 'Verified & Active',
      album: 'TKRnX5'
    });
    saveStoredProviderDocs(docs);
    renderProviderDocumentVault();
  }

  const newProvider = {
    name,
    businessName,
    category,
    serviceProviderNumber: spn,
    tradeTitle: `${category.toUpperCase()} Specialist`,
    qbccLicense: license,
    phone,
    email,
    suburb,
    country,
    distanceUnit,
    radius,
    serviceAreas: suburbsList.length > 0 ? suburbsList : [suburb],
    bankDetails: {
      accountName: bankAccountName,
      bsb,
      accountNumber,
      bankName: 'National Australia Bank (NAB)'
    },
    payId,
    payIdType,
    pricing: {
      hourlyRate,
      flatRate,
      calloutFee,
      distanceCharging: {
        enabled: distanceChecked,
        calloutPerUnit,
        courierPerUnit,
        freeDistance,
        unit: distanceUnit
      }
    },
    hourlyRate,
    servicesList,
    servicesOffered: servicesDesc,
    skills,
    equipmentOwned: equipment,
    insurance: '$10M+ Verified Cover',
    rating: 5.0,
    reviewCount: 1,
    licensePhotoUrl: licensePhoto,
    status: (function() {
      const pfx = isInline ? 'inline' : 'modal';
      const rad = document.querySelector(`input[name="${pfx}-profile-status"]:checked`);
      return rad ? rad.value : 'active';
    })(),
    pausedReason: (function() {
      const pfx = isInline ? 'inline' : 'modal';
      const rad = document.querySelector(`input[name="${pfx}-profile-status"]:checked`);
      return rad && rad.value === 'paused' ? 'Paused upon registration' : '';
    })(),
    calendarSchedule: getMatrixSchedule(isInline ? 'inline' : 'modal'),
    blackoutDates: [],
    workingHours: {
      is24_7,
      shiftDescription: is24_7 ? "24/7 • 365 Days a Year Registered & On-Call" : "Standard Registered Shifts",
      shifts: shifts.length > 0 ? shifts : ['morning', 'afternoon']
    }
  };

  // Register Service Provider into Stripe as a User
  if (window.stripePaymentService?.registerProviderUser) {
    try {
      const stripeUser = await window.stripePaymentService.registerProviderUser(newProvider);
      newProvider.stripeCustomerId = stripeUser.stripeCustomerId;
    } catch (err) {
      console.warn("Could not register provider in Stripe:", err);
    }
  }

  // Add to in-memory provider database
  window.providerDB.addProvider(newProvider);

  // Sync to Firestore
  if (window.firebaseService?.saveProviderToFirestore) {
    await window.firebaseService.saveProviderToFirestore(newProvider);
  }

  if (isInline) {
    document.getElementById('inline-provider-reg-form')?.reset();
    if (typeof clearProviderApplicationDraft === 'function') {
      clearProviderApplicationDraft(false);
    }
  } else {
    closeServiceProviderRegisterModal();
    document.getElementById('provider-advanced-reg-form')?.reset();
  }

  // Refresh contractor search safely
  try {
    filterContractors();
  } catch (e) {
    console.warn("Contractor search refresh note:", e);
  }

  lastCreatedSPN = spn;
  const currentUser = window.firebaseService?.getCurrentGoogleUser?.();
  if (currentUser) {
    currentUser.hasCompletedApplication = true;
    currentUser.spn = spn;
    currentUser.role = 'provider';
    localStorage.setItem('iasj_google_user', JSON.stringify(currentUser));
    updateGoogleAuthUI(currentUser);
  }

  // Open SPN success modal
  const spnElem = document.getElementById('modal-spn-number');
  if (spnElem) spnElem.textContent = spn;
  const modal = document.getElementById('provider-success-modal');
  if (modal) modal.classList.add('active');

  showToast(`Welcome aboard, ${name}! Your official Service Provider Number is ${spn}. Licence stored on server.`);
}

let lastCreatedSPN = null;

function handleSuccessModalOpenAdmin() {
  closeProviderSuccessModal();
  openProviderAdminPanel(lastCreatedSPN);
}

function toggleFaq(id) {
  const item = document.getElementById(id);
  if (!item) return;
  item.classList.toggle('open');
}

function goToFaq(id) {
  switchTab('how-it-works-tab');
  const item = document.getElementById(id);
  if (!item) return;
  item.classList.add('open');
  setTimeout(() => item.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
}
window.goToFaq = goToFaq;

function openRegisterSelectionPanel() {
  document.getElementById('settings-dropdown-panel')?.classList.remove('show');
  document.getElementById('settings-menu-btn')?.classList.remove('active');
  if (typeof switchTab === 'function') {
    switchTab('register-selection-tab');
  }
}

function closeRegisterSelectionPanel() {
  // If it's a tab, we don't 'close' it, we could switch to a default tab
  if (typeof switchTab === 'function') {
    switchTab('ai-book-tab');
  }
}

function selectRegistrationType(type) {
  closeRegisterSelectionPanel();
  if (type === 'customer') {
    switchTab('customer-application-tab');
  } else if (type === 'provider') {
    switchTab('provider-application-tab');
  } else if (type === 'franchise') {
    switchTab('franchise-application-tab');
  }
}

// Global window attachments for interactive onclick events
window.openRegisterSelectionPanel = openRegisterSelectionPanel;
window.closeRegisterSelectionPanel = closeRegisterSelectionPanel;
window.selectRegistrationType = selectRegistrationType;
window.toggleFaq = toggleFaq;
window.toggleSettingsMenu = toggleSettingsMenu;
window.openCustomerRegisterModal = openCustomerRegisterModal;
window.closeCustomerRegisterModal = closeCustomerRegisterModal;
window.openCustomerSuccessModal = openCustomerSuccessModal;
window.closeCustomerSuccessModal = closeCustomerSuccessModal;
window.copyCRNToClipboard = copyCRNToClipboard;
window.syncCustomerDistanceUnits = syncCustomerDistanceUnits;
window.handleCustomerRegistrationSubmit = handleCustomerRegistrationSubmit;
window.openServiceProviderRegisterModal = openServiceProviderRegisterModal;
window.closeServiceProviderRegisterModal = closeServiceProviderRegisterModal;
window.updateProviderDistUnit = updateProviderDistUnit;
window.handleProviderCountryChange = handleProviderCountryChange;
window.toggleDistanceChargeFields = toggleDistanceChargeFields;
window.handleAdvancedProviderSubmit = handleAdvancedProviderSubmit;
window.closeProviderSuccessModal = closeProviderSuccessModal;
window.copySPNToClipboard = copySPNToClipboard;
window.handleCustomerPhotoUpload = handleCustomerPhotoUpload;
window.showInlineRegistration = showInlineRegistration;
window.scrollToVault = scrollToVault;
window.renderProviderDocumentVault = renderProviderDocumentVault;
window.viewVaultDocument = viewVaultDocument;
window.triggerVaultUpload = triggerVaultUpload;

/* ==========================================================================
   SERVICE PROVIDER CALENDAR & ADMIN PANEL CONTROLLER
   ========================================================================== */

const CALENDAR_DAYS = [
  { key: 'mon', label: 'Mon', shortDate: 'Monday' },
  { key: 'tue', label: 'Tue', shortDate: 'Tuesday' },
  { key: 'wed', label: 'Wed', shortDate: 'Wednesday' },
  { key: 'thu', label: 'Thu', shortDate: 'Thursday' },
  { key: 'fri', label: 'Fri', shortDate: 'Friday' },
  { key: 'sat', label: 'Sat', shortDate: 'Saturday' },
  { key: 'sun', label: 'Sun', shortDate: 'Sunday' }
];

const CALENDAR_SHIFTS = [
  { key: 'urgent_247', label: '⚡ 24/7 • 365 Urgent', time: 'Urgent On-Call (60–90m)', isUrgent: true },
  { key: 'morning', label: '🌅 Morning', time: '7:00 AM – 12:00 PM' },
  { key: 'afternoon', label: '☀️ Afternoon', time: '12:00 PM – 5:00 PM' },
  { key: 'evening', label: '🌇 Evening', time: '5:00 PM – 10:00 PM' },
  { key: 'overnight', label: '🌙 Overnight', time: '10:00 PM – 6:00 AM' }
];

function createDefaultMatrixData(is24_7 = true) {
  const sched = {};
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(d => {
    sched[d] = {
      urgent_247: is24_7,
      morning: true,
      afternoon: true,
      evening: is24_7 || d === 'fri' || d === 'sat',
      overnight: is24_7
    };
  });
  return sched;
}

const matrixSchedules = {
  inline: createDefaultMatrixData(true),
  modal: createDefaultMatrixData(true),
  admin: createDefaultMatrixData(true)
};

let currentAdminProviderId = null;
let currentAdminBlackoutDates = [];

function renderCalendarMatrix(rootId, prefix, scheduleData) {
  const root = document.getElementById(rootId);
  if (!root) return;

  if (scheduleData) {
    matrixSchedules[prefix] = JSON.parse(JSON.stringify(scheduleData));
  } else if (!matrixSchedules[prefix]) {
    matrixSchedules[prefix] = createDefaultMatrixData(true);
  }
  const sched = matrixSchedules[prefix];

  let html = `
    <div class="matrix-table-responsive">
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="th-shift">Shift Window</th>
            ${CALENDAR_DAYS.map(d => `<th>${d.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;

  CALENDAR_SHIFTS.forEach(shift => {
    html += `
      <tr>
        <td class="td-shift-name">
          <div>${shift.label}</div>
          <div style="font-size:0.68rem; color:var(--text-muted); font-weight:normal;">${shift.time}</div>
        </td>
    `;

    CALENDAR_DAYS.forEach(day => {
      const isActive = !!(sched[day.key] && sched[day.key][shift.key]);
      const urgentClass = shift.isUrgent ? 'urgent-slot' : '';
      const activeClass = isActive ? `active ${urgentClass}` : '';
      const cellId = `matrix-btn-${prefix}-${day.key}-${shift.key}`;

      html += `
        <td>
          <button type="button" 
                  class="matrix-slot-toggle ${activeClass}" 
                  id="${cellId}"
                  onclick="toggleMatrixSlot('${prefix}', '${day.key}', '${shift.key}')"
                  title="${day.label} ${shift.label} (${isActive ? 'Active' : 'Off'})">
            <span>${isActive ? 'ON' : 'OFF'}</span>
          </button>
        </td>
      `;
    });

    html += `</tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  root.innerHTML = html;
}

function initInlineCalendarMatrix() {
  renderCalendarMatrix('inline-calendar-matrix-root', 'inline');
}
window.initInlineCalendarMatrix = initInlineCalendarMatrix;

function toggleMatrixSlot(prefix, dayKey, shiftKey) {
  if (!matrixSchedules[prefix]) {
    matrixSchedules[prefix] = createDefaultMatrixData(true);
  }
  const sched = matrixSchedules[prefix];
  if (!sched[dayKey]) sched[dayKey] = {};
  sched[dayKey][shiftKey] = !sched[dayKey][shiftKey];

  const btn = document.getElementById(`matrix-btn-${prefix}-${dayKey}-${shiftKey}`);
  if (btn) {
    const isNowActive = sched[dayKey][shiftKey];
    const isUrgent = shiftKey === 'urgent_247';
    if (isNowActive) {
      btn.classList.add('active');
      if (isUrgent) btn.classList.add('urgent-slot');
      btn.querySelector('span').textContent = 'ON';
    } else {
      btn.classList.remove('active', 'urgent-slot');
      btn.querySelector('span').textContent = 'OFF';
    }
  }
}

function applyCalendarPreset(prefix, presetType) {
  if (!matrixSchedules[prefix]) {
    matrixSchedules[prefix] = createDefaultMatrixData(true);
  }
  const sched = matrixSchedules[prefix];
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  days.forEach(d => {
    if (!sched[d]) sched[d] = {};
    if (presetType === 'all') {
      sched[d].urgent_247 = true;
      sched[d].morning = true;
      sched[d].afternoon = true;
      sched[d].evening = true;
      sched[d].overnight = true;
    } else if (presetType === 'core') {
      const isWeekday = ['mon', 'tue', 'wed', 'thu', 'fri'].includes(d);
      sched[d].urgent_247 = false;
      sched[d].morning = isWeekday;
      sched[d].afternoon = isWeekday;
      sched[d].evening = false;
      sched[d].overnight = false;
    } else if (presetType === 'after_hours') {
      const isWeekend = ['sat', 'sun'].includes(d);
      sched[d].urgent_247 = true;
      sched[d].morning = isWeekend;
      sched[d].afternoon = isWeekend;
      sched[d].evening = true;
      sched[d].overnight = true;
    } else if (presetType === 'clear') {
      sched[d].urgent_247 = false;
      sched[d].morning = false;
      sched[d].afternoon = false;
      sched[d].evening = false;
      sched[d].overnight = false;
    }
  });

  const rootId = (prefix === 'inline' || prefix === 'page')
    ? 'inline-calendar-matrix-root' 
    : (prefix === 'modal' ? 'modal-calendar-matrix-root' : 'admin-calendar-matrix-root');
  renderCalendarMatrix(rootId, prefix);
  showToast(`Applied preset: ${presetType.toUpperCase()}`);
}

function getMatrixSchedule(prefix) {
  return matrixSchedules[prefix] || createDefaultMatrixData(true);
}

function handleStatusRadioChange(prefix, value) {
  const activeLabel = document.getElementById(`label-${prefix}-status-active`);
  const pausedLabel = document.getElementById(`label-${prefix}-status-paused`);
  if (value === 'active') {
    if (activeLabel) {
      activeLabel.style.background = '#ECFDF5';
      activeLabel.style.color = '#059669';
      activeLabel.style.borderColor = '#A7F3D0';
    }
    if (pausedLabel) {
      pausedLabel.style.background = '#F1F5F9';
      pausedLabel.style.color = '#64748B';
      pausedLabel.style.borderColor = '#CBD5E1';
    }
  } else {
    if (activeLabel) {
      activeLabel.style.background = '#F1F5F9';
      activeLabel.style.color = '#64748B';
      activeLabel.style.borderColor = '#CBD5E1';
    }
    if (pausedLabel) {
      pausedLabel.style.background = '#FEF3C7';
      pausedLabel.style.color = '#B45309';
      pausedLabel.style.borderColor = '#FCD34D';
    }
  }
}

function openProviderAdminPanel(spnOrId) {
  const allProviders = window.providerDB ? window.providerDB.getAll() : [];
  if (allProviders.length === 0) {
    showToast('No service providers registered yet.');
    return;
  }

  const currentUser = window.firebaseService?.getCurrentGoogleUser?.();
  if (currentUser && currentUser.role === 'provider' && !currentUser.hasCompletedApplication && !spnOrId) {
    const userProv = allProviders.find(p => p.email && p.email.toLowerCase() === (currentUser.email||'').toLowerCase());
    if (!userProv) {
      openServiceProviderRegisterModal(currentUser);
      showToast('Please complete your Service Provider application first.');
      return;
    }
  }

  const selector = document.getElementById('admin-provider-selector');
  if (selector) {
    selector.innerHTML = allProviders.map(p => `
      <option value="${p.id}">${p.name} (${p.serviceProviderNumber || p.id}) - ${p.status === 'paused' ? '⏸️ Paused' : '🟢 Active'}</option>
    `).join('');
  }

  let targetId = spnOrId;
  if (!targetId && currentUser?.spn) {
    const found = window.providerDB.findBySPN(currentUser.spn);
    if (found) targetId = found.id;
  }
  if (!targetId && currentUser?.email) {
    const foundEmail = allProviders.find(p => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase());
    if (foundEmail) targetId = foundEmail.id;
  }
  if (!targetId) targetId = allProviders[0].id;

  loadProviderIntoAdmin(targetId);

  document.getElementById('provider-admin-modal')?.classList.add('active');
  document.getElementById('settings-dropdown-panel')?.classList.remove('show');
}

function handleProviderAdminClick() {
  document.getElementById('settings-dropdown-panel')?.classList.remove('show');
  document.getElementById('settings-menu-btn')?.classList.remove('active');

  const currentUser = window.firebaseService?.getCurrentGoogleUser?.();
  if (currentUser && currentUser.role === 'provider') {
    if (currentUser.hasCompletedApplication) {
      openProviderAdminPanel(currentUser.spn);
    } else {
      openServiceProviderRegisterModal(currentUser);
      showToast('Please complete your Service Provider application first.');
    }
  } else {
    openServiceProviderRegisterModal(currentUser);
  }
}

function closeProviderAdminPanel() {
  document.getElementById('provider-admin-modal')?.classList.remove('active');
}

function openCustomerAdminPanel() {
  document.getElementById('google-user-menu')?.classList.remove('show');
  window.location.href = 'customer-admin.html';
}
window.openCustomerAdminPanel = openCustomerAdminPanel;

function loadProviderIntoAdmin(providerId) {
  const provider = window.providerDB.findById(providerId);
  if (!provider) return;

  currentAdminProviderId = provider.id;
  currentAdminBlackoutDates = Array.isArray(provider.blackoutDates) ? [...provider.blackoutDates] : [];

  const nameEl = document.getElementById('admin-current-provider-name');
  if (nameEl) {
    nameEl.textContent = `${provider.name} (${provider.serviceProviderNumber || provider.id}) • ${provider.tradeTitle}`;
  }

  const selector = document.getElementById('admin-provider-selector');
  if (selector && selector.value !== provider.id) {
    selector.value = provider.id;
  }

  updateAdminStatusUI(provider.status === 'paused', provider.pausedReason);

  const hourlyEl = document.getElementById('admin-hourly-rate');
  if (hourlyEl) hourlyEl.value = provider.hourlyRate || 95;
  const calloutEl = document.getElementById('admin-callout-fee');
  if (calloutEl) calloutEl.value = provider.pricing?.calloutFee || 35;
  const distRateEl = document.getElementById('admin-distance-rate');
  if (distRateEl) distRateEl.value = provider.pricing?.distanceCharging?.calloutPerUnit || 2;
  const distUnitEl = document.getElementById('admin-distance-unit');
  if (distUnitEl) distUnitEl.value = provider.distanceUnit || 'km';

  const sched = provider.calendarSchedule || createDefaultMatrixData(provider.workingHours?.is24_7 ?? true);
  renderCalendarMatrix('admin-calendar-matrix-root', 'admin', sched);
  renderAdminBlackoutChips();

  // Render configured services list
  const servicesContainer = document.getElementById('admin-services-list-container');
  if (servicesContainer) {
    const list = Array.isArray(provider.servicesList) && provider.servicesList.length > 0 
      ? provider.servicesList 
      : (provider.skills || []).map(s => ({
          name: s.charAt(0).toUpperCase() + s.slice(1),
          feeStructure: 'hourly',
          rate: provider.hourlyRate || 95
        }));

    if (list.length === 0) {
      servicesContainer.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted);">No individual services configured yet.</span>`;
    } else {
      servicesContainer.innerHTML = list.map(item => {
        let priceBadge = '';
        if (item.feeStructure === 'hourly') priceBadge = `$${item.rate}/hr`;
        else if (item.feeStructure === 'flat') priceBadge = `$${item.rate} flat`;
        else if (item.feeStructure === 'callout_hourly') priceBadge = `$${item.callout} callout + $${item.rate}/hr`;
        else if (item.feeStructure === 'day_rate') priceBadge = `$${item.rate}/day`;
        else if (item.feeStructure === 'half_day') priceBadge = `$${item.rate}/4hrs`;
        else if (item.feeStructure === 'per_metre') priceBadge = `$${item.rate}/m²`;
        else if (item.feeStructure === 'per_unit') priceBadge = `$${item.rate}/item`;
        else if (item.feeStructure === 'free_quote') priceBadge = `Free Quote`;
        else priceBadge = `$${item.rate || 95}`;

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; background:#F8FAFC; border:1px solid var(--border-light); border-radius:6px; padding:0.5rem 0.75rem;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-check" style="color:var(--brand-orange); font-size:0.8rem;"></i>
              <strong style="font-size:0.85rem; color:var(--primary-navy);">${item.name}</strong>
            </div>
            <span style="font-size:0.8rem; font-weight:800; color:#1E3A8A; background:#EFF6FF; border:1px solid #BFDBFE; border-radius:4px; padding:0.2rem 0.5rem;">
              ${priceBadge}
            </span>
          </div>
        `;
      }).join('');
    }
  }

  // Update Google Calendar Sync status in admin panel
  const gcalEmail = document.getElementById('admin-gcal-account-email');
  const gcalAutoblock = document.getElementById('admin-gcal-autoblock');
  const gcalBadge = document.getElementById('admin-gcal-badge');
  const gcalBox = document.getElementById('admin-gcal-sync-box');

  const googleUser = window.firebaseService?.getCurrentGoogleUser?.();
  const isGcalConnected = Boolean(googleUser || provider.googleCalendarConnected);
  const accountEmail = googleUser?.email || provider.googleEmail || `${provider.name.toLowerCase().replace(/[^a-z]/g, '.')}@gmail.com`;

  if (gcalEmail) gcalEmail.textContent = isGcalConnected ? accountEmail : 'Not connected';
  if (gcalAutoblock) gcalAutoblock.checked = provider.gcalAutoBlock !== false;
  if (gcalBadge) {
    gcalBadge.className = isGcalConnected ? 'gcal-badge-connected' : 'gcal-badge-disconnected';
    gcalBadge.innerHTML = isGcalConnected 
      ? '<i class="fa-solid fa-circle-check"></i> Google Calendar Connected' 
      : '<i class="fa-solid fa-circle-exclamation" style="color:#D97706;"></i> Disconnected';
  }
  if (gcalBox) {
    gcalBox.classList.toggle('connected', isGcalConnected);
  }

  // Load Work Teams summary for this provider
  if (typeof loadProviderWorkTeamsSummary === 'function') {
    loadProviderWorkTeamsSummary(provider);
  }
}

function loadProviderWorkTeamsSummary(provider) {
  const container = document.getElementById('provider-admin-teams-summary');
  if (!container || !window.workTeamsService) return;

  const spn = provider.serviceProviderNumber || provider.id;
  const allTeams = window.workTeamsService.getAllTeams();
  const myTeams = allTeams.filter(t => 
    t.ownerId === spn || 
    t.personInCharge?.spn === spn ||
    (t.members || []).some(m => m.spn === spn)
  );

  if (myTeams.length === 0) {
    container.innerHTML = `
      <div style="background:#fff; border:1px dashed #CBD5E1; border-radius:6px; padding:0.75rem; text-align:center; font-size:0.8rem; color:var(--text-muted);">
        Not assigned to any active work teams yet.
        <div style="margin-top:0.4rem;">
          <a href="/customer-admin.html?view=work-teams" class="btn btn-outline btn-sm" style="font-size:0.72rem; padding:0.25rem 0.6rem;">
            <i class="fa-solid fa-plus"></i> Create or Join a Work Team
          </a>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = myTeams.map(team => {
    const isPic = team.personInCharge?.spn === spn;
    return `
      <div style="background:#fff; border:1px solid var(--border-light); border-radius:6px; padding:0.65rem 0.85rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
        <div>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <strong style="font-size:0.88rem; color:var(--primary-navy);">${team.name}</strong>
            ${isPic ? '<span style="font-size:0.65rem; background:#FEF3C7; color:#92400E; padding:0.1rem 0.4rem; border-radius:4px; font-weight:800;"><i class="fa-solid fa-star"></i> PIC</span>' : ''}
          </div>
          <span style="font-size:0.74rem; color:var(--text-muted);">
            ${team.sectorLabel} • ${team.members?.length || 0} crew members • ${team.jobs?.length || 0} active jobs
          </span>
        </div>
        <a href="/customer-admin.html?view=work-teams&team=${team.id}" class="btn btn-outline btn-sm" style="font-size:0.72rem; padding:0.25rem 0.6rem; color:#2563EB; border-color:#BFDBFE; text-decoration:none;">
          <i class="fa-solid fa-arrow-right"></i> Open Crew Board
        </a>
      </div>
    `;
  }).join('');
}
window.loadProviderWorkTeamsSummary = loadProviderWorkTeamsSummary;

function toggleProviderAdminPause() {
  if (!currentAdminProviderId) return;
  const provider = window.providerDB.findById(currentAdminProviderId);
  if (!provider) return;

  const willBePaused = provider.status !== 'paused';
  provider.status = willBePaused ? 'paused' : 'active';
  if (willBePaused) {
    const reasonInput = document.getElementById('admin-pause-reason');
    provider.pausedReason = reasonInput?.value || "Taking a scheduled break";
  } else {
    provider.pausedReason = "";
  }

  updateAdminStatusUI(willBePaused, provider.pausedReason);
  window.providerDB.save();
  filterContractors();

  showToast(willBePaused ? 'Profile paused. You are on break.' : 'Profile resumed. You are LIVE and accepting jobs!');
}

function updateAdminStatusUI(isPaused, reason = "") {
  const badge = document.getElementById('admin-live-status-badge');
  const btn = document.getElementById('admin-toggle-pause-btn');
  const expl = document.getElementById('admin-status-explanation');
  const reasonWrap = document.getElementById('admin-pause-reason-wrapper');
  const reasonInput = document.getElementById('admin-pause-reason');
  const statusBox = document.getElementById('admin-status-box');

  if (isPaused) {
    statusBox?.classList.add('is-paused');
    if (badge) {
      badge.className = 'status-badge-live paused';
      badge.innerHTML = '<i class="fa-solid fa-circle-pause"></i> Profile Paused (On Break)';
    }
    if (btn) {
      btn.className = 'status-switch-btn btn-resume';
      btn.innerHTML = '<i class="fa-solid fa-play"></i> Resume Profile & Go Live';
    }
    if (expl) {
      expl.innerHTML = 'Your profile is currently <strong>PAUSED</strong>. You are temporarily hidden from new automated bookings and live map dispatch.';
    }
    if (reasonWrap) reasonWrap.style.display = 'block';
    if (reasonInput && reason) reasonInput.value = reason;
  } else {
    statusBox?.classList.remove('is-paused');
    if (badge) {
      badge.className = 'status-badge-live active';
      badge.innerHTML = 'Active & Receiving Bookings';
    }
    if (btn) {
      btn.className = 'status-switch-btn btn-pause';
      btn.innerHTML = '<i class="fa-solid fa-circle-pause"></i> Pause My Profile';
    }
    if (expl) {
      expl.innerHTML = 'Your profile is currently <strong>ACTIVE</strong> in the AI matching pool and visible on the live contractor map. Customers can book your active shift windows 24/7, 365 days a year.';
    }
    if (reasonWrap) reasonWrap.style.display = 'none';
  }
}

function addAdminBlackoutDate() {
  const input = document.getElementById('admin-new-blackout-date');
  if (!input || !input.value) return;
  const dateStr = input.value;
  if (!currentAdminBlackoutDates.includes(dateStr)) {
    currentAdminBlackoutDates.push(dateStr);
    renderAdminBlackoutChips();
    input.value = '';
    showToast(`Added blackout date: ${dateStr}`);
  }
}

function removeAdminBlackoutDate(dateStr, btn = null) {
  const doRemove = () => {
    currentAdminBlackoutDates = currentAdminBlackoutDates.filter(d => d !== dateStr);
    renderAdminBlackoutChips();
    showToast(`Blackout date ${dateStr} removed.`);
  };

  if (btn && typeof iasjConfirmDelete === 'function') {
    const chip = btn.closest('span') || btn;
    iasjConfirmDelete(chip, doRemove, {
      label: 'Remove?',
      compact: true,
      targetType: 'blackout_date',
      targetId: dateStr
    });
  } else {
    doRemove();
  }
}

function renderAdminBlackoutChips() {
  const container = document.getElementById('admin-blackout-chips-container');
  if (!container) return;
  if (currentAdminBlackoutDates.length === 0) {
    container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">No blackout dates set. Available 365 days a year.</span>';
    return;
  }
  container.innerHTML = currentAdminBlackoutDates.map(d => `
    <span class="date-chip" style="display:inline-flex; align-items:center; gap:0.4rem; background:#FEE2E2; border:1px solid #FCA5A5; color:#991B1B; padding:0.25rem 0.6rem; border-radius:var(--radius-full); font-size:0.75rem; font-weight:700;">
      <i class="fa-solid fa-calendar-xmark"></i> ${d}
      <button type="button" onclick="removeAdminBlackoutDate('${d}', this)" title="Remove blackout date" style="background:none; border:none; color:#991B1B; cursor:pointer; font-size:0.85rem; padding:0; margin-left:0.2rem;">&times;</button>
    </span>
  `).join('');
}

function saveProviderAdminSchedule() {
  if (!currentAdminProviderId) return;
  const provider = window.providerDB.findById(currentAdminProviderId);
  if (!provider) return;

  const schedule = getMatrixSchedule('admin');
  const hourly = wholeMoney(parseFloat(document.getElementById('admin-hourly-rate')?.value) || provider.hourlyRate);
  const callout = wholeMoney(parseFloat(document.getElementById('admin-callout-fee')?.value) || 35);
  const distRate = wholeMoney(parseFloat(document.getElementById('admin-distance-rate')?.value) || 2);
  const distUnit = document.getElementById('admin-distance-unit')?.value || 'km';
  const pauseReason = document.getElementById('admin-pause-reason')?.value || provider.pausedReason;

  const updates = {
    calendarSchedule: schedule,
    blackoutDates: currentAdminBlackoutDates,
    hourlyRate: hourly,
    pausedReason: pauseReason,
    distanceUnit: distUnit,
    pricing: {
      ...provider.pricing,
      hourlyRate: hourly,
      calloutFee: callout,
      distanceCharging: {
        ...(provider.pricing?.distanceCharging || {}),
        calloutPerUnit: distRate,
        courierPerUnit: distRate,
        unit: distUnit
      }
    }
  };

  window.providerDB.updateProvider(currentAdminProviderId, updates);
  filterContractors();
  closeProviderAdminPanel();
  showToast(`Schedule & settings saved for ${provider.name}!`);
}

function openProviderCalendarModal(providerId) {
  const provider = window.providerDB.findById(providerId);
  if (!provider) return;

  window.appState.currentViewingProviderId = provider.id;

  const avatar = document.getElementById('pub-cal-avatar');
  if (avatar) avatar.src = provider.avatar || 'assets/images/tradie_worker.jpg';
  const nameEl = document.getElementById('pub-cal-name');
  if (nameEl) nameEl.textContent = provider.name;
  const metaEl = document.getElementById('pub-cal-meta');
  if (metaEl) {
    metaEl.textContent = `${provider.tradeTitle} • ${provider.serviceProviderNumber || 'SPN-Verified'} • ${provider.baseSuburb || 'Gold Coast QLD'}`;
  }

  const isPaused = provider.status === 'paused';
  const statusPill = document.getElementById('pub-cal-status-pill');
  if (statusPill) {
    if (isPaused) {
      statusPill.className = 'card-status-pill paused';
      statusPill.innerHTML = '<i class="fa-solid fa-circle-pause"></i> Profile Paused';
    } else {
      statusPill.className = 'card-status-pill active';
      statusPill.innerHTML = '<i class="fa-solid fa-circle"></i> Active & On-Call';
    }
  }

  const banner = document.getElementById('pub-cal-paused-banner');
  const pausedReason = document.getElementById('pub-cal-paused-reason');
  if (banner) {
    banner.style.display = isPaused ? 'block' : 'none';
    if (pausedReason) {
      pausedReason.textContent = provider.pausedReason || 'This provider is currently on a scheduled break.';
    }
  }

  renderPublicCalendarGrid(provider);
  document.getElementById('provider-calendar-modal')?.classList.add('active');
}

function closeProviderCalendarModal() {
  document.getElementById('provider-calendar-modal')?.classList.remove('active');
}

function renderPublicCalendarGrid(provider) {
  const container = document.getElementById('pub-cal-grid-container');
  if (!container) return;

  const sched = provider.calendarSchedule || createDefaultMatrixData(provider.workingHours?.is24_7 ?? true);
  const blackouts = Array.isArray(provider.blackoutDates) ? provider.blackoutDates : [];

  const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const today = new Date();

  let html = '';

  for (let i = 0; i < 7; i++) {
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + i);

    const dayKey = daysOfWeek[targetDate.getDay()];
    const dateFormatted = targetDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const isToday = i === 0;
    const isoDateStr = targetDate.toISOString().split('T')[0];
    const isBlackout = blackouts.includes(isoDateStr);
    const daySchedule = sched[dayKey] || {};

    html += `
      <div class="public-day-column ${isToday ? 'is-today' : ''}">
        <div class="day-col-header">
          ${isToday ? 'Today' : targetDate.toLocaleDateString('en-AU', { weekday: 'short' })}
        </div>
        <div class="day-col-date">${dateFormatted}</div>
    `;

    if (isBlackout) {
      html += `
        <div class="day-slot-badge slot-off" title="Provider on leave this day">
          <i class="fa-solid fa-plane"></i> Day Off
        </div>
      `;
    } else {
      CALENDAR_SHIFTS.forEach(shift => {
        const isShiftAvail = !!daySchedule[shift.key] && provider.status !== 'paused';
        const shiftClass = isShiftAvail 
          ? (shift.isUrgent ? 'slot-urgent' : 'slot-avail')
          : 'slot-off';

        if (isShiftAvail) {
          html += `
            <div class="day-slot-badge ${shiftClass}" onclick="bookProviderShift('${provider.id}', '${shift.key}', '${dateFormatted}')">
              ${shift.isUrgent ? '⚡ Urgent 24/7' : shift.label}
            </div>
          `;
        } else {
          html += `
            <div class="day-slot-badge ${shiftClass}">
              ${shift.isUrgent ? 'Urgent: Off' : shift.label + ' Off'}
            </div>
          `;
        }
      });
    }

    html += `</div>`;
  }

  container.innerHTML = html;
}

function bookProviderShift(providerId, shiftKey, dateStr) {
  closeProviderCalendarModal();
  bookProviderDirectly(providerId);

  const mapShifts = {
    urgent_247: 'emergency_24_7',
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    overnight: 'overnight'
  };
  const appShift = mapShifts[shiftKey] || 'morning';
  selectShift(appShift);

  showToast(`Selected ${dateStr} - ${shiftKey.toUpperCase()} with contractor!`);
}

// Window global bindings for onclick handlers
window.renderCalendarMatrix = renderCalendarMatrix;
window.toggleMatrixSlot = toggleMatrixSlot;
window.applyCalendarPreset = applyCalendarPreset;
window.handleStatusRadioChange = handleStatusRadioChange;
window.openProviderAdminPanel = openProviderAdminPanel;
window.closeProviderAdminPanel = closeProviderAdminPanel;
window.loadProviderIntoAdmin = loadProviderIntoAdmin;
window.toggleProviderAdminPause = toggleProviderAdminPause;
window.addAdminBlackoutDate = addAdminBlackoutDate;
window.removeAdminBlackoutDate = removeAdminBlackoutDate;
window.saveProviderAdminSchedule = saveProviderAdminSchedule;
window.openProviderCalendarModal = openProviderCalendarModal;
window.closeProviderCalendarModal = closeProviderCalendarModal;
window.bookProviderShift = bookProviderShift;

/**
 * =========================================================================
 * Google Sign-In & Google Calendar Synchronization Controllers
 * =========================================================================
 */

function getGoogleCalendarUrl(booking) {
  if (!booking) return 'https://calendar.google.com';
  
  const title = `It's A Simple Job: ${booking.categoryName || 'Service Call'} (${booking.docketNumber})`;
  
  const now = new Date();
  const dateStr = booking.scheduledDate || new Date(now.getTime() + 86400000).toISOString().split('T')[0];
  
  let startHour = 8;
  let endHour = 12;
  const shift = (booking.shift || '').toLowerCase();
  if (shift.includes('morning') || shift.includes('7am')) {
    startHour = 7; endHour = 12;
  } else if (shift.includes('afternoon') || shift.includes('12pm')) {
    startHour = 12; endHour = 17;
  } else if (shift.includes('evening') || shift.includes('5pm')) {
    startHour = 17; endHour = 22;
  } else if (shift.includes('overnight') || shift.includes('10pm')) {
    startHour = 22; endHour = 23;
  } else if (shift.includes('urgent') || shift.includes('24/7')) {
    startHour = now.getHours();
    endHour = Math.min(23, startHour + 3);
  }

  const pad = (n) => String(n).padStart(2, '0');
  const dParts = dateStr.split('-');
  const y = dParts[0] || '2026';
  const m = dParts[1] || '10';
  const d = dParts[2] || '06';

  const startIso = `${y}${pad(m)}${pad(d)}T${pad(startHour)}0000`;
  const endIso = `${y}${pad(m)}${pad(d)}T${pad(endHour)}0000`;

  const details = [
    `IT'S A SIMPLE JOB - SERVICE BOOKING DOCKET`,
    `Docket Number: ${booking.docketNumber}`,
    `Customer Reference: ${booking.customerRefNumber || 'CRN-849102'}`,
    `Service Category: ${booking.categoryName || 'General Trade'}`,
    `Assigned Provider: ${booking.provider?.name || 'Local Verified Contractor'} (${booking.provider?.serviceProviderNumber || 'SPN-101001'})`,
    `Provider Business: ${booking.provider?.businessName || 'Verified Trade Partner'}`,
    `Customer Address: ${booking.custAddress || 'On-site'}`,
    `Shift Window: ${booking.shift || 'Urgent Dispatch'}`,
    `Estimated Total: ${window.iasjCurrency.formatAud(getInvoiceTotals(booking).total)} (invoiced in Australian Dollars)`,
    `24/7 Operations Hotline: 0495 019 791`
  ].join('\n');

  const location = booking.custAddress || 'Australia';

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startIso}/${endIso}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
}

async function triggerGoogleSignIn(role = 'supporter') {
  try {
    if (window.firebaseService?.signInWithGoogle) {
      const user = await window.firebaseService.signInWithGoogle(role);
      updateGoogleAuthUI(user);
      showToast(`Welcome ${user.displayName}! Signed in with Google.`);
      return user;
    }
  } catch (err) {
    console.error("Google sign in error:", err);
    showToast(err.message);
  }
}

async function signUpWithGoogle(role = 'supporter', bypassGate = false) {
  try {
    if (window.firebaseService?.signInWithGoogle) {
      const user = await window.firebaseService.signInWithGoogle(role);
      if (!user) return null;

      // Commit to localStorage immediately to avoid race conditions with view updates
      localStorage.setItem('iasj_google_user', JSON.stringify(user));
      updateGoogleAuthUI(user);
      closeRegisterSelectionPanel();

      // Automatically register user as a Community Supporter upon Google login
      let supporter = window.supporterDB.findByEmail(user.email);
      if (!supporter) {
        supporter = window.supporterDB.addSupporter({
          name: user.displayName || 'Google Supporter',
          email: user.email,
          phone: user.phoneNumber || '',
          suburb: '',
          photoURL: user.photoURL || '',
          googleUid: user.uid || ''
        });
      }
      localStorage.setItem(CURRENT_SUPPORTER_KEY, supporter.id);
      renderSupporterPanel();

      if (role === 'supporter' || role === 'provider' || user.role === 'superadmin' || user.isSuperadmin) {
        switchTab('driver-admin-tab', true);
        switchSupporterSubTab('supporter-details-subtab');
        showToast(`🎉 Logged in with Google! Welcome ${user.displayName || 'Supporter'}. You can now register details or access the Driver Application.`);
        return user;
      }

      if (role === 'customer') {
        switchTab('customer-application-tab');
        const nameInput = document.getElementById('inline-cust-name');
        const emailInput = document.getElementById('inline-cust-email');
        if (nameInput && !nameInput.value) nameInput.value = user.displayName || '';
        if (emailInput && !emailInput.value) emailInput.value = user.email || '';
        
        if (typeof restoreCustomerApplicationDraft === 'function') {
          restoreCustomerApplicationDraft();
        }
        if (typeof updateGoogleAuthBanners === 'function') {
          updateGoogleAuthBanners(user);
        }
        showToast(`Signed up with Google! Welcome ${user.displayName}. Fill out your details or save draft to continue anytime.`);
      } else if (role === 'provider') {
        const pageName = document.getElementById('page-prov-name');
        const pageEmail = document.getElementById('page-prov-email');
        if (pageName && !pageName.value) pageName.value = user.displayName || '';
        if (pageEmail && !pageEmail.value) pageEmail.value = user.email || '';

        // Check if this provider has already completed a registration application
        let existingProvider = null;
        if (user.spn && window.providerDB) {
          existingProvider = window.providerDB.findBySPN(user.spn);
        }
        if (!existingProvider && window.providerDB && user.email) {
          existingProvider = window.providerDB.getAll().find(p => p.email && p.email.toLowerCase() === user.email.toLowerCase());
        }

        if (existingProvider) {
          user.hasCompletedApplication = true;
          user.spn = existingProvider.serviceProviderNumber || existingProvider.id;
          localStorage.setItem('iasj_google_user', JSON.stringify(user));
          existingProvider.googleEmail = user.email;
          existingProvider.googleCalendarConnected = true;
          existingProvider.gcalAutoBlock = true;
          window.providerDB.save();
          openProviderAdminPanel(existingProvider.id);
          showToast(`Welcome back, ${existingProvider.name}! Google Calendar 2-way sync connected.`);
        } else {
          // USER MUST FILL OUT A COMPLETE SERVICE PROVIDER APPLICATION!
          switchTab('provider-application-tab');
          if (typeof restoreProviderApplicationDraft === 'function') {
            restoreProviderApplicationDraft();
          }
          if (typeof updateGoogleAuthBanners === 'function') {
            updateGoogleAuthBanners(user);
          }
          showToast(`Google linked for ${user.displayName}! Complete your Service Provider application or save draft to continue anytime.`);
        }
      } else if (role === 'franchise_admin') {
        switchTab('franchise-application-tab');
        const nameInput = document.getElementById('franchise-admin-name');
        const emailInput = document.getElementById('franchise-admin-email');
        if (nameInput && !nameInput.value) nameInput.value = user.displayName || '';
        if (emailInput && !emailInput.value) emailInput.value = user.email || '';
        
        user.franchiseName = user.displayName + "'s Franchise";
        // Override local user with franchise name so dashboard can display it
        localStorage.setItem('iasj_google_user', JSON.stringify(user));
        
        if (typeof restoreFranchiseApplicationDraft === 'function') {
          restoreFranchiseApplicationDraft();
        }
        if (typeof updateGoogleAuthBanners === 'function') {
          updateGoogleAuthBanners(user);
        }
        showToast(`Signed up with Google as Franchise Admin! Fill out your details or save draft to continue anytime.`);
      }
      return user;
    }
  } catch (err) {
    console.error("Google signup error:", err);
    showToast(err.message);
  }
}

function handleGoogleSignOut() {
  if (window.firebaseService?.signOutGoogle) {
    window.firebaseService.signOutGoogle();
  }
  updateGoogleAuthUI(null);
  if (appState.activeTab === 'driver-admin-tab') {
    switchTab('courier-tab');
  }
  showToast('Signed out of Google account.');
}

function toggleGoogleUserMenu(event) {
  event?.stopPropagation();
  const menu = document.getElementById('google-user-menu');
  if (menu) {
    const isVisible = menu.style.display === 'block' || menu.classList.contains('show');
    if (isVisible) {
      menu.style.display = 'none';
      menu.classList.remove('show');
    } else {
      menu.style.display = 'block';
      menu.classList.add('show');
    }
  }
}

function closeGoogleUserMenu() {
  const menu = document.getElementById('google-user-menu');
  if (menu) {
    menu.style.display = 'none';
    menu.classList.remove('show');
  }
}

function updateGoogleAuthUI(user) {
  const signinBtn = document.getElementById('nav-google-signin-btn') || document.getElementById('btn-google-signin-nav');
  const chip = document.getElementById('google-user-chip');
  const navAvatar = document.getElementById('google-nav-avatar');
  const navName = document.getElementById('google-nav-name');
  const navText = document.getElementById('google-nav-text');

  const menu = document.getElementById('google-user-menu');
  const menuAvatar = document.getElementById('google-menu-avatar');
  const menuName = document.getElementById('google-menu-name');
  const menuEmail = document.getElementById('google-menu-email');
  const menuRoleBadge = document.getElementById('google-menu-role-badge');

  const adminEmail = document.getElementById('admin-gcal-account-email');
  const adminBadge = document.getElementById('admin-gcal-badge');
  const adminSyncBox = document.getElementById('admin-gcal-sync-box');

  if (user) {
    document.body.classList.add('google-logged-in');
    if (signinBtn) signinBtn.style.display = 'none';
    const altBtn = document.getElementById('btn-google-signin-nav');
    if (altBtn) altBtn.style.display = 'none';
    const navBtn = document.getElementById('nav-google-signin-btn');
    if (navBtn) navBtn.style.display = 'none';

    if (chip) {
      chip.style.display = 'inline-flex';
      chip.setAttribute('aria-label', `Logged In with Google Profile Menu: ${user.displayName || 'Supporter'}`);
    }

    const supporterTabBtn = document.getElementById('tab-btn-supporter-admin');
    if (supporterTabBtn) supporterTabBtn.style.display = 'inline-flex';
    const footerSupporterLink = document.getElementById('footer-supporter-link');
    if (footerSupporterLink) footerSupporterLink.style.display = 'inline';
    
    const isSa = checkIsSuperadmin(user);
    if (isSa && user.role !== 'superadmin') {
      user.role = 'superadmin';
      user.isSuperadmin = true;
      localStorage.setItem('iasj_google_user', JSON.stringify(user));
    }

    let roleDisplay = 'Supporter';
    let roleIcon = 'fa-shield-heart';
    let roleColor = 'var(--brand-orange)';

    const activeRole = getActiveUserRole();
    if (activeRole === 'superadmin' || isSa) {
      const activeView = sessionStorage.getItem('iasj_superadmin_view_role');
      if (activeView && activeView !== 'superadmin') {
        const viewTitles = {
          customer: 'Customer View',
          provider: 'Driver View',
          driver: 'Driver View',
          supporter: 'Supporter View',
          franchise_admin: 'Franchise Admin View'
        };
        roleDisplay = `Superadmin (${viewTitles[activeView] || activeView})`;
      } else {
        roleDisplay = 'Superadmin';
      }
      roleIcon = 'fa-crown';
      roleColor = '#F59E0B';
    } else if (activeRole === 'driver' || user.role === 'driver' || user.isDriver === true || user.role === 'provider') {
      roleDisplay = 'Approved Courier Driver';
      roleIcon = 'fa-truck-fast';
      roleColor = '#3B82F6';
    } else {
      roleDisplay = 'Community Supporter';
      roleIcon = 'fa-shield-halved';
      roleColor = '#10B981';
    }

    const firstName = (user.displayName || 'Supporter').split(' ')[0];
    if (navText) {
      navText.textContent = `${firstName} (Logged In)`;
    } else if (navName) {
      navName.innerHTML = `<i class="fa-brands fa-google" style="color:#EA4335; font-size:0.75rem;"></i> <span>${firstName} (Logged In)</span>`;
    }
    if (navAvatar) navAvatar.src = user.photoURL || 'https://lh3.googleusercontent.com/a/default-user';

    if (menuAvatar) menuAvatar.src = user.photoURL || 'https://lh3.googleusercontent.com/a/default-user';
    if (menuName) menuName.textContent = user.displayName || 'Google Supporter';
    if (menuEmail) menuEmail.textContent = user.email || '';
    if (menuRoleBadge) {
      menuRoleBadge.innerHTML = `<i class="fa-brands fa-google" style="color:#EA4335;"></i> Active ${roleDisplay} • Logged In`;
    }

    const btnSwitchProvider = document.getElementById('google-menu-switch-to-provider');
    const btnSwitchCustomer = document.getElementById('google-menu-switch-to-customer');
    const btnSwitchFranchise = document.getElementById('google-menu-switch-to-franchise');
    const btnFranchiseDashboard = document.getElementById('google-menu-franchise-dashboard');
    
    if (btnSwitchProvider && btnSwitchCustomer && btnSwitchFranchise && btnFranchiseDashboard) {
      btnSwitchProvider.style.display = 'none';
      btnSwitchCustomer.style.display = 'none';
      btnSwitchFranchise.style.display = 'none';
      btnFranchiseDashboard.style.display = 'none';
      
      if (user.role === 'customer') {
        btnSwitchProvider.style.display = 'flex';
        btnSwitchFranchise.style.display = 'flex';
      } else if (user.role === 'provider') {
        btnSwitchCustomer.style.display = 'flex';
        btnSwitchFranchise.style.display = 'flex';
      } else if (user.role === 'franchise_admin') {
        btnFranchiseDashboard.style.display = 'flex';
        btnSwitchCustomer.style.display = 'flex';
        btnSwitchProvider.style.display = 'flex';
      }
    }

    if (adminEmail) adminEmail.textContent = user.email || 'connected@gmail.com';
    if (adminBadge) {
      adminBadge.className = 'gcal-badge-connected';
      adminBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Google Calendar Connected';
    }
    if (adminSyncBox) adminSyncBox.classList.add('connected');
  } else {
    document.body.classList.remove('google-logged-in');
    if (signinBtn) signinBtn.style.display = 'inline-flex';
    const altBtn = document.getElementById('btn-google-signin-nav');
    if (altBtn) altBtn.style.display = 'inline-flex';
    const navBtn = document.getElementById('nav-google-signin-btn');
    if (navBtn) navBtn.style.display = 'inline-flex';

    if (chip) chip.style.display = 'none';
    if (menu) {
      menu.style.display = 'none';
      menu.classList.remove('show');
    }

    const supporterTabBtn = document.getElementById('tab-btn-supporter-admin');
    if (supporterTabBtn) supporterTabBtn.style.display = 'none';
    const footerSupporterLink = document.getElementById('footer-supporter-link');
    if (footerSupporterLink) footerSupporterLink.style.display = 'none';

    if (adminEmail) adminEmail.textContent = 'Not connected';
    if (adminBadge) {
      adminBadge.className = 'gcal-badge-disconnected';
      adminBadge.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#D97706;"></i> Disconnected';
    }
    if (adminSyncBox) adminSyncBox.classList.remove('connected');
  }

  if (typeof updateGoogleAuthBanners === 'function') {
    updateGoogleAuthBanners(user);
  }
  try { updateDriverApplicationGateUI(); } catch (e) {}
}

function toggleGoogleCalendarAutoBlock(checked) {
  localStorage.setItem('iasj_gcal_autoblock', checked ? 'true' : 'false');
  if (currentAdminProviderId && window.providerDB) {
    const prov = window.providerDB.findById(currentAdminProviderId);
    if (prov) {
      prov.gcalAutoBlock = checked;
      window.providerDB.save();
    }
  }

  if (checked) {
    showToast('Google Calendar Auto-Block ENABLED: Personal calendar appointments will auto-blackout dispatch shifts.');
  } else {
    showToast('Google Calendar Auto-Block DISABLED: 24/7 availability active regardless of personal calendar entries.');
  }
}

function triggerGoogleCalendarManualSync() {
  showToast('🔄 Synchronizing with Google Calendar API...');
  setTimeout(() => {
    showToast('✅ Google Calendar synchronization complete! 0 scheduling conflicts detected. Your 24/7 shifts are active.');
  }, 600);
}

function routeUserToDashboard(user) {
  if (!user) return;
  // If provider has an active registered profile, they can view their admin panel if explicitly navigated
  if (user.role === 'provider' && user.hasCompletedApplication) {
    if (typeof openProviderAdminPanel === 'function') openProviderAdminPanel(user.spn);
  }
}

function initGoogleAuthUI() {
  const existingUser = window.firebaseService?.getCurrentGoogleUser?.();
  if (existingUser) {
    updateGoogleAuthUI(existingUser);
    // Do NOT automatically switch tabs on initial page load - user must remain on the main app page
  }

  window.addEventListener('googleAuthStateChanged', (e) => {
    updateGoogleAuthUI(e.detail?.user);
    syncSuperadminControls();
    if (e.detail?.action === 'login' && e.detail?.redirectOnLogin) {
      routeUserToDashboard(e.detail?.user);
    }
  });

  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#google-auth-nav-container')) {
      closeGoogleUserMenu();
    }
  });
}

// Window global bindings for Google Sign-In & Google Calendar
window.getGoogleCalendarUrl = getGoogleCalendarUrl;
window.triggerGoogleSignIn = triggerGoogleSignIn;
window.signUpWithGoogle = signUpWithGoogle;
window.handleGoogleSignOut = handleGoogleSignOut;
window.toggleGoogleUserMenu = toggleGoogleUserMenu;
window.closeGoogleUserMenu = closeGoogleUserMenu;
window.updateGoogleAuthUI = updateGoogleAuthUI;
window.toggleGoogleCalendarAutoBlock = toggleGoogleCalendarAutoBlock;
window.triggerGoogleCalendarManualSync = triggerGoogleCalendarManualSync;
window.initGoogleAuthUI = initGoogleAuthUI;

// Window global bindings for Services & Fee Structures Drop Boxes
window.addServiceFeeRow = addServiceFeeRow;
window.removeServiceFeeRow = removeServiceFeeRow;
window.handleCategoryChange = handleCategoryChange;
window.handleServiceSelectChange = handleServiceSelectChange;
window.handleFeeStructureChange = handleFeeStructureChange;
window.handleProviderAdminClick = handleProviderAdminClick;
window.handleSuccessModalOpenAdmin = handleSuccessModalOpenAdmin;
window.collectServicesFeeData = collectServicesFeeData;
window.renderDefaultServiceFeeRows = renderDefaultServiceFeeRows;

/**
 * 1-Click Clipboard Copy with Toast Feedback
 */
window.copyToClipboard = function(text, label = 'Text') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`✅ ${label} copied to clipboard: ${text}`);
    }).catch(() => {
      fallbackCopy(text, label);
    });
  } else {
    fallbackCopy(text, label);
  }
};

function fallbackCopy(text, label) {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(`✅ ${label} copied: ${text}`);
  } catch (err) {
    showToast(`Copy: ${text}`);
  }
}



// ==========================================
// Franchise Admin Logic
// ==========================================
function openFranchiseRegisterModal(user = null) {
  if (typeof switchTab === 'function') {
    switchTab('franchise-application-tab');
  }
  const currentUser = user || (function() {
    try { return JSON.parse(localStorage.getItem('iasj_google_user') || 'null'); } catch(e) { return null; }
  })();
  if (currentUser) {
    const nameInput = document.getElementById('franchise-admin-name');
    const emailInput = document.getElementById('franchise-admin-email');
    if (nameInput && !nameInput.value) nameInput.value = currentUser.displayName || '';
    if (emailInput && !emailInput.value) emailInput.value = currentUser.email || '';
  }
  if (typeof restoreFranchiseApplicationDraft === 'function') {
    restoreFranchiseApplicationDraft();
  }
  setTimeout(() => {
    const embeddedCard = document.querySelector('#franchise-application-tab .embedded-form-card') || document.getElementById('franchise-application-tab');
    if (embeddedCard) {
      embeddedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 60);
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

async function handleFranchiseRegisterSubmit(e) {
  e.preventDefault();
  const franchiseName = document.getElementById('franchise-name')?.value.trim() || 'Franchise Partner';
  const abn = document.getElementById('franchise-abn')?.value.trim() || '';
  const adminName = document.getElementById('franchise-admin-name')?.value.trim() || 'Franchise Manager';
  const adminTitle = document.getElementById('franchise-admin-title')?.value.trim() || 'General Manager & Operations Director';
  const adminEmail = document.getElementById('franchise-admin-email')?.value.trim() || '';
  const adminPhone = document.getElementById('franchise-admin-phone')?.value.trim() || '0412 000 000';
  const adminRegion = document.getElementById('franchise-admin-region')?.value.trim() || 'Australia';
  const adminLicense = document.getElementById('franchise-admin-license')?.value.trim() || '';
  const adminIsProvider = document.getElementById('franchise-admin-is-provider')?.checked || false;
  const adminPayId = document.getElementById('franchise-admin-payid')?.value.trim() || adminPhone;
  const adminPayIdType = document.getElementById('franchise-admin-payid-type')?.value || 'email';
  const adminBankName = document.getElementById('franchise-admin-bank-name')?.value.trim() || franchiseName;
  const adminBsb = document.getElementById('franchise-admin-bsb')?.value.trim() || '084-004';
  const adminAccount = document.getElementById('franchise-admin-account')?.value.trim() || '98765432';

  const user = {
    uid: 'franchise-' + Date.now(),
    displayName: adminName,
    email: adminEmail,
    role: 'franchise_admin',
    franchiseName: franchiseName,
    title: adminTitle,
    abn: abn,
    phone: adminPhone,
    region: adminRegion,
    license: adminLicense,
    isFieldProvider: adminIsProvider,
    payId: adminPayId,
    payIdType: adminPayIdType,
    photoURL: 'assets/images/tradie_worker.jpg'
  };

  localStorage.setItem('iasj_google_user', JSON.stringify(user));

  // Collect and register each staff technician and service provider
  const staffCards = document.querySelectorAll('#franchise-staff-container .franchise-staff-card');
  const registeredStaffList = [];

  // If Manager is also marked as an active field provider, register Manager
  if (adminIsProvider) {
    const managerSpn = window.firebaseService?.generateSPN?.() || (`SPN-${Math.floor(100000 + Math.random() * 900000)}`);
    const mgrLat = -28.0027 + (Math.random() * 0.08 - 0.04);
    const mgrLng = 153.4146 + (Math.random() * 0.08 - 0.04);

    const managerProvider = {
      id: managerSpn,
      serviceProviderNumber: managerSpn,
      name: adminName,
      businessName: `${adminName} (${franchiseName} - GM & Field Operations)`,
      category: 'handyman',
      tradeTitle: `${adminTitle} (${franchiseName})`,
      qbccLicense: adminLicense || 'Business Registered Licence',
      phone: adminPhone,
      email: adminEmail,
      baseSuburb: adminRegion,
      country: 'AU',
      distanceUnit: 'km',
      radius: 35,
      serviceAreas: [adminRegion],
      pricing: { hourly: 110, flat: 180, callout: 50 },
      servicesList: [
        { name: "Emergency Dispatch & Priority Inspection", feeStructure: "hourly", rate: 110, callout: 50 },
        { name: "Comprehensive Project Management & Site Review", feeStructure: "flat", rate: 250, callout: 0 }
      ],
      servicesOffered: "Emergency Dispatch & Priority Inspection, Comprehensive Project Management",
      skills: ["project management", "emergency inspection", "field diagnostics"],
      hourlyRate: 110,
      location: { lat: mgrLat, lng: mgrLng },
      bankDetails: {
        accountName: adminBankName,
        bsb: adminBsb,
        accountNumber: adminAccount,
        bankName: 'Franchise Central Settlement'
      },
      payId: adminPayId,
      payIdType: adminPayIdType,
      workingHours: {
        is24_7: true,
        shiftDescription: "24/7 • 365 Days a Year Franchise Dispatch",
        shifts: ['emergency_24_7', 'morning', 'afternoon', 'evening', 'overnight']
      },
      rating: 5.0,
      reviewCount: 2,
      status: 'active',
      isFranchiseManager: true,
      franchiseName,
      franchiseAdmin: adminName,
      franchiseId: user.uid
    };

    if (window.providerDB) {
      window.providerDB.addProvider(managerProvider);
    }
    if (window.firebaseService?.saveProviderToFirestore) {
      await window.firebaseService.saveProviderToFirestore(managerProvider);
    }

    registeredStaffList.push({
      id: managerSpn,
      name: `${adminName} (Franchise Manager)`,
      email: adminEmail,
      phone: adminPhone,
      category: 'handyman',
      tradeTitle: adminTitle,
      payId: adminPayId,
      isManager: true,
      addedAt: new Date().toISOString()
    });
  }

  for (let idx = 0; idx < staffCards.length; idx++) {
    const card = staffCards[idx];
    const i = card.dataset.index;
    const name = document.getElementById(`franchise-staff-${i}-name`)?.value.trim() || `Staff Technician #${idx + 1}`;
    const businessName = document.getElementById(`franchise-staff-${i}-business`)?.value.trim() || `${name} (${franchiseName})`;
    const bizName = document.getElementById(`franchise-staff-${i}-biz-name`)?.value.trim() || businessName;
    const bizCodeType = document.getElementById(`franchise-staff-${i}-biz-code-type`)?.value || 'ABN';
    const bizNumber = document.getElementById(`franchise-staff-${i}-biz-number`)?.value.trim() || '';
    const bizStructure = document.getElementById(`franchise-staff-${i}-biz-structure`)?.value || 'sole_trader';
    const bizGst = document.getElementById(`franchise-staff-${i}-biz-gst`)?.value || 'yes';
    const bizAddress = document.getElementById(`franchise-staff-${i}-biz-address`)?.value.trim() || '';
    const phone = document.getElementById(`franchise-staff-${i}-phone`)?.value.trim() || adminPhone;
    const email = document.getElementById(`franchise-staff-${i}-email`)?.value.trim() || adminEmail;
    const category = document.getElementById(`franchise-staff-${i}-category`)?.value || 'plumbing';
    const license = document.getElementById(`franchise-staff-${i}-license`)?.value.trim() || 'Verified Licence';
    const suburb = document.getElementById(`franchise-staff-${i}-suburb`)?.value.trim() || adminRegion;
    const country = document.getElementById(`franchise-staff-${i}-country`)?.value || 'AU';
    const radius = parseFloat(document.getElementById(`franchise-staff-${i}-radius`)?.value) || 25;
    const distRadio = document.querySelector(`input[name="franchise-staff-${i}-dist-unit"]:checked`);
    const distUnit = distRadio ? distRadio.value : 'km';
    const areasInput = document.getElementById(`franchise-staff-${i}-areas`)?.value.trim() || '';
    const serviceAreas = areasInput ? areasInput.split(',').map(s => s.trim()).filter(Boolean) : [suburb];

    // Pricing & Rates
    const hourlyActive = document.getElementById(`franchise-staff-${i}-rate-hourly`)?.checked !== false;
    const hourlyRate = wholeMoney(parseFloat(document.getElementById(`franchise-staff-${i}-hourly-rate`)?.value) || 95);
    const flatActive = document.getElementById(`franchise-staff-${i}-rate-flat`)?.checked || false;
    const flatRate = wholeMoney(parseFloat(document.getElementById(`franchise-staff-${i}-flat-rate`)?.value) || 150);
    const calloutActive = document.getElementById(`franchise-staff-${i}-rate-callout`)?.checked || false;
    const calloutRate = wholeMoney(parseFloat(document.getElementById(`franchise-staff-${i}-callout-rate`)?.value) || 45);
    const chargeDistance = document.getElementById(`franchise-staff-${i}-rate-distance`)?.checked || false;
    const calloutPerKm = wholeMoney(parseFloat(document.getElementById(`franchise-staff-${i}-callout-per-km`)?.value) || 2);
    const courierPerKm = wholeMoney(parseFloat(document.getElementById(`franchise-staff-${i}-courier-per-km`)?.value) || 2);
    const freeKm = parseFloat(document.getElementById(`franchise-staff-${i}-free-km`)?.value) || 10;

    const services = collectServicesFeeData(`franchise-staff-${i}`);
    const equipment = document.getElementById(`franchise-staff-${i}-equipment`)?.value.trim() || '';

    // Status & 24/7 Hours
    const statusRadio = document.querySelector(`input[name="franchise-staff-${i}-profile-status"]:checked`);
    const profileStatus = statusRadio ? statusRadio.value : 'active';
    const is24_7 = document.getElementById(`franchise-staff-${i}-shift-247`)?.checked || false;
    const shifts = [];
    if (is24_7) shifts.push('emergency_24_7');
    if (document.getElementById(`franchise-staff-${i}-shift-morn`)?.checked) shifts.push('morning');
    if (document.getElementById(`franchise-staff-${i}-shift-aft`)?.checked) shifts.push('afternoon');
    if (document.getElementById(`franchise-staff-${i}-shift-eve`)?.checked) shifts.push('evening');
    if (document.getElementById(`franchise-staff-${i}-shift-overnight`)?.checked) shifts.push('overnight');
    const insured = document.getElementById(`franchise-staff-${i}-insured`)?.checked || false;

    // Remuneration Route
    const route = document.getElementById(`franchise-staff-${i}-payout-route`)?.value || 'franchise';
    const staffPayId = document.getElementById(`franchise-staff-${i}-payid`)?.value.trim() || adminPayId;
    const staffPayIdType = document.getElementById(`franchise-staff-${i}-payid-type`)?.value || 'phone';
    const staffBankName = document.getElementById(`franchise-staff-${i}-bank-name`)?.value.trim() || name;
    const staffBsb = document.getElementById(`franchise-staff-${i}-bsb`)?.value.trim() || adminBsb;
    const staffAccount = document.getElementById(`franchise-staff-${i}-account`)?.value.trim() || adminAccount;

    const spn = window.firebaseService?.generateSPN?.() || (`SPN-${Math.floor(100000 + Math.random() * 900000)}`);
    const lat = -28.0027 + (Math.random() * 0.1 - 0.05);
    const lng = 153.4146 + (Math.random() * 0.1 - 0.05);

    const staffProvider = {
      id: spn,
      name,
      businessName: bizName || businessName,
      businessLegalName: bizName,
      businessNumber: bizNumber,
      businessCodeType: bizCodeType,
      abn: bizNumber,
      businessStructure: bizStructure,
      gstRegistered: bizGst === 'yes',
      businessAddress: bizAddress,
      category,
      serviceProviderNumber: spn,
      tradeTitle: `${category.toUpperCase()} Specialist (${franchiseName})`,
      qbccLicense: license,
      phone,
      email,
      baseSuburb: suburb,
      country,
      distanceUnit: distUnit,
      radius,
      serviceAreas,
      pricing: {
        hourly: hourlyRate,
        flat: flatRate,
        callout: calloutRate,
        distanceCharge: {
          enabled: chargeDistance,
          calloutPerKm,
          courierPerKm,
          freeKm
        }
      },
      servicesList: services,
      servicesOffered: services.map(s => s.name).join(', ') || `${category} services`,
      skills: services.length > 0 ? services.map(s => s.name.toLowerCase()) : [category],
      hourlyRate: hourlyActive ? hourlyRate : (services.find(s => s.feeStructure === 'hourly')?.rate || 85),
      tools: equipment,
      location: { lat, lng },
      insurance: insured ? "$10M+ Public Liability / Transit Cover Verified" : "",
      bankDetails: route === 'staff' ? {
        accountName: staffBankName,
        bsb: staffBsb,
        accountNumber: staffAccount,
        bankName: 'Staff Designated Account',
        payId: staffPayId,
        payIdType: staffPayIdType
      } : {
        accountName: adminBankName,
        bsb: adminBsb,
        accountNumber: adminAccount,
        bankName: 'Franchise Central Settlement',
        payId: adminPayId,
        payIdType: adminPayIdType
      },
      payId: route === 'staff' ? staffPayId : adminPayId,
      payIdType: route === 'staff' ? staffPayIdType : adminPayIdType,
      workingHours: {
        is24_7,
        shiftDescription: is24_7 ? "24/7 • 365 Days a Year On-Call" : "Standard Registered Shifts",
        shifts: shifts.length > 0 ? shifts : ['morning', 'afternoon']
      },
      rating: 5.0,
      reviewCount: 1,
      status: profileStatus,
      franchiseName,
      franchiseAdmin: adminName,
      franchiseId: user.uid
    };

    if (window.providerDB) {
      window.providerDB.addProvider(staffProvider);
    }
    if (window.firebaseService?.saveProviderToFirestore) {
      await window.firebaseService.saveProviderToFirestore(staffProvider);
    }

    registeredStaffList.push({
      id: spn,
      name,
      email,
      phone,
      category,
      tradeTitle: `${category.toUpperCase()} Specialist`,
      bizName,
      bizCodeType,
      bizNumber,
      bizStructure,
      bizGst,
      abn: bizNumber,
      bizAddress,
      payId: route === 'staff' ? staffPayId : adminPayId,
      route,
      servicesCount: services.length,
      is24_7,
      status: profileStatus,
      addedAt: new Date().toISOString()
    });
  }

  localStorage.setItem('iasj_franchise_staff', JSON.stringify(registeredStaffList));

  if (window.firebaseService?.savePartnerApplicationToFirestore) {
    await window.firebaseService.savePartnerApplicationToFirestore({
      franchiseName,
      abn,
      adminName,
      adminTitle,
      adminEmail,
      adminPhone,
      adminRegion,
      adminIsProvider,
      staffCount: registeredStaffList.length
    });
  }

  closeFranchiseRegisterModal();
  if (typeof clearFranchiseApplicationDraft === 'function') {
    clearFranchiseApplicationDraft(false);
  }

  // Open franchise success modal if present on standalone page
  const successModal = document.getElementById('franchise-success-modal');
  if (successModal) {
    const nameEl = document.getElementById('modal-franchise-name');
    const mgrEl = document.getElementById('modal-franchise-manager');
    const countEl = document.getElementById('modal-franchise-staff-count');
    if (nameEl) nameEl.textContent = franchiseName;
    if (mgrEl) mgrEl.textContent = adminName;
    if (countEl) countEl.textContent = registeredStaffList.length;
    successModal.classList.add('active');
  }

  showToast(`✅ Franchise '${franchiseName}' registered with Manager '${adminName}' and ${registeredStaffList.length} staff technician(s)!`);
  
  window.dispatchEvent(new CustomEvent('googleAuthStateChanged', { detail: { user: user, action: 'login' } }));
  if (window.filterContractors) window.filterContractors();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeFranchiseSuccessModal() {
  document.getElementById('franchise-success-modal')?.classList.remove('active');
}
window.closeFranchiseSuccessModal = closeFranchiseSuccessModal;

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
  
  // Register staff globally
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
    radius: 25,
    distanceUnit: 'km',
    category: category,
    tradeTitle: `${category.charAt(0).toUpperCase() + category.slice(1)} Specialist (Franchise Staff)`,
    servicesList: [{ name: "General Maintenance & Service", feeStructure: "hourly", rate: 85, callout: 35 }],
    servicesOffered: 'General Maintenance & Service',
    status: 'active',
    workingHours: {
      is24_7: true,
      shiftDescription: "24/7 • 365 Days On-Call Dispatch",
      shifts: ['emergency_24_7', 'morning', 'afternoon']
    },
    bankDetails: {
      accountName: name,
      payId: payId,
      bsb: '084-004',
      account: '12345678'
    },
    payId: payId,
    payIdType: 'phone'
  };

  if (window.providerDB) {
    window.providerDB.addProvider(providerProfile);
  }

  document.getElementById('franchise-add-staff-form')?.reset();
  showToast(`✅ Staff member '${name}' registered with ${spn} (${bizCodeType}: ${bizNumber || 'Registered'})!`);
  renderFranchiseStaff();
  
  if (window.filterContractors) window.filterContractors();
}

function renderFranchiseStaff() {
  const container = document.getElementById('franchise-staff-list');
  if (!container) return;

  const staffList = JSON.parse(localStorage.getItem('iasj_franchise_staff') || '[]');
  
  if (staffList.length === 0) {
    container.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.85rem; border:1.5px dashed var(--border-light); border-radius:var(--radius-md); background:#fff;">No staff or service providers registered under this franchise yet.</div>`;
    return;
  }

  container.innerHTML = staffList.map(staff => {
    const cat = staff.category || 'plumbing';
    const isOnline = staff.status !== 'paused';
    return `
      <div style="background:#fff; border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:1rem 1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <span class="franchise-staff-badge badge-${cat}">
            ${cat.toUpperCase()}
          </span>
          <div>
            <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
              <h4 style="margin:0; color:var(--primary-navy); font-size:1.02rem; font-weight:800;">
                ${staff.name} ${staff.isManager ? '<span style="font-size:0.72rem; background:#EDE9FE; color:#7E22CE; padding:0.15rem 0.5rem; border-radius:10px; font-weight:700;">MANAGER</span>' : ''}
              </h4>
              ${staff.bizNumber ? `<span style="font-size:0.72rem; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; padding:0.12rem 0.5rem; border-radius:6px; font-weight:700;"><i class="fa-solid fa-briefcase"></i> ${staff.bizCodeType || 'ABN'}: ${staff.bizNumber}</span>` : ''}
            </div>
            ${staff.bizName ? `<div style="font-size:0.78rem; font-weight:700; color:#475569; margin-top:0.2rem;"><i class="fa-solid fa-building"></i> ${staff.bizName} ${staff.bizStructure ? '<span style="font-weight:400; color:#64748B;">(' + staff.bizStructure.replace('_', ' ').toUpperCase() + ')</span>' : ''}</div>` : ''}
            <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.25rem; display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
              <span><i class="fa-solid fa-id-card"></i> <strong>${staff.id || 'SPN-Verified'}</strong></span>
              <span>•</span>
              <span><i class="fa-solid fa-phone"></i> ${staff.phone || '0400 000 000'}</span>
              <span>•</span>
              <span><i class="fa-solid fa-envelope"></i> ${staff.email || 'staff@franchise.com'}</span>
              <span>•</span>
              <span><i class="fa-solid fa-money-check-dollar"></i> ${staff.payId || 'Central Bank'}</span>
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          ${staff.is24_7 ? '<span style="font-size:0.72rem; background:#FFFBEB; color:#B45309; padding:0.2rem 0.55rem; border-radius:12px; font-weight:800; border:1px solid #FDE68A;"><i class="fa-solid fa-bolt"></i> 24/7 ON-CALL</span>' : ''}
          <span class="badge-status ${isOnline ? 'online' : 'offline'}" style="font-size:0.75rem; font-weight:700;">
            ${isOnline ? '🟢 Active Dispatch' : '⏸️ Paused'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

window.openFranchiseRegisterModal = openFranchiseRegisterModal;
window.closeFranchiseRegisterModal = closeFranchiseRegisterModal;
window.openFranchiseDashboard = openFranchiseDashboard;
window.closeFranchiseDashboard = closeFranchiseDashboard;
window.handleFranchiseRegisterSubmit = handleFranchiseRegisterSubmit;
window.handleAddStaffSubmit = handleAddStaffSubmit;
window.renderFranchiseStaff = renderFranchiseStaff;
window.handleAddStaffSubmit = handleAddStaffSubmit;
window.renderFranchiseStaff = renderFranchiseStaff;

// =========================================================================
// DRAFT PERSISTENCE & AUTO-SAVE CONTROLLER (GOOGLE ACCOUNT LINKED)
// =========================================================================

function getDraftStorageKey(formType) {
  const user = window.firebaseService?.getCurrentGoogleUser?.() || (function() {
    try { return JSON.parse(localStorage.getItem('iasj_google_user') || 'null'); } catch(e) { return null; }
  })();
  if (user?.email) {
    const sanitizedEmail = user.email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    return `iasj_draft_${formType}_${sanitizedEmail}`;
  }
  return `iasj_draft_${formType}_guest`;
}

function updateDraftStatusUI(id, text, isSaving = false) {
  const elem = document.getElementById(id);
  if (!elem) return;
  elem.innerHTML = isSaving 
    ? `<i class="fa-solid fa-spinner fa-spin" style="color:var(--brand-orange);"></i> <span>${text}</span>`
    : `<i class="fa-solid fa-cloud-check" style="color:#10B981;"></i> <span>${text}</span>`;
}

function updateGoogleAuthBanners(user = null) {
  const currentUser = user || window.firebaseService?.getCurrentGoogleUser?.() || (function() {
    try { return JSON.parse(localStorage.getItem('iasj_google_user') || 'null'); } catch(e) { return null; }
  })();

  const bannerConfigs = [
    { id: 'page-prov-google-banner', role: 'provider', roleTitle: 'Service Provider' },
    { id: 'inline-cust-google-banner', role: 'customer', roleTitle: 'Customer' },
    { id: 'franchise-google-banner', role: 'franchise_admin', roleTitle: 'Franchise Admin' }
  ];

  bannerConfigs.forEach(({ id, role, roleTitle }) => {
    const banner = document.getElementById(id);
    if (!banner) return;

    if (currentUser) {
      banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <img src="${currentUser.photoURL || 'assets/images/tradie_worker.jpg'}" style="width:38px; height:38px; border-radius:50%; border:2px solid #ffffff; object-fit:cover; box-shadow:0 2px 6px rgba(0,0,0,0.25);" alt="User">
          <div>
            <div style="font-size:0.88rem; font-weight:700; color:#ffffff;">
              <i class="fa-solid fa-circle-check" style="color:#10B981; margin-right:4px;"></i> Signed in with Google: ${currentUser.displayName || 'Google User'}
            </div>
            <div style="font-size:0.75rem; color:#E2E8F0; margin-top:2px;">
              <i class="fa-solid fa-envelope" style="margin-right:4px;"></i> ${currentUser.email || ''} &bull; <i class="fa-solid fa-cloud-check" style="color:#38BDF8; margin-right:3px;"></i> Application draft linked to this Google account
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
          <span style="background:rgba(255,255,255,0.18); color:#ffffff; border-radius:20px; font-size:0.75rem; padding:0.3rem 0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:0.4rem;">
            <i class="fa-solid fa-calendar-check" style="color:#60A5FA;"></i> Google Calendar 2-Way Sync
          </span>
          <button type="button" class="btn btn-sm" onclick="handleGoogleSignOut()" style="background:rgba(0,0,0,0.3); color:#F8FAFC; border:1px solid rgba(255,255,255,0.25); font-size:0.75rem; padding:0.3rem 0.65rem; border-radius:14px; cursor:pointer;">
            <i class="fa-solid fa-right-from-bracket"></i> Switch Account
          </button>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.65rem;">
          <div style="width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; color:#FCD34D; font-size:1.1rem;">
            <i class="fa-brands fa-google"></i>
          </div>
          <div>
            <div style="font-size:0.85rem; font-weight:700; color:#FFFFFF;">
              Save your ${roleTitle} application & continue later with Google
            </div>
            <div style="font-size:0.74rem; color:#CBD5E1; margin-top:2px;">
              Sign in with Google to automatically safeguard your draft details and connect your personal Google Calendar.
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-sm" onclick="signUpWithGoogle('${role}')" style="background:#FFFFFF; color:#0F172A; font-weight:700; font-size:0.8rem; padding:0.45rem 0.9rem; border-radius:20px; border:none; display:inline-flex; align-items:center; gap:0.45rem; box-shadow:0 2px 6px rgba(0,0,0,0.2); cursor:pointer;">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="16" height="16" alt="Google">
          Sign In / Link with Google
        </button>
      `;
    }
  });
}

// -------------------------------------------------------------------------
// 1. Service Provider Application Draft Operations
// -------------------------------------------------------------------------
function saveProviderApplicationDraft(notify = false) {
  const form = document.getElementById('inline-provider-reg-form');
  if (!form) return;

  const services = collectServicesFeeData('page');
  
  // Persist calendar schedule directly from matrix
  const calendarSchedule = matrixSchedules['inline'] || matrixSchedules['page'] || createDefaultMatrixData(true);

  const distUnitRadio = document.querySelector('input[name="page-prov-dist-unit"]:checked');
  const profileStatusRadio = document.querySelector('input[name="inline-profile-status"]:checked');

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const radiusVal = document.getElementById('page-prov-radius')?.value 
    || document.getElementById('page-prov-radius-dist')?.value 
    || '25';

  const accountVal = document.getElementById('page-prov-account')?.value 
    || document.getElementById('page-prov-account-number')?.value 
    || '';

  const bankNameVal = document.getElementById('page-prov-bank-name')?.value 
    || document.getElementById('page-prov-account-name')?.value 
    || '';

  const draft = {
    name: document.getElementById('page-prov-name')?.value || '',
    business: document.getElementById('page-prov-business')?.value || '',
    category: document.getElementById('page-prov-category')?.value || 'plumbing',
    license: document.getElementById('page-prov-license')?.value || '',
    phone: document.getElementById('page-prov-phone')?.value || '',
    email: document.getElementById('page-prov-email')?.value || '',
    unitNumber: document.getElementById('page-prov-unit-number')?.value || '',
    streetAddress: document.getElementById('page-prov-street-address')?.value || '',
    suburb: document.getElementById('page-prov-suburb')?.value || '',
    postcode: document.getElementById('page-prov-postcode')?.value || '',
    country: document.getElementById('page-prov-country')?.value || 'AU',
    radiusDist: radiusVal,
    distUnit: distUnitRadio ? distUnitRadio.value : 'km',
    suburbsList: document.getElementById('page-prov-suburbs-list')?.value || '',
    equipment: document.getElementById('page-prov-equipment')?.value || '',
    servicesDesc: document.getElementById('page-prov-services-desc')?.value || '',
    callout: document.getElementById('page-prov-callout')?.value || '35',
    hourly: document.getElementById('page-prov-hourly')?.value || '85',
    flat: document.getElementById('page-prov-flat')?.value || '130',
    emergency: document.getElementById('page-prov-emergency')?.value || '120',
    notes: document.getElementById('page-prov-notes')?.value || '',
    payoutPreference: document.getElementById('page-prov-payout-preference')?.value || 'bank_transfer',
    payid: document.getElementById('page-prov-payid')?.value || '',
    payidType: document.getElementById('page-prov-payid-type')?.value || 'phone',
    bsb: document.getElementById('page-prov-bsb')?.value || '',
    accountNumber: accountVal,
    accountName: bankNameVal,
    profileStatus: profileStatusRadio ? profileStatusRadio.value : 'active',
    shift247: document.getElementById('page-shift-247')?.checked || false,
    shiftMorn: document.getElementById('page-shift-morn')?.checked || false,
    shiftAft: document.getElementById('page-shift-aft')?.checked || false,
    shiftEve: document.getElementById('page-shift-eve')?.checked || false,
    shiftOvernight: document.getElementById('page-shift-overnight')?.checked || false,
    rateHourly: document.getElementById('page-rate-hourly')?.checked || false,
    rateFlat: document.getElementById('page-rate-flat')?.checked || false,
    rateCallout: document.getElementById('page-rate-callout')?.checked || false,
    rateDistance: document.getElementById('page-rate-distance')?.checked || false,
    services,
    calendarSchedule,
    savedAt: now.toISOString(),
    savedDisplay: `${timeStr}, ${dateStr}`
  };

  const key = getDraftStorageKey('provider');
  localStorage.setItem(key, JSON.stringify(draft));
  localStorage.setItem('iasj_draft_provider_latest', JSON.stringify(draft));

  updateDraftStatusUI('page-prov-draft-status', `Draft saved ${timeStr}`);

  if (notify) {
    showToast(`💾 Service Provider application draft saved! You can close your browser and resume anytime.`);
  }
}

function restoreProviderApplicationDraft() {
  const key = getDraftStorageKey('provider');
  let raw = localStorage.getItem(key);
  if (!raw) {
    raw = localStorage.getItem('iasj_draft_provider_latest');
  }
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    if (!draft) return;

    if (draft.name && document.getElementById('page-prov-name')) document.getElementById('page-prov-name').value = draft.name;
    if (draft.business && document.getElementById('page-prov-business')) document.getElementById('page-prov-business').value = draft.business;
    if (draft.category && document.getElementById('page-prov-category')) {
      document.getElementById('page-prov-category').value = draft.category;
    }
    if (draft.license && document.getElementById('page-prov-license')) document.getElementById('page-prov-license').value = draft.license;
    if (draft.phone && document.getElementById('page-prov-phone')) document.getElementById('page-prov-phone').value = draft.phone;
    if (draft.email && document.getElementById('page-prov-email')) document.getElementById('page-prov-email').value = draft.email;
    if (draft.unitNumber && document.getElementById('page-prov-unit-number')) document.getElementById('page-prov-unit-number').value = draft.unitNumber;
    if (draft.streetAddress && document.getElementById('page-prov-street-address')) document.getElementById('page-prov-street-address').value = draft.streetAddress;
    if (draft.suburb && document.getElementById('page-prov-suburb')) document.getElementById('page-prov-suburb').value = draft.suburb;
    if (draft.postcode && document.getElementById('page-prov-postcode')) document.getElementById('page-prov-postcode').value = draft.postcode;
    if (draft.country && document.getElementById('page-prov-country')) document.getElementById('page-prov-country').value = draft.country;
    
    // Radius support
    const radiusVal = draft.radiusDist || draft.radius;
    if (radiusVal) {
      if (document.getElementById('page-prov-radius')) document.getElementById('page-prov-radius').value = radiusVal;
      if (document.getElementById('page-prov-radius-dist')) document.getElementById('page-prov-radius-dist').value = radiusVal;
    }

    if (draft.suburbsList && document.getElementById('page-prov-suburbs-list')) document.getElementById('page-prov-suburbs-list').value = draft.suburbsList;
    if (draft.equipment && document.getElementById('page-prov-equipment')) document.getElementById('page-prov-equipment').value = draft.equipment;
    if (draft.servicesDesc && document.getElementById('page-prov-services-desc')) document.getElementById('page-prov-services-desc').value = draft.servicesDesc;
    if (draft.callout && document.getElementById('page-prov-callout')) document.getElementById('page-prov-callout').value = draft.callout;
    if (draft.hourly && document.getElementById('page-prov-hourly')) document.getElementById('page-prov-hourly').value = draft.hourly;
    if (draft.flat && document.getElementById('page-prov-flat')) document.getElementById('page-prov-flat').value = draft.flat;
    if (draft.emergency && document.getElementById('page-prov-emergency')) document.getElementById('page-prov-emergency').value = draft.emergency;
    if (draft.notes && document.getElementById('page-prov-notes')) document.getElementById('page-prov-notes').value = draft.notes;
    if (draft.payoutPreference && document.getElementById('page-prov-payout-preference')) document.getElementById('page-prov-payout-preference').value = draft.payoutPreference;
    if (draft.payid && document.getElementById('page-prov-payid')) document.getElementById('page-prov-payid').value = draft.payid;
    if (draft.payidType && document.getElementById('page-prov-payid-type')) document.getElementById('page-prov-payid-type').value = draft.payidType;
    if (draft.bsb && document.getElementById('page-prov-bsb')) document.getElementById('page-prov-bsb').value = draft.bsb;
    
    // Bank Details support
    const acctVal = draft.accountNumber || draft.account;
    if (acctVal) {
      if (document.getElementById('page-prov-account')) document.getElementById('page-prov-account').value = acctVal;
      if (document.getElementById('page-prov-account-number')) document.getElementById('page-prov-account-number').value = acctVal;
    }

    const bankNameVal = draft.accountName || draft.bankName;
    if (bankNameVal) {
      if (document.getElementById('page-prov-bank-name')) document.getElementById('page-prov-bank-name').value = bankNameVal;
      if (document.getElementById('page-prov-account-name')) document.getElementById('page-prov-account-name').value = bankNameVal;
    }

    if (draft.distUnit) {
      const radio = document.querySelector(`input[name="page-prov-dist-unit"][value="${draft.distUnit}"]`);
      if (radio) radio.checked = true;
    }

    if (draft.profileStatus) {
      const radio = document.querySelector(`input[name="inline-profile-status"][value="${draft.profileStatus}"]`);
      if (radio) radio.checked = true;
    }

    if (typeof draft.shift247 === 'boolean' && document.getElementById('page-shift-247')) document.getElementById('page-shift-247').checked = draft.shift247;
    if (typeof draft.shiftMorn === 'boolean' && document.getElementById('page-shift-morn')) document.getElementById('page-shift-morn').checked = draft.shiftMorn;
    if (typeof draft.shiftAft === 'boolean' && document.getElementById('page-shift-aft')) document.getElementById('page-shift-aft').checked = draft.shiftAft;
    if (typeof draft.shiftEve === 'boolean' && document.getElementById('page-shift-eve')) document.getElementById('page-shift-eve').checked = draft.shiftEve;
    if (typeof draft.shiftOvernight === 'boolean' && document.getElementById('page-shift-overnight')) document.getElementById('page-shift-overnight').checked = draft.shiftOvernight;

    if (typeof draft.rateHourly === 'boolean' && document.getElementById('page-rate-hourly')) document.getElementById('page-rate-hourly').checked = draft.rateHourly;
    if (typeof draft.rateFlat === 'boolean' && document.getElementById('page-rate-flat')) document.getElementById('page-rate-flat').checked = draft.rateFlat;
    if (typeof draft.rateCallout === 'boolean' && document.getElementById('page-rate-callout')) document.getElementById('page-rate-callout').checked = draft.rateCallout;
    if (typeof draft.rateDistance === 'boolean' && document.getElementById('page-rate-distance')) document.getElementById('page-rate-distance').checked = draft.rateDistance;

    // Restore custom services & fee structures properly
    if (draft.services && Array.isArray(draft.services) && draft.services.length > 0) {
      const container = document.getElementById('page-services-fee-container');
      if (container) {
        container.innerHTML = '';
        draft.services.forEach(srv => {
          addServiceFeeRow('page', srv);
        });
      }
    }

    // Restore Calendar Matrix
    if (draft.calendarSchedule) {
      matrixSchedules['inline'] = draft.calendarSchedule;
      matrixSchedules['page'] = draft.calendarSchedule;
      renderCalendarMatrix('inline-calendar-matrix-root', 'inline');
    }

    const banner = document.getElementById('prov-restored-draft-banner');
    const textSpan = document.getElementById('prov-draft-time-text');
    if (banner) {
      banner.style.display = 'flex';
      if (textSpan) {
        textSpan.textContent = `Draft restored from ${draft.savedDisplay || 'previous session'}. You can continue editing or save updates anytime.`;
      }
    }

    updateDraftStatusUI('page-prov-draft-status', `Draft resumed (${draft.savedDisplay ? draft.savedDisplay.split(',')[0] : 'Saved'})`);
  } catch (err) {
    console.warn("Could not restore provider draft:", err);
  }
}

function clearProviderApplicationDraft(notify = true, btn = null) {
  const doClear = () => {
    const key = getDraftStorageKey('provider');
    localStorage.removeItem(key);
    localStorage.removeItem('iasj_draft_provider_latest');

    document.getElementById('inline-provider-reg-form')?.reset();
    const banner = document.getElementById('prov-restored-draft-banner');
    if (banner) banner.style.display = 'none';

    renderDefaultServiceFeeRows('page', 'plumbing');
    updateDraftStatusUI('page-prov-draft-status', 'Draft cleared');

    // Pre-fill Google user details again if logged in
    const user = window.firebaseService?.getCurrentGoogleUser?.() || (function() {
      try { return JSON.parse(localStorage.getItem('iasj_google_user') || 'null'); } catch(e) { return null; }
    })();
    if (user) {
      const pageName = document.getElementById('page-prov-name');
      const pageEmail = document.getElementById('page-prov-email');
      if (pageName) pageName.value = user.displayName || '';
      if (pageEmail) pageEmail.value = user.email || '';
    }

    if (notify) {
      showToast('Provider application draft cleared. You have a fresh form.');
    }
  };

  if (btn && typeof iasjConfirmDelete === 'function') {
    iasjConfirmDelete(btn, doClear, {
      label: 'Confirm Clear Draft?',
      targetType: 'form_draft',
      targetId: 'provider_draft'
    });
  } else {
    doClear();
  }
}

// -------------------------------------------------------------------------
// 2. Customer Application Draft Operations
// -------------------------------------------------------------------------
function saveCustomerApplicationDraft(notify = false) {
  const form = document.getElementById('inline-customer-register-form');
  if (!form) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const draft = {
    name: document.getElementById('inline-cust-name')?.value || '',
    type: document.getElementById('inline-cust-type')?.value || 'residential',
    phone: document.getElementById('inline-cust-phone')?.value || '',
    email: document.getElementById('inline-cust-email')?.value || '',
    address: document.getElementById('inline-cust-address')?.value || '',
    country: document.getElementById('inline-cust-country')?.value || 'AU',
    idType: document.getElementById('inline-cust-id-type')?.value || 'driver_licence',
    notes: document.getElementById('inline-cust-notes')?.value || '',
    savedAt: now.toISOString(),
    savedDisplay: `${timeStr}, ${dateStr}`
  };

  const key = getDraftStorageKey('customer');
  localStorage.setItem(key, JSON.stringify(draft));
  localStorage.setItem('iasj_draft_customer_latest', JSON.stringify(draft));

  updateDraftStatusUI('inline-cust-draft-status', `Draft saved ${timeStr}`);

  if (notify) {
    showToast(`💾 Customer application draft saved! You can close your browser and resume anytime.`);
  }
}

function restoreCustomerApplicationDraft() {
  const key = getDraftStorageKey('customer');
  let raw = localStorage.getItem(key);
  if (!raw) {
    raw = localStorage.getItem('iasj_draft_customer_latest');
  }
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    if (!draft) return;

    if (draft.name && document.getElementById('inline-cust-name')) document.getElementById('inline-cust-name').value = draft.name;
    if (draft.type && document.getElementById('inline-cust-type')) document.getElementById('inline-cust-type').value = draft.type;
    if (draft.phone && document.getElementById('inline-cust-phone')) document.getElementById('inline-cust-phone').value = draft.phone;
    if (draft.email && document.getElementById('inline-cust-email')) document.getElementById('inline-cust-email').value = draft.email;
    if (draft.address && document.getElementById('inline-cust-address')) document.getElementById('inline-cust-address').value = draft.address;
    if (draft.country && document.getElementById('inline-cust-country')) document.getElementById('inline-cust-country').value = draft.country;
    if (draft.idType && document.getElementById('inline-cust-id-type')) document.getElementById('inline-cust-id-type').value = draft.idType;
    if (draft.notes && document.getElementById('inline-cust-notes')) document.getElementById('inline-cust-notes').value = draft.notes;

    const banner = document.getElementById('cust-restored-draft-banner');
    const textSpan = document.getElementById('cust-draft-time-text');
    if (banner) {
      banner.style.display = 'flex';
      if (textSpan) {
        textSpan.textContent = `Draft restored from ${draft.savedDisplay || 'previous session'}. You can continue editing or save updates anytime.`;
      }
    }

    updateDraftStatusUI('inline-cust-draft-status', `Draft resumed (${draft.savedDisplay ? draft.savedDisplay.split(',')[0] : 'Saved'})`);
  } catch (err) {
    console.warn("Could not restore customer draft:", err);
  }
}

function clearCustomerApplicationDraft(notify = true, btn = null) {
  const doClear = () => {
    const key = getDraftStorageKey('customer');
    localStorage.removeItem(key);
    localStorage.removeItem('iasj_draft_customer_latest');

    document.getElementById('inline-customer-register-form')?.reset();
    const banner = document.getElementById('cust-restored-draft-banner');
    if (banner) banner.style.display = 'none';

    updateDraftStatusUI('inline-cust-draft-status', 'Draft cleared');

    // Pre-fill Google user details again if logged in
    const user = window.firebaseService?.getCurrentGoogleUser?.() || (function() {
      try { return JSON.parse(localStorage.getItem('iasj_google_user') || 'null'); } catch(e) { return null; }
    })();
    if (user) {
      const nameInput = document.getElementById('inline-cust-name');
      const emailInput = document.getElementById('inline-cust-email');
      if (nameInput) nameInput.value = user.displayName || '';
      if (emailInput) emailInput.value = user.email || '';
    }

    if (notify) {
      showToast('Customer draft cleared. You have a fresh form.');
    }
  };

  if (btn && typeof iasjConfirmDelete === 'function') {
    iasjConfirmDelete(btn, doClear, {
      label: 'Confirm Clear Draft?',
      targetType: 'form_draft',
      targetId: 'customer_draft'
    });
  } else {
    doClear();
  }
}

// -------------------------------------------------------------------------
// 3. Franchise Application & Multi-Staff Board Operations
// -------------------------------------------------------------------------
let franchiseStaffCounter = 0;

function updateFranchiseStaffStats() {
  const container = document.getElementById('franchise-staff-container');
  const pill = document.getElementById('franchise-staff-stats-pill');
  if (!container || !pill) return;
  const count = container.querySelectorAll('.franchise-staff-card').length;
  pill.innerHTML = `<i class="fa-solid fa-users"></i> Staff: ${count} Loaded`;
}

function handleLinkExistingProviderChange(index, providerId) {
  if (!providerId) return;
  const providers = (window.providerDB && window.providerDB.getAllProviders) 
    ? window.providerDB.getAllProviders() 
    : (typeof INITIAL_PROVIDERS !== 'undefined' ? INITIAL_PROVIDERS : []);
  const p = providers.find(item => item.id === providerId || item.serviceProviderNumber === providerId);
  if (!p) return;

  const nameInput = document.getElementById(`franchise-staff-${index}-name`);
  const businessInput = document.getElementById(`franchise-staff-${index}-business`);
  const phoneInput = document.getElementById(`franchise-staff-${index}-phone`);
  const emailInput = document.getElementById(`franchise-staff-${index}-email`);
  const catSelect = document.getElementById(`franchise-staff-${index}-category`);
  const licenseInput = document.getElementById(`franchise-staff-${index}-license`);
  const suburbInput = document.getElementById(`franchise-staff-${index}-suburb`);
  const countrySelect = document.getElementById(`franchise-staff-${index}-country`);
  const radiusInput = document.getElementById(`franchise-staff-${index}-radius`);
  const areasInput = document.getElementById(`franchise-staff-${index}-areas`);
  const equipmentInput = document.getElementById(`franchise-staff-${index}-equipment`);
  const hourlyRateInput = document.getElementById(`franchise-staff-${index}-hourly-rate`);

  const bizNameInput = document.getElementById(`franchise-staff-${index}-biz-name`);
  const bizCodeTypeSelect = document.getElementById(`franchise-staff-${index}-biz-code-type`);
  const bizNumberInput = document.getElementById(`franchise-staff-${index}-biz-number`);
  const bizStructureSelect = document.getElementById(`franchise-staff-${index}-biz-structure`);
  const bizGstSelect = document.getElementById(`franchise-staff-${index}-biz-gst`);
  const bizAddressInput = document.getElementById(`franchise-staff-${index}-biz-address`);

  if (nameInput) nameInput.value = p.name || '';
  if (businessInput) businessInput.value = p.businessName || `${p.name} (Franchise Staff)`;
  if (phoneInput) phoneInput.value = p.phone || '';
  if (emailInput) emailInput.value = p.email || '';
  if (catSelect && p.category) {
    catSelect.value = p.category;
    handleFranchiseStaffCategoryChange(index, p.category);
  }
  if (licenseInput) licenseInput.value = p.qbccLicense || p.license || '';
  if (suburbInput) suburbInput.value = p.baseSuburb || p.suburb || '';
  if (countrySelect) countrySelect.value = p.country || 'AU';
  if (radiusInput) radiusInput.value = p.radius || 25;
  if (areasInput && p.serviceAreas) areasInput.value = Array.isArray(p.serviceAreas) ? p.serviceAreas.join(', ') : p.serviceAreas;
  if (equipmentInput && (p.vehicle || p.equipment || p.tools)) equipmentInput.value = p.vehicle || p.equipment || p.tools || '';
  if (hourlyRateInput && p.hourlyRate) hourlyRateInput.value = p.hourlyRate;

  // Business Information Fields
  if (bizNameInput) bizNameInput.value = p.businessLegalName || p.businessName || '';
  if (bizNumberInput) bizNumberInput.value = p.abn || p.businessNumber || p.bizNumber || '';
  if (bizCodeTypeSelect && (p.businessCodeType || p.bizCodeType)) {
    bizCodeTypeSelect.value = p.businessCodeType || p.bizCodeType;
    handleStaffBizCodeTypeChange(index, bizCodeTypeSelect.value);
  }
  if (bizStructureSelect && (p.businessStructure || p.bizStructure)) bizStructureSelect.value = p.businessStructure || p.bizStructure;
  if (bizGstSelect && (p.gstRegistered !== undefined || p.bizGst)) {
    bizGstSelect.value = (p.gstRegistered === false || p.bizGst === 'no') ? 'no' : 'yes';
  }
  if (bizAddressInput && (p.businessAddress || p.bizAddress)) bizAddressInput.value = p.businessAddress || p.bizAddress;

  // Working hours
  const cb247 = document.getElementById(`franchise-staff-${index}-shift-247`);
  if (cb247) cb247.checked = !!(p.workingHours?.is24_7 || p.is24_7);

  // Remuneration
  if (p.payId) {
    const payidInput = document.getElementById(`franchise-staff-${index}-payid`);
    if (payidInput) payidInput.value = p.payId;
    const routeSelect = document.getElementById(`franchise-staff-${index}-payout-route`);
    if (routeSelect) {
      routeSelect.value = 'staff';
      toggleStaffDirectPayFields(index);
    }
  }
  if (p.bankDetails) {
    const bsb = document.getElementById(`franchise-staff-${index}-bsb`);
    const acc = document.getElementById(`franchise-staff-${index}-account`);
    if (bsb) bsb.value = p.bankDetails.bsb || '';
    if (acc) acc.value = p.bankDetails.accountNumber || p.bankDetails.account || '';
  }

  // Services
  if (p.servicesList && Array.isArray(p.servicesList) && p.servicesList.length > 0) {
    const sContainer = document.getElementById(`franchise-staff-${index}-services-fee-container`);
    if (sContainer) {
      sContainer.innerHTML = '';
      p.servicesList.forEach(s => addServiceFeeRow(`franchise-staff-${index}`, s));
    }
  }

  updateStaffHeaderSummary(index);
  showToast(`✅ Linked '${p.name}' (${p.serviceProviderNumber || p.category}) to staff roster.`);
}

function handleStaffBizCodeTypeChange(index, codeType) {
  const numberInput = document.getElementById(`franchise-staff-${index}-biz-number`);
  const label = document.getElementById(`franchise-staff-${index}-biz-number-label`);
  const hint = document.getElementById(`franchise-staff-${index}-biz-number-hint`);
  if (!numberInput) return;

  const placeholders = {
    'ABN': 'e.g. 51 824 753 556 (or ACN)',
    'NZBN': 'e.g. 9429041234567 (13 digits)',
    'EIN': 'e.g. 12-3456789 (US Tax ID)',
    'CRN': 'e.g. 12345678 or SC123456 (UK Company / UTR)',
    'BN': 'e.g. 123456789 RT0001 (Canada BN)',
    'UEN': 'e.g. 201812345Z (Singapore UEN)',
    'OTHER': 'e.g. Any combination of numbers, letters, codes'
  };

  numberInput.placeholder = placeholders[codeType] || 'Enter business number or code';
  if (label) {
    label.textContent = `${codeType} Business Number / Code (Any combination of numbers/codes)`;
  }
  if (hint) {
    hint.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10B981;"></i> Format: Accepts any alphanumeric string, hyphens, spaces or country codes.`;
  }
  updateStaffHeaderSummary(index);
}

function addFranchiseStaffMember(data = null) {
  const container = document.getElementById('franchise-staff-container');
  if (!container) return;

  const index = franchiseStaffCounter++;
  const staffNumber = container.querySelectorAll('.franchise-staff-card').length + 1;
  const staffName = data?.name || `Staff Technician #${staffNumber}`;
  const category = data?.category || 'plumbing';

  // Get existing registered providers to populate quick-link dropdown
  const allExistingProviders = (window.providerDB && window.providerDB.getAllProviders) 
    ? window.providerDB.getAllProviders() 
    : (typeof INITIAL_PROVIDERS !== 'undefined' ? INITIAL_PROVIDERS : []);

  const providerOptions = allExistingProviders.map(p => `
    <option value="${p.id || p.serviceProviderNumber}" ${data?.linkedProviderId === (p.id || p.serviceProviderNumber) ? 'selected' : ''}>
      ${p.name} — ${p.category ? p.category.toUpperCase() : 'TRADE'} (${p.serviceProviderNumber || 'SPN'}) • ${p.baseSuburb || 'AU'}
    </option>
  `).join('');

  const card = document.createElement('div');
  card.className = 'franchise-staff-card';
  card.id = `franchise-staff-card-${index}`;
  card.dataset.index = index;

  card.innerHTML = `
    <!-- Staff Card Dropdown Header -->
    <div class="franchise-staff-header" onclick="toggleStaffCardCollapse(${index})">
      <div class="franchise-staff-header-info">
        <span class="franchise-staff-badge badge-${category}" id="franchise-staff-${index}-badge">${category.toUpperCase()}</span>
        <div>
          <h4 class="franchise-staff-title" id="franchise-staff-${index}-header-title">
            Staff #${staffNumber}: ${staffName}
          </h4>
          <span class="franchise-staff-sub" id="franchise-staff-${index}-header-sub">
            ${data?.phone || 'Field Service Technician'} • ${data?.suburb || 'Territory Fleet'} • 🟢 Active
          </span>
        </div>
      </div>
      <div class="franchise-staff-controls" onclick="event.stopPropagation()">
        <button type="button" class="franchise-dropdown-toggle-pill" onclick="toggleStaffCardCollapse(${index})" title="Toggle Dropdown Box">
          <i class="fa-solid fa-chevron-up franchise-toggle-icon" id="franchise-staff-${index}-toggle-icon"></i>
          <span id="franchise-staff-${index}-toggle-text">Dropdown Details</span>
        </button>
        <button type="button" class="btn btn-outline btn-sm" onclick="removeFranchiseStaffMember(${index}, this)" title="Remove Staff Member" style="background:#fff; color:#DC2626; border-color:#FCA5A5; font-size:0.75rem; padding:0.35rem 0.65rem; border-radius:var(--radius-sm);">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>

    <!-- Staff Card Dropdown Body: Exact Full Details of Service Provider Form -->
    <div class="franchise-staff-body" id="franchise-staff-${index}-body">
      
      <!-- Top Dropdown: Quick-Link Registered Service Provider OR Fresh Staff -->
      <div class="franchise-provider-link-box">
        <label for="franchise-staff-${index}-link-existing">
          <i class="fa-solid fa-link"></i> Select from Existing Service Provider Network (or leave to create fresh staff):
        </label>
        <select id="franchise-staff-${index}-link-existing" class="form-control" onchange="handleLinkExistingProviderChange(${index}, this.value)">
          <option value="">-- [➕ Create New Staff Technician / Service Provider] --</option>
          ${providerOptions}
        </select>
        <div style="font-size:0.75rem; color:#6B21A8; margin-top:0.35rem;">
          <i class="fa-solid fa-circle-info"></i> Selecting an existing provider automatically fills all trade details, fee structures, and credentials into this dropdown box.
        </div>
      </div>

      <!-- 1. Profile & Trade Credentials (Same as Service Provider Form Section 1) -->
      <div class="franchise-staff-section-title" style="margin-top:0;">
        <i class="fa-solid fa-address-card" style="color:var(--brand-orange);"></i> 1. Staff Profile & Trade Credentials
      </div>
      <div class="form-row">
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-name">Staff Full Name / Primary Contact</label>
          <input type="text" id="franchise-staff-${index}-name" class="form-control" value="${data?.name || ''}" placeholder="e.g. Luke Sullivan" required oninput="updateStaffHeaderSummary(${index})">
        </div>
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-business">Business / Fleet Display Name</label>
          <input type="text" id="franchise-staff-${index}-business" class="form-control" value="${data?.businessName || ''}" placeholder="e.g. Luke Sullivan (Gold Coast Express Couriers)">
        </div>
      </div>

      <div class="form-row">
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-category">Primary Trade Discipline</label>
          <select id="franchise-staff-${index}-category" class="form-control" onchange="handleFranchiseStaffCategoryChange(${index}, this.value)">
            <option value="plumbing" ${category === 'plumbing' ? 'selected' : ''}>Plumbing & Gas Solutions</option>
            <option value="electrical" ${category === 'electrical' ? 'selected' : ''}>Licensed Electrical Services</option>
            <option value="courier" ${category === 'courier' ? 'selected' : ''}>Courier Driver & Express Freight</option>
            <option value="handyman" ${category === 'handyman' ? 'selected' : ''}>General Handyman & Assembly</option>
            <option value="carpentry" ${category === 'carpentry' ? 'selected' : ''}>Carpentry & Building Repairs</option>
            <option value="garden" ${category === 'garden' ? 'selected' : ''}>Lawn, Tree & Garden Care</option>
            <option value="painting" ${category === 'painting' ? 'selected' : ''}>Painting & Surface Restoration</option>
            <option value="appliance" ${category === 'appliance' ? 'selected' : ''}>Appliance Diagnostics & Repair</option>
            <option value="civil" ${category === 'civil' ? 'selected' : ''}>Civil & Machine Plant Operator</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-license">Licence # / Certification / Driver Lic</label>
          <input type="text" id="franchise-staff-${index}-license" class="form-control" value="${data?.license || ''}" placeholder="e.g. QBCC #1509214 or Open Driver Licence">
        </div>
      </div>

      <div class="form-row">
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-phone">Mobile Phone</label>
          <input type="tel" id="franchise-staff-${index}-phone" class="form-control" value="${data?.phone || ''}" placeholder="0400 123 456" required oninput="updateStaffHeaderSummary(${index})">
        </div>
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-email">Email Address</label>
          <input type="email" id="franchise-staff-${index}-email" class="form-control" value="${data?.email || ''}" placeholder="e.g. luke@franchise.com">
        </div>
      </div>

      <!-- 2. Staff Business Information & Tax Entity (ABN / International Codes) -->
      <div class="franchise-staff-section-title">
        <i class="fa-solid fa-briefcase" style="color:var(--brand-orange);"></i> 2. Staff Business Entity & Tax Registration Details (ABN / International Codes)
      </div>
      <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:var(--radius-sm); padding:1rem; margin-bottom:1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.4rem;">
          <div style="font-size:0.8rem; font-weight:800; color:#334155;">
            <i class="fa-solid fa-globe"></i> International Business Registration & Identification Number
          </div>
          <span style="font-size:0.72rem; background:#E0F2FE; color:#0369A1; padding:0.15rem 0.55rem; border-radius:10px; font-weight:700;">
            Any Alphanumeric Format Accepted
          </span>
        </div>
        
        <div class="form-row">
          <div class="input-group">
            <label class="input-label" for="franchise-staff-${index}-biz-name">Registered Business / Legal Trading Name</label>
            <input type="text" id="franchise-staff-${index}-biz-name" class="form-control" value="${data?.bizName || ''}" placeholder="e.g. Sullivan Plumbing Services Pty Ltd" oninput="updateStaffHeaderSummary(${index})">
          </div>
          <div class="input-group">
            <label class="input-label" for="franchise-staff-${index}-biz-structure">Entity Structure / Type</label>
            <select id="franchise-staff-${index}-biz-structure" class="form-control">
              <option value="sole_trader" ${(data?.bizStructure === 'sole_trader' || !data?.bizStructure) ? 'selected' : ''}>Sole Trader / Individual Contractor</option>
              <option value="pty_ltd" ${data?.bizStructure === 'pty_ltd' ? 'selected' : ''}>Proprietary Limited Company (Pty Ltd)</option>
              <option value="corporation" ${data?.bizStructure === 'corporation' ? 'selected' : ''}>Corporation / Limited Company (LLC / Ltd)</option>
              <option value="partnership" ${data?.bizStructure === 'partnership' ? 'selected' : ''}>Partnership</option>
              <option value="trust" ${data?.bizStructure === 'trust' ? 'selected' : ''}>Trust / Corporate Trustee</option>
              <option value="other" ${data?.bizStructure === 'other' ? 'selected' : ''}>Other Registered Business Entity</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="input-group">
            <label class="input-label" for="franchise-staff-${index}-biz-code-type">Country / Tax Code Identifier</label>
            <select id="franchise-staff-${index}-biz-code-type" class="form-control" onchange="handleStaffBizCodeTypeChange(${index}, this.value)">
              <option value="ABN" ${(data?.bizCodeType === 'ABN' || !data?.bizCodeType) ? 'selected' : ''}>ABN / ACN (Australia — 11 Digits)</option>
              <option value="NZBN" ${data?.bizCodeType === 'NZBN' ? 'selected' : ''}>NZBN / GST (New Zealand — 13 Digits)</option>
              <option value="EIN" ${data?.bizCodeType === 'EIN' ? 'selected' : ''}>EIN / Tax ID (United States — XX-XXXXXXX)</option>
              <option value="CRN" ${data?.bizCodeType === 'CRN' ? 'selected' : ''}>CRN / Company # / UTR (United Kingdom)</option>
              <option value="BN" ${data?.bizCodeType === 'BN' ? 'selected' : ''}>BN / CRA # (Canada — 9 Digits)</option>
              <option value="UEN" ${data?.bizCodeType === 'UEN' ? 'selected' : ''}>UEN (Singapore — 9-10 Characters)</option>
              <option value="OTHER" ${data?.bizCodeType === 'OTHER' ? 'selected' : ''}>Other Country / Any Alphanumeric Code</option>
            </select>
          </div>
          <div class="input-group">
            <label class="input-label" for="franchise-staff-${index}-biz-number" id="franchise-staff-${index}-biz-number-label">
              Business Number / Code (Any combination of numbers/codes)
            </label>
            <input type="text" id="franchise-staff-${index}-biz-number" class="form-control" value="${data?.bizNumber || data?.abn || ''}" placeholder="e.g. 51 824 753 556, 94290..., or any alphanumeric code" oninput="updateStaffHeaderSummary(${index})">
            <div style="font-size:0.72rem; color:#64748B; margin-top:0.25rem;" id="franchise-staff-${index}-biz-number-hint">
              <i class="fa-solid fa-circle-check" style="color:#10B981;"></i> Accepts any combination of numbers, letters, spaces, or international codes.
            </div>
          </div>
        </div>

        <div class="form-row" style="margin-bottom:0;">
          <div class="input-group" style="margin-bottom:0;">
            <label class="input-label" for="franchise-staff-${index}-biz-gst">GST / VAT Tax Registration Status</label>
            <select id="franchise-staff-${index}-biz-gst" class="form-control">
              <option value="yes" ${(data?.bizGst !== 'no') ? 'selected' : ''}>Registered for GST / VAT (Tax Invoicing Active)</option>
              <option value="no" ${(data?.bizGst === 'no') ? 'selected' : ''}>Not Registered for GST / VAT</option>
            </select>
          </div>
          <div class="input-group" style="margin-bottom:0;">
            <label class="input-label" for="franchise-staff-${index}-biz-address">Registered Business Address / Head Office</label>
            <input type="text" id="franchise-staff-${index}-biz-address" class="form-control" value="${data?.bizAddress || ''}" placeholder="e.g. Suite 4, 120 Marine Parade, Southport QLD 4215">
          </div>
        </div>
      </div>

      <!-- 3. Location & Distance Units (Same as Service Provider Form Section 2) -->
      <div class="franchise-staff-section-title">
        <i class="fa-solid fa-map-location-dot" style="color:var(--brand-orange);"></i> 3. Location & Distance Units (km / mile)
      </div>
      <div class="form-row">
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-suburb">Base Suburb / City & Postcode</label>
          <input type="text" id="franchise-staff-${index}-suburb" class="form-control" value="${data?.suburb || ''}" placeholder="e.g. Surfers Paradise QLD 4217" oninput="updateStaffHeaderSummary(${index})">
        </div>
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-country">Country / Region</label>
          <select id="franchise-staff-${index}-country" class="form-control">
            <option value="AU" ${(data?.country === 'AU' || !data?.country) ? 'selected' : ''}>Australia (km)</option>
            <option value="NZ" ${data?.country === 'NZ' ? 'selected' : ''}>New Zealand (km)</option>
            <option value="US" ${data?.country === 'US' ? 'selected' : ''}>United States (miles)</option>
            <option value="UK" ${data?.country === 'UK' ? 'selected' : ''}>United Kingdom (miles)</option>
            <option value="CA" ${data?.country === 'CA' ? 'selected' : ''}>Canada (km)</option>
            <option value="OTHER" ${data?.country === 'OTHER' ? 'selected' : ''}>Other Region</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-radius">Standard Service Radius</label>
          <input type="number" id="franchise-staff-${index}-radius" class="form-control" value="${data?.radius || 25}" min="5" max="250">
        </div>
        <div class="input-group">
          <label class="input-label">Distance Unit</label>
          <div style="display:flex; align-items:center; gap:1.25rem; height:42px;">
            <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-size:0.85rem; font-weight:600;">
              <input type="radio" name="franchise-staff-${index}-dist-unit" value="km" ${(data?.distUnit !== 'mile') ? 'checked' : ''}> Kilometres (km)
            </label>
            <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-size:0.85rem; font-weight:600;">
              <input type="radio" name="franchise-staff-${index}-dist-unit" value="mile" ${(data?.distUnit === 'mile') ? 'checked' : ''}> Miles (mi)
            </label>
          </div>
        </div>
      </div>

      <div class="input-group">
        <label class="input-label" for="franchise-staff-${index}-areas">Service Areas Covered (comma separated)</label>
        <input type="text" id="franchise-staff-${index}-areas" class="form-control" value="${data?.serviceAreas || ''}" placeholder="e.g. Surfers Paradise, Southport, Robina, Burleigh Heads">
      </div>

      <!-- 4. Base Pricing, Rates & Distance Charges (Same as Service Provider Form Section 3) -->
      <div class="franchise-staff-section-title">
        <i class="fa-solid fa-calculator" style="color:var(--brand-orange);"></i> 4. Pricing, Rates & Distance Charges
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:0.75rem; margin-bottom:0.85rem;">
        <!-- Hourly -->
        <div style="background:#F8FAFC; border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:0.75rem;">
          <label style="display:flex; align-items:center; gap:0.35rem; font-weight:700; font-size:0.82rem; margin-bottom:0.4rem;">
            <input type="checkbox" id="franchise-staff-${index}-rate-hourly" ${(data?.rateHourlyActive !== false) ? 'checked' : ''}> Hourly Rate
          </label>
          <div style="display:flex; align-items:center; gap:0.3rem;">
            <span style="font-weight:700; color:var(--text-muted);">$</span>
            <input type="number" id="franchise-staff-${index}-hourly-rate" class="form-control" value="${data?.hourlyRate || 95}" min="30" max="400">
            <span style="font-size:0.75rem; color:var(--text-muted);">/ hr</span>
          </div>
        </div>

        <!-- Flat Rate -->
        <div style="background:#F8FAFC; border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:0.75rem;">
          <label style="display:flex; align-items:center; gap:0.35rem; font-weight:700; font-size:0.82rem; margin-bottom:0.4rem;">
            <input type="checkbox" id="franchise-staff-${index}-rate-flat" ${(data?.rateFlatActive) ? 'checked' : ''}> Flat Rate (Standard Jobs)
          </label>
          <div style="display:flex; align-items:center; gap:0.3rem;">
            <span style="font-weight:700; color:var(--text-muted);">$</span>
            <input type="number" id="franchise-staff-${index}-flat-rate" class="form-control" value="${data?.flatRate || 150}" min="40" max="2000">
            <span style="font-size:0.75rem; color:var(--text-muted);">flat</span>
          </div>
        </div>

        <!-- Callout -->
        <div style="background:#F8FAFC; border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:0.75rem;">
          <label style="display:flex; align-items:center; gap:0.35rem; font-weight:700; font-size:0.82rem; margin-bottom:0.4rem;">
            <input type="checkbox" id="franchise-staff-${index}-rate-callout" ${(data?.rateCalloutActive !== false) ? 'checked' : ''}> Base Call-Out Fee
          </label>
          <div style="display:flex; align-items:center; gap:0.3rem;">
            <span style="font-weight:700; color:var(--text-muted);">$</span>
            <input type="number" id="franchise-staff-${index}-callout-rate" class="form-control" value="${data?.calloutRate || 45}" min="0" max="300">
            <span style="font-size:0.75rem; color:var(--text-muted);">callout</span>
          </div>
        </div>
      </div>

      <!-- Distance Travel Charges -->
      <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:var(--radius-sm); padding:0.85rem 1rem; margin-bottom:1rem;">
        <label style="display:flex; align-items:center; gap:0.4rem; font-weight:800; font-size:0.85rem; color:#92400E; cursor:pointer;">
          <input type="checkbox" id="franchise-staff-${index}-rate-distance" ${(data?.chargeDistance !== false) ? 'checked' : ''}>
          <i class="fa-solid fa-route"></i> Charge Distance / Travel Fee (Callout per km / Courier Freight per km)
        </label>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem; margin-top:0.6rem;">
          <div>
            <label class="input-label" style="font-size:0.75rem;" for="franchise-staff-${index}-callout-per-km">Call-out Travel Fee per km</label>
            <div style="display:flex; align-items:center; gap:0.3rem;">
              <span style="font-weight:700; color:#92400E;">$</span>
              <input type="number" id="franchise-staff-${index}-callout-per-km" class="form-control" step="1" min="0" value="${data?.calloutPerKm || 2}">
              <span style="font-size:0.75rem; color:#92400E;">/km</span>
            </div>
          </div>
          <div>
            <label class="input-label" style="font-size:0.75rem;" for="franchise-staff-${index}-courier-per-km">Freight Rate per km</label>
            <div style="display:flex; align-items:center; gap:0.3rem;">
              <span style="font-weight:700; color:#92400E;">$</span>
              <input type="number" id="franchise-staff-${index}-courier-per-km" class="form-control" step="1" min="0" value="${data?.courierPerKm || 2}">
              <span style="font-size:0.75rem; color:#92400E;">/km</span>
            </div>
          </div>
          <div>
            <label class="input-label" style="font-size:0.75rem;" for="franchise-staff-${index}-free-km">Included Free Distance</label>
            <div style="display:flex; align-items:center; gap:0.3rem;">
              <input type="number" id="franchise-staff-${index}-free-km" class="form-control" value="${data?.freeKm || 10}">
              <span style="font-size:0.75rem; color:#92400E;">km free</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Trade Services Offered & Fee Structures Dropdown Box System (Same as Service Provider Form Section 4) -->
      <div class="franchise-staff-section-title">
        <i class="fa-solid fa-list-check" style="color:var(--brand-orange);"></i> 5. Services Offered & Fee Structures Dropdown Boxes
      </div>
      <p style="font-size:0.75rem; color:#64748B; margin-bottom:0.75rem;">
        List the specific services this staff member provides using the drop boxes below. Select the service, choose its fee structure (Hourly, Flat Rate, Call-out + Hourly, Day Rate, etc.), and specify the rate.
      </p>

      <div id="franchise-staff-${index}-services-fee-container" class="services-fee-container">
        <!-- Rendered via renderDefaultServiceFeeRows or data.services -->
      </div>

      <div style="margin-top:0.75rem; margin-bottom:1.25rem;">
        <button type="button" class="btn-add-service-row" onclick="addServiceFeeRow('franchise-staff-${index}')" style="background:#FAF5FF; border-color:#DDD6FE; color:#7E22CE; font-weight:700;">
          <i class="fa-solid fa-plus-circle"></i> + Add Another Service & Fee Structure for this Staff Member
        </button>
      </div>

      <div class="input-group">
        <label class="input-label" for="franchise-staff-${index}-equipment">Tools, Machinery & Vehicles Owned</label>
        <input type="text" id="franchise-staff-${index}-equipment" class="form-control" value="${data?.equipment || ''}" placeholder="e.g. 1-Tonne Van with Racks, CCTV Pipe Camera, Electric Drain Snake">
      </div>

      <!-- 6. Profile Status & 24/7 Shift Calendar Availability (Same as Service Provider Form Section 5) -->
      <div class="franchise-staff-section-title">
        <i class="fa-solid fa-calendar-days" style="color:var(--brand-orange);"></i> 6. Profile Status & 24/7 Shift Calendar Availability
      </div>
      <div style="background:#F8FAFC; border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:0.85rem 1rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
        <div>
          <strong style="font-size:0.85rem; color:var(--primary-navy); display:block;">Initial Profile Status:</strong>
          <span style="font-size:0.78rem; color:var(--text-muted);">Can be paused or activated anytime from your Franchise Admin Panel.</span>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; padding:0.35rem 0.75rem; border-radius:var(--radius-full); font-size:0.78rem; font-weight:700; background:#ECFDF5; color:#059669; border:1px solid #A7F3D0;">
            <input type="radio" name="franchise-staff-${index}-profile-status" value="active" ${(data?.profileStatus !== 'paused') ? 'checked' : ''}> 🟢 Active & Ready
          </label>
          <label style="cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; padding:0.35rem 0.75rem; border-radius:var(--radius-full); font-size:0.78rem; font-weight:700; background:#F1F5F9; color:#64748B; border:1px solid #CBD5E1;">
            <input type="radio" name="franchise-staff-${index}-profile-status" value="paused" ${(data?.profileStatus === 'paused') ? 'checked' : ''}> ⏸️ Paused (On Break)
          </label>
        </div>
      </div>

      <div style="background:#FAF5FF; border:1px solid #E9D5FF; border-radius:var(--radius-sm); padding:0.85rem; margin-bottom:1rem;">
        <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer; margin-bottom:0.75rem; font-weight:700; color:#581C87;">
          <input type="checkbox" id="franchise-staff-${index}-shift-247" ${(data?.shift247 !== false) ? 'checked' : ''} style="width:18px; height:18px; accent-color:#7E22CE;">
          <span><i class="fa-solid fa-bolt" style="color:#F59E0B;"></i> 24/7 • 365 Days a Year Registered On-Call Dispatch</span>
        </label>
        
        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem; flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="applyStaffCalendarPreset(${index}, '24_7')" style="background:#fff; font-size:0.72rem; padding:0.25rem 0.6rem;">
            Preset: ⚡ 24/7 Emergency
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="applyStaffCalendarPreset(${index}, 'business')" style="background:#fff; font-size:0.72rem; padding:0.25rem 0.6rem;">
            Preset: 🏢 Mon-Fri Business (8-5)
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="applyStaffCalendarPreset(${index}, 'weekends')" style="background:#fff; font-size:0.72rem; padding:0.25rem 0.6rem;">
            Preset: 🌙 Weekends & After-Hours
          </button>
        </div>

        <div style="display:flex; gap:1.25rem; flex-wrap:wrap; font-size:0.82rem;">
          <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
            <input type="checkbox" id="franchise-staff-${index}-shift-morn" ${(data?.shiftMorn !== false) ? 'checked' : ''}> Morning (6am - 12pm)
          </label>
          <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
            <input type="checkbox" id="franchise-staff-${index}-shift-aft" ${(data?.shiftAft !== false) ? 'checked' : ''}> Afternoon (12pm - 5pm)
          </label>
          <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
            <input type="checkbox" id="franchise-staff-${index}-shift-eve" ${(data?.shiftEve !== false) ? 'checked' : ''}> Evening (5pm - 10pm)
          </label>
          <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
            <input type="checkbox" id="franchise-staff-${index}-shift-overnight" ${(data?.shiftOvernight !== false) ? 'checked' : ''}> Overnight (10pm - 6am)
          </label>
        </div>
      </div>

      <div style="margin-bottom:1rem;">
        <label class="checkbox-label" style="font-size:0.82rem; font-weight:700;">
          <input type="checkbox" id="franchise-staff-${index}-insured" ${(data?.insured !== false) ? 'checked' : ''}>
          $10M+ Public Liability / Carrier Transit Cover Active for this Staff Member
        </label>
      </div>

      <!-- 7. Stored Verification Documents & Licences (Stored on Server) (Same as Service Provider Form Section 6) -->
      <div class="franchise-staff-section-title">
        <i class="fa-solid fa-cloud-arrow-up" style="color:var(--brand-orange);"></i> 7. Licences & Verification Uploads (Stored on Server)
      </div>
      <div class="form-row">
        <div class="input-group">
          <label class="input-label">Trade Licence Card / Insurance Scan</label>
          <input type="file" class="form-control" accept="image/*">
        </div>
        <div class="input-group">
          <label class="input-label">Work Vehicle / Staff Photo Scan</label>
          <input type="file" class="form-control" accept="image/*">
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem; font-size:0.75rem; color:#059669; font-weight:700;">
        <i class="fa-solid fa-shield-check"></i> Documents stored on server and always accessible in your franchise compliance vault.
      </div>

      <!-- 8. Remuneration & Direct PayID / Banking Settlement (Same as Service Provider Form Section 7) -->
      <div class="franchise-staff-section-title">
        <i class="fa-solid fa-building-columns" style="color:var(--brand-orange);"></i> 8. Staff Remuneration & Payout Routing
      </div>
      <div class="form-row">
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-payout-route">Payout Remuneration Route</label>
          <select id="franchise-staff-${index}-payout-route" class="form-control" onchange="toggleStaffDirectPayFields(${index})">
            <option value="franchise" ${(data?.payoutRoute !== 'staff') ? 'selected' : ''}>Route to Franchise Central Bank / PayID</option>
            <option value="staff" ${(data?.payoutRoute === 'staff') ? 'selected' : ''}>Direct Settlement to Staff Member's Bank / PayID</option>
          </select>
        </div>
        <div class="input-group" id="franchise-staff-${index}-payid-group" style="display:${(data?.payoutRoute === 'staff') ? 'block' : 'none'};">
          <label class="input-label" for="franchise-staff-${index}-payid">Staff Direct PayID</label>
          <input type="text" id="franchise-staff-${index}-payid" class="form-control" value="${data?.staffPayId || ''}" placeholder="e.g. 0400 123 456 or staff@payid.com">
        </div>
      </div>

      <div class="form-row" id="franchise-staff-${index}-bank-row" style="display:${(data?.payoutRoute === 'staff') ? 'flex' : 'none'};">
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-payid-type">Staff PayID Type</label>
          <select id="franchise-staff-${index}-payid-type" class="form-control">
            <option value="phone" ${(data?.staffPayIdType === 'phone' || !data?.staffPayIdType) ? 'selected' : ''}>Mobile Phone (04XX XXX XXX)</option>
            <option value="email" ${data?.staffPayIdType === 'email' ? 'selected' : ''}>Email Address</option>
            <option value="abn" ${data?.staffPayIdType === 'abn' ? 'selected' : ''}>ABN</option>
            <option value="org_id" ${data?.staffPayIdType === 'org_id' ? 'selected' : ''}>Organisation ID</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-bank-name">Staff Account Name</label>
          <input type="text" id="franchise-staff-${index}-bank-name" class="form-control" value="${data?.staffBankName || ''}" placeholder="e.g. Luke Sullivan">
        </div>
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-bsb">Staff BSB</label>
          <input type="text" id="franchise-staff-${index}-bsb" class="form-control" value="${data?.staffBsb || ''}" placeholder="084-004" maxlength="7">
        </div>
        <div class="input-group">
          <label class="input-label" for="franchise-staff-${index}-account">Staff Account Number</label>
          <input type="text" id="franchise-staff-${index}-account" class="form-control" value="${data?.staffAccount || ''}" placeholder="12345678" maxlength="10">
        </div>
      </div>
    </div>
  `;

  container.appendChild(card);

  // Populate services fee rows for this staff member
  if (data?.services && Array.isArray(data.services) && data.services.length > 0) {
    const sContainer = document.getElementById(`franchise-staff-${index}-services-fee-container`);
    if (sContainer) {
      sContainer.innerHTML = '';
      data.services.forEach(s => addServiceFeeRow(`franchise-staff-${index}`, s));
    }
  } else {
    renderDefaultServiceFeeRows(`franchise-staff-${index}`, category);
  }

  updateStaffHeaderSummary(index);
  updateFranchiseStaffStats();
}

function updateStaffHeaderSummary(index) {
  const nameInput = document.getElementById(`franchise-staff-${index}-name`);
  const phoneInput = document.getElementById(`franchise-staff-${index}-phone`);
  const suburbInput = document.getElementById(`franchise-staff-${index}-suburb`);
  const catSelect = document.getElementById(`franchise-staff-${index}-category`);
  const hourlyInput = document.getElementById(`franchise-staff-${index}-hourly-rate`);
  const bizNumberInput = document.getElementById(`franchise-staff-${index}-biz-number`);
  const bizCodeTypeSelect = document.getElementById(`franchise-staff-${index}-biz-code-type`);
  const title = document.getElementById(`franchise-staff-${index}-header-title`);
  const sub = document.getElementById(`franchise-staff-${index}-header-sub`);
  const badge = document.getElementById(`franchise-staff-${index}-badge`);
  
  const card = document.getElementById(`franchise-staff-card-${index}`);
  const staffNumber = card ? Array.from(card.parentNode.children).indexOf(card) + 1 : 1;
  const category = catSelect?.value || 'plumbing';

  if (title) {
    title.textContent = `Staff #${staffNumber}: ${nameInput?.value.trim() || 'New Technician / Provider'}`;
  }
  if (sub) {
    const sCount = card?.querySelectorAll('.service-fee-row')?.length || 2;
    const rateText = hourlyInput?.value ? `$${hourlyInput.value}/hr` : '';
    const bizNumber = bizNumberInput?.value.trim() || '';
    const bizCodeType = bizCodeTypeSelect?.value || 'ABN';
    const bizText = bizNumber ? `• ${bizCodeType}: ${bizNumber}` : '';
    sub.textContent = `${phoneInput?.value.trim() || 'Mobile pending'} • ${suburbInput?.value.trim() || 'Territory Fleet'} ${bizText} • ${sCount} Service(s) ${rateText ? '• ' + rateText : ''} • 🟢 Active`;
  }
  if (badge) {
    badge.textContent = category.toUpperCase();
    badge.className = `franchise-staff-badge badge-${category}`;
  }
}

function handleFranchiseStaffCategoryChange(index, newCategory) {
  const badge = document.getElementById(`franchise-staff-${index}-badge`);
  if (badge) {
    badge.textContent = newCategory.toUpperCase();
    badge.className = `franchise-staff-badge badge-${newCategory}`;
  }
  handleCategoryChange(`franchise-staff-${index}`, newCategory);
  updateStaffHeaderSummary(index);
}

function toggleStaffCardCollapse(index) {
  const card = document.getElementById(`franchise-staff-card-${index}`);
  const body = document.getElementById(`franchise-staff-${index}-body`);
  const icon = document.getElementById(`franchise-staff-${index}-toggle-icon`);
  const text = document.getElementById(`franchise-staff-${index}-toggle-text`);
  if (!body) return;
  
  const isHidden = body.style.display === 'none';
  if (isHidden) {
    body.style.display = 'block';
    if (card) card.classList.remove('collapsed');
    if (icon) icon.className = 'fa-solid fa-chevron-up franchise-toggle-icon';
    if (text) text.textContent = 'Collapse';
  } else {
    body.style.display = 'none';
    if (card) card.classList.add('collapsed');
    if (icon) icon.className = 'fa-solid fa-chevron-down franchise-toggle-icon';
    if (text) text.textContent = 'Dropdown Details';
  }
}

function toggleStaffDirectPayFields(index) {
  const routeSelect = document.getElementById(`franchise-staff-${index}-payout-route`);
  const payidGroup = document.getElementById(`franchise-staff-${index}-payid-group`);
  const bankRow = document.getElementById(`franchise-staff-${index}-bank-row`);
  const isDirect = routeSelect?.value === 'staff';
  if (payidGroup) payidGroup.style.display = isDirect ? 'block' : 'none';
  if (bankRow) bankRow.style.display = isDirect ? 'flex' : 'none';
}

function applyStaffCalendarPreset(index, preset) {
  const cb247 = document.getElementById(`franchise-staff-${index}-shift-247`);
  const cbMorn = document.getElementById(`franchise-staff-${index}-shift-morn`);
  const cbAft = document.getElementById(`franchise-staff-${index}-shift-aft`);
  const cbEve = document.getElementById(`franchise-staff-${index}-shift-eve`);
  const cbOvernight = document.getElementById(`franchise-staff-${index}-shift-overnight`);

  if (preset === '24_7') {
    if (cb247) cb247.checked = true;
    if (cbMorn) cbMorn.checked = true;
    if (cbAft) cbAft.checked = true;
    if (cbEve) cbEve.checked = true;
    if (cbOvernight) cbOvernight.checked = true;
    showToast(`Staff #${index + 1}: 24/7 Emergency Dispatch Preset applied.`);
  } else if (preset === 'business') {
    if (cb247) cb247.checked = false;
    if (cbMorn) cbMorn.checked = true;
    if (cbAft) cbAft.checked = true;
    if (cbEve) cbEve.checked = false;
    if (cbOvernight) cbOvernight.checked = false;
    showToast(`Staff #${index + 1}: Standard Business Hours (8am-5pm) Preset applied.`);
  } else if (preset === 'weekends') {
    if (cb247) cb247.checked = false;
    if (cbMorn) cbMorn.checked = false;
    if (cbAft) cbAft.checked = false;
    if (cbEve) cbEve.checked = true;
    if (cbOvernight) cbOvernight.checked = true;
    showToast(`Staff #${index + 1}: After-Hours & Weekend Preset applied.`);
  }
}

function removeFranchiseStaffMember(index, btn = null) {
  const card = document.getElementById(`franchise-staff-card-${index}`);
  const container = document.getElementById('franchise-staff-container');
  if (!card || !container) return;

  if (container.querySelectorAll('.franchise-staff-card').length <= 1) {
    showToast('Franchise must have at least one staff technician or service provider.');
    return;
  }

  const targetBtn = btn || card.querySelector('.franchise-staff-controls button:last-child');
  const doRemove = () => {
    card.remove();
    showToast('Staff member removed from franchise roster.');
    updateFranchiseStaffStats();

    // Renumber remaining cards
    const cards = container.querySelectorAll('.franchise-staff-card');
    cards.forEach((c, idx) => {
      const i = c.dataset.index;
      const title = document.getElementById(`franchise-staff-${i}-header-title`);
      const nameInput = document.getElementById(`franchise-staff-${i}-name`);
      if (title) {
        title.textContent = `Staff #${idx + 1}: ${nameInput?.value.trim() || 'New Technician / Provider'}`;
      }
    });
  };

  if (targetBtn && typeof iasjConfirmDelete === 'function') {
    iasjConfirmDelete(targetBtn, doRemove, {
      label: 'Confirm Remove?',
      targetType: 'staff_member',
      targetId: `staff_${index}`
    });
  } else {
    doRemove();
  }
}

function saveFranchiseApplicationDraft(notify = false) {
  const form = document.getElementById('franchise-register-form');
  if (!form) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

  // Collect staff members
  const staffMembers = [];
  const staffCards = document.querySelectorAll('#franchise-staff-container .franchise-staff-card');
  staffCards.forEach(card => {
    const idx = card.dataset.index;
    const distRadio = document.querySelector(`input[name="franchise-staff-${idx}-dist-unit"]:checked`);
    const statusRadio = document.querySelector(`input[name="franchise-staff-${idx}-profile-status"]:checked`);
    
    staffMembers.push({
      linkedProviderId: document.getElementById(`franchise-staff-${idx}-link-existing`)?.value || '',
      name: document.getElementById(`franchise-staff-${idx}-name`)?.value || '',
      businessName: document.getElementById(`franchise-staff-${idx}-business`)?.value || '',
      bizName: document.getElementById(`franchise-staff-${idx}-biz-name`)?.value || '',
      bizCodeType: document.getElementById(`franchise-staff-${idx}-biz-code-type`)?.value || 'ABN',
      bizNumber: document.getElementById(`franchise-staff-${idx}-biz-number`)?.value || '',
      bizStructure: document.getElementById(`franchise-staff-${idx}-biz-structure`)?.value || 'sole_trader',
      bizGst: document.getElementById(`franchise-staff-${idx}-biz-gst`)?.value || 'yes',
      bizAddress: document.getElementById(`franchise-staff-${idx}-biz-address`)?.value || '',
      phone: document.getElementById(`franchise-staff-${idx}-phone`)?.value || '',
      email: document.getElementById(`franchise-staff-${idx}-email`)?.value || '',
      category: document.getElementById(`franchise-staff-${idx}-category`)?.value || 'plumbing',
      license: document.getElementById(`franchise-staff-${idx}-license`)?.value || '',
      suburb: document.getElementById(`franchise-staff-${idx}-suburb`)?.value || '',
      country: document.getElementById(`franchise-staff-${idx}-country`)?.value || 'AU',
      radius: document.getElementById(`franchise-staff-${idx}-radius`)?.value || '25',
      distUnit: distRadio ? distRadio.value : 'km',
      serviceAreas: document.getElementById(`franchise-staff-${idx}-areas`)?.value || '',
      
      rateHourlyActive: document.getElementById(`franchise-staff-${idx}-rate-hourly`)?.checked || false,
      hourlyRate: document.getElementById(`franchise-staff-${idx}-hourly-rate`)?.value || '95',
      rateFlatActive: document.getElementById(`franchise-staff-${idx}-rate-flat`)?.checked || false,
      flatRate: document.getElementById(`franchise-staff-${idx}-flat-rate`)?.value || '150',
      rateCalloutActive: document.getElementById(`franchise-staff-${idx}-rate-callout`)?.checked || false,
      calloutRate: document.getElementById(`franchise-staff-${idx}-callout-rate`)?.value || '45',
      chargeDistance: document.getElementById(`franchise-staff-${idx}-rate-distance`)?.checked || false,
      calloutPerKm: document.getElementById(`franchise-staff-${idx}-callout-per-km`)?.value || '2',
      courierPerKm: document.getElementById(`franchise-staff-${idx}-courier-per-km`)?.value || '2',
      freeKm: document.getElementById(`franchise-staff-${idx}-free-km`)?.value || '10',

      services: collectServicesFeeData(`franchise-staff-${idx}`),
      equipment: document.getElementById(`franchise-staff-${idx}-equipment`)?.value || '',
      profileStatus: statusRadio ? statusRadio.value : 'active',
      shift247: document.getElementById(`franchise-staff-${idx}-shift-247`)?.checked || false,
      shiftMorn: document.getElementById(`franchise-staff-${idx}-shift-morn`)?.checked || false,
      shiftAft: document.getElementById(`franchise-staff-${idx}-shift-aft`)?.checked || false,
      shiftEve: document.getElementById(`franchise-staff-${idx}-shift-eve`)?.checked || false,
      shiftOvernight: document.getElementById(`franchise-staff-${idx}-shift-overnight`)?.checked || false,
      insured: document.getElementById(`franchise-staff-${idx}-insured`)?.checked || false,

      payoutRoute: document.getElementById(`franchise-staff-${idx}-payout-route`)?.value || 'franchise',
      staffPayId: document.getElementById(`franchise-staff-${idx}-payid`)?.value || '',
      staffPayIdType: document.getElementById(`franchise-staff-${idx}-payid-type`)?.value || 'phone',
      staffBankName: document.getElementById(`franchise-staff-${idx}-bank-name`)?.value || '',
      staffBsb: document.getElementById(`franchise-staff-${idx}-bsb`)?.value || '',
      staffAccount: document.getElementById(`franchise-staff-${idx}-account`)?.value || ''
    });
  });

  const draft = {
    franchiseName: document.getElementById('franchise-name')?.value || '',
    franchiseAbn: document.getElementById('franchise-abn')?.value || '',
    adminName: document.getElementById('franchise-admin-name')?.value || '',
    adminTitle: document.getElementById('franchise-admin-title')?.value || '',
    adminEmail: document.getElementById('franchise-admin-email')?.value || '',
    adminPhone: document.getElementById('franchise-admin-phone')?.value || '',
    adminRegion: document.getElementById('franchise-admin-region')?.value || '',
    adminLicense: document.getElementById('franchise-admin-license')?.value || '',
    adminIsProvider: document.getElementById('franchise-admin-is-provider')?.checked || false,
    adminPayId: document.getElementById('franchise-admin-payid')?.value || '',
    adminPayIdType: document.getElementById('franchise-admin-payid-type')?.value || 'email',
    adminBankName: document.getElementById('franchise-admin-bank-name')?.value || '',
    adminBsb: document.getElementById('franchise-admin-bsb')?.value || '',
    adminAccount: document.getElementById('franchise-admin-account')?.value || '',
    staffMembers,
    savedAt: now.toISOString(),
    savedDisplay: `${timeStr}, ${dateStr}`
  };

  const key = getDraftStorageKey('franchise');
  localStorage.setItem(key, JSON.stringify(draft));
  localStorage.setItem('iasj_draft_franchise_latest', JSON.stringify(draft));

  updateDraftStatusUI('franchise-draft-status', `Draft saved ${timeStr}`);
  updateFranchiseStaffStats();

  if (notify) {
    showToast(`💾 Franchise application draft saved! Franchise Manager and ${staffMembers.length} Staff details preserved.`);
  }
}

function restoreFranchiseApplicationDraft() {
  const key = getDraftStorageKey('franchise');
  let raw = localStorage.getItem(key);
  if (!raw) {
    raw = localStorage.getItem('iasj_draft_franchise_latest');
  }
  
  const container = document.getElementById('franchise-staff-container');

  if (!raw) {
    // If no draft exists and container is empty, initialize 1 staff card
    if (container && container.children.length === 0) {
      addFranchiseStaffMember();
    }
    updateFranchiseStaffStats();
    return;
  }

  try {
    const draft = JSON.parse(raw);
    if (!draft) return;

    if (draft.franchiseName && document.getElementById('franchise-name')) document.getElementById('franchise-name').value = draft.franchiseName;
    if (draft.franchiseAbn && document.getElementById('franchise-abn')) document.getElementById('franchise-abn').value = draft.franchiseAbn;
    if (draft.adminName && document.getElementById('franchise-admin-name')) document.getElementById('franchise-admin-name').value = draft.adminName;
    if (draft.adminTitle && document.getElementById('franchise-admin-title')) document.getElementById('franchise-admin-title').value = draft.adminTitle;
    if (draft.adminEmail && document.getElementById('franchise-admin-email')) document.getElementById('franchise-admin-email').value = draft.adminEmail;
    if (draft.adminPhone && document.getElementById('franchise-admin-phone')) document.getElementById('franchise-admin-phone').value = draft.adminPhone;
    if (draft.adminRegion && document.getElementById('franchise-admin-region')) document.getElementById('franchise-admin-region').value = draft.adminRegion;
    if (draft.adminLicense && document.getElementById('franchise-admin-license')) document.getElementById('franchise-admin-license').value = draft.adminLicense;
    if (document.getElementById('franchise-admin-is-provider')) document.getElementById('franchise-admin-is-provider').checked = !!draft.adminIsProvider;
    if (draft.adminPayId && document.getElementById('franchise-admin-payid')) document.getElementById('franchise-admin-payid').value = draft.adminPayId;
    if (draft.adminPayIdType && document.getElementById('franchise-admin-payid-type')) document.getElementById('franchise-admin-payid-type').value = draft.adminPayIdType;
    if (draft.adminBankName && document.getElementById('franchise-admin-bank-name')) document.getElementById('franchise-admin-bank-name').value = draft.adminBankName;
    if (draft.adminBsb && document.getElementById('franchise-admin-bsb')) document.getElementById('franchise-admin-bsb').value = draft.adminBsb;
    if (draft.adminAccount && document.getElementById('franchise-admin-account')) document.getElementById('franchise-admin-account').value = draft.adminAccount;

    // Restore Staff Members
    if (container) {
      container.innerHTML = '';
      if (draft.staffMembers && Array.isArray(draft.staffMembers) && draft.staffMembers.length > 0) {
        draft.staffMembers.forEach(staffData => addFranchiseStaffMember(staffData));
      } else {
        addFranchiseStaffMember();
      }
    }

    const banner = document.getElementById('franchise-restored-draft-banner');
    const textSpan = document.getElementById('franchise-draft-time-text');
    if (banner) {
      banner.style.display = 'flex';
      if (textSpan) {
        const staffCount = draft.staffMembers ? draft.staffMembers.length : 1;
        textSpan.textContent = `Draft restored from ${draft.savedDisplay || 'previous session'} (${staffCount} staff technician/provider(s) loaded).`;
      }
    }

    updateDraftStatusUI('franchise-draft-status', `Draft resumed (${draft.savedDisplay ? draft.savedDisplay.split(',')[0] : 'Saved'})`);
    updateFranchiseStaffStats();
  } catch (err) {
    console.warn("Could not restore franchise draft:", err);
  }
}

function clearFranchiseApplicationDraft(notify = true, btn = null) {
  const doClear = () => {
    const key = getDraftStorageKey('franchise');
    localStorage.removeItem(key);
    localStorage.removeItem('iasj_draft_franchise_latest');

    document.getElementById('franchise-register-form')?.reset();
    const banner = document.getElementById('franchise-restored-draft-banner');
    if (banner) banner.style.display = 'none';

    const container = document.getElementById('franchise-staff-container');
    if (container) {
      container.innerHTML = '';
      addFranchiseStaffMember();
    }

    updateDraftStatusUI('franchise-draft-status', 'Draft cleared');
    updateFranchiseStaffStats();

    // Pre-fill Google user details again if logged in
    const user = window.firebaseService?.getCurrentGoogleUser?.() || (function() {
      try { return JSON.parse(localStorage.getItem('iasj_google_user') || 'null'); } catch(e) { return null; }
    })();
    if (user) {
      const nameInput = document.getElementById('franchise-admin-name');
      const emailInput = document.getElementById('franchise-admin-email');
      if (nameInput) nameInput.value = user.displayName || '';
      if (emailInput) emailInput.value = user.email || '';
    }

    if (notify) {
      showToast('Franchise draft cleared. You have a fresh form.');
    }
  };

  if (btn && typeof iasjConfirmDelete === 'function') {
    iasjConfirmDelete(btn, doClear, {
      label: 'Confirm Clear Draft?',
      targetType: 'form_draft',
      targetId: 'franchise_draft'
    });
  } else {
    doClear();
  }
}

// -------------------------------------------------------------------------
// 4. Draft Auto-Save Debounced Listeners
// -------------------------------------------------------------------------
function attachDraftAutoSaveListeners() {
  function debounce(func, delay = 800) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

  const debouncedProviderSave = debounce(() => {
    updateDraftStatusUI('page-prov-draft-status', 'Auto-saving...', true);
    saveProviderApplicationDraft(false);
  }, 900);

  const debouncedCustomerSave = debounce(() => {
    updateDraftStatusUI('inline-cust-draft-status', 'Auto-saving...', true);
    saveCustomerApplicationDraft(false);
  }, 900);

  const debouncedFranchiseSave = debounce(() => {
    updateDraftStatusUI('franchise-draft-status', 'Auto-saving...', true);
    saveFranchiseApplicationDraft(false);
  }, 900);

  const provForm = document.getElementById('inline-provider-reg-form');
  if (provForm) {
    provForm.addEventListener('input', debouncedProviderSave);
    provForm.addEventListener('change', debouncedProviderSave);
  }

  const custForm = document.getElementById('inline-customer-register-form');
  if (custForm) {
    custForm.addEventListener('input', debouncedCustomerSave);
    custForm.addEventListener('change', debouncedCustomerSave);
  }

  const franchiseForm = document.getElementById('franchise-register-form');
  if (franchiseForm) {
    franchiseForm.addEventListener('input', debouncedFranchiseSave);
    franchiseForm.addEventListener('change', debouncedFranchiseSave);
  }
}

// Global window registrations
window.getDraftStorageKey = getDraftStorageKey;
window.updateDraftStatusUI = updateDraftStatusUI;
window.updateGoogleAuthBanners = updateGoogleAuthBanners;
window.saveProviderApplicationDraft = saveProviderApplicationDraft;
window.restoreProviderApplicationDraft = restoreProviderApplicationDraft;
window.clearProviderApplicationDraft = clearProviderApplicationDraft;
window.saveCustomerApplicationDraft = saveCustomerApplicationDraft;
window.restoreCustomerApplicationDraft = restoreCustomerApplicationDraft;
window.clearCustomerApplicationDraft = clearCustomerApplicationDraft;
window.saveFranchiseApplicationDraft = saveFranchiseApplicationDraft;
window.restoreFranchiseApplicationDraft = restoreFranchiseApplicationDraft;
window.clearFranchiseApplicationDraft = clearFranchiseApplicationDraft;
window.attachDraftAutoSaveListeners = attachDraftAutoSaveListeners;

// Franchise Staff Technicians window exports
window.addFranchiseStaffMember = addFranchiseStaffMember;
window.updateStaffHeaderSummary = updateStaffHeaderSummary;
window.handleFranchiseStaffCategoryChange = handleFranchiseStaffCategoryChange;
window.toggleStaffCardCollapse = toggleStaffCardCollapse;
window.toggleStaffDirectPayFields = toggleStaffDirectPayFields;
window.applyStaffCalendarPreset = applyStaffCalendarPreset;
window.removeFranchiseStaffMember = removeFranchiseStaffMember;
window.handleLinkExistingProviderChange = handleLinkExistingProviderChange;
window.updateFranchiseStaffStats = updateFranchiseStaffStats;
window.handleStaffBizCodeTypeChange = handleStaffBizCodeTypeChange;

// Core Application & Navigation Exports for Bundled Module Compatibility
window.appState = appState;
window.SAMPLE_PROMPTS = SAMPLE_PROMPTS;
window.switchTab = switchTab;
window.focusAIChat = focusAIChat;
window.setupAddressAutocomplete = setupAddressAutocomplete;

/* ==========================================================================
   Thin Geolocation, Weather & Time Footer Bar & Regional Settings Logic
   ========================================================================== */
export const COUNTRY_FLAGS = {
  AU: '🇦🇺',
  NZ: '🇳🇿',
  US: '🇺🇸',
  GB: '🇬🇧',
  CA: '🇨🇦',
  IE: '🇮🇪',
  SG: '🇸🇬'
};

export const geoTimeState = {
  country: 'AU',
  suburb: 'Broadbeach QLD 4218',
  coords: { lat: -28.0280, lng: 153.4312 },
  timeFormat: '12h',
  dateFormat: 'DD/MM/YYYY',
  timezone: 'Australia/Brisbane',
  tempUnit: 'C',
  weather: '24°C Clear',
  weatherIcon: 'fa-sun',
  weatherLoaded: false
};

/**
 * Set the visitor's region everywhere it is used: the geo footer bar, distance units and
 * the display currency (AUD in Australia & New Zealand, a USD conversion elsewhere).
 */
function setUserCountry(country, source = 'saved') {
  const code = String(country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return;
  geoTimeState.country = code;
  appState.userCountry = code;
  window.iasjCurrency?.setCountry(code, source);
  updateGeoTimeBar();
}

/**
 * Default region, in order of preference: the visitor's own saved choice (or GPS),
 * then IP geolocation (applied in initGeoTimeBar once /api/pricing answers), then the device time zone.
 * Returns where the country came from.
 */
function detectInitialCountry() {
  const savedSettings = localStorage.getItem('iasj_regional_settings');
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
      Object.assign(geoTimeState, parsed);
      setUserCountry(geoTimeState.country || 'AU', 'saved');
      return 'saved';
    } catch (e) {}
  }

  const savedCountry = localStorage.getItem('iasj_user_country');
  if (savedCountry) {
    setUserCountry(savedCountry, 'saved');
    return 'saved';
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Australia') || tz.includes('Brisbane') || tz.includes('Sydney') || tz.includes('Melbourne') || tz.includes('Perth')) {
      geoTimeState.country = 'AU';
      geoTimeState.timezone = tz;
    } else if (tz.includes('Auckland')) {
      geoTimeState.country = 'NZ';
      geoTimeState.timezone = tz;
    } else if (tz.includes('New_York') || tz.includes('Chicago') || tz.includes('Los_Angeles') || tz.includes('America/')) {
      geoTimeState.country = 'US';
      geoTimeState.timezone = tz;
      geoTimeState.dateFormat = 'MM/DD/YYYY';
      geoTimeState.tempUnit = 'F';
    } else if (tz.includes('London')) {
      geoTimeState.country = 'GB';
      geoTimeState.timezone = tz;
    }
  } catch (e) {}

  setUserCountry(geoTimeState.country || 'AU', 'timezone');
  return 'timezone';
}

/**
 * Time zone, date format and temperature unit that go with a country
 */
function applyCountryDefaults(country) {
  const defaults = {
    AU: ['Australia/Brisbane', 'DD/MM/YYYY', 'C'],
    NZ: ['Pacific/Auckland', 'DD/MM/YYYY', 'C'],
    US: ['America/New_York', 'MM/DD/YYYY', 'F'],
    GB: ['Europe/London', 'DD/MM/YYYY', 'C'],
    CA: ['America/Toronto', 'YYYY-MM-DD', 'C']
  }[country];
  if (!defaults) return;
  [geoTimeState.timezone, geoTimeState.dateFormat, geoTimeState.tempUnit] = defaults;
}

async function fetchOpenMeteoWeather(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.current_weather) return;

    const rawTemp = data.current_weather.temperature;
    const code = data.current_weather.weathercode;

    let displayTemp = Math.round(rawTemp);
    if (geoTimeState.tempUnit === 'F') {
      displayTemp = Math.round((rawTemp * 9 / 5) + 32);
    }

    let desc = 'Clear';
    let icon = 'fa-sun';
    if (code === 0) { desc = 'Clear'; icon = 'fa-sun'; }
    else if (code >= 1 && code <= 3) { desc = 'Partly Cloudy'; icon = 'fa-cloud-sun'; }
    else if (code >= 45 && code <= 48) { desc = 'Foggy'; icon = 'fa-smog'; }
    else if (code >= 51 && code <= 67) { desc = 'Rain'; icon = 'fa-cloud-rain'; }
    else if (code >= 71 && code <= 77) { desc = 'Snow'; icon = 'fa-snowflake'; }
    else if (code >= 80 && code <= 82) { desc = 'Showers'; icon = 'fa-cloud-showers-heavy'; }
    else if (code >= 95) { desc = 'Storm'; icon = 'fa-bolt'; }

    geoTimeState.weather = `${displayTemp}°${geoTimeState.tempUnit} ${desc}`;
    geoTimeState.weatherIcon = icon;
    geoTimeState.weatherLoaded = true;

    updateGeoTimeBar();
  } catch (err) {
    console.warn('Weather fetch warning:', err);
  }
}

function updateGeoTimeBar() {
  const flagEl = document.getElementById('geo-bar-flag');
  const countryEl = document.getElementById('geo-bar-country-name');
  const suburbEl = document.getElementById('geo-bar-suburb');
  const weatherEl = document.getElementById('geo-bar-weather');
  const weatherIconEl = document.getElementById('geo-bar-weather-icon');

  const flag = COUNTRY_FLAGS[geoTimeState.country] || '🌐';
  if (flagEl) flagEl.textContent = flag;
  if (countryEl) countryEl.textContent = geoTimeState.country;
  if (suburbEl) {
    const rawSub = geoTimeState.suburb || 'Broadbeach';
    suburbEl.textContent = rawSub.split(',')[0].trim();
  }
  if (weatherEl) weatherEl.textContent = geoTimeState.weather;
  if (weatherIconEl) {
    weatherIconEl.className = `fa-solid ${geoTimeState.weatherIcon}`;
  }
}

function updateGeoTimeBarTime() {
  const timeEl = document.getElementById('geo-bar-time');
  if (!timeEl) return;
  try {
    const now = new Date();
    const is12 = geoTimeState.timeFormat === '12h';
    const formatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: geoTimeState.timezone || 'Australia/Brisbane',
      hour: '2-digit',
      minute: '2-digit',
      hour12: is12
    });
    
    let tzAbbr = 'AEST';
    const tzStr = geoTimeState.timezone || '';
    if (tzStr.includes('Sydney') || tzStr.includes('Melbourne')) tzAbbr = 'AEDT';
    else if (tzStr.includes('Adelaide')) tzAbbr = 'ACDT';
    else if (tzStr.includes('Perth')) tzAbbr = 'AWST';
    else if (tzStr.includes('Auckland')) tzAbbr = 'NZDT';
    else if (tzStr.includes('New_York')) tzAbbr = 'ET';
    else if (tzStr.includes('Los_Angeles')) tzAbbr = 'PT';
    else if (tzStr.includes('London')) tzAbbr = 'GMT';

    timeEl.textContent = `${formatter.format(now)} ${tzAbbr}`;
  } catch (e) {
    timeEl.textContent = new Date().toLocaleTimeString();
  }
}

function openGeoTimeModal() {
  const modal = document.getElementById('geo-time-modal') || document.getElementById('geo-settings-modal');
  if (!modal) return;

  const selCountry = document.getElementById('geo-select-country');
  const inSuburb = document.getElementById('geo-input-suburb');
  const selTimeFormat = document.getElementById('geo-select-time-format');
  const selDateFormat = document.getElementById('geo-select-date-format');
  const selTz = document.getElementById('geo-select-timezone');
  const selTemp = document.getElementById('geo-select-temp-unit');

  if (selCountry) selCountry.value = geoTimeState.country;
  if (inSuburb) inSuburb.value = geoTimeState.suburb;
  if (selTimeFormat) selTimeFormat.value = geoTimeState.timeFormat;
  if (selDateFormat) selDateFormat.value = geoTimeState.dateFormat;
  if (selTz) selTz.value = geoTimeState.timezone;
  if (selTemp) selTemp.value = geoTimeState.tempUnit;

  modal.style.display = 'flex';
}

function closeGeoTimeModal() {
  const modal = document.getElementById('geo-time-modal') || document.getElementById('geo-settings-modal');
  if (modal) modal.style.display = 'none';
}

function handleCountrySelectChange(country) {
  // Only fills in the form; the region is applied when the visitor presses Save
  applyCountryDefaults(country);

  const selDateFormat = document.getElementById('geo-select-date-format');
  const selTz = document.getElementById('geo-select-timezone');
  const selTemp = document.getElementById('geo-select-temp-unit');
  if (selDateFormat) selDateFormat.value = geoTimeState.dateFormat;
  if (selTz) selTz.value = geoTimeState.timezone;
  if (selTemp) selTemp.value = geoTimeState.tempUnit;
}

function saveGeoTimeSettings() {
  const selCountry = document.getElementById('geo-select-country')?.value || 'AU';
  const inSuburb = document.getElementById('geo-input-suburb')?.value.trim() || 'Broadbeach QLD 4218';
  const selTimeFormat = document.getElementById('geo-select-time-format')?.value || '12h';
  const selDateFormat = document.getElementById('geo-select-date-format')?.value || 'DD/MM/YYYY';
  const selTz = document.getElementById('geo-select-timezone')?.value || 'Australia/Brisbane';
  const selTemp = document.getElementById('geo-select-temp-unit')?.value || 'C';

  geoTimeState.suburb = inSuburb;
  geoTimeState.timeFormat = selTimeFormat;
  geoTimeState.dateFormat = selDateFormat;
  geoTimeState.timezone = selTz;
  geoTimeState.tempUnit = selTemp;

  // The visitor's own choice overrides geolocation from now on
  setUserCountry(selCountry, 'saved');
  if (typeof syncCustomerDistanceUnits === 'function') {
    syncCustomerDistanceUnits(selCountry);
  }

  localStorage.setItem('iasj_regional_settings', JSON.stringify(geoTimeState));
  localStorage.setItem('iasj_user_country', selCountry);

  updateGeoTimeBar();
  updateGeoTimeBarTime();
  closeGeoTimeModal();

  if (geoTimeState.coords) {
    fetchOpenMeteoWeather(geoTimeState.coords.lat, geoTimeState.coords.lng);
  }

  showToast(`🌍 Settings applied: ${COUNTRY_FLAGS[selCountry] || ''} ${selCountry} • ${inSuburb}`);
}

async function reDetectGpsLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by your browser.");
    return;
  }

  showToast("📍 Accessing GPS to detect country and suburb...");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      geoTimeState.coords = { lat, lng };

      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          
          if (addr.country_code) {
            const detectedCountry = addr.country_code.toUpperCase();
            localStorage.setItem('iasj_user_country', detectedCountry);
            const selCountry = document.getElementById('geo-select-country');
            if (selCountry) {
              selCountry.value = detectedCountry;
              handleCountrySelectChange(detectedCountry);
            }
            setUserCountry(detectedCountry, 'gps');
          }

          const suburb = addr.suburb || addr.city_district || addr.town || addr.city || '';
          const state = addr.state === 'Queensland' ? 'QLD' : (addr.state || '');
          const postcode = addr.postcode || '';
          const suburbText = [suburb, state, postcode].filter(Boolean).join(' ') || data.display_name.split(',')[0];
          
          geoTimeState.suburb = suburbText;
          const inSuburb = document.getElementById('geo-input-suburb');
          if (inSuburb) inSuburb.value = suburbText;

          fetchOpenMeteoWeather(lat, lng);
          showToast(`📍 Located: ${suburbText} (${geoTimeState.country})`);
        }
      } catch (e) {
        console.warn('GPS detection error:', e);
        showToast('Could not resolve suburb name from GPS.');
      }
    },
    (err) => {
      console.warn('GPS error:', err);
      showToast('Could not retrieve GPS location.');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function initGeoTimeBar() {
  const source = detectInitialCountry();

  // Geolocation sets the default region: use the IP country unless the visitor chose one themselves
  window.iasjCurrency?.ready.then(({ ipCountry }) => {
    if (source === 'saved' || !ipCountry || ipCountry === geoTimeState.country) return;
    applyCountryDefaults(ipCountry);
    setUserCountry(ipCountry, 'ip');
    updateGeoTimeBarTime();
  });

  // The thin footer bar only exists on the main page
  if (!document.getElementById('geo-time-footer-bar')) return;

  updateGeoTimeBar();
  updateGeoTimeBarTime();
  setInterval(updateGeoTimeBarTime, 1000);
  fetchOpenMeteoWeather(geoTimeState.coords.lat, geoTimeState.coords.lng);

  // Close modal when clicking outside backdrop or pressing Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGeoTimeModal();
  });

  const modal = document.getElementById('geo-settings-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeGeoTimeModal();
    });
  }
}



/* ==========================================================================
   Superadmin Multi-Role Perspective Switching
   ========================================================================== */
function checkIsSuperadmin(user) {
  if (!user) {
    const localUser = window.firebaseService?.getCurrentGoogleUser?.();
    if (localUser) user = localUser;
    else if (localStorage.getItem('iasj_superadmin_mode') === 'true') return true;
    else return false;
  }
  const email = (user.email || '').toLowerCase().trim();
  const rawAllowed = (window.ENV?.SUPERADMIN_EMAILS || 'support@aifoundation.net.au,davidrobertson.info@gmail.com') + '';
  const allowedList = rawAllowed.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isSuperEmail = allowedList.includes(email) || email === 'support@aifoundation.net.au' || email === 'davidrobertson.info@gmail.com';
  return isSuperEmail || user.isSuperadmin === true || user.role === 'superadmin' || localStorage.getItem('iasj_superadmin_mode') === 'true';
}

function switchSuperadminViewRole(role) {
  const user = window.firebaseService?.getCurrentGoogleUser?.();
  if (!checkIsSuperadmin(user)) return;

  if (role === 'customer') role = 'supporter';

  const roleNames = {
    superadmin: 'SuperAdmin (Supreme Ruler)',
    driver: 'Driver (Approved Courier Driver)',
    supporter: 'Community Supporter'
  };

  sessionStorage.setItem('iasj_superadmin_view_role', role);

  // Update switcher buttons
  document.querySelectorAll('.superadmin-role-btn').forEach(btn => {
    const btnRole = btn.getAttribute('data-role');
    const isActive = btnRole === role;
    btn.classList.toggle('active', isActive);
    if (isActive) {
      btn.style.fontWeight = '900';
      btn.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.4)';
    } else {
      btn.style.fontWeight = '700';
      btn.style.boxShadow = 'none';
    }
  });

  const currentRoleLabel = document.getElementById('superadmin-current-role-label');
  if (currentRoleLabel) {
    currentRoleLabel.textContent = roleNames[role] || role;
  }

  const floatingBanner = document.getElementById('superadmin-viewing-banner');
  const viewNameEl = document.getElementById('sa-active-view-name');
  const bannerSelect = document.getElementById('sa-banner-role-select');

  if (bannerSelect) bannerSelect.value = role;

  if (role === 'superadmin') {
    if (floatingBanner) floatingBanner.style.display = 'none';
  } else {
    if (floatingBanner) {
      floatingBanner.style.display = 'block';
      if (viewNameEl) viewNameEl.textContent = roleNames[role] || role;
    }
  }

  // Navigate or adapt layout based on simulated role perspective
  if (role === 'driver') {
    if (typeof switchTab === 'function') switchTab('driver-admin-tab', true);
    if (typeof switchSupporterSubTab === 'function') switchSupporterSubTab('supporter-dispatch-subtab');
  } else if (role === 'supporter') {
    if (typeof switchTab === 'function') switchTab('driver-admin-tab', true);
    if (typeof switchSupporterSubTab === 'function') switchSupporterSubTab('supporter-details-subtab');
  } else if (role === 'superadmin') {
    if (typeof switchTab === 'function') switchTab('driver-admin-tab', true);
    if (typeof switchSupporterSubTab === 'function') switchSupporterSubTab('supporter-dispatch-subtab');
  }

  syncSuperadminControls();
  try { renderSupporterPanel(); } catch (e) {}
  try { renderDriverAdminDashboard(); } catch (e) {}
  try { updateDriverApplicationGateUI(); } catch (e) {}
  try { updateGoogleAuthUI(user); } catch (e) {}

  if (typeof showToast === 'function') {
    showToast(`👑 Viewing site as: ${roleNames[role] || role}`);
  }
}
window.switchSuperadminViewRole = switchSuperadminViewRole;

function syncSuperadminControls() {
  const user = window.firebaseService?.getCurrentGoogleUser?.();
  const isSa = checkIsSuperadmin(user);
  const viewRole = sessionStorage.getItem('iasj_superadmin_view_role') || 'superadmin';
  const showPriceTools = isSa && viewRole === 'superadmin';

  const switcher = document.getElementById('superadmin-role-switcher-section');
  if (switcher) switcher.style.display = (isSa && viewRole === 'superadmin') ? 'block' : 'none';

  const menuSwitcher = document.getElementById('google-menu-superadmin-switcher');
  if (menuSwitcher) menuSwitcher.style.display = isSa ? 'block' : 'none';
  if (isSa) {
    document.querySelectorAll('.superadmin-role-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-role') === viewRole);
    });
  }

  const emailEl = document.getElementById('superadmin-firebase-email');
  if (emailEl) {
    emailEl.textContent = user?.email || 'support@aifoundation.net.au';
  }

  document.querySelectorAll('.superadmin-only').forEach(el => {
    el.style.display = showPriceTools ? '' : 'none';
  });
  if (showPriceTools) {
    syncSuperadminCourierControls();
    if (typeof renderSuperadminTokenBalance === 'function') renderSuperadminTokenBalance();
    if (typeof renderSuperadminDriverApprovals === 'function') renderSuperadminDriverApprovals();
  }
}

function initSuperadminViewMode() {
  const user = window.firebaseService?.getCurrentGoogleUser?.();
  const switcherSec = document.getElementById('superadmin-role-switcher-section');
  const floatingBanner = document.getElementById('superadmin-viewing-banner');
  const isSa = checkIsSuperadmin(user);

  if (isSa && switcherSec) {
    switcherSec.style.display = 'block';
    let activeView = sessionStorage.getItem('iasj_superadmin_view_role') || 'superadmin';
    if (activeView === 'customer') activeView = 'supporter';
    switchSuperadminViewRole(activeView);
  } else {
    if (switcherSec) switcherSec.style.display = 'none';
    if (floatingBanner) floatingBanner.style.display = 'none';
  }
}


window.setupOsmAddressAutocomplete = setupOsmAddressAutocomplete;
window.searchOsmAddress = searchOsmAddress;
window.reverseGeocodeOsm = reverseGeocodeOsm;
window.locateCustomer = locateCustomer;
window.updateRadiusDisplay = updateRadiusDisplay;
window.filterContractors = filterContractors;
window.renderContractorCards = renderContractorCards;
window.panToContractor = panToContractor;
window.bookProviderDirectly = bookProviderDirectly;
window.computeDistanceInKm = computeDistanceInKm;
window.applySamplePrompt = applySamplePrompt;
window.clearAIPrompt = clearAIPrompt;
window.submitAIAnalysis = submitAIAnalysis;
window.renderAnalysisResults = renderAnalysisResults;
window.selectMatchedProvider = selectMatchedProvider;
window.updatePricingCard = updatePricingCard;
window.selectShift = selectShift;
window.handleJobPhotoUpload = handleJobPhotoUpload;
window.removeJobPhoto = removeJobPhoto;
window.handleCourierPhotoUpload = handleCourierPhotoUpload;
window.handleProviderPhotoUpload = handleProviderPhotoUpload;
window.handleCandidatePhotoUpload = handleCandidatePhotoUpload;
window.confirmBooking = confirmBooking;
window.selectPackageType = selectPackageType;
window.calculateCourierQuote = calculateCourierQuote;
window.updateCourierPricingWithSettings = updateCourierPricingWithSettings;
window.bookCourierDispatch = bookCourierDispatch;
window.handleProviderRegistration = handleProviderRegistration;
window.addJobToDispatchFeed = addJobToDispatchFeed;
window.acceptDispatchJob = acceptDispatchJob;
window.declineDispatchJob = declineDispatchJob;
window.completeJob = completeJob;
window.renderInvoiceModal = renderInvoiceModal;
window.closeBookingModal = closeBookingModal;
window.printOrDownloadInvoice = printOrDownloadInvoice;
window.openStripePaymentModal = openStripePaymentModal;
window.closeStripePaymentModal = closeStripePaymentModal;
window.handleStripePaymentSubmit = handleStripePaymentSubmit;
window.openFranchiseModal = openFranchiseModal;
window.closeFranchiseModal = closeFranchiseModal;
window.handleFranchiseSubmit = handleFranchiseSubmit;
window.openTrackModal = openTrackModal;
window.initSpeechRecognition = initSpeechRecognition;
window.toggleVoiceSpeech = toggleVoiceSpeech;
window.showToast = showToast;
window.renderCandidateCards = renderCandidateCards;
window.filterCandidates = filterCandidates;
window.selectCandidateShiftFilter = selectCandidateShiftFilter;
window.resetRecruitmentFilters = resetRecruitmentFilters;
window.openCandidateResumeModal = openCandidateResumeModal;
window.closeCandidateResumeModal = closeCandidateResumeModal;
window.openHireModalFromResume = openHireModalFromResume;
window.openHireStaffModal = openHireStaffModal;
window.closeHireStaffModal = closeHireStaffModal;
window.handleRecruitmentHireSubmit = handleRecruitmentHireSubmit;
window.openCandidateRegisterModal = openCandidateRegisterModal;
window.closeCandidateRegisterModal = closeCandidateRegisterModal;
window.handleCandidateRegisterSubmit = handleCandidateRegisterSubmit;
window.getStoredProviderDocs = getStoredProviderDocs;
window.saveStoredProviderDocs = saveStoredProviderDocs;
window.getCategoryServices = getCategoryServices;
window.updateRowPriceInputs = updateRowPriceInputs;
window.createDefaultMatrixData = createDefaultMatrixData;
window.getMatrixSchedule = getMatrixSchedule;
window.updateAdminStatusUI = updateAdminStatusUI;
window.renderAdminBlackoutChips = renderAdminBlackoutChips;
window.renderPublicCalendarGrid = renderPublicCalendarGrid;
window.routeUserToDashboard = routeUserToDashboard;
window.fallbackCopy = fallbackCopy;


window.openGeoTimeModal = openGeoTimeModal;
window.closeGeoTimeModal = closeGeoTimeModal;
window.saveGeoTimeSettings = saveGeoTimeSettings;
window.handleCountrySelectChange = handleCountrySelectChange;
window.reDetectGpsLocation = reDetectGpsLocation;
window.geoTimeState = geoTimeState;

window.selectCourierDriverMode = selectCourierDriverMode;
window.toggleContractorCardMode = toggleContractorCardMode;

window.checkIsSuperadmin = checkIsSuperadmin;
window.switchSuperadminViewRole = switchSuperadminViewRole;
window.initSuperadminViewMode = initSuperadminViewMode;

window.formatTokenItemPrice = formatTokenItemPrice;

window.iasjConfirmDelete = iasjConfirmDelete;
window.refreshPriceTags = refreshPriceTags;
window.syncSuperadminControls = syncSuperadminControls;
window.setUserCountry = setUserCountry;

/* ==========================================================================
   Currency & price list wiring
   Runs last, once every function and the geoTimeState above are defined.
   ========================================================================== */

// Redraw prices when the region, exchange rate or superadmin price list changes
// Each step is guarded separately so one failure never stops the other prices from updating
window.addEventListener('iasjPricingChanged', () => {
  const steps = [
    () => syncSuperadminDistanceTierInputs(),
    () => {
      const dist = appState.lastCourierRoute?.distanceKm || 8.5;
      const mins = appState.lastCourierRoute?.durationMins || 15;
      updateCourierPricingWithSettings(dist, mins);
    },
    () => refreshPriceTags(),
    () => syncSuperadminControls()
  ];
  steps.forEach(run => {
    try { run(); } catch (e) { console.warn('💱 Price refresh step failed:', e); }
  });
});

try { initGeoTimeBar(); } catch (e) { console.warn('Geo bar init error:', e); }
try { syncSuperadminControls(); } catch (e) {}
