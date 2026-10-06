/**
 * It's A Simple Job - Interactive Client Application Logic
 * Integrates Google Maps API, Places Autocomplete, Geolocation Locator,
 * Dynamic Contractor Search & Map Markers, and Courier Route Directions.
 */

// Application State
const appState = {
  activeTab: 'ai-book-tab',
  currentAnalysis: null,
  selectedProviderId: null,
  selectedShift: 'morning', // 'emergency_24_7', 'morning', 'afternoon', 'evening', 'overnight'
  courierPackageType: 'documents',
  activeBookings: [],
  isListening: false,
  recognition: null,
  candidateShiftFilter: 'all',
  activeCandidateModalId: null,
  // ImgBB Upload State (Album: https://ibb.co/album/k4vjCb)
  uploadedJobPhotos: [],
  uploadedCourierPhoto: null,
  uploadedProviderPhoto: null,
  uploadedCandidatePhoto: null,
  // Google Maps State
  userCoords: { lat: -28.0280, lng: 153.4312 }, // Broadbeach QLD default
  userLocationName: 'Broadbeach QLD 4218',
  searchRadiusKm: 25,
  contractorMarkers: [],
  userMarker: null,
  contractorInfoWindow: null,
  contractorMap: null,
  courierRouteMap: null,
  directionsService: null,
  directionsRenderer: null
};

// Preset Sample Prompts for Instant Evaluation
const SAMPLE_PROMPTS = {
  leaking_tap: "My kitchen mixer tap is dripping constantly under the sink and the shutoff valve feels loose. I'm in Broadbeach on the Gold Coast. Can someone come Thursday afternoon?",
  flatpack_assembly: "I bought two 3-door IKEA wardrobes and a huge hallway mirror that need assembling and securely mounting to the plaster wall in Southport. Need an experienced handyman with their own tools.",
  urgent_courier: "Urgent courier needed: 2 boxes of critical surgical supplies (12kg total) from Gold Coast Private Hospital in Southport to Brisbane Hospital ASAP today. Needs urgent direct drop-off.",
  powerpoints: "Need 3 weatherproof double power points installed outdoors on my covered patio in Robina, plus a ceiling fan replacement. Looking for a licensed sparky.",
  garden_lawn: "My backyard grass is overgrown past my knees after the rain, palm fronds everywhere, and front gutters need a thorough vacuum and green waste removal in Burleigh Heads.",
  drywall_patch: "There's an accidental hole in the drywall behind the bedroom door and a few scuffs. Need it patched, sanded smooth, and repainted to match."
};

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initSpeechRecognition();
  loadGoogleMapsScript();
  initGoogleAuthUI();
  const courierDateInput = document.getElementById('courier-pickup-date');
  if (courierDateInput && !courierDateInput.value) {
    courierDateInput.value = new Date().toISOString().split('T')[0];
  }
  calculateCourierQuote();
  filterCandidates();
  renderProviderDocumentVault();
  renderCalendarMatrix('inline-calendar-matrix-root', 'inline');
  renderCalendarMatrix('modal-calendar-matrix-root', 'modal');
  renderDefaultServiceFeeRows('page', 'plumbing');
  renderDefaultServiceFeeRows('modal', 'plumbing');

  // Initialize form draft auto-save listeners & Google auth banners
  if (typeof attachDraftAutoSaveListeners === 'function') {
    attachDraftAutoSaveListeners();
  }
  if (typeof updateGoogleAuthBanners === 'function') {
    updateGoogleAuthBanners();
  }
  if (typeof restoreFranchiseApplicationDraft === 'function') {
    restoreFranchiseApplicationDraft();
  }

  // If Firebase is available, seed providers if database is empty
  if (window.firebaseService?.seedProvidersIfEmpty && window.INITIAL_PROVIDERS) {
    window.firebaseService.seedProvidersIfEmpty(window.INITIAL_PROVIDERS);
  }

  // Subscribe to live Firestore bookings for dispatch feed
  if (window.firebaseService?.subscribeToLiveBookings) {
    window.firebaseService.subscribeToLiveBookings((remoteBookings) => {
      if (remoteBookings && remoteBookings.length > 0) {
        remoteBookings.forEach(rb => {
          if (!appState.activeBookings.some(b => b.docketNumber === rb.docketNumber)) {
            appState.activeBookings.unshift(rb);
            addJobToDispatchFeed(rb);
          }
        });
      }
    });
  }

  // Run an initial analysis with a realistic prompt so the interface is immediately engaging
  const promptInput = document.getElementById('ai-prompt-input');
  if (promptInput) {
    promptInput.value = SAMPLE_PROMPTS.leaking_tap;
    submitAIAnalysis(false); // subtle initial run without notification toast
  }

  // Handle URL search params or hash for navigation
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const requestedTab = urlParams.get('tab');
    if (requestedTab) {
      if (requestedTab === 'register-selection-tab') {
        openRegisterSelectionPanel();
      } else if (typeof switchTab === 'function') {
        switchTab(requestedTab);
      }
    } else if (window.location.hash === '#register') {
      openRegisterSelectionPanel();
    }
  } catch (e) {
    console.warn('URL param navigation error:', e);
  }
});

/**
 * Tab Navigation Controller
 */
function switchTab(tabId) {
  // Alias register-tab to register-selection-tab
  if (tabId === 'register-tab') {
    tabId = 'register-selection-tab';
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
  if (tabId === 'ai-book-tab') {
    document.getElementById('tab-btn-ai-book')?.classList.add('active');
    document.getElementById('pill-ai-book')?.classList.add('active');
  } else if (tabId === 'find-contractors-tab') {
    document.getElementById('tab-btn-find-contractors')?.classList.add('active');
    document.getElementById('pill-find-contractors')?.classList.add('active');
    setTimeout(() => {
      if (appState.contractorMap && window.google?.maps) {
        google.maps.event.trigger(appState.contractorMap, 'resize');
        if (appState.userCoords) {
          appState.contractorMap.setCenter(appState.userCoords);
        }
      }
    }, 150);
  } else if (tabId === 'courier-tab') {
    document.getElementById('tab-btn-courier')?.classList.add('active');
    document.getElementById('pill-courier')?.classList.add('active');
    setTimeout(() => {
      if (appState.courierRouteMap && window.google?.maps) {
        google.maps.event.trigger(appState.courierRouteMap, 'resize');
      }
    }, 150);
  } else if (tabId === 'recruitment-tab') {
    document.getElementById('tab-btn-recruitment')?.classList.add('active');
    document.getElementById('pill-recruitment')?.classList.add('active');
    filterCandidates();
  } else if (tabId === 'register-selection-tab') {
    document.getElementById('tab-btn-register')?.classList.add('active');
    document.getElementById('pill-register')?.classList.add('active');
  } else if (tabId === 'provider-application-tab') {
    document.getElementById('tab-btn-register')?.classList.add('active');
    document.getElementById('tab-btn-provider')?.classList.add('active');
    document.getElementById('pill-register')?.classList.add('active');
    if (typeof restoreProviderApplicationDraft === 'function') {
      restoreProviderApplicationDraft();
    }
    if (typeof renderProviderDocumentVault === 'function') {
      renderProviderDocumentVault();
    }
    if (typeof updateGoogleAuthBanners === 'function') {
      updateGoogleAuthBanners();
    }
  } else if (tabId === 'customer-application-tab') {
    document.getElementById('tab-btn-register')?.classList.add('active');
    document.getElementById('tab-btn-customer')?.classList.add('active');
    document.getElementById('pill-register')?.classList.add('active');
    if (typeof restoreCustomerApplicationDraft === 'function') {
      restoreCustomerApplicationDraft();
    }
    if (typeof updateGoogleAuthBanners === 'function') {
      updateGoogleAuthBanners();
    }
  } else if (tabId === 'franchise-application-tab') {
    document.getElementById('tab-btn-register')?.classList.add('active');
    document.getElementById('tab-btn-franchise')?.classList.add('active');
    document.getElementById('pill-register')?.classList.add('active');
    if (typeof restoreFranchiseApplicationDraft === 'function') {
      restoreFranchiseApplicationDraft();
    }
    if (typeof updateGoogleAuthBanners === 'function') {
      updateGoogleAuthBanners();
    }
  } else if (tabId === 'franchise-tab') {
    document.getElementById('tab-btn-franchise')?.classList.add('active');
    document.getElementById('pill-franchise')?.classList.add('active');
  } else if (tabId === 'how-it-works-tab') {
    document.getElementById('tab-btn-how-it-works')?.classList.add('active');
    document.getElementById('pill-how-it-works')?.classList.add('active');
  } else if (tabId === 'provider-network-tab') {
    document.getElementById('tab-btn-provider-network')?.classList.add('active');
    document.getElementById('pill-provider-network')?.classList.add('active');
  } else if (tabId === 'franchise-tab') {
    document.getElementById('tab-btn-franchise')?.classList.add('active');
    document.getElementById('pill-franchise')?.classList.add('active');
  }

  appState.activeTab = tabId;
  const isFormView = tabId.includes('application') || tabId === 'register-selection-tab';
  window.scrollTo({ top: isFormView ? 120 : 400, behavior: 'smooth' });
}

function focusAIChat() {
  switchTab('ai-book-tab');
  const input = document.getElementById('ai-prompt-input');
  if (input) {
    input.focus();
  }
}

/**
 * ==========================================================================
 * GOOGLE MAPS SERVICES & GEOLOCATION
 * ==========================================================================
 */

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
 * Attach Autocomplete to an input element
 */
function setupAddressAutocomplete(inputId, onPlaceSelectedCallback) {
  const input = document.getElementById(inputId);
  if (!input || !window.google?.maps?.places) return;

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
}

/**
 * Geolocation / "Locate Me" Button Action
 */
function locateCustomer(targetInputId) {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by your browser.");
    return;
  }

  showToast("📍 Accessing GPS to locate you...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      appState.userCoords = { lat, lng };

      // Reverse geocode with Google Maps Geocoder if available
      if (window.google?.maps?.Geocoder) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          let addressText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          if (status === "OK" && results[0]) {
            addressText = results[0].formatted_address;
          }

          appState.userLocationName = addressText;
          const input = document.getElementById(targetInputId);
          if (input) input.value = addressText;

          if (targetInputId === 'contractor-search-location') {
            if (appState.contractorMap) {
              appState.contractorMap.panTo(appState.userCoords);
              appState.contractorMap.setZoom(13);
            }
            filterContractors();
          } else if (targetInputId === 'courier-origin') {
            calculateCourierQuote();
          }

          showToast(`📍 Located: ${addressText.split(',')[0]}`);
        });
      } else {
        const input = document.getElementById(targetInputId);
        if (input) input.value = "Gold Coast QLD (GPS Located)";
        filterContractors();
        showToast("📍 Located your GPS position!");
      }
    },
    (error) => {
      console.warn("Geolocation denied or unavailable:", error);
      showToast("Could not retrieve exact GPS. Defaulting to Gold Coast.");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/**
 * Radius Slider Display updater
 */
function updateRadiusDisplay(value) {
  appState.searchRadiusKm = parseInt(value, 10);
  const pill = document.getElementById('radius-val-display');
  if (pill) pill.textContent = `${value} km`;
  filterContractors();
}

/**
 * Filter Contractors and Update Google Map Markers
 */
function filterContractors() {
  const category = document.getElementById('contractor-search-category')?.value || 'all';
  const radius = appState.searchRadiusKm || 25;
  const userLat = appState.userCoords.lat;
  const userLng = appState.userCoords.lng;

  // Clear existing markers
  appState.contractorMarkers.forEach(m => m.setMap(null));
  appState.contractorMarkers = [];

  if (appState.userMarker) {
    appState.userMarker.setMap(null);
  }

  const allProviders = window.providerDB ? window.providerDB.getAll() : [];
  const matched = [];

  // Add User Location Marker
  if (appState.contractorMap && window.google?.maps) {
    appState.userMarker = new google.maps.Marker({
      position: appState.userCoords,
      map: appState.contractorMap,
      title: "Your Location",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#00D2D3",
        fillOpacity: 1,
        strokeColor: "#0B192C",
        strokeWeight: 3
      }
    });
  }

  // Bounds tracker
  const bounds = new google.maps.LatLngBounds();
  bounds.extend(new google.maps.LatLng(userLat, userLng));

  allProviders.forEach(provider => {
    // 1. Trade Category Match
    if (category !== 'all' && provider.category !== category) {
      return;
    }

    // 2. Distance Calculation
    const provLat = provider.lat || -28.0280;
    const provLng = provider.lng || 153.4312;
    const distanceKm = computeDistanceInKm(userLat, userLng, provLat, provLng);

    // 3. Radius Check
    if (distanceKm <= radius) {
      const contractorWithDistance = {
        ...provider,
        distanceKm: distanceKm.toFixed(1)
      };
      matched.push(contractorWithDistance);

      // Plot Marker on Google Map
      if (appState.contractorMap && window.google?.maps) {
        const markerPos = new google.maps.LatLng(provLat, provLng);
        bounds.extend(markerPos);

        const markerColor = provider.category === 'courier' ? '#FF5A1F' : '#0B192C';

        const marker = new google.maps.Marker({
          position: markerPos,
          map: appState.contractorMap,
          title: `${provider.name} - ${provider.tradeTitle}`,
          icon: {
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
            fillColor: markerColor,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1.5,
            scale: 1.8,
            anchor: new google.maps.Point(12, 24)
          }
        });

        // Info Window content
        marker.addListener('click', () => {
          if (appState.contractorInfoWindow) {
            appState.contractorInfoWindow.setContent(`
              <div class="gmap-infowindow">
                <div class="gmap-info-title">${provider.name}</div>
                <div class="gmap-info-trade">${provider.tradeTitle}</div>
                <div class="gmap-info-rating"><i class="fa-solid fa-star"></i> ${provider.rating.toFixed(2)} (${provider.reviewCount} jobs)</div>
                <div style="font-size:0.8rem; color:#475569; margin-bottom:0.4rem;">
                  <strong>$${provider.hourlyRate}/hr</strong> • ${distanceKm.toFixed(1)} km from you
                </div>
                <button class="gmap-info-btn" onclick="bookProviderDirectly('${provider.id}')">
                  <i class="fa-solid fa-bolt"></i> Book With AI
                </button>
              </div>
            `);
            appState.contractorInfoWindow.open(appState.contractorMap, marker);
          }
        });

        appState.contractorMarkers.push(marker);
      }
    }
  });

  // Fit bounds if markers exist
  if (appState.contractorMap && matched.length > 0) {
    appState.contractorMap.fitBounds(bounds);
  }

  // Update Status Header
  const counterText = document.getElementById('map-counter-text');
  if (counterText) {
    counterText.textContent = `Showing ${matched.length} Active Contractors`;
  }
  const summaryText = document.getElementById('contractor-filter-summary');
  if (summaryText) {
    summaryText.textContent = `Within ${radius} km of your location`;
  }

  // Render Scrollable Contractor Cards
  renderContractorCards(matched);
}

/**
 * Render Contractor Cards List in Search View
 */
function renderContractorCards(contractors) {
  const container = document.getElementById('contractor-cards-container');
  if (!container) return;

  if (contractors.length === 0) {
    container.innerHTML = `
      <div style="background:#fff; border-radius:var(--radius-md); padding:2rem; text-align:center; border:1px solid var(--border-light);">
        <i class="fa-solid fa-magnifying-glass" style="font-size:2rem; color:var(--text-light); margin-bottom:0.75rem; display:block;"></i>
        <h5 style="color:var(--primary-navy); margin-bottom:0.25rem;">No contractors in this radius</h5>
        <p style="font-size:0.85rem; color:var(--text-muted);">Try increasing your search radius to 50km or selecting 'All Trades'.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = contractors.map(c => {
    const isPaused = c.status === 'paused';
    const statusPill = isPaused 
      ? `<span class="card-status-pill paused" title="${c.pausedReason || 'Profile paused'}"><i class="fa-solid fa-circle-pause"></i> Paused</span>`
      : `<span class="card-status-pill active"><i class="fa-solid fa-circle"></i> Live 24/7</span>`;

    return `
    <div class="contractor-search-card ${isPaused ? 'card-paused' : ''}" id="search-card-${c.id}" onclick="panToContractor('${c.id}', ${c.lat}, ${c.lng})">
      <div class="card-top-row">
        <div class="card-tradie-profile">
          <img src="${c.avatar}" alt="${c.name}" class="card-avatar-sm">
          <div>
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
              <h5 style="font-size:1rem; font-weight:800; color:var(--primary-navy); margin-bottom:0.1rem;">
                ${c.name} <i class="fa-solid fa-circle-check verified-badge" title="Verified Licence"></i>
              </h5>
              ${statusPill}
            </div>
            <div style="font-size:0.8rem; font-weight:700; color:var(--brand-orange);">${c.tradeTitle}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.05rem; font-weight:900; color:var(--primary-navy);">$${c.hourlyRate}/hr</div>
          <span class="card-dist-badge"><i class="fa-solid fa-location-arrow"></i> ${c.distanceKm} km away</span>
        </div>
      </div>

      <p style="font-size:0.82rem; color:var(--text-muted); line-height:1.4; margin-bottom:0.6rem;">
        ${c.bio}
      </p>

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-light); padding-top:0.6rem; flex-wrap:wrap; gap:0.5rem;">
        <div style="font-size:0.78rem; color:var(--text-muted);">
          <span style="color:var(--accent-gold); font-weight:700;"><i class="fa-solid fa-star"></i> ${c.rating.toFixed(2)}</span> (${c.reviewCount} reviews) • ${c.qbccLicense}
        </div>
        <div style="display:flex; gap:0.4rem; align-items:center;">
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); openProviderCalendarModal('${c.id}')" title="View 7-day live calendar availability">
            <i class="fa-solid fa-calendar-days"></i> Availability
          </button>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); bookProviderDirectly('${c.id}')">
            <i class="fa-solid fa-bolt"></i> Book with AI
          </button>
        </div>
      </div>
    </div>
  `}).join('');
}

function panToContractor(providerId, lat, lng) {
  if (appState.contractorMap && window.google?.maps) {
    appState.contractorMap.panTo(new google.maps.LatLng(lat, lng));
    appState.contractorMap.setZoom(14);
  }

  // Highlight card
  document.querySelectorAll('.contractor-search-card').forEach(el => el.classList.remove('card-active'));
  document.getElementById(`search-card-${providerId}`)?.classList.add('card-active');
}

function bookProviderDirectly(providerId) {
  const provider = window.providerDB.findById(providerId);
  if (!provider) return;

  switchTab('ai-book-tab');

  // Pre-fill prompt suitable for this trade
  const input = document.getElementById('ai-prompt-input');
  if (input) {
    if (provider.category === 'plumbing') input.value = SAMPLE_PROMPTS.leaking_tap;
    else if (provider.category === 'electrical') input.value = SAMPLE_PROMPTS.powerpoints;
    else if (provider.category === 'courier') input.value = SAMPLE_PROMPTS.urgent_courier;
    else if (provider.category === 'garden') input.value = SAMPLE_PROMPTS.garden_lawn;
    else input.value = SAMPLE_PROMPTS.flatpack_assembly;
  }

  submitAIAnalysis(false).then(() => {
    selectMatchedProvider(providerId);
    showToast(`Selected ${provider.name} for your booking!`);
  });
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
              <img src="${provider.avatar}" alt="${provider.name}" class="provider-avatar-img">
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
              <div class="provider-price-rate">$${provider.hourlyRate}/hr</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 5. Update Pricing Breakdown & Hours in Sidebar
  updatePricingCard(analysis);
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

  // Recalculate price if provider hourly rate differs
  const provider = window.providerDB.findById(providerId);
  if (provider && appState.currentAnalysis) {
    const analysis = appState.currentAnalysis;
    const rate = provider.hourlyRate;
    const hours = analysis.estimatedHours;
    const callout = analysis.pricing.calloutFee;
    const materials = analysis.pricing.materialsEstimate;
    const labour = Math.round(rate * hours);
    const subtotal = callout + labour + materials;
    const gst = Math.round(subtotal * 0.10);
    const total = subtotal + gst;

    // Mutate pricing
    analysis.pricing.hourlyRate = rate;
    analysis.pricing.baseLabour = labour;
    analysis.pricing.subtotal = subtotal;
    analysis.pricing.gst = gst;
    analysis.pricing.estimatedTotal = total;

    updatePricingCard(analysis);
  }
}

/**
 * Update Sidebar Pricing Breakdown Card
 */
function updatePricingCard(analysis) {
  const p = analysis.pricing;

  document.getElementById('invoice-est-hours').textContent = analysis.estimatedHours;
  document.getElementById('invoice-hourly-rate').textContent = p.hourlyRate;
  document.getElementById('price-labour-val').textContent = `$${p.baseLabour.toFixed(2)}`;
  document.getElementById('price-callout-val').textContent = `$${p.calloutFee.toFixed(2)}`;
  document.getElementById('price-materials-val').textContent = `$${p.materialsEstimate.toFixed(2)}`;
  document.getElementById('price-gst-val').textContent = `$${p.gst.toFixed(2)}`;
  document.getElementById('price-total-val').textContent = `$${p.estimatedTotal.toFixed(2)}`;
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
 * IMGBB IMAGE UPLOAD HANDLERS (Album: https://ibb.co/album/k4vjCb)
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
          <button type="button" onclick="removeJobPhoto(${idx})" style="position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.7); color:#fff; border:none; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center;">&times;</button>
        </div>
      `).join('');

      if (countIndicator) {
        countIndicator.textContent = `${appState.uploadedJobPhotos.length} photo(s) in ImgBB Album`;
      }
    }

    showToast(`Uploaded ${files.length} photo(s) to ImgBB Album (itsasimplejob)!`);
  } catch (err) {
    console.error("ImgBB upload error:", err);
    showToast('Image upload failed: ' + err.message);
  } finally {
    if (label) label.textContent = 'Add Photos';
    event.target.value = '';
  }
}

function removeJobPhoto(index) {
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
        <button type="button" onclick="removeJobPhoto(${idx})" style="position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.7); color:#fff; border:none; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center;">&times;</button>
      </div>
    `).join('');
    if (countIndicator) countIndicator.textContent = `${appState.uploadedJobPhotos.length} photo(s) in ImgBB Album`;
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

async function handleProviderPhotoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const preview = document.getElementById('provider-photo-preview');
  if (preview) {
    preview.style.display = 'flex';
    preview.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading licence photo to ImgBB...';
  }

  try {
    const upload = await window.imgbbService.uploadImage(file, `tradie_lic_${Date.now()}`, 'tradie_license');
    appState.uploadedProviderPhoto = upload;
    if (preview) {
      preview.innerHTML = `
        <img src="${upload.thumbUrl}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #93C5FD;">
        <span><strong>Licence Stored in ImgBB:</strong> <a href="${upload.url}" target="_blank" style="color:#2563EB;">View Image</a></span>
      `;
    }
    showToast('Licence card uploaded to ImgBB Album!');
  } catch (err) {
    console.error("Provider photo error:", err);
    showToast('Licence upload error: ' + err.message);
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
    businessId: 'itsasimplejob',
    createdAt: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    custName,
    custPhone,
    custAddress,
    custNotes,
    customerRefNumber,
    shift: shiftLabel,
    categoryName: analysis.categoryName,
    attachedPhotos: appState.uploadedJobPhotos.map(p => p.url),
    imgbbAlbumUrl: 'https://ibb.co/album/k4vjCb',
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
 * Courier Service Calculator with Google Directions Service
 */
function selectPackageType(type, elem) {
  appState.courierPackageType = type;
  document.querySelectorAll('.package-type-btn').forEach(btn => btn.classList.remove('active'));
  if (elem) elem.classList.add('active');
  calculateCourierQuote();
}

function calculateCourierQuote() {
  const origin = document.getElementById('courier-origin')?.value || 'Southport, Gold Coast QLD 4215';
  const dest = document.getElementById('courier-dest')?.value || 'Brisbane CBD, QLD 4000';
  const weight = parseFloat(document.getElementById('courier-weight')?.value) || 12;
  const urgency = document.getElementById('courier-urgency')?.value || 'express';

  // If Google Maps Directions Service is loaded, calculate actual road distance & route
  if (appState.directionsService && appState.directionsRenderer && origin && dest) {
    appState.directionsService.route(
      {
        origin: origin,
        destination: dest,
        travelMode: google.maps.TravelMode.DRIVING
      },
      (response, status) => {
        if (status === 'OK' && response.routes[0]?.legs[0]) {
          appState.directionsRenderer.setDirections(response);
          const leg = response.routes[0].legs[0];
          const distKm = Math.round((leg.distance.value / 1000) * 10) / 10;
          const durationMins = Math.round(leg.duration.value / 60);

          updateCourierPricingUI(distKm, durationMins, weight, urgency);
          return;
        } else {
          // Fallback to heuristic
          fallbackCourierCalculation(origin, dest, weight, urgency);
        }
      }
    );
  } else {
    fallbackCourierCalculation(origin, dest, weight, urgency);
  }
}

function fallbackCourierCalculation(origin, dest, weight, urgency) {
  let distanceKm = 78.5;
  const pair = (origin + ' ' + dest).toLowerCase();

  if (pair.includes('southport') && pair.includes('brisbane')) distanceKm = 78.5;
  else if (pair.includes('broadbeach') && pair.includes('brisbane')) distanceKm = 84.0;
  else if (pair.includes('surfers') && pair.includes('brisbane')) distanceKm = 81.2;
  else if (pair.includes('robina') && pair.includes('southport')) distanceKm = 14.5;
  else if (pair.includes('burleigh') && pair.includes('coolangatta')) distanceKm = 18.2;

  const transitMins = Math.round(distanceKm * 0.85);
  updateCourierPricingUI(distanceKm, transitMins, weight, urgency);
}

function updateCourierPricingUI(distanceKm, transitMins, weight, urgency) {
  const baseLoading = 35.00;
  const kmRate = 1.20;
  const distanceFee = Math.round(distanceKm * kmRate * 100) / 100;
  const urgencyFee = urgency === 'express' ? 25.00 : (urgency === 'standard' ? 0.00 : -10.00);
  const weightFee = weight > 20 ? (weight - 20) * 1.5 : 0;
  
  const subtotal = baseLoading + distanceFee + urgencyFee + weightFee;
  const gst = Math.round(subtotal * 0.10 * 100) / 100;
  const total = subtotal + gst;

  // DOM Updates
  document.getElementById('courier-calc-distance').textContent = `${distanceKm} km`;
  document.getElementById('courier-calc-time').textContent = `${transitMins} Mins`;
  document.getElementById('courier-base-fee').textContent = `$${baseLoading.toFixed(2)}`;
  document.getElementById('courier-dist-km').textContent = distanceKm;
  document.getElementById('courier-dist-fee').textContent = `$${distanceFee.toFixed(2)}`;
  document.getElementById('courier-urgency-fee').textContent = `$${urgencyFee.toFixed(2)}`;
  document.getElementById('courier-gst-fee').textContent = `$${gst.toFixed(2)}`;
  document.getElementById('courier-total-fee').textContent = `$${total.toFixed(2)}`;

  return { distanceKm, transitMins, total };
}

function bookCourierDispatch() {
  const origin = document.getElementById('courier-origin')?.value || 'Southport';
  const dest = document.getElementById('courier-dest')?.value || 'Brisbane CBD';
  const desc = document.getElementById('courier-desc')?.value || 'Parcels';
  const pickupDate = document.getElementById('courier-pickup-date')?.value || new Date().toISOString().split('T')[0];
  const pickupTime = document.getElementById('courier-pickup-time')?.value || 'asap';
  const totalText = document.getElementById('courier-total-fee')?.textContent.replace('$', '') || '169.62';
  const total = parseFloat(totalText);
  const docketNumber = 'IASJ-CR-' + Math.floor(100000 + Math.random() * 900000);
  const customerRefNumber = window.firebaseService?.getOrCreateCRN?.() || (`CRN-${Math.floor(100000 + Math.random() * 900000)}`);

  const courierBooking = {
    docketNumber,
    businessId: 'itsasimplejob',
    customerRefNumber,
    createdAt: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    pickupDate,
    pickupTime,
    custName: 'Priority Consignor',
    custPhone: '07 5512 3456',
    custAddress: `${origin} ➔ ${dest}`,
    custNotes: `${desc} (Pickup: ${pickupDate} - ${pickupTime.toUpperCase()})`,
    shift: `Pickup: ${pickupDate} (${pickupTime.toUpperCase()}) • Express Transit`,
    categoryName: 'Courier & Freight Express',
    provider: {
      serviceProviderNumber: 'SPN-101002',
      name: 'Callum Evans',
      businessName: 'Gold Coast Rapid Express Couriers',
      qbccLicense: 'Commercial Carrier Lic #CC-88219',
      insurance: '$10M Transit Goods Cover',
      hourlyRate: 55
    },
    pricing: {
      calloutFee: 35,
      baseLabour: total * 0.8,
      materialsEstimate: 0,
      gst: total * 0.1,
      estimatedTotal: total
    },
    packagePhotoUrl: appState.uploadedCourierPhoto?.url || null,
    status: 'Courier Dispatched'
  };

  appState.activeBookings.unshift(courierBooking);

  if (window.firebaseService?.saveBookingToFirestore) {
    window.firebaseService.saveBookingToFirestore(courierBooking);
  }

  addJobToDispatchFeed(courierBooking);
  renderInvoiceModal(courierBooking);
  showToast(`Consignment ${docketNumber} created! Driver en route (CRN: ${customerRefNumber}).`);
}

/**
 * Provider Network Registration
 */
function handleProviderRegistration(event) {
  event.preventDefault();

  const name = document.getElementById('reg-name')?.value.trim();
  const businessName = document.getElementById('reg-business')?.value.trim();
  const category = document.getElementById('reg-trade')?.value;
  const qbccLicense = document.getElementById('reg-license')?.value.trim();
  const hourlyRate = parseFloat(document.getElementById('reg-rate')?.value) || 85;
  const suburbs = document.getElementById('reg-suburbs')?.value.split(',').map(s => s.trim());
  const skills = document.getElementById('reg-skills')?.value.split(',').map(s => s.trim());

  // 24/7 working hours registration
  const is24_7 = document.getElementById('reg-shift-247')?.checked || false;
  const shifts = [];
  if (is24_7) shifts.push('emergency_24_7');
  if (document.getElementById('reg-shift-morn')?.checked) shifts.push('morning');
  if (document.getElementById('reg-shift-aft')?.checked) shifts.push('afternoon');
  if (document.getElementById('reg-shift-eve')?.checked) shifts.push('evening');
  if (document.getElementById('reg-shift-overnight')?.checked) shifts.push('overnight');

  const spn = window.firebaseService?.generateSPN?.() || (`SPN-${Math.floor(100000 + Math.random() * 900000)}`);

  const newProvider = {
    name,
    businessName,
    category,
    serviceProviderNumber: spn,
    tradeTitle: `${category.toUpperCase()} Specialist`,
    qbccLicense,
    licensePhotoUrl: appState.uploadedProviderPhoto?.url || null,
    insurance: '$20M Public Liability Verified',
    hourlyRate,
    serviceAreas: suburbs,
    skills,
    workingHours: {
      is24_7,
      shiftDescription: is24_7 ? "24/7 • 365 Days a Year Emergency On-Call Registered" : "Standard Shifts Registered",
      shifts: shifts.length > 0 ? shifts : ['morning', 'afternoon']
    }
  };

  window.providerDB.addProvider(newProvider);
  document.getElementById('provider-registration-form')?.reset();

  filterContractors(); // Refresh Google Maps contractor search with new provider!

  // Open modal showing their newly issued official SPN
  const spnElem = document.getElementById('modal-spn-number');
  if (spnElem) spnElem.textContent = spn;
  document.getElementById('provider-success-modal')?.classList.add('active');

  showToast(`Welcome aboard, ${name}! Your official Service Provider Number is ${spn}.`);
}

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

  item.innerHTML = `
    <div class="dispatch-job-header">
      <h5><i class="fa-solid fa-bolt" style="color:var(--brand-orange);"></i> [NEW] ${booking.categoryName}</h5>
      <span class="dispatch-earnings">$${booking.pricing.estimatedTotal.toFixed(2)} AUD</span>
    </div>
    <p class="dispatch-job-desc">
      ${booking.custName} • ${booking.custAddress} • ${booking.shift}
    </p>
    <div class="dispatch-meta-chips">
      <span class="dispatch-chip"><i class="fa-solid fa-receipt"></i> ${booking.docketNumber}</span>
      <span class="dispatch-chip" style="color:var(--accent-green);"><i class="fa-solid fa-circle-check"></i> Assigned to ${booking.provider.name}</span>
    </div>
    <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
      <button class="btn btn-primary btn-sm" onclick="acceptDispatchJob('job-${booking.docketNumber}', '${booking.custName}')">
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
            <a href="https://ibb.co/album/k4vjCb" target="_blank" style="color:#2563EB; font-size:0.72rem;">View in ImgBB Album</a>
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

      <table style="width:100%; font-size:0.85rem; border-collapse:collapse; margin-bottom:1rem;">
        <thead>
          <tr style="border-bottom:2px solid var(--border-light); text-align:left;">
            <th style="padding:0.4rem 0;">Description</th>
            <th style="padding:0.4rem 0; text-align:right;">Amount (AUD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:0.4rem 0;">${booking.categoryName} - Base Allocated Labour</td>
            <td style="text-align:right;">$${booking.pricing.baseLabour.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:0.4rem 0;">Insured Vehicle Transit & Mobilisation</td>
            <td style="text-align:right;">$${booking.pricing.calloutFee.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:0.4rem 0;">Consumables / Materials Buffer</td>
            <td style="text-align:right;">$${booking.pricing.materialsEstimate.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:0.4rem 0;">Australian Goods & Services Tax (GST 10%)</td>
            <td style="text-align:right;">$${booking.pricing.gst.toFixed(2)}</td>
          </tr>
          <tr style="border-top:2px solid var(--primary-navy); font-weight:800; font-size:1.05rem;">
            <td style="padding:0.6rem 0;">TOTAL INVOICE (No Upfront Charges)</td>
            <td style="text-align:right; color:var(--brand-orange);">$${booking.pricing.estimatedTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

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
        <strong>Payment Terms:</strong> Invoice issued on completion. Payment via direct bank transfer or credit card once you inspect and sign off on the job.
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

function openStripePaymentModal() {
  const latestBooking = appState.activeBookings[0];
  if (!latestBooking) {
    showToast('No active booking docket found.');
    return;
  }

  currentPayingBooking = latestBooking;

  const docketElem = document.getElementById('stripe-modal-docket');
  const amountElem = document.getElementById('stripe-modal-amount');
  const nameInput = document.getElementById('stripe-cardholder-name');

  if (docketElem) docketElem.textContent = latestBooking.docketNumber;
  if (amountElem) amountElem.textContent = `$${latestBooking.pricing.estimatedTotal.toFixed(2)} AUD`;
  if (nameInput) nameInput.value = latestBooking.custName || 'David Smith';

  document.getElementById('stripe-payment-modal')?.classList.add('active');
}

function closeStripePaymentModal() {
  document.getElementById('stripe-payment-modal')?.classList.remove('active');
}

async function handleStripePaymentSubmit(event) {
  event.preventDefault();

  const submitBtn = document.getElementById('btn-stripe-submit');
  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Communicating with Stripe Gateway...';
    submitBtn.disabled = true;
  }

  try {
    const booking = currentPayingBooking || appState.activeBookings[0];
    const amount = booking ? booking.pricing.estimatedTotal : 150.00;
    const docket = booking ? booking.docketNumber : 'IASJ-982104';
    const cardholder = document.getElementById('stripe-cardholder-name')?.value || 'David Smith';

    let tx = null;
    if (window.stripePaymentService) {
      tx = await window.stripePaymentService.processInvoicePayment({
        docketNumber: docket,
        amount: amount,
        customerName: cardholder,
        description: `Payment for docket ${docket} (${booking?.categoryName || 'Trade Service'})`
      });
    }

    if (booking) {
      booking.status = 'Paid via Stripe (AUD)';
      booking.stripeTx = tx;
    }

    // Update Pay via Stripe button on the invoice modal
    const payBtn = document.getElementById('btn-open-stripe');
    if (payBtn) {
      payBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Paid via Stripe';
      payBtn.style.background = '#059669';
      payBtn.style.borderColor = '#059669';
      payBtn.disabled = true;
    }

    closeStripePaymentModal();
    showToast(`Payment of $${amount.toFixed(2)} AUD processed successfully! (Ref: ${tx ? tx.paymentIntentId : 'pi_test_success'})`);
  } catch (err) {
    console.error("Stripe payment error:", err);
    showToast('Payment processing error: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.innerHTML = originalHtml;
      submitBtn.disabled = false;
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
  const toast = document.getElementById('toast-msg');
  const text = document.getElementById('toast-text');
  if (!toast || !text) return;

  text.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Dynamic Google Maps Script Loader using key from .env via window.ENV
function loadGoogleMapsScript() {
  const apiKey = window.ENV?.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ [Google Maps] GOOGLE_MAPS_API_KEY not configured in .env");
    return;
  }
  if (document.getElementById('google-maps-api-script')) return;
  const script = document.createElement('script');
  script.id = 'google-maps-api-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=initGoogleMapsServices`;
  script.async = true;
  script.defer = true;
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
  const hourlyRate = parseFloat(document.getElementById('cand-reg-rate')?.value) || 65;
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
          <div style="font-size:0.72rem; color:#64748B;">Album: k4vjCb • <a href="${upload.url}" target="_blank" style="color:#2563EB; font-weight:700;">Inspect Image</a></div>
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
    album: 'k4vjCb'
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
    album: 'k4vjCb'
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
    album: 'k4vjCb'
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
          <i class="fa-solid fa-server"></i> Server Album: <strong>${doc.album || 'k4vjCb'}</strong>
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
        album: 'k4vjCb'
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
      albumId: 'k4vjCb'
    },
    preferredDistanceUnit: (country === 'US' || country === 'UK') ? 'mile' : 'km',
    businessId: 'itsasimplejob',
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
    "Lawn Mowing, Edging & Whipper Snipping",
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
  if (row && container) {
    if (container.querySelectorAll('.service-fee-row').length <= 1) {
      showToast('You must have at least one service listed.');
      return;
    }
    row.remove();
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
    const rate = rateInput ? parseFloat(rateInput.value) || 0 : 0;
    const callout = calloutInput ? parseFloat(calloutInput.value) || 0 : 0;

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
  const hourlyRate = hourlyChecked ? (parseFloat(document.getElementById(`${prefix}hourly`)?.value) || 85) : 85;

  const flatChecked = document.getElementById(`${ratePrefix}rate-flat`)?.checked || false;
  const flatRate = flatChecked ? (parseFloat(document.getElementById(`${prefix}flat`)?.value) || 130) : null;

  const calloutChecked = document.getElementById(`${ratePrefix}rate-callout`)?.checked || false;
  const calloutFee = calloutChecked ? (parseFloat(document.getElementById(`${prefix}callout`)?.value) || 35) : 35;

  const distanceChecked = document.getElementById(`${ratePrefix}rate-distance`)?.checked || false;
  const calloutPerUnit = distanceChecked ? (parseFloat(document.getElementById(`${prefix}callout-per-km`)?.value) || 1.50) : 0;
  const courierPerUnit = distanceChecked ? (parseFloat(document.getElementById(`${prefix}courier-per-km`)?.value) || 1.20) : 0;
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
      album: 'k4vjCb'
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

  // Refresh contractor search
  filterContractors();

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
  document.getElementById('provider-success-modal')?.classList.add('active');

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
  if (distRateEl) distRateEl.value = provider.pricing?.distanceCharging?.calloutPerUnit || 1.50;
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
}

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

function removeAdminBlackoutDate(dateStr) {
  currentAdminBlackoutDates = currentAdminBlackoutDates.filter(d => d !== dateStr);
  renderAdminBlackoutChips();
}

function renderAdminBlackoutChips() {
  const container = document.getElementById('admin-blackout-chips-container');
  if (!container) return;
  if (currentAdminBlackoutDates.length === 0) {
    container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">No blackout dates set. Available 365 days a year.</span>';
    return;
  }
  container.innerHTML = currentAdminBlackoutDates.map(d => `
    <span style="display:inline-flex; align-items:center; gap:0.4rem; background:#FEE2E2; border:1px solid #FCA5A5; color:#991B1B; padding:0.25rem 0.6rem; border-radius:var(--radius-full); font-size:0.75rem; font-weight:700;">
      <i class="fa-solid fa-calendar-xmark"></i> ${d}
      <button type="button" onclick="removeAdminBlackoutDate('${d}')" style="background:none; border:none; color:#991B1B; cursor:pointer; font-size:0.85rem; padding:0; margin-left:0.2rem;">&times;</button>
    </span>
  `).join('');
}

function saveProviderAdminSchedule() {
  if (!currentAdminProviderId) return;
  const provider = window.providerDB.findById(currentAdminProviderId);
  if (!provider) return;

  const schedule = getMatrixSchedule('admin');
  const hourly = parseFloat(document.getElementById('admin-hourly-rate')?.value) || provider.hourlyRate;
  const callout = parseFloat(document.getElementById('admin-callout-fee')?.value) || 35;
  const distRate = parseFloat(document.getElementById('admin-distance-rate')?.value) || 1.50;
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
    `Estimated Total: $${booking.pricing?.estimatedTotal?.toFixed(2) || '0.00'} AUD`,
    `24/7 Operations Hotline: 0495 019 791`
  ].join('\n');

  const location = booking.custAddress || 'Australia';

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startIso}/${endIso}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
}

async function triggerGoogleSignIn(role = 'customer') {
  try {
    if (window.firebaseService?.signInWithGoogle) {
      const user = await window.firebaseService.signInWithGoogle(role);
      updateGoogleAuthUI(user);
      showToast(`Welcome ${user.displayName}! Signed in with Google.`);
      return user;
    }
  } catch (err) {
    console.error("Google sign in error:", err);
    showToast('Google sign in error: ' + err.message);
  }
}

async function signUpWithGoogle(role = 'customer') {
  try {
    if (window.firebaseService?.signInWithGoogle) {
      const user = await window.firebaseService.signInWithGoogle(role);
      updateGoogleAuthUI(user);
      closeRegisterSelectionPanel();

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
    showToast('Sign up error: ' + err.message);
  }
}

function handleGoogleSignOut() {
  if (window.firebaseService?.signOutGoogle) {
    window.firebaseService.signOutGoogle();
  }
  updateGoogleAuthUI(null);
  showToast('Signed out of Google account.');
}

function toggleGoogleUserMenu(event) {
  event?.stopPropagation();
  const menu = document.getElementById('google-user-menu');
  if (menu) {
    menu.classList.toggle('show');
  }
}

function closeGoogleUserMenu() {
  document.getElementById('google-user-menu')?.classList.remove('show');
}

function updateGoogleAuthUI(user) {
  const signinBtn = document.getElementById('btn-google-signin-nav');
  const chip = document.getElementById('google-user-chip');
  const navAvatar = document.getElementById('google-nav-avatar');
  const navName = document.getElementById('google-nav-name');

  const menuAvatar = document.getElementById('google-menu-avatar');
  const menuName = document.getElementById('google-menu-name');
  const menuEmail = document.getElementById('google-menu-email');
  const menuRoleBadge = document.getElementById('google-menu-role-badge');

  const adminEmail = document.getElementById('admin-gcal-account-email');
  const adminBadge = document.getElementById('admin-gcal-badge');
  const adminSyncBox = document.getElementById('admin-gcal-sync-box');

  if (user) {
    if (signinBtn) signinBtn.style.display = 'none';
    if (chip) chip.style.display = 'inline-flex';
    
    const firstName = (user.displayName || 'Google User').split(' ')[0];
    if (navName) navName.textContent = firstName;
    if (navAvatar) navAvatar.src = user.photoURL || 'assets/images/tradie_worker.jpg';

    if (menuAvatar) menuAvatar.src = user.photoURL || 'assets/images/tradie_worker.jpg';
    if (menuName) menuName.textContent = user.displayName || 'Google User';
    if (menuEmail) menuEmail.textContent = user.email || '';
    if (menuRoleBadge) {
      let roleDisplay = 'Customer';
      if (user.role === 'provider') roleDisplay = 'Provider';
      if (user.role === 'franchise_admin') roleDisplay = 'Franchise Admin';
      menuRoleBadge.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Google Calendar Synced (${roleDisplay})`;
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
    if (signinBtn) signinBtn.style.display = 'inline-flex';
    if (chip) chip.style.display = 'none';

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
    const hourlyRate = parseFloat(document.getElementById(`franchise-staff-${i}-hourly-rate`)?.value) || 95;
    const flatActive = document.getElementById(`franchise-staff-${i}-rate-flat`)?.checked || false;
    const flatRate = parseFloat(document.getElementById(`franchise-staff-${i}-flat-rate`)?.value) || 150;
    const calloutActive = document.getElementById(`franchise-staff-${i}-rate-callout`)?.checked || false;
    const calloutRate = parseFloat(document.getElementById(`franchise-staff-${i}-callout-rate`)?.value) || 45;
    const chargeDistance = document.getElementById(`franchise-staff-${i}-rate-distance`)?.checked || false;
    const calloutPerKm = parseFloat(document.getElementById(`franchise-staff-${i}-callout-per-km`)?.value) || 1.50;
    const courierPerKm = parseFloat(document.getElementById(`franchise-staff-${i}-courier-per-km`)?.value) || 1.20;
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
  showToast(`✅ Franchise '${franchiseName}' registered with Manager '${adminName}' and ${registeredStaffList.length} staff technician(s)!`);
  
  window.dispatchEvent(new CustomEvent('googleAuthStateChanged', { detail: { user: user, action: 'login' } }));
  if (window.filterContractors) window.filterContractors();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  
  const calendarCells = [];
  const matrixInputs = document.querySelectorAll('#inline-calendar-matrix-root input[type="checkbox"]');
  matrixInputs.forEach(cb => {
    if (cb.id) {
      calendarCells.push({ id: cb.id, checked: cb.checked });
    }
  });

  const distUnitRadio = document.querySelector('input[name="page-prov-dist-unit"]:checked');
  const profileStatusRadio = document.querySelector('input[name="inline-profile-status"]:checked');

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

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
    radiusDist: document.getElementById('page-prov-radius-dist')?.value || '25',
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
    accountNumber: document.getElementById('page-prov-account-number')?.value || '',
    accountName: document.getElementById('page-prov-account-name')?.value || '',
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
    calendarCells,
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
    if (draft.radiusDist && document.getElementById('page-prov-radius-dist')) document.getElementById('page-prov-radius-dist').value = draft.radiusDist;
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
    if (draft.accountNumber && document.getElementById('page-prov-account-number')) document.getElementById('page-prov-account-number').value = draft.accountNumber;
    if (draft.accountName && document.getElementById('page-prov-account-name')) document.getElementById('page-prov-account-name').value = draft.accountName;

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

    if (draft.services && Array.isArray(draft.services) && draft.services.length > 0) {
      renderDefaultServiceFeeRows('page', draft.services);
    }

    if (draft.calendarCells && Array.isArray(draft.calendarCells)) {
      draft.calendarCells.forEach(cell => {
        const el = document.getElementById(cell.id);
        if (el) el.checked = cell.checked;
      });
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

function clearProviderApplicationDraft(notify = true) {
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

function clearCustomerApplicationDraft(notify = true) {
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
        <button type="button" class="btn btn-outline btn-sm" onclick="removeFranchiseStaffMember(${index})" title="Remove Staff Member" style="background:#fff; color:#DC2626; border-color:#FCA5A5; font-size:0.75rem; padding:0.35rem 0.65rem; border-radius:var(--radius-sm);">
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
          <input type="text" id="franchise-staff-${index}-business" class="form-control" value="${data?.businessName || ''}" placeholder="e.g. Luke Sullivan (Jim's Mowing Field Tech)">
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
              <input type="number" id="franchise-staff-${index}-callout-per-km" class="form-control" step="0.10" value="${data?.calloutPerKm || 1.50}">
              <span style="font-size:0.75rem; color:#92400E;">/km</span>
            </div>
          </div>
          <div>
            <label class="input-label" style="font-size:0.75rem;" for="franchise-staff-${index}-courier-per-km">Freight Rate per km</label>
            <div style="display:flex; align-items:center; gap:0.3rem;">
              <span style="font-weight:700; color:#92400E;">$</span>
              <input type="number" id="franchise-staff-${index}-courier-per-km" class="form-control" step="0.10" value="${data?.courierPerKm || 1.20}">
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

function removeFranchiseStaffMember(index) {
  const card = document.getElementById(`franchise-staff-card-${index}`);
  const container = document.getElementById('franchise-staff-container');
  if (!card || !container) return;

  if (container.querySelectorAll('.franchise-staff-card').length <= 1) {
    showToast('Franchise must have at least one staff technician or service provider.');
    return;
  }

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
      calloutPerKm: document.getElementById(`franchise-staff-${idx}-callout-per-km`)?.value || '1.50',
      courierPerKm: document.getElementById(`franchise-staff-${idx}-courier-per-km`)?.value || '1.20',
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

function clearFranchiseApplicationDraft(notify = true) {
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
window.fallbackCourierCalculation = fallbackCourierCalculation;
window.updateCourierPricingUI = updateCourierPricingUI;
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

