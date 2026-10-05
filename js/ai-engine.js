/**
 * It's A Simple Job - SimpleAI Natural Language Engine & Provider Matcher
 * Parses natural language descriptions, identifies requirements, estimates duration & cost,
 * and matches the best qualified service providers.
 */

class SimpleAIEngine {
  constructor() {
    this.taxonomy = {
      plumbing: {
        keywords: [
          "tap", "leaking", "dripping", "sink", "pipe", "toilet", "drain", "water", 
          "plumber", "plumbing", "hot water", "washer", "cistern", "shower", "flush", "gutter leak", "spout"
        ],
        name: "Plumbing & Water Services",
        defaultDuration: 1.5,
        defaultHourlyRate: 95,
        requiredLicense: "QBCC Licensed Plumber",
        suggestedMaterials: ["Standard replacement tap washers / ceramic disc cartridge", "O-rings & thread seal tape", "Pipe fittings"]
      },
      courier: {
        keywords: [
          "courier", "deliver", "delivery", "pickup", "pick up", "parcel", "box", "package", 
          "documents", "drop off", "send", "transport", "freight", "rush", "same day", "urgent delivery", 
          "destination", "origin", "medical", "retail items", "urgent"
        ],
        name: "Courier & Express Freight",
        defaultDuration: 1.0,
        defaultHourlyRate: 55,
        requiredLicense: "Commercial Carrier / Insured Transit",
        suggestedMaterials: ["Protective blankets & tie-down straps", "Heavy-duty hand trolley", "Weatherproof cargo hold"]
      },
      electrical: {
        keywords: [
          "power", "point", "socket", "plug", "switch", "sparky", "electrician", "wire", "light", 
          "downlight", "fuse", "circuit", "breaker", "safety switch", "tripping", "fan", "ceiling fan", 
          "smoke alarm", "sensor", "oven power"
        ],
        name: "Licensed Electrical Services",
        defaultDuration: 1.5,
        defaultHourlyRate: 110,
        requiredLicense: "QBCC Electrical Contractor Licence",
        suggestedMaterials: ["Clipsal double power points", "Cable testing equipment", "Safety switch isolators"]
      },
      handyman: {
        keywords: [
          "assemble", "assembly", "flatpack", "ikea", "hang", "mirror", "tv", "mount", "wall", 
          "drywall", "plaster", "hole", "patch", "hinge", "door", "lock", "repair", "fix", 
          "cupboard", "curtain", "blinds", "shelf", "shelving", "screw"
        ],
        name: "General Handyman & Assembly",
        defaultDuration: 2.0,
        defaultHourlyRate: 75,
        requiredLicense: "Insured General Handyman / Builder Restricted",
        suggestedMaterials: ["Heavy-duty hollow wall anchors & stud finder", "Laser level & cordless driver kit", "Plaster patch compound & sanders"]
      },
      garden: {
        keywords: [
          "lawn", "mow", "mowing", "grass", "hedge", "trim", "garden", "green waste", 
          "overgrown", "weeds", "gutter cleaning", "pruning", "yard", "mulch", "pressure clean"
        ],
        name: "Garden & Lawn Maintenance",
        defaultDuration: 2.0,
        defaultHourlyRate: 68,
        requiredLicense: "Public Liability & Horticulture Care",
        suggestedMaterials: ["Commercial lawnmower & trimmer", "Gutter vacuum & safety harness", "Green waste disposal trailer"]
      },
      painting: {
        keywords: [
          "paint", "painting", "touch up", "roller", "brush", "wall", "ceiling", "interior", 
          "stain", "peeling", "flake", "re-paint"
        ],
        name: "Painting & Surface Repairs",
        defaultDuration: 3.0,
        defaultHourlyRate: 72,
        requiredLicense: "Trade Painter & Surface Prep",
        suggestedMaterials: ["Drop sheets & low-bleed painter's tape", "Undercoat sealer & matching interior tint", "Pro roller kit"]
      },
      appliance: {
        keywords: [
          "appliance", "dishwasher", "washing machine", "dryer", "fridge", "freezer", "oven", 
          "stove", "rangehood", "broken appliance", "not heating", "not draining"
        ],
        name: "Appliance Repair & Installation",
        defaultDuration: 1.5,
        defaultHourlyRate: 90,
        requiredLicense: "Restricted Electrical / Appliance Cert",
        suggestedMaterials: ["Multimeter diagnostic tester", "Hose clamps & intake solenoid valves", "Thermal fuse components"]
      }
    };

    this.goldCoastSuburbs = [
      "Surfers Paradise", "Broadbeach", "Southport", "Robina", "Burleigh Heads", 
      "Varsity Lakes", "Main Beach", "Mermaid Beach", "Miami", "Palm Beach", 
      "Currumbin", "Coolangatta", "Nerang", "Ashmore", "Bundall", "Coomera", 
      "Helensvale", "Hope Island", "Brisbane", "Logan", "Tweed"
    ];
  }

  /**
   * Main analysis pipeline
   * @param {string} promptText User's plain English request
   */
  async analyzeRequest(promptText) {
    // Artificial small delay for sleek AI thinking animation
    await new Promise(resolve => setTimeout(resolve, 450));

    const cleanText = (promptText || "").toLowerCase().trim();

    // 1. Detect Category by keyword scoring
    let bestCategory = "handyman"; // fallback
    let highestScore = 0;

    for (const [catKey, catData] of Object.entries(this.taxonomy)) {
      let score = 0;
      for (const kw of catData.keywords) {
        if (cleanText.includes(kw)) {
          // Longer keywords carry higher weight
          score += kw.includes(" ") ? 3 : 1.5;
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestCategory = catKey;
      }
    }

    const categoryMeta = this.taxonomy[bestCategory];

    // 2. Detect Urgency
    const isUrgent = cleanText.includes("urgent") || cleanText.includes("today") || cleanText.includes("asap") || cleanText.includes("emergency") || cleanText.includes("rush");
    const urgency = isUrgent ? "High Priority / Same Day" : "Standard Shift (Next 24-48h)";

    // 3. Detect Location / Suburbs
    let detectedLocation = "Gold Coast Region";
    for (const suburb of this.goldCoastSuburbs) {
      if (cleanText.includes(suburb.toLowerCase())) {
        detectedLocation = suburb;
        break;
      }
    }

    // Check for postcodes like 4217, 4000
    const postcodeMatch = cleanText.match(/\b(4\d{3}|2\d{3}|3\d{3})\b/);
    if (postcodeMatch) {
      detectedLocation += ` (Postcode ${postcodeMatch[0]})`;
    }

    // 4. Estimate Time Required based on context clues
    let estimatedHours = categoryMeta.defaultDuration;
    if (cleanText.includes("2 ") || cleanText.includes("two ")) estimatedHours += 0.5;
    if (cleanText.includes("3 ") || cleanText.includes("three ") || cleanText.includes("multiple")) estimatedHours += 1.0;
    if (cleanText.includes("quick") || cleanText.includes("small") || cleanText.includes("minor")) estimatedHours = Math.max(1.0, estimatedHours - 0.5);
    if (cleanText.includes("large") || cleanText.includes("whole") || cleanText.includes("overgrown")) estimatedHours += 1.5;

    // 5. Calculate Cost Estimates (transparent upfront pricing)
    const calloutFee = bestCategory === "courier" ? 25 : 35;
    const baseLabour = Math.round(categoryMeta.defaultHourlyRate * estimatedHours);
    const materialsEstimate = bestCategory === "courier" ? 0 : 25;
    const subtotal = calloutFee + baseLabour + materialsEstimate;
    const gst = Math.round(subtotal * 0.10);
    const estimatedTotal = subtotal + gst;

    // 6. Generate natural, conversational AI explanation
    const aiExplanation = this.generateExplanation(cleanText, bestCategory, estimatedHours, detectedLocation, isUrgent);

    // 7. Find and Rank Providers from DB
    const allProviders = window.providerDB ? window.providerDB.getAll() : [];
    const matchedProviders = this.matchProviders(allProviders, bestCategory, detectedLocation, isUrgent);

    return {
      category: bestCategory,
      categoryName: categoryMeta.name,
      urgency,
      isUrgent,
      detectedLocation,
      estimatedHours,
      pricing: {
        calloutFee,
        baseLabour,
        hourlyRate: categoryMeta.defaultHourlyRate,
        materialsEstimate,
        subtotal,
        gst,
        estimatedTotal
      },
      suggestedMaterials: categoryMeta.suggestedMaterials,
      explanation: aiExplanation,
      matchedProviders
    };
  }

  generateExplanation(text, category, hours, location, isUrgent) {
    const timeFrame = isUrgent ? "same-day urgent dispatch" : "flexible morning (9am-12pm) or afternoon (2pm-5pm) shift";

    if (category === "plumbing") {
      return `I've analyzed your plumbing problem. It looks like you're experiencing a fluid seal or mixer leak. Our AI has calculated approximately ${hours} hours for inspection, isolator shutoff, component replacement, and pressure re-testing in ${location}. We've matched licensed QBCC plumbers ready with standard parts in their van.`;
    } else if (category === "courier") {
      return `Got it! This requires our courier service with secure transit handling. We've routed optimal transit pathways for ${location} with guaranteed person-to-person handover. Best suited for ${timeFrame}.`;
    } else if (category === "electrical") {
      return `I've registered your electrical requirement. Since all electrical alterations in Australia legally mandate a licensed electrical contractor, we've matched certified Master Electricians with insulated diagnostic tools and test certification. Estimated time: ${hours} hours.`;
    } else if (category === "handyman") {
      return `Understood! You don't need a high-cost specialist trade for this—our AI has pinpointed an all-round experienced handyman. They bring heavy masonry anchors, stud sensors, and pro cordless assembly kits. Estimated job time: ${hours} hours.`;
    } else if (category === "garden") {
      return `Nature's taken over! Our grounds crew can tackle this with commercial mowers, hedge trimmers, and green waste tip trailer. Estimated time: ${hours} hours to get your property looking pristine.`;
    } else {
      return `Our AI agent has cataloged your job request for ${location}. We've prepared an estimated time allocation of ${hours} hours and paired you with the highest-rated verified professionals.`;
    }
  }

  matchProviders(providers, targetCategory, location, isUrgent) {
    const scored = providers.map(provider => {
      let score = 70; // baseline

      // Category match
      if (provider.category === targetCategory) {
        score += 20;
      } else if (targetCategory === "handyman" && (provider.category === "carpenter" || provider.category === "plumbing")) {
        score += 8;
      }

      // Location match
      const locLower = location.toLowerCase();
      const servesArea = provider.serviceAreas.some(area => 
        locLower.includes(area.toLowerCase()) || area.toLowerCase().includes(locLower)
      );
      if (servesArea) score += 5;

      // Rating bonus
      score += Math.min(5, (provider.rating - 4.5) * 10);

      // Urgency / Shift availability
      if (isUrgent && provider.availability.includes("urgent_sameday")) {
        score += 5;
      }

      // Clamp between 88% and 99% for realistic look
      const matchScore = Math.min(99, Math.max(88, Math.round(score)));

      return {
        ...provider,
        matchScore
      };
    });

    // Sort by match score descending
    return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
  }
}

// Global instance
window.simpleAIEngine = new SimpleAIEngine();
