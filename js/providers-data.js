/**
 * It's A Simple Job - Verified Provider, Courier & Recruitment Candidate Network Data
 * Seed database of qualified Australian tradies, handymen, couriers, and recruit candidates.
 * Tagged for multi-tenant Firebase: businessId = 'itsasimplejob'
 */

function getDefaultCalendarSchedule(is24_7 = true) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const schedule = {};
  days.forEach(d => {
    schedule[d] = {
      urgent_247: is24_7,
      morning: true,
      afternoon: true,
      evening: is24_7 || d === 'fri' || d === 'sat',
      overnight: is24_7
    };
  });
  return schedule;
}

const INITIAL_PROVIDERS = [
  {
    id: "prov-101",
    serviceProviderNumber: "SPN-101001",
    businessId: "itsasimplejob",
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
      "toilet repair", "blocked sink", "water pressure", "dishwasher install", "shower leak", "burst pipe"
    ],
    experienceYears: 14,
    workingHours: {
      is24_7: true,
      shiftDescription: "24/7 • 365 Days a Year Emergency Burst Pipes & Shifts",
      shifts: ["emergency_24_7", "morning", "afternoon", "evening", "overnight"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Friendly Gold Coast local plumber for 14 years. Arrives on time with all standard tap ware and pipe replacement parts ready in the van. Available 24/7 for urgent plumbing emergencies.",
    completedJobs: 412,
    badge: "24/7 Emergency Plumber"
  },
  {
    id: "prov-102",
    serviceProviderNumber: "SPN-101002",
    businessId: "itsasimplejob",
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
      "equipment transport", "retail goods delivery", "bulky pickup", "pallet express", "overnight freight"
    ],
    vehicle: "Toyota HiAce LWB High Roof (1.4 Tonne)",
    experienceYears: 9,
    workingHours: {
      is24_7: true,
      shiftDescription: "24/7 • 365 Days a Year Priority Express & Hotshot Deliveries",
      shifts: ["emergency_24_7", "morning", "afternoon", "evening", "overnight"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Punctual, insured courier with heavy-duty lift gate. Servicing Gold Coast to Brisbane express daily with direct doorstep handoff. 24/7 on-call dispatch.",
    completedJobs: 980,
    badge: "24/7 Priority Courier"
  },
  {
    id: "prov-103",
    serviceProviderNumber: "SPN-101003",
    businessId: "itsasimplejob",
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
    workingHours: {
      is24_7: false,
      shiftDescription: "Monday–Saturday: 7:00 AM – 7:00 PM (Emergency lockouts on-call)",
      shifts: ["morning", "afternoon", "evening"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    },
    bio: "Equipped with comprehensive tools, fasteners, and heavy masonry fixings. No job too small, no job too big. Lock repairs and boarding up available after-hours.",
    completedJobs: 560,
    badge: "5-Star Assembler"
  },
  {
    id: "prov-104",
    serviceProviderNumber: "SPN-101004",
    businessId: "itsasimplejob",
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
      "safety switch trip", "led downlights", "stove connection", "exhaust fan", "switchboard upgrade", "emergency blackout"
    ],
    experienceYears: 15,
    workingHours: {
      is24_7: true,
      shiftDescription: "24/7 • 365 Days a Year Emergency Blackout & Safety Service",
      shifts: ["emergency_24_7", "morning", "afternoon", "evening", "overnight"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Fully licensed master electricians. We prioritize electrical safety, clean workmanship, and rapid response for outages 24 hours a day.",
    completedJobs: 390,
    badge: "24/7 Emergency Sparky"
  },
  {
    id: "prov-105",
    serviceProviderNumber: "SPN-101005",
    businessId: "itsasimplejob",
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
      "garden pruning", "weed control", "high pressure cleaning", "mulching", "storm damage tree cleanup"
    ],
    experienceYears: 8,
    workingHours: {
      is24_7: false,
      shiftDescription: "Monday–Sunday: 6:30 AM – 5:30 PM (Storm clean-up on-call)",
      shifts: ["morning", "afternoon"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Equipped with commercial zero-turn mowers, hedge trimmers, gutter vacuums, and green waste tip trailer.",
    completedJobs: 280,
    badge: "Eco Garden Care"
  },
  {
    id: "prov-106",
    serviceProviderNumber: "SPN-101006",
    businessId: "itsasimplejob",
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
      "delicate parcels", "retail stock transfer", "legal contracts", "night specimen delivery"
    ],
    vehicle: "Mercedes-Benz Sprinter Van with Temperature Control & Straps",
    experienceYears: 7,
    workingHours: {
      is24_7: true,
      shiftDescription: "24/7 • 365 Days a Year Critical Medical & Legal Courier Transit",
      shifts: ["emergency_24_7", "morning", "afternoon", "evening", "overnight"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Specialist in time-critical deliveries between medical clinics, commercial offices, and retail hubs. Operating round the clock.",
    completedJobs: 820,
    badge: "24/7 Medical Transit"
  },
  {
    id: "prov-107",
    serviceProviderNumber: "SPN-101007",
    businessId: "itsasimplejob",
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
      "carpentry", "deck repair", "skirting boards", "door hanging", "cabinet repairs", "timber pergola", "structural timber"
    ],
    experienceYears: 11,
    workingHours: {
      is24_7: false,
      shiftDescription: "Monday–Saturday: 7:00 AM – 5:00 PM",
      shifts: ["morning", "afternoon"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    },
    bio: "Passionate carpenter specialized in timber finishes, door installations, deck repairs, and bespoke joinery.",
    completedJobs: 195,
    badge: "Master Carpenter"
  },
  {
    id: "prov-108",
    serviceProviderNumber: "SPN-101008",
    businessId: "itsasimplejob",
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
    workingHours: {
      is24_7: false,
      shiftDescription: "Monday–Saturday: 6:30 AM – 4:30 PM",
      shifts: ["morning", "afternoon"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    },
    bio: "Clean lines, zero paint drips, and dustless sanding. Flawless plaster patching and colour matching.",
    completedJobs: 230,
    badge: "Clean Finish Pro"
  },
  {
    id: "prov-109",
    serviceProviderNumber: "SPN-101009",
    businessId: "itsasimplejob",
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
      "oven repair", "dishwasher fix", "washing machine", "dryer belt", "rangehood motor", "appliance wiring", "emergency commercial fridge repair"
    ],
    experienceYears: 13,
    workingHours: {
      is24_7: true,
      shiftDescription: "24/7 • 365 Days a Year Refrigeration & Appliance Service",
      shifts: ["emergency_24_7", "morning", "afternoon", "evening", "overnight"],
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    bio: "Prompt diagnostic repair on all major Australian and European brands (Bosch, Fisher & Paykel, Westinghouse).",
    completedJobs: 375,
    badge: "24/7 Appliance Tech"
  }
];

/**
 * Seed Candidates & Resumes for Hire Recruitment
 * Searchable by recruiters across Australia using key terms & location
 */
const INITIAL_CANDIDATES = [
  {
    id: "cand-201",
    serviceProviderNumber: "SPN-842101",
    businessId: "itsasimplejob",
    name: "Liam O'Connor",
    tradeTitle: "Cert III Qualified Carpenter & Framing Lead",
    category: "carpentry",
    suburb: "Southport QLD",
    postcode: "4215",
    lat: -27.9678,
    lng: 153.4011,
    hourlyRate: 65,
    dayRate: 520,
    experienceYears: 8,
    employmentTypes: ["Full-Time", "Temp / Contract", "Subcontractor"],
    policeChecked: true,
    workingHours: {
      is24_7: true,
      registeredShifts: "24/7 • 365 Days a Year (Day Shifts, Twilight & Emergency Repairs)",
      availabilityBadge: "24/7/365 Available Immediately"
    },
    keyTerms: [
      "carpentry", "framing", "fix out", "timber decking", "cladding", "eaves", 
      "doors", "locks", "white card", "qbcc", "power tools", "read plans", "joinery"
    ],
    licenses: ["Cert III Carpentry (CPC30220)", "QBCC Licence #1529104", "White Card #WC-749102", "Driver Licence (Open C)"],
    resumeSummary: "Experienced 8-year carpenter specialized in residential framing, architectural fix-out, and composite timber decking. Owns full Makita 40V kit, laser level, and dual-cab Hilux ute.",
    fullResume: {
      summary: "Dynamic and safety-conscious Cert III Carpenter with 8 years on tier-1 and boutique residential builds across South-East Queensland.",
      experience: [
        { role: "Leading Hand Carpenter", company: "Coastal Crest Constructions", dates: "2021 – 2026", details: "Supervised timber frame erection, fix-out and exterior cladding on 40+ multi-storey luxury townhouses." },
        { role: "Trade Carpenter", company: "Gold Coast Decks & Pergolas", dates: "2018 – 2021", details: "Constructed bespoke hardwood and Trex composite decking, pergolas, and pool cabanas." }
      ],
      education: "TAFE Queensland - Certificate III in Carpentry (CPC30220)",
      tickets: ["White Card", "Working at Heights", "First Aid & CPR (HLTAID011)"],
      toolsOwned: "Full battery tool arsenal, drop saws, framing guns, laser levels, 3.2m aluminium trailer."
    }
  },
  {
    id: "cand-202",
    serviceProviderNumber: "SPN-842102",
    businessId: "itsasimplejob",
    name: "Marcus Taylor",
    tradeTitle: "Licensed Electrician & High Voltage / Solar Specialist",
    category: "electrical",
    suburb: "Helensvale QLD",
    postcode: "4212",
    lat: -27.9189,
    lng: 153.3275,
    hourlyRate: 95,
    dayRate: 760,
    experienceYears: 11,
    employmentTypes: ["Subcontractor", "Temp / Contract", "Full-Time"],
    policeChecked: true,
    workingHours: {
      is24_7: true,
      registeredShifts: "24/7 • 365 Days a Year Industrial Breakdown & On-Call",
      availabilityBadge: "24/7/365 On-Call Ready"
    },
    keyTerms: [
      "electrical", "solar", "switchboard", "ev charger", "cabling", "data", "high voltage", 
      "fault finding", "safety switch", "smoke alarms", "white card", "lvr cpr"
    ],
    licenses: ["Electrical Fitter / Mechanic Lic #84291", "Clean Energy Council Solar Accredited", "White Card", "CPR & LVR current"],
    resumeSummary: "Master electrician with 11 years across industrial, commercial, and high-end residential solar/battery storage. Extensive switchboard overhaul and hazardous area wiring experience.",
    fullResume: {
      summary: "Licensed electrical contractor with proven track record in switchboard upgrades, three-phase power, commercial solar arrays, and smart automation.",
      experience: [
        { role: "Senior Project Electrician", company: "SunState Power Solutions", dates: "2020 – 2026", details: "Commissioned 150+ commercial 30kW–100kW rooftop PV installations and Tesla Powerwalls." },
        { role: "Maintenance Electrician", company: "Pacific Industrial Facilities", dates: "2015 – 2020", details: "Fault diagnostic and preventative electrical maintenance across automated warehouse equipment." }
      ],
      education: "SkillsTech Australia - Certificate III in Electrotechnology Electrician (UEE30811)",
      tickets: ["Qld Electrical Work Licence", "Working at Heights (RIIWHS204E)", "Elevated Work Platform (EWP) Licence"],
      toolsOwned: "Complete electrical testing kit, Fluke thermal imager, insulated toolsets, test tags, stocked van."
    }
  },
  {
    id: "cand-203",
    serviceProviderNumber: "SPN-842103",
    businessId: "itsasimplejob",
    name: "Elena Vasquez",
    tradeTitle: "Heavy Rigid (HR) Commercial Driver & Multi-Drop Courier",
    category: "courier",
    suburb: "Southport QLD",
    postcode: "4215",
    lat: -27.9678,
    lng: 153.4011,
    hourlyRate: 52,
    dayRate: 420,
    experienceYears: 7,
    employmentTypes: ["Full-Time", "Casual / Shift", "Temp"],
    policeChecked: true,
    workingHours: {
      is24_7: true,
      registeredShifts: "24/7 • 365 Days a Year Flexible (Overnight Freight, Early Bird, Express)",
      availabilityBadge: "24/7/365 Ready (Day or Night)"
    },
    keyTerms: [
      "heavy rigid", "hr driver", "courier", "forklift", "freight", "pallet", "multi drop", 
      "logistics", "dangerous goods", "tail lift", "route navigation", "overnight"
    ],
    licenses: ["Heavy Rigid (HR) Licence", "Forklift Licence (LF)", "White Card", "Security Police Clearance"],
    resumeSummary: "Punctual, safety-focused commercial transport driver with clean HR record and 7 years navigating South-East Queensland and interstate linehaul. Flawless zero-incident rating.",
    fullResume: {
      summary: "Commercial freight operator experienced in high-volume metro deliveries, tail-gate logistics, and delicate pharmaceutical transit.",
      experience: [
        { role: "Regional Express Linehaul Driver", company: "Q-Freight Express", dates: "2021 – 2026", details: "Operated 14-tonne tautliner between Brisbane and Tweed daily; 50+ drop points with electronic proof of delivery." },
        { role: "Courier Delivery Specialist", company: "FastTrack Metro Couriers", dates: "2019 – 2021", details: "High-density multi-drop delivery across Gold Coast suburbs with 99.4% on-time SLA." }
      ],
      education: "Certificate III in Driving Operations (TLI31216)",
      tickets: ["HR Licence (Synchromesh & Auto)", "LF Forklift High Risk Work Licence", "First Aid HLTAID009"],
      toolsOwned: "Heavy-duty pallet jack, load restraint straps & chains, GPS navigation tracking units."
    }
  },
  {
    id: "cand-204",
    serviceProviderNumber: "SPN-842104",
    businessId: "itsasimplejob",
    name: "Jack MacIntyre",
    tradeTitle: "Senior Facilities Maintenance Lead & Multi-Trade Handyman",
    category: "handyman",
    suburb: "Robina QLD",
    postcode: "4226",
    lat: -28.0772,
    lng: 153.3853,
    hourlyRate: 72,
    dayRate: 580,
    experienceYears: 13,
    employmentTypes: ["Full-Time", "Contract", "Casual"],
    policeChecked: true,
    workingHours: {
      is24_7: true,
      registeredShifts: "24/7 • 365 Days a Year Emergency Repairs & Standard Shifts",
      availabilityBadge: "24/7/365 Ready"
    },
    keyTerms: [
      "handyman", "maintenance", "drywall", "painting", "plumbing repairs", "locks", 
      "carpentry", "white card", "asbestos", "preventative", "facility manager"
    ],
    licenses: ["QBCC Nominated Licence #1289410", "White Card", "Asbestos Awareness Ticket", "Working at Heights"],
    resumeSummary: "Versatile facility upkeep specialist with 13 years maintaining corporate complexes, hotels, and retail centres. Expert in rapid building fabric repairs, door hardware, and safety audits.",
    fullResume: {
      summary: "Proactive hands-on facility maintenance coordinator with broad technical skills across carpentry, plastering, minor plumbing, and safety standards.",
      experience: [
        { role: "Head Facility Handyman", company: "Broadbeach Resort & Apartments", dates: "2019 – 2026", details: "Managed day-to-day repairs for 220 apartment units and common areas. Reduced response times by 35%." },
        { role: "Commercial Property Maintenance Tech", company: "Apex Commercial Services", dates: "2013 – 2019", details: "Fire door maintenance, ceiling grid repairs, drywall patch-up, and lock replacements." }
      ],
      education: "Certificate IV in Building and Construction (CPC40120)",
      tickets: ["White Card", "Working Safely with Asbestos (CPCCDE3014A)", "Chemical Handling Certification"],
      toolsOwned: "Complete tool trailer, Festool dustless sanders, drywall guns, pressure washers, extension ladders."
    }
  },
  {
    id: "cand-205",
    serviceProviderNumber: "SPN-842105",
    businessId: "itsasimplejob",
    name: "Samir Patel",
    tradeTitle: "Civil Pipe Layer & 5-Tonne Excavator Operator",
    category: "civil",
    suburb: "Burleigh Heads QLD",
    postcode: "4220",
    lat: -28.0877,
    lng: 153.4478,
    hourlyRate: 78,
    dayRate: 620,
    experienceYears: 9,
    employmentTypes: ["Contract", "Subcontractor", "Full-Time"],
    policeChecked: true,
    workingHours: {
      is24_7: true,
      registeredShifts: "Day Shifts (6am–4pm) & Night Roadworks (8pm–5am)",
      availabilityBadge: "Night Shift & Day Ready"
    },
    keyTerms: [
      "excavator", "pipe layer", "civil", "drainage", "trenching", "confined space", 
      "laser level", "stormwater", "sewer", "traffic control", "white card"
    ],
    licenses: ["RII Competency: Excavator (RIIMPO320F)", "Confined Space Entry Ticket", "White Card", "Civil Construction Cert III"],
    resumeSummary: "Precision excavator operator with 9 years in deep drainage, civil roadworks, and service trenching around live utilities. Highly proficient with rotating laser levels and GPS machine guidance.",
    fullResume: {
      summary: "Detail-oriented civil machine operator specialized in urban deep services, pipe bedding, and tight-access excavation.",
      experience: [
        { role: "Lead Excavator Operator", company: "Gold Coast Infrastructure Civils", dates: "2020 – 2026", details: "Trenching for stormwater mains, electrical conduits, and water pipes adjacent to Pacific Motorway." },
        { role: "Civil Pipe Layer & Plant Operator", company: "Burleigh Earth & Pipe Works", dates: "2017 – 2020", details: "Installed reinforced concrete pipes, manholes, and subsoil drainage networks." }
      ],
      education: "Certificate III in Civil Construction Plant Operations (RII30820)",
      tickets: ["Excavator Ticket", "Confined Space (RIIWHS202E)", "Gas Test Atmospheres (MSMWHS217)"],
      toolsOwned: "Leica Rugby rotating laser level, trench shields, laser receivers, full personal PPE."
    }
  },
  {
    id: "cand-206",
    serviceProviderNumber: "SPN-842106",
    businessId: "itsasimplejob",
    name: "Sophie Becker",
    tradeTitle: "Commercial & Architectural Painter / Plaster Finisher",
    category: "painting",
    suburb: "Broadbeach Waters QLD",
    postcode: "4218",
    lat: -28.0310,
    lng: 153.4150,
    hourlyRate: 68,
    dayRate: 540,
    experienceYears: 10,
    employmentTypes: ["Subcontractor", "Full-Time", "Temp"],
    policeChecked: true,
    workingHours: {
      is24_7: false,
      registeredShifts: "Monday–Saturday 6am–4:30pm (After-hours commercial retail painting on request)",
      availabilityBadge: "Available This Week"
    },
    keyTerms: [
      "painter", "airless spray", "drywall", "plaster", "interior painting", "exterior", 
      "epoxy floor", "white card", "qbcc", "colour match", "dustless sanding"
    ],
    licenses: ["QBCC Licence #1499210 (Painting & Decorating)", "White Card", "EWP Boom Lift Ticket (>11m)"],
    resumeSummary: "Punctual tradeswoman specialized in airless spraying, fine enamel finishes, epoxy floor coatings, and flawless level 5 drywall patching. Delivers showroom-quality finishes.",
    fullResume: {
      summary: "Qualified painter and plaster finisher delivering premium residential and retail fit-outs with strict adherence to timelines and cleanliness.",
      experience: [
        { role: "Lead Finisher", company: "Luxe Coastal Painting", dates: "2020 – 2026", details: "Executed high-end residential interior/exterior repaints, timber staining, and anti-graffiti coatings." },
        { role: "Commercial Fitout Painter", company: "Metro Retail Decorators", dates: "2016 – 2020", details: "Completed night-time retail shop painting and epoxy flooring in Pacific Fair and Robina Town Centre." }
      ],
      education: "Certificate III in Painting and Decorating (CPC30620)",
      tickets: ["White Card", "Elevated Work Platform (EWP) High Risk Licence", "Working at Heights"],
      toolsOwned: "Graco Ultra Max II airless sprayer, Festool Planex drywall sander, rolling scaffolding, drop sheets."
    }
  }
];

// Persistent state wrapper using localStorage with fallback
class ProviderDatabase {
  constructor() {
    this.storageKey = "simplejob_registered_providers_v3";
    this.providers = this.loadProviders();
  }

  loadProviders() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= INITIAL_PROVIDERS.length) {
          return parsed.map(p => ({
            ...p,
            status: p.status || "active",
            pausedReason: p.pausedReason || "",
            bankDetails: p.bankDetails || {
              accountName: p.businessName || p.name || "Master Trade Services",
              bsb: p.bsb || "084-004",
              accountNumber: p.accountNumber || "482910481",
              bankName: p.bankName || "National Australia Bank (NAB)"
            },
            payId: p.payId || p.phone || "0412 889 211",
            payIdType: p.payIdType || "phone",
            calendarSchedule: p.calendarSchedule || getDefaultCalendarSchedule(p.workingHours?.is24_7 ?? true),
            blackoutDates: p.blackoutDates || []
          }));
        }
      }
    } catch (e) {
      console.warn("Could not read local storage, using initial seed data", e);
    }
    return INITIAL_PROVIDERS.map(p => ({
      ...p,
      status: p.status || "active",
      pausedReason: p.pausedReason || "",
      bankDetails: p.bankDetails || {
        accountName: p.businessName || p.name || "Master Trade Services",
        bsb: p.bsb || "084-004",
        accountNumber: p.accountNumber || "482910481",
        bankName: p.bankName || "National Australia Bank (NAB)"
      },
      payId: p.payId || p.phone || "0412 889 211",
      payIdType: p.payIdType || "phone",
      calendarSchedule: p.calendarSchedule || getDefaultCalendarSchedule(p.workingHours?.is24_7 ?? true),
      blackoutDates: p.blackoutDates || []
    }));
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
    const spn = newProvider.serviceProviderNumber || (window.firebaseService?.generateSPN ? window.firebaseService.generateSPN() : `SPN-${Math.floor(100000 + Math.random() * 900000)}`);
    const lat = newProvider.lat || (-28.0024 + (Math.random() - 0.5) * 0.1);
    const lng = newProvider.lng || (153.4310 + (Math.random() - 0.5) * 0.1);
    
    const providerWithDefaults = {
      id,
      serviceProviderNumber: spn,
      businessId: "itsasimplejob",
      status: newProvider.status || "active",
      pausedReason: newProvider.pausedReason || "",
      rating: 5.0,
      reviewCount: 1,
      completedJobs: 0,
      badge: "Newly Verified",
      policeChecked: true,
      avatar: "assets/images/tradie_worker.jpg",
      lat,
      lng,
      baseSuburb: newProvider.baseSuburb || "Gold Coast QLD",
      bankDetails: newProvider.bankDetails || {
        accountName: newProvider.bankAccountName || newProvider.businessName || newProvider.name,
        bsb: newProvider.bsb || "084-004",
        accountNumber: newProvider.accountNumber || "482910481",
        bankName: newProvider.bankName || "National Australia Bank (NAB)"
      },
      payId: newProvider.payId || newProvider.phone || "0412 889 211",
      payIdType: newProvider.payIdType || "phone",
      calendarSchedule: newProvider.calendarSchedule || getDefaultCalendarSchedule(newProvider.workingHours?.is24_7 ?? true),
      blackoutDates: newProvider.blackoutDates || [],
      workingHours: newProvider.workingHours || {
        is24_7: true,
        shiftDescription: "24/7 • 365 Days a Year Registered Working Hours",
        shifts: ["emergency_24_7", "morning", "afternoon", "evening", "overnight"],
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      },
      ...newProvider
    };
    this.providers.unshift(providerWithDefaults);
    this.save();

    // Sync to Firestore if service ready
    if (window.firebaseService?.saveProviderToFirestore) {
      window.firebaseService.saveProviderToFirestore(providerWithDefaults);
    }

    return providerWithDefaults;
  }

  findById(id) {
    return this.providers.find(p => p.id === id || p.serviceProviderNumber === id);
  }

  updateProvider(idOrSpn, updates) {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    Object.assign(p, updates);
    this.save();
    if (window.firebaseService?.saveProviderToFirestore) {
      window.firebaseService.saveProviderToFirestore(p);
    }
    return p;
  }

  togglePause(idOrSpn, reason = "") {
    const p = this.findById(idOrSpn);
    if (!p) return null;
    p.status = p.status === "paused" ? "active" : "paused";
    if (p.status === "paused") {
      p.pausedReason = reason || "Taking a scheduled break";
    } else {
      p.pausedReason = "";
    }
    this.save();
    if (window.firebaseService?.saveProviderToFirestore) {
      window.firebaseService.saveProviderToFirestore(p);
    }
    return p;
  }
}

// Candidate Resume Database for Recruiters
class CandidateDatabase {
  constructor() {
    this.storageKey = "simplejob_candidates_resumes_v1";
    this.candidates = this.loadCandidates();
  }

  loadCandidates() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= INITIAL_CANDIDATES.length) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not read candidates local storage", e);
    }
    return [...INITIAL_CANDIDATES];
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.candidates));
    } catch (e) {
      console.error("Failed to save candidates to local storage", e);
    }
  }

  getAll() {
    return this.candidates;
  }

  findById(id) {
    return this.candidates.find(c => c.id === id || c.serviceProviderNumber === id);
  }

  addCandidate(newCand) {
    const id = "cand-" + (Date.now().toString().slice(-4));
    const spn = newCand.serviceProviderNumber || (window.firebaseService?.generateSPN ? window.firebaseService.generateSPN() : `SPN-${Math.floor(100000 + Math.random() * 900000)}`);

    const candidate = {
      id,
      serviceProviderNumber: spn,
      businessId: "itsasimplejob",
      policeChecked: true,
      lat: newCand.lat || -28.0024,
      lng: newCand.lng || 153.4310,
      ...newCand
    };

    this.candidates.unshift(candidate);
    this.save();

    if (window.firebaseService?.saveCandidateToFirestore) {
      window.firebaseService.saveCandidateToFirestore(candidate);
    }

    return candidate;
  }

  search({ keyword = '', location = '', category = 'all', shiftType = 'all' }) {
    const kw = keyword.toLowerCase().trim();
    const loc = location.toLowerCase().trim();

    return this.candidates.filter(c => {
      // Keyword match across skills, title, bio, tools, tickets
      if (kw) {
        const searchableText = [
          c.name,
          c.tradeTitle,
          c.category,
          c.resumeSummary,
          ...(c.keyTerms || []),
          ...(c.licenses || []),
          ...(c.fullResume?.tickets || []),
          c.fullResume?.education || '',
          c.fullResume?.toolsOwned || ''
        ].join(' ').toLowerCase();

        const match = kw.split(' ').some(term => term.length > 2 && searchableText.includes(term));
        if (!match && !searchableText.includes(kw)) {
          return false;
        }
      }

      // Location match
      if (loc) {
        const candLoc = (c.suburb + ' ' + (c.postcode || '')).toLowerCase();
        if (!candLoc.includes(loc) && !loc.includes(c.suburb.toLowerCase())) {
          return false;
        }
      }

      // Category match
      if (category && category !== 'all' && c.category !== category) {
        return false;
      }

      // 24/7 or shift match
      if (shiftType && shiftType !== 'all') {
        if (shiftType === '24_7' && !c.workingHours?.is24_7) {
          return false;
        }
      }

      return true;
    });
  }
}

// Global instances
window.INITIAL_PROVIDERS = INITIAL_PROVIDERS;
window.INITIAL_CANDIDATES = INITIAL_CANDIDATES;
window.providerDB = new ProviderDatabase();
window.candidateDB = new CandidateDatabase();
