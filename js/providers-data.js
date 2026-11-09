/**
 * It's A Simple Job - Verified Courier Driver & Order Network Data
 * Dedicated Courier-Only Platform (AUD Only)
 *
 * Drivers register with:
 *  - Licence details (Number, State, Class, Expiry)
 *  - Address, Phone, Email, PayID (Phone / Email / ABN)
 *  - Per-km rate ($ AUD/km)
 *  - Urgent fee ($ AUD) & Same-day fee ($ AUD)
 *  - Max pickup weight (kg) & Max package dimensions: Height, Width, Length (cm)
 *  - Live Auto-Geolocated coordinates (lat, lng) to rank closest to the job pickup
 *  - Driver Token Balance (charged per customer order by SuperAdmin distance tiers: 0-20km, 21-50km, 51-100km, 101+km)
 */

function getDefaultCalendarSchedule(is24_7 = true) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const schedule = {};
  days.forEach(d => {
    schedule[d] = {
      urgent_247: is24_7,
      morning: true,
      afternoon: true,
      evening: is24_7,
      overnight: is24_7
    };
  });
  return schedule;
}

const INITIAL_PROVIDERS = [
  {
    id: "drv-101",
    serviceProviderNumber: "DRV-101001",
    businessId: "its-a-simple-job",
    name: "Callum Evans",
    gender: "male",
    businessName: "Gold Coast Rapid Van Couriers",
    category: "courier",
    tradeTitle: "Express Van Courier Driver",
    avatar: "assets/images/courier_worker.jpg",
    rating: 4.98,
    reviewCount: 320,
    licenceNumber: "482910384",
    licenceState: "QLD",
    licenceClass: "C (Car / LWB Van)",
    licenceExpiry: "2029-11-30",
    qbccLicense: "QLD Driver Lic #482910384 (Class C)",
    insurance: "$10M Transit Goods & Liability",
    policeChecked: true,
    address: "14 Nerang Street, Southport QLD 4215",
    baseSuburb: "Southport QLD",
    phone: "0412 889 341",
    email: "callum.evans@gccouriers.com.au",
    payIdType: "phone",
    payIdValue: "0412 889 341",
    payIdAccountName: "Callum Evans Courier Services",
    hasVehicleCourier: true,
    hasBicycleCourier: false,
    vehiclePerKmRateAud: 2.20,
    vehicleSameDayFeeAud: 18,
    vehicleUrgentFeeAud: 35,
    vehicleMaxWeightKg: 800,
    vehicleMaxHeightCm: 160,
    vehicleMaxWidthCm: 140,
    vehicleMaxLengthCm: 280,
    bicyclePerKmRateAud: 1.80,
    bicycleSameDayFeeAud: 0,
    bicycleUrgentFeeAud: 0,
    bicycleMaxWeightKg: 8,
    bicycleMaxHeightCm: 35,
    bicycleMaxWidthCm: 30,
    bicycleMaxLengthCm: 40,
    perKmRateAud: 2.20,
    sameDayFeeAud: 18,
    urgentFeeAud: 35,
    hourlyRate: 55,
    maxWeightKg: 800,
    maxHeightCm: 160,
    maxWidthCm: 140,
    maxLengthCm: 280,
    tokenBalance: 45,
    lat: -27.9678,
    lng: 153.4011,
    lastGeolocatedAt: "2026-11-08T09:00:00Z",
    autoGeolocateEnabled: true,
    serviceAreas: ["Southport", "Gold Coast", "Brisbane Metro", "Surfers Paradise", "Broadbeach", "Robina"],
    postcodes: ["4215", "4217", "4218", "4226", "4000"],
    skills: ["courier", "parcel delivery", "urgent same day", "medical items", "pallet express", "bulky pickup"],
    vehicle: "Toyota HiAce LWB High Roof Van",
    experienceYears: 9,
    workingHours: {
      is24_7: true,
      shiftDescription: "Pickup Window: 9:00 AM – 4:00 PM Daily (Same-Day & Urgent Dispatch)",
      shifts: ["morning", "afternoon"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Punctual Southport-based courier with LWB high-roof HiAce van. Direct PayID settlement. Available for standard, same-day, and urgent runs.",
    completedJobs: 980,
    badge: "Verified Van Driver"
  },
  {
    id: "drv-102",
    serviceProviderNumber: "DRV-101002",
    businessId: "its-a-simple-job",
    name: "Sarah Jenkins",
    gender: "female",
    businessName: "Broadbeach City Parcel & Document Runner",
    category: "courier",
    tradeTitle: "Fast City Sedan & Parcel Courier",
    avatar: "assets/images/courier_worker.jpg",
    rating: 4.96,
    reviewCount: 215,
    licenceNumber: "591028471",
    licenceState: "QLD",
    licenceClass: "C (Standard Vehicle)",
    licenceExpiry: "2030-04-18",
    qbccLicense: "QLD Driver Lic #591028471 (Class C)",
    insurance: "$5M Commercial Courier Cover",
    policeChecked: true,
    address: "42 Surf Parade, Broadbeach QLD 4218",
    baseSuburb: "Broadbeach QLD",
    phone: "0423 551 902",
    email: "sarah@broadbeachrunner.com.au",
    payIdType: "email",
    payIdValue: "sarah@broadbeachrunner.com.au",
    payIdAccountName: "Sarah Jenkins Express",
    perKmRateAud: 2.10,
    sameDayFeeAud: 12,
    urgentFeeAud: 25,
    vehiclePerKmRateAud: 2.10,
    vehicleSameDayFeeAud: 12,
    vehicleUrgentFeeAud: 25,
    vehicleMaxWeightKg: 35,
    vehicleMaxHeightCm: 65,
    vehicleMaxWidthCm: 80,
    vehicleMaxLengthCm: 110,
    hasVehicleCourier: true,
    hasBicycleCourier: true,
    bicyclePerKmRateAud: 1.60,
    bicycleSameDayFeeAud: 8,
    bicycleUrgentFeeAud: 18,
    bicycleMaxWeightKg: 8,
    bicycleMaxHeightCm: 35,
    bicycleMaxWidthCm: 30,
    bicycleMaxLengthCm: 40,
    hourlyRate: 48,
    maxWeightKg: 35,
    maxHeightCm: 65,
    maxWidthCm: 80,
    maxLengthCm: 110,
    tokenBalance: 60,
    lat: -28.0280,
    lng: 153.4312,
    lastGeolocatedAt: "2026-11-08T09:10:00Z",
    autoGeolocateEnabled: true,
    serviceAreas: ["Broadbeach", "Surfers Paradise", "Burleigh Heads", "Southport", "Robina", "Brisbane"],
    postcodes: ["4218", "4217", "4220", "4215", "4226"],
    skills: ["documents", "small parcels", "medical samples", "electronics", "same day courier"],
    vehicle: "Toyota Corolla Hybrid Station Wagon",
    experienceYears: 6,
    workingHours: {
      is24_7: true,
      shiftDescription: "Pickup Window: 9:00 AM – 4:00 PM Daily",
      shifts: ["morning", "afternoon"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    },
    bio: "Low per-km rate for documents, medical parcels, retail boxes, and electronics up to 35kg.",
    completedJobs: 640,
    badge: "Fast Parcel Runner"
  },
  {
    id: "drv-103",
    serviceProviderNumber: "DRV-101003",
    businessId: "its-a-simple-job",
    name: "Marcus 'Macca' Taylor",
    gender: "male",
    businessName: "Robina Heavy Ute & Trade Freight",
    category: "courier",
    tradeTitle: "Heavy Ute & Bulky Item Courier",
    avatar: "assets/images/tradie_worker.jpg",
    rating: 4.94,
    reviewCount: 184,
    licenceNumber: "310492817",
    licenceState: "QLD",
    licenceClass: "LR (Light Rigid & Ute)",
    licenceExpiry: "2028-09-22",
    qbccLicense: "QLD Driver Lic #310492817 (Class LR)",
    insurance: "$10M Goods in Transit",
    policeChecked: true,
    address: "19 Cheltenham Drive, Robina QLD 4226",
    baseSuburb: "Robina QLD",
    phone: "0438 772 619",
    email: "macca@robinaheavyfreight.com.au",
    payIdType: "phone",
    payIdValue: "0438 772 619",
    payIdAccountName: "Marcus Taylor Freight",
    perKmRateAud: 2.50,
    sameDayFeeAud: 20,
    urgentFeeAud: 40,
    hourlyRate: 65,
    maxWeightKg: 1000,
    maxHeightCm: 180,
    maxWidthCm: 180,
    maxLengthCm: 240,
    tokenBalance: 35,
    lat: -28.0772,
    lng: 153.3853,
    lastGeolocatedAt: "2026-11-08T09:05:00Z",
    autoGeolocateEnabled: true,
    serviceAreas: ["Robina", "Varsity Lakes", "Burleigh Heads", "Nerang", "Gold Coast", "Brisbane"],
    postcodes: ["4226", "4227", "4220", "4211"],
    skills: ["heavy items", "appliances", "furniture courier", "pallet", "hardware pickup"],
    vehicle: "Ford Ranger Aluminium Tray Ute + Tie-Downs (1 Tonne)",
    experienceYears: 11,
    workingHours: {
      is24_7: true,
      shiftDescription: "Pickup Window: 9:00 AM – 4:00 PM Daily",
      shifts: ["morning", "afternoon"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Heavy-duty tray ute with ramps and tie-down straps. Ideal for bulky boxes and heavy freight up to 1,000kg.",
    completedJobs: 520,
    badge: "Heavy Ute Courier"
  },
  {
    id: "drv-104",
    serviceProviderNumber: "DRV-101004",
    businessId: "its-a-simple-job",
    name: "Liam O'Connor",
    gender: "male",
    businessName: "M1 Corridor Sprinter Freight (GC to Brisbane)",
    category: "courier",
    tradeTitle: "Long-Wheelbase Sprinter Courier",
    avatar: "assets/images/courier_worker.jpg",
    rating: 4.97,
    reviewCount: 276,
    licenceNumber: "774829104",
    licenceState: "QLD",
    licenceClass: "MR (Medium Rigid)",
    licenceExpiry: "2029-12-01",
    qbccLicense: "QLD Driver Lic #774829104 (Class MR)",
    insurance: "$20M Commercial Freight Insurance",
    policeChecked: true,
    address: "55 Siganto Drive, Helensvale QLD 4212",
    baseSuburb: "Helensvale QLD",
    phone: "0409 334 812",
    email: "liam@m1sprinter.com.au",
    payIdType: "abn",
    payIdValue: "51824753556",
    payIdAccountName: "M1 Corridor Sprinter Pty Ltd",
    perKmRateAud: 2.80,
    sameDayFeeAud: 25,
    urgentFeeAud: 50,
    hourlyRate: 70,
    maxWeightKg: 1500,
    maxHeightCm: 195,
    maxWidthCm: 175,
    maxLengthCm: 360,
    tokenBalance: 80,
    lat: -27.9189,
    lng: 153.3275,
    lastGeolocatedAt: "2026-11-08T09:12:00Z",
    autoGeolocateEnabled: true,
    serviceAreas: ["Helensvale", "Coomera", "Southport", "Logan", "Brisbane CBD", "Ipswich"],
    postcodes: ["4212", "4209", "4215", "4114", "4000"],
    skills: ["long distance", "brisbane express", "commercial boxes", "pallets", "fragile freight"],
    vehicle: "Mercedes-Benz Sprinter LWB High Roof (1.5 Tonne)",
    experienceYears: 14,
    workingHours: {
      is24_7: true,
      shiftDescription: "Pickup Window: 9:00 AM – 4:00 PM Daily",
      shifts: ["morning", "afternoon"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    },
    bio: "Daily M1 runs connecting northern Gold Coast, Southport, and Brisbane CBD. Extra-long 3.6m cargo bay.",
    completedJobs: 890,
    badge: "LWB Sprinter Pro"
  },
  {
    id: "drv-105",
    serviceProviderNumber: "DRV-101005",
    businessId: "its-a-simple-job",
    name: "Tanya Nguyen",
    gender: "female",
    businessName: "Surfers & Central Coast Direct Courier",
    category: "courier",
    tradeTitle: "Compact Van & Retail Delivery Driver",
    avatar: "assets/images/courier_worker.jpg",
    rating: 4.95,
    reviewCount: 159,
    licenceNumber: "663920185",
    licenceState: "QLD",
    licenceClass: "C (Car / Compact Van)",
    licenceExpiry: "2030-06-30",
    qbccLicense: "QLD Driver Lic #663920185 (Class C)",
    insurance: "$5M Transit Liability",
    policeChecked: true,
    address: "8 Cavill Avenue, Surfers Paradise QLD 4217",
    baseSuburb: "Surfers Paradise QLD",
    phone: "0415 902 447",
    email: "tanya@surfersdirect.com.au",
    payIdType: "phone",
    payIdValue: "0415 902 447",
    payIdAccountName: "Tanya Nguyen Couriers",
    perKmRateAud: 2.00,
    sameDayFeeAud: 15,
    urgentFeeAud: 30,
    hourlyRate: 50,
    maxWeightKg: 450,
    maxHeightCm: 125,
    maxWidthCm: 120,
    maxLengthCm: 180,
    tokenBalance: 40,
    lat: -28.0023,
    lng: 153.4295,
    lastGeolocatedAt: "2026-11-08T09:15:00Z",
    autoGeolocateEnabled: true,
    serviceAreas: ["Surfers Paradise", "Main Beach", "Southport", "Broadbeach", "Bundall"],
    postcodes: ["4217", "4215", "4218"],
    skills: ["retail packages", "luggage", "boxes", "office supplies", "urgent pickup"],
    vehicle: "Volkswagen Caddy Maxi Cargo Van",
    experienceYears: 5,
    workingHours: {
      is24_7: true,
      shiftDescription: "Pickup Window: 9:00 AM – 4:00 PM Daily",
      shifts: ["morning", "afternoon"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Fast underground carpark access across Surfers Paradise and Broadbeach high-rises. Capacity up to 450kg.",
    completedJobs: 430,
    badge: "High-Rise Access Van"
  }
];

const INITIAL_ORDERS = [
  {
    orderId: "ORD-901204",
    createdAt: "2026-11-08T08:45:00Z",
    driverId: "drv-101",
    driverSpn: "DRV-101001",
    driverName: "Callum Evans",
    driverPhone: "0412 889 341",
    driverEmail: "callum.evans@gccouriers.com.au",
    driverVehicle: "Toyota HiAce LWB High Roof Van",
    driverPayIdType: "phone",
    driverPayIdValue: "0412 889 341",
    driverPayIdName: "Callum Evans Courier Services",
    driverPayIdAccountName: "Callum Evans Courier Services",
    pickupDate: "2026-11-08",
    pickupTime: "10:30 AM",
    customerName: "Jack Thompson",
    customerPhone: "0412 889 123",
    customerEmail: "jack.thompson@example.com.au",
    customerAddress: "10 Smith Street, Southport QLD 4215",
    originAddress: "10 Smith Street, Southport QLD 4215",
    pickupAddress: "10 Smith Street, Southport QLD 4215",
    destAddress: "42 Surf Parade, Broadbeach QLD 4218",
    deliveryAddress: "42 Surf Parade, Broadbeach QLD 4218",
    distanceKm: 8.5,
    durationMins: 16,
    packageContents: "2 sealed boxes of medical diagnostic parts (fragile)",
    packageContent: "2 sealed boxes of medical diagnostic parts (fragile)",
    weightKg: 14,
    packageWeightKg: 14,
    heightCm: 45,
    packageHeightCm: 45,
    widthCm: 40,
    packageWidthCm: 40,
    lengthCm: 60,
    packageLengthCm: 60,
    speedTier: "same_day",
    perKmRateAud: 2.20,
    distanceChargeAud: 18.70,
    sameDayFeeAud: 18.00,
    urgentFeeAud: 0,
    totalAud: 36.70,
    tokensCharged: 2,
    tokensChargedToDriver: 2,
    distanceTierLabel: "0–20 km",
    tokenTierLabel: "0–20 km",
    paymentMethod: "Direct Driver PayID (AUD)",
    status: "Awaiting Customer PayID"
  }
];

class ProviderDatabase {
  constructor() {
    this.storageKey = "simplejob_courier_drivers_v5";
    this.providers = this.loadProviders();
  }

  loadProviders() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(p => this.normalizeDriver(p));
        }
      }
    } catch (e) {
      console.warn("Could not read drivers local storage", e);
    }
    return INITIAL_PROVIDERS.map(p => this.normalizeDriver({ ...p }));
  }

  normalizeDriver(p) {
    const hasVehicleCourier = p.hasVehicleCourier !== false;
    const hasBicycleCourier = p.id === 'drv-102' ? (p.hasBicycleCourier !== false) : (p.hasBicycleCourier === true);
    const femaleNames = ['sarah', 'tanya', 'emma', 'chloe', 'sophie', 'jessica', 'claire', 'amy', 'olivia', 'mia', 'zoe'];
    const inferredGender = femaleNames.some(n => (p.name || '').toLowerCase().includes(n)) ? 'female' : 'male';
    const gender = p.gender || (p.id === 'drv-102' || p.id === 'drv-105' ? 'female' : inferredGender);
    const vehiclePerKmRateAud = Number(p.vehiclePerKmRateAud ?? p.perKmRateAud ?? p.perKmRate ?? 2.20);
    const vehicleSameDayFeeAud = Number(p.vehicleSameDayFeeAud ?? p.sameDayFeeAud ?? p.sameDayFee ?? 0);
    const vehicleUrgentFeeAud = Number(p.vehicleUrgentFeeAud ?? p.urgentFeeAud ?? p.urgentFee ?? 0);
    const vehicleMaxWeightKg = Number(p.vehicleMaxWeightKg ?? p.maxWeightKg ?? 50);
    const vehicleMaxHeightCm = Number(p.vehicleMaxHeightCm ?? p.maxHeightCm ?? 70);
    const vehicleMaxWidthCm = Number(p.vehicleMaxWidthCm ?? p.maxWidthCm ?? 50);
    const vehicleMaxLengthCm = Number(p.vehicleMaxLengthCm ?? p.maxLengthCm ?? 50);

    const bicyclePerKmRateAud = Number(p.bicyclePerKmRateAud ?? (p.id === 'drv-102' ? 1.60 : 1.80));
    const bicycleSameDayFeeAud = Number(p.bicycleSameDayFeeAud ?? (p.id === 'drv-102' ? 8 : 0));
    const bicycleUrgentFeeAud = Number(p.bicycleUrgentFeeAud ?? (p.id === 'drv-102' ? 18 : 0));
    const bicycleMaxWeightKg = Number(p.bicycleMaxWeightKg ?? 8);
    const bicycleMaxHeightCm = Number(p.bicycleMaxHeightCm ?? 35);
    const bicycleMaxWidthCm = Number(p.bicycleMaxWidthCm ?? 30);
    const bicycleMaxLengthCm = Number(p.bicycleMaxLengthCm ?? 40);

    return {
      ...p,
      gender,
      category: "courier",
      hasVehicleCourier,
      hasBicycleCourier,
      vehicle: p.vehicle || (hasBicycleCourier && !hasVehicleCourier ? "Bicycle / E-Bike" : "Courier Van"),
      vehiclePerKmRateAud,
      vehicleSameDayFeeAud,
      vehicleUrgentFeeAud,
      vehicleMaxWeightKg,
      vehicleMaxHeightCm,
      vehicleMaxWidthCm,
      vehicleMaxLengthCm,
      bicyclePerKmRateAud,
      bicycleSameDayFeeAud,
      bicycleUrgentFeeAud,
      bicycleMaxWeightKg,
      bicycleMaxHeightCm,
      bicycleMaxWidthCm,
      bicycleMaxLengthCm,
      licenceNumber: p.licenceNumber || "482910384",
      licenceState: p.licenceState || "QLD",
      licenceClass: p.licenceClass || "C (Car / Van)",
      licenceExpiry: p.licenceExpiry || "2029-12-31",
      address: p.address || p.baseSuburb || "Southport QLD 4215",
      baseSuburb: p.baseSuburb || "Southport QLD",
      phone: p.phone || "0412 000 000",
      email: p.email || "driver@itsasimplejob.com.au",
      payIdType: p.payIdType || "phone",
      payIdValue: p.payIdValue || p.phone || "0412 000 000",
      payIdAccountName: p.payIdAccountName || p.businessName || p.name || "Verified Driver",
      perKmRateAud: vehiclePerKmRateAud,
      sameDayFeeAud: vehicleSameDayFeeAud,
      urgentFeeAud: vehicleUrgentFeeAud,
      maxWeightKg: vehicleMaxWeightKg,
      maxHeightCm: vehicleMaxHeightCm,
      maxWidthCm: vehicleMaxWidthCm,
      maxLengthCm: vehicleMaxLengthCm,
      tokenBalance: Number.isFinite(Number(p.tokenBalance)) ? Number(p.tokenBalance) : 25,
      lat: Number(p.lat ?? -27.9678),
      lng: Number(p.lng ?? 153.4011),
      lastGeolocatedAt: p.lastGeolocatedAt || new Date().toISOString(),
      autoGeolocateEnabled: p.autoGeolocateEnabled !== false,
      profileTurnedOn: p.profileTurnedOn !== false && p.profileActive !== false,
      profileActive: p.profileTurnedOn !== false && p.profileActive !== false,
      approved: p.approved !== false && p.status !== "pending_approval",
      status: p.status || (p.approved === false ? "pending_approval" : "active"),
      calendarSchedule: p.calendarSchedule || getDefaultCalendarSchedule(true)
    };
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.providers));
    } catch (e) {
      console.error("Failed to save drivers to local storage", e);
    }
  }

  getAll() {
    return this.providers;
  }

  getAllApproved() {
    return this.providers.filter(p => isDriverApproved(p));
  }

  getAllVisibleOnMap() {
    return this.providers.filter(p => isDriverVisibleOnMap(p));
  }

  getActiveDrivers() {
    return this.providers.filter(p => p.status !== "paused" && isDriverProfileTurnedOn(p));
  }

  addProvider(newProv) {
    const cleanEmail = (newProv.email || '').toLowerCase().trim();
    if (cleanEmail) {
      const existing = this.providers.find(p => (p.email || '').toLowerCase().trim() === cleanEmail);
      if (existing) {
        const merged = this.normalizeDriver({
          ...existing,
          ...newProv,
          id: existing.id,
          serviceProviderNumber: existing.serviceProviderNumber,
          updatedAt: new Date().toISOString()
        });
        Object.assign(existing, merged);
        this.save();
        if (window.firebaseService?.saveProviderToFirestore) {
          try { window.firebaseService.saveProviderToFirestore(existing); } catch (e) {}
        }
        return existing;
      }
    }

    const id = "drv-" + Date.now().toString().slice(-5);
    const spn = newProv.serviceProviderNumber || `DRV-${Math.floor(100000 + Math.random() * 900000)}`;

    const driver = this.normalizeDriver({
      id,
      serviceProviderNumber: spn,
      businessId: "its-a-simple-job",
      rating: 5.0,
      reviewCount: 1,
      policeChecked: true,
      completedJobs: 0,
      badge: "Verified Courier Driver",
      avatar: "assets/images/courier_worker.jpg",
      tokenBalance: 25,
      approved: newProv.approved ?? false,
      status: newProv.status || (newProv.approved ? "active" : "pending_approval"),
      ...newProv
    });

    this.providers.unshift(driver);
    this.save();

    if (window.firebaseService?.saveProviderToFirestore) {
      try { window.firebaseService.saveProviderToFirestore(driver); } catch (e) {}
    }

    return driver;
  }

  findById(id) {
    if (!id) return this.providers[0] || null;
    return this.providers.find(p => p.id === id || p.serviceProviderNumber === id);
  }

  updateProvider(idOrSpn, updates) {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    Object.assign(p, updates);
    const normalized = this.normalizeDriver(p);
    Object.assign(p, normalized);
    this.save();
    if (window.firebaseService?.saveProviderToFirestore) {
      try { window.firebaseService.saveProviderToFirestore(p); } catch (e) {}
    }
    return p;
  }

  updateDriverLocation(idOrSpn, latOrObj, lng, addressText) {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    if (latOrObj && typeof latOrObj === 'object') {
      p.lat = Number(latOrObj.lat);
      p.lng = Number(latOrObj.lng);
      if (latOrObj.addressText) {
        p.currentLocationText = latOrObj.addressText;
        p.baseSuburb = latOrObj.addressText.split(',')[0] || p.baseSuburb;
      }
    } else {
      p.lat = Number(latOrObj);
      p.lng = Number(lng);
      if (addressText) {
        p.currentLocationText = addressText;
        p.baseSuburb = addressText.split(',')[0] || p.baseSuburb;
      }
    }
    p.lastGeolocatedAt = new Date().toISOString();
    this.save();
    return p;
  }

  deductDriverTokens(idOrSpn, tokensToDeduct) {
    const p = this.findById(idOrSpn);
    if (!p) return { ok: false, error: "Driver not found" };
    const amount = Math.max(0, Math.ceil(Number(tokensToDeduct) || 0));
    if (p.tokenBalance < amount) {
      return { ok: false, error: `Driver ${p.name} has insufficient tokens (${p.tokenBalance} available, ${amount} required).` };
    }
    p.tokenBalance -= amount;
    p.completedJobs = (p.completedJobs || 0) + 1;
    this.save();
    return { ok: true, remainingBalance: p.tokenBalance };
  }

  addDriverTokens(idOrSpn, tokensToAdd) {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    const amount = Math.max(0, Math.ceil(Number(tokensToAdd) || 0));
    p.tokenBalance = (Number(p.tokenBalance) || 0) + amount;
    this.save();
    return p.tokenBalance;
  }

  approveDriver(idOrSpn) {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    p.approved = true;
    p.status = "active";
    p.isActive = true;
    p.role = "driver";
    p.isDriver = true;
    this.save();
    return p;
  }

  revokeDriver(idOrSpn) {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    p.approved = false;
    p.status = "pending_approval";
    p.isActive = false;
    this.save();
    return p;
  }

  togglePause(idOrSpn, reason = "") {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    p.status = p.status === "paused" ? "active" : "paused";
    p.pausedReason = p.status === "paused" ? (reason || "Off duty") : "";
    this.save();
    return p;
  }

  setDriverProfileTurnedOn(idOrSpn, isTurnedOn) {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    const nextState = Boolean(isTurnedOn);
    p.profileTurnedOn = nextState;
    p.profileActive = nextState;
    if (nextState && p.status === "paused") {
      p.status = p.approved !== false ? "active" : "pending_approval";
      p.pausedReason = "";
    }
    this.save();
    if (window.firebaseService?.saveProviderToFirestore) {
      try { window.firebaseService.saveProviderToFirestore(p); } catch (e) {}
    }
    return p;
  }
}

class CourierOrderDatabase {
  constructor() {
    this.storageKey = "iasj_courier_orders_v3";
    this.orders = this.loadOrders();
  }

  loadOrders() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [...INITIAL_ORDERS];
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.orders));
    } catch (e) {}
  }

  getAll() {
    return this.orders;
  }

  getOrderById(orderId) {
    if (!orderId) return null;
    return this.orders.find(o => o.orderId === orderId) || null;
  }

  getByDriver(driverIdOrSpn) {
    if (!driverIdOrSpn || driverIdOrSpn === 'all') return this.orders;
    return this.orders.filter(o => o.driverId === driverIdOrSpn || o.driverSpn === driverIdOrSpn);
  }

  addOrder(orderData) {
    const orderId = orderData.orderId || `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const record = {
      orderId,
      createdAt: new Date().toISOString(),
      status: "Awaiting Customer PayID",
      paymentMethod: "Direct Driver PayID (AUD)",
      unreadByDriver: true,
      ...orderData
    };
    this.orders.unshift(record);
    this.save();
    return record;
  }

  markOrderReadByDriver(orderId) {
    const ord = this.orders.find(o => o.orderId === orderId);
    if (!ord) return null;
    ord.unreadByDriver = false;
    this.save();
    return ord;
  }

  updateOrderStatus(orderId, newStatus) {
    const ord = this.orders.find(o => o.orderId === orderId);
    if (!ord) return null;
    ord.status = newStatus;
    if (String(newStatus || '').includes('Accepted') || String(newStatus || '').includes('Picked Up') || String(newStatus || '').includes('Delivered')) {
      ord.unreadByDriver = false;
    }
    this.save();
    return ord;
  }

  deleteOrder(orderId) {
    const idx = this.orders.findIndex(o => o.orderId === orderId);
    if (idx === -1) return false;
    this.orders.splice(idx, 1);
    this.save();
    return true;
  }
}

class SuperadminDatabase {
  constructor() {
    this.storageKey = "iasj_superadmin_tokens_v1";
    this.historyKey = "iasj_superadmin_token_history_v1";
  }

  getBalance() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return Math.max(0, parseInt(raw, 10) || 0);
    } catch (e) {
      return 0;
    }
  }

  addTokens(amount, details = {}) {
    const tokens = Math.max(0, Math.round(Number(amount) || 0));
    const current = this.getBalance();
    const updated = current + tokens;
    try {
      localStorage.setItem(this.storageKey, String(updated));
      const history = this.getHistory();
      history.unshift({
        id: "TX-" + Date.now(),
        timestamp: new Date().toISOString(),
        tokens,
        orderId: details.orderId || "ORD-DIRECT",
        driverName: details.driverName || "Courier Driver",
        driverId: details.driverId || "",
        tier: details.tier || "Standard Distance"
      });
      localStorage.setItem(this.historyKey, JSON.stringify(history.slice(0, 50)));
    } catch (e) {}
    return updated;
  }

  wipeTokens() {
    try {
      localStorage.setItem(this.storageKey, "0");
    } catch (e) {}
    return 0;
  }

  minusTokens(amount) {
    const tokens = Math.max(0, Math.round(Number(amount) || 0));
    const current = this.getBalance();
    const updated = Math.max(0, current - tokens);
    try {
      localStorage.setItem(this.storageKey, String(updated));
    } catch (e) {}
    return updated;
  }

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.historyKey) || "[]");
    } catch (e) {
      return [];
    }
  }
}

class CandidateDatabase {
  constructor() {
    this.candidates = [];
  }
  getAll() { return []; }
  findById() { return null; }
  addCandidate(c) { return c; }
  search() { return []; }
}

function isDriverApproved(driver) {
  if (!driver) return false;
  return driver.approved === true || (driver.approved !== false && driver.status === 'active' && driver.status !== 'pending_approval' && driver.status !== 'revoked' && driver.isActive !== false);
}

function isDriverProfileTurnedOn(driver) {
  if (!driver) return false;
  return driver.profileTurnedOn !== false && driver.profileActive !== false && driver.status !== 'paused';
}

function isDriverVisibleOnMap(driver) {
  return Boolean(isDriverApproved(driver) && isDriverProfileTurnedOn(driver));
}

window.isDriverApproved = isDriverApproved;
window.isDriverProfileTurnedOn = isDriverProfileTurnedOn;
window.isDriverVisibleOnMap = isDriverVisibleOnMap;
window.INITIAL_PROVIDERS = INITIAL_PROVIDERS;
window.INITIAL_CANDIDATES = [];
window.providerDB = new ProviderDatabase();
window.courierOrderDB = new CourierOrderDatabase();
window.superadminDB = new SuperadminDatabase();
window.candidateDB = new CandidateDatabase();
window.ProviderDatabase = ProviderDatabase;
window.CourierOrderDatabase = CourierOrderDatabase;
window.SuperadminDatabase = SuperadminDatabase;
window.CandidateDatabase = CandidateDatabase;
window.getDefaultCalendarSchedule = getDefaultCalendarSchedule;
