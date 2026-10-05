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
  selectedShift: 'morning', // 'morning' (9am-12pm) or 'afternoon' (2pm-5pm)
  courierPackageType: 'documents',
  activeBookings: [],
  isListening: false,
  recognition: null,
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
  calculateCourierQuote();

  // Run an initial analysis with a realistic prompt so the interface is immediately engaging
  const promptInput = document.getElementById('ai-prompt-input');
  if (promptInput) {
    promptInput.value = SAMPLE_PROMPTS.leaking_tap;
    submitAIAnalysis(false); // subtle initial run without notification toast
  }
});

/**
 * Tab Navigation Controller
 */
function switchTab(tabId) {
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
    // Resize Google Map when shown
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
    // Resize Courier Route Map
    setTimeout(() => {
      if (appState.courierRouteMap && window.google?.maps) {
        google.maps.event.trigger(appState.courierRouteMap, 'resize');
      }
    }, 150);
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
  window.scrollTo({ top: 400, behavior: 'smooth' });
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

  container.innerHTML = contractors.map(c => `
    <div class="contractor-search-card" id="search-card-${c.id}" onclick="panToContractor('${c.id}', ${c.lat}, ${c.lng})">
      <div class="card-top-row">
        <div class="card-tradie-profile">
          <img src="${c.avatar}" alt="${c.name}" class="card-avatar-sm">
          <div>
            <h5 style="font-size:1rem; font-weight:800; color:var(--primary-navy); margin-bottom:0.1rem;">
              ${c.name} <i class="fa-solid fa-circle-check verified-badge" title="Verified Licence"></i>
            </h5>
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

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-light); padding-top:0.6rem;">
        <div style="font-size:0.78rem; color:var(--text-muted);">
          <span style="color:var(--accent-gold); font-weight:700;"><i class="fa-solid fa-star"></i> ${c.rating.toFixed(2)}</span> (${c.reviewCount} reviews) • ${c.qbccLicense}
        </div>
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); bookProviderDirectly('${c.id}')">
          <i class="fa-solid fa-bolt"></i> Book with AI
        </button>
      </div>
    </div>
  `).join('');
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
 * Shift Selector
 */
function selectShift(shiftType) {
  appState.selectedShift = shiftType;
  document.getElementById('slot-morning')?.classList.toggle('active', shiftType === 'morning');
  document.getElementById('slot-afternoon')?.classList.toggle('active', shiftType === 'afternoon');
}

/**
 * Confirm Booking & Generate Tax Invoice
 */
function confirmBooking() {
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

  const shiftLabel = appState.selectedShift === 'morning' ? 'Morning Shift (9:00 AM – 12:00 PM)' : 'Afternoon Shift (2:00 PM – 5:00 PM)';
  const docketNumber = 'IASJ-' + Math.floor(100000 + Math.random() * 900000);

  const booking = {
    docketNumber,
    createdAt: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    custName,
    custPhone,
    custAddress,
    custNotes,
    shift: shiftLabel,
    categoryName: analysis.categoryName,
    provider,
    pricing: analysis.pricing,
    status: 'Confirmed & Dispatched'
  };

  appState.activeBookings.unshift(booking);

  // Add job to the Provider Live Dispatch Dashboard
  addJobToDispatchFeed(booking);

  // Render & Open Modal
  renderInvoiceModal(booking);
  showToast(`Booking ${docketNumber} confirmed! Tradie notified via SMS.`);
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
  const totalText = document.getElementById('courier-total-fee')?.textContent.replace('$', '') || '169.62';
  const total = parseFloat(totalText);
  const docketNumber = 'IASJ-CR-' + Math.floor(100000 + Math.random() * 900000);

  const courierBooking = {
    docketNumber,
    createdAt: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    custName: 'Priority Consignor',
    custPhone: '07 5512 3456',
    custAddress: `${origin} ➔ ${dest}`,
    custNotes: desc,
    shift: 'Urgent Same-Day Express Transit',
    categoryName: 'Courier & Freight Express',
    provider: {
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
    status: 'Courier Dispatched'
  };

  appState.activeBookings.unshift(courierBooking);
  addJobToDispatchFeed(courierBooking);
  renderInvoiceModal(courierBooking);
  showToast(`Consignment ${docketNumber} created! Driver en route.`);
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

  const newProvider = {
    name,
    businessName,
    category,
    tradeTitle: `${category.toUpperCase()} Specialist`,
    qbccLicense,
    insurance: '$20M Public Liability Verified',
    hourlyRate,
    serviceAreas: suburbs,
    skills,
    availability: ['morning', 'afternoon']
  };

  window.providerDB.addProvider(newProvider);
  document.getElementById('provider-registration-form')?.reset();

  filterContractors(); // Refresh Google Maps contractor search with new provider!
  showToast(`Welcome aboard, ${name}! Your profile is now live in Google Maps & AI matching.`);
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

  container.innerHTML = `
    <div class="invoice-preview-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem;">
        <div>
          <h3 style="font-size:1.3rem; font-weight:900; color:var(--primary-navy);">It's A Simple Job</h3>
          <p style="font-size:0.78rem; color:var(--text-muted);">
            Australia's 1st Labour & Courier Service Powered by AI<br>
            ABN: 84 928 104 291 • Phone: 1300 SIMPLE
          </p>
        </div>
        <div style="text-align:right;">
          <span class="badge-pill-pill" style="background:var(--primary-navy);">${booking.docketNumber}</span>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">Date: ${booking.createdAt}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.25rem; font-size:0.85rem; border-top:1px solid var(--border-light); border-bottom:1px solid var(--border-light); padding:0.75rem 0;">
        <div>
          <strong>CUSTOMER DETAILS:</strong><br>
          ${booking.custName}<br>
          ${booking.custAddress}<br>
          Mobile: ${booking.custPhone}
        </div>
        <div>
          <strong>MATCHED TRADIE / PROVIDER:</strong><br>
          <strong>${booking.provider.name}</strong><br>
          ${booking.provider.businessName}<br>
          ${booking.provider.qbccLicense}
        </div>
      </div>

      <div style="margin-bottom:1rem;">
        <strong>SCHEDULED SERVICE WINDOW:</strong>
        <div style="font-size:0.95rem; font-weight:700; color:var(--brand-orange); margin-top:0.2rem;">
          <i class="fa-regular fa-clock"></i> ${booking.shift}
        </div>
      </div>

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
 * Franchise Modal
 */
function openFranchiseModal(territory = 'Gold Coast Central') {
  const modal = document.getElementById('franchise-modal');
  const terrInput = document.getElementById('fran-territory');
  if (terrInput) terrInput.value = territory;
  if (modal) modal.classList.add('active');
}

function closeFranchiseModal() {
  document.getElementById('franchise-modal')?.classList.remove('active');
}

function handleFranchiseSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('fran-name')?.value;
  const territory = document.getElementById('fran-territory')?.value;
  closeFranchiseModal();
  showToast(`Thank you, ${name}! Your franchise prospectus for ${territory} has been queued.`);
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

// Make initGoogleMapsServices accessible globally for JSONP callback
window.initGoogleMapsServices = initGoogleMapsServices;
