/**
 * It's A Simple Job - Verified Provider & Courier Network Data
 * Seed database of qualified Australian tradies, handymen, and couriers with exact GPS coordinates.
 */

const INITIAL_PROVIDERS = [
  {
    id: "prov-101",
    name: "Lachlan 'Lockie' Miller",
    businessName: "Lockie's Plumbing & Leak Solutions",
    category: "plumbing",
    tradeTitle: "Licensed Master Plumber & Gas Fitter",
    avatar: "assets/images/tradie_worker.jpg",
    rating: 4.95,
    reviewCount: 148,
    qbccLicense: "QBCC #1518920",
    insurance: "$20M Public Liability Verified",
    policeChecked: true,
    hourlyRate: 98,
    lat: -28.0280,
    lng: 153.4312,
    baseSuburb: "Broadbeach QLD",
    serviceAreas: ["Surfers Paradise", "Broadbeach", "Southport", "Robina", "Burleigh Heads", "Gold Coast"],
    postcodes: ["4217", "4218", "4215", "4226", "4220", "4214"],
    skills: [
      "leaking tap", "tap washer", "mixer tap replacement", "pipe leak", "dripping tap", 
      "toilet repair", "blocked sink", "water pressure", "dishwasher install", "shower leak"
    ],
    experienceYears: 14,
    availability: ["morning", "afternoon"], // 9am-12pm & 2pm-5pm
    bio: "Friendly Gold Coast local plumber for 14 years. Arrives on time with all standard tap ware and pipe replacement parts ready in the van.",
    completedJobs: 412,
    badge: "Top Rated Tradie"
  },
  {
    id: "prov-102",
    name: "Callum Evans",
    businessName: "Gold Coast Rapid Express Couriers",
    category: "courier",
    tradeTitle: "Commercial Courier & Logistics Specialist",
    avatar: "assets/images/courier_worker.jpg",
    rating: 4.98,
    reviewCount: 320,
    qbccLicense: "Commercial Carrier Lic #CC-88219",
    insurance: "$10M Transit Goods & Liability",
    policeChecked: true,
    hourlyRate: 55,
    lat: -27.9678,
    lng: 153.4011,
    baseSuburb: "Southport QLD",
    serviceAreas: ["Gold Coast", "Brisbane Metro", "Logan", "Tweed Heads", "Ipswich", "Australia-wide"],
    postcodes: ["4217", "4215", "4000", "4101", "4122", "2485"],
    skills: [
      "courier", "parcel delivery", "urgent same day", "documents", "medical items", 
      "equipment transport", "retail goods delivery", "bulky pickup", "pallet express"
    ],
    vehicle: "Toyota HiAce LWB High Roof (1.4 Tonne)",
    experienceYears: 9,
    availability: ["morning", "afternoon", "urgent_sameday"],
    bio: "Punctual, insured courier with heavy-duty lift gate. Servicing Gold Coast to Brisbane express daily with direct doorstep handoff.",
    completedJobs: 980,
    badge: "Express Priority Driver"
  },
  {
    id: "prov-103",
    name: "Dave 'Macca' Mackenzie",
    businessName: "All-Round Aussie Handyman & Repairs",
    category: "handyman",
    tradeTitle: "Certified Multi-Trade Handyman & Carpenter",
    avatar: "assets/images/tradie_worker.jpg",
    rating: 4.92,
    reviewCount: 204,
    qbccLicense: "QBCC Nominated #1289410",
    insurance: "$20M Public Liability Verified",
    policeChecked: true,
    hourlyRate: 75,
    lat: -28.0772,
    lng: 153.3853,
    baseSuburb: "Robina QLD",
    serviceAreas: ["Southport", "Robina", "Varsity Lakes", "Nerang", "Ashmore", "Broadbeach"],
    postcodes: ["4215", "4226", "4227", "4211", "4214", "4218"],
    skills: [
      "flatpack furniture assembly", "ikea assembly", "hang mirror", "tv wall mounting", 
      "door lock replacement", "drywall patch", "plaster repair", "hinge adjustment", "shelf installation", "curtain rods"
    ],
    experienceYears: 12,
    availability: ["morning", "afternoon"],
    bio: "Equipped with comprehensive tools, fasteners, and heavy masonry fixings. No job too small, no job too big.",
    completedJobs: 560,
    badge: "5-Star Assembler"
  },
  {
    id: "prov-104",
    name: "Marcus & Trent Taylor",
    businessName: "Coastline Sparky & Solar Works",
    category: "electrical",
    tradeTitle: "Licensed Electrical Contractor",
    avatar: "assets/images/tradie_worker.jpg",
    rating: 4.96,
    reviewCount: 165,
    qbccLicense: "Qld Electrical Lic #84291",
    insurance: "$20M Master Electricians Cover",
    policeChecked: true,
    hourlyRate: 110,
    lat: -27.9189,
    lng: 153.3275,
    baseSuburb: "Helensvale QLD",
    serviceAreas: ["Gold Coast", "Hope Island", "Coomera", "Helensvale", "Surfers Paradise", "Brisbane South"],
    postcodes: ["4212", "4209", "4210", "4217", "4122"],
    skills: [
      "electrical", "power point install", "light switch", "ceiling fan", "smoke alarms", 
      "safety switch trip", "led downlights", "stove connection", "exhaust fan"
    ],
    experienceYears: 15,
    availability: ["morning", "afternoon"],
    bio: "Fully licensed master electricians. We prioritize electrical safety, clean workmanship, and punctual service.",
    completedJobs: 390,
    badge: "Master Electrician"
  },
  {
    id: "prov-105",
    name: "Darren Boyd",
    businessName: "Boyd's Garden & Grounds Care",
    category: "garden",
    tradeTitle: "Landscape & Garden Maintenance Specialist",
    avatar: "assets/images/tradie_worker.jpg",
    rating: 4.89,
    reviewCount: 112,
    qbccLicense: "Horticulture Cert III / Insured",
    insurance: "$10M Public Liability",
    policeChecked: true,
    hourlyRate: 68,
    lat: -28.0877,
    lng: 153.4478,
    baseSuburb: "Burleigh Heads QLD",
    serviceAreas: ["Burleigh Heads", "Palm Beach", "Elanora", "Currumbin", "Coolangatta", "Tweed"],
    postcodes: ["4220", "4221", "4223", "4225", "2485"],
    skills: [
      "lawn mowing", "lawn care", "hedge trimming", "gutter cleaning", "green waste removal", 
      "garden pruning", "weed control", "high pressure cleaning", "mulching"
    ],
    experienceYears: 8,
    availability: ["morning", "afternoon"],
    bio: "Equipped with commercial zero-turn mowers, hedge trimmers, gutter vacuums, and green waste tip trailer.",
    completedJobs: 280,
    badge: "Eco Garden Care"
  },
  {
    id: "prov-106",
    name: "Sarah 'Saz' Jennings",
    businessName: "Apex Express Freight & Courier",
    category: "courier",
    tradeTitle: "Urgent Medical & Retail Courier Specialist",
    avatar: "assets/images/courier_worker.jpg",
    rating: 4.97,
    reviewCount: 245,
    qbccLicense: "Logistics Cert IV / Carrier Verified",
    insurance: "$20M Transit & Marine Insurance",
    policeChecked: true,
    hourlyRate: 58,
    lat: -27.4698,
    lng: 153.0251,
    baseSuburb: "Brisbane CBD QLD",
    serviceAreas: ["Brisbane CBD", "Fortitude Valley", "Gold Coast", "Logan", "Caboolture"],
    postcodes: ["4000", "4006", "4217", "4114", "4510"],
    skills: [
      "courier", "urgent delivery", "medical items", "documents", "same day express", 
      "delicate parcels", "retail stock transfer", "legal contracts"
    ],
    vehicle: "Mercedes-Benz Sprinter Van with Temperature Control & Straps",
    experienceYears: 7,
    availability: ["morning", "afternoon", "urgent_sameday"],
    bio: "Specialist in time-critical deliveries between medical clinics, commercial offices, and retail hubs.",
    completedJobs: 820,
    badge: "Fast Delivery Star"
  },
  {
    id: "prov-107",
    name: "Toby 'Vancey' Vance",
    businessName: "Coastal Carpentry & Timber Fix",
    category: "carpentry",
    tradeTitle: "Licensed Finish Carpenter & Joiner",
    avatar: "assets/images/tradie_worker.jpg",
    rating: 4.94,
    reviewCount: 88,
    qbccLicense: "QBCC #1539201",
    insurance: "$20M Public Liability",
    policeChecked: true,
    hourlyRate: 88,
    lat: -27.9520,
    lng: 153.4050,
    baseSuburb: "Labrador QLD",
    serviceAreas: ["Southport", "Labrador", "Runaway Bay", "Main Beach", "Surfers Paradise"],
    postcodes: ["4215", "4216", "4217"],
    skills: [
      "carpentry", "deck repair", "skirting boards", "door hanging", "cabinet repairs", "timber pergola"
    ],
    experienceYears: 11,
    availability: ["morning", "afternoon"],
    bio: "Passionate carpenter specialized in timber finishes, door installations, deck repairs, and bespoke joinery.",
    completedJobs: 195,
    badge: "Master Carpenter"
  },
  {
    id: "prov-108",
    name: "Brett 'Wilso' Wilson",
    businessName: "Gold Coast Pro Painting & Drywall",
    category: "painting",
    tradeTitle: "Trade Painter & Drywall Finisher",
    avatar: "assets/images/tradie_worker.jpg",
    rating: 4.91,
    reviewCount: 94,
    qbccLicense: "QBCC #1499210",
    insurance: "$10M Public Liability",
    policeChecked: true,
    hourlyRate: 72,
    lat: -28.0310,
    lng: 153.4150,
    baseSuburb: "Broadbeach Waters QLD",
    serviceAreas: ["Broadbeach", "Mermaid Waters", "Bundall", "Surfers Paradise", "Miami"],
    postcodes: ["4218", "4217", "4220"],
    skills: [
      "interior painting", "drywall patch", "ceiling paint", "plaster repair", "touch up", "door repaint"
    ],
    experienceYears: 10,
    availability: ["morning", "afternoon"],
    bio: "Clean lines, zero paint drips, and dustless sanding. Flawless plaster patching and colour matching.",
    completedJobs: 230,
    badge: "Clean Finish Pro"
  },
  {
    id: "prov-109",
    name: "Liam O'Connor",
    businessName: "Hinterland Appliance Doctors",
    category: "appliance",
    tradeTitle: "Certified Appliance Tech & Electrician",
    avatar: "assets/images/tradie_worker.jpg",
    rating: 4.93,
    reviewCount: 135,
    qbccLicense: "Qld Restricted Elec #91024",
    insurance: "$10M Public Liability",
    policeChecked: true,
    hourlyRate: 90,
    lat: -27.9940,
    lng: 153.3420,
    baseSuburb: "Nerang QLD",
    serviceAreas: ["Nerang", "Ashmore", "Robina", "Mudgeeraba", "Southport"],
    postcodes: ["4211", "4214", "4226", "4213", "4215"],
    skills: [
      "oven repair", "dishwasher fix", "washing machine", "dryer belt", "rangehood motor", "appliance wiring"
    ],
    experienceYears: 13,
    availability: ["morning", "afternoon"],
    bio: "Prompt diagnostic repair on all major Australian and European brands (Bosch, Fisher & Paykel, Westinghouse).",
    completedJobs: 375,
    badge: "Appliance Expert"
  }
];

// Persistent state wrapper using localStorage with fallback
class ProviderDatabase {
  constructor() {
    this.storageKey = "simplejob_registered_providers_v2";
    this.providers = this.loadProviders();
  }

  loadProviders() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= INITIAL_PROVIDERS.length) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not read local storage, using initial seed data", e);
    }
    return [...INITIAL_PROVIDERS];
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.providers));
    } catch (e) {
      console.error("Failed to save to local storage", e);
    }
  }

  getAll() {
    return this.providers;
  }

  addProvider(newProvider) {
    const id = "prov-" + (Date.now().toString().slice(-4));
    // Default coordinates in Gold Coast if not provided
    const lat = newProvider.lat || (-28.0024 + (Math.random() - 0.5) * 0.1);
    const lng = newProvider.lng || (153.4310 + (Math.random() - 0.5) * 0.1);
    
    const providerWithDefaults = {
      id,
      rating: 5.0,
      reviewCount: 1,
      completedJobs: 0,
      badge: "Newly Verified",
      policeChecked: true,
      avatar: "assets/images/tradie_worker.jpg",
      lat,
      lng,
      baseSuburb: newProvider.baseSuburb || "Gold Coast QLD",
      ...newProvider
    };
    this.providers.unshift(providerWithDefaults);
    this.save();
    return providerWithDefaults;
  }

  findById(id) {
    return this.providers.find(p => p.id === id);
  }
}

// Global instance
window.providerDB = new ProviderDatabase();
