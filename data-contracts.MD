# Data Contracts — It's A Simple Job
**Author:** AI Foundation Architecture Team  
**Standards:** Strict JSON Schema / Zod Schemas (`additionalProperties: false`), Australian Privacy Act 1988 (APPs), ATO Tax Invoicing & Stripe Integer-Cent Compliance.  
**Last Updated:** November 2026

---

## 1. Compliance & Security Directives

1. **Australian Privacy Act 1988 & APPs (Australian Privacy Principles):**
   - Personal Identifiable Information (PII) like full names, mobile numbers, and personal IDs must only be collected with explicit consent for booking fulfillment or identity verification.
   - All Australian phone numbers must be sanitized and validated using the standard Australian mobile regex: `^(?:\+?61|0)[4-5]\d{8}$`.
   - Business ABNs must match ATO 11-digit format: `^\d{11}$`.
   - Banking BSBs must match Australian format: `^\d{3}-?\d{3}$`.

2. **Strict Schema Validation:**
   - Every contract prohibits unexpected fields via `additionalProperties: false`.
   - Zero hardcoded credentials or client-side secret exposure.

3. **Token Economy & Currency Integrity:**
   - **Australian Dollars for everything.** Every price, quote, invoice and payment is in AUD (`BASE_CURRENCY = 'AUD'`). Stripe always charges in `aud`.
   - **Whole numbers only — never decimals.** Every token amount, AUD amount, GST amount, billable hour and billable km is a whole number. Every calculated value is **rounded up** with `wholeUp()` (`shared/pricing.js`), which strips floating-point noise before `Math.ceil` (so `150 * 0.1` gives `15`, not `16`).
   - **Exception — USD conversions: 2 decimal places maximum.** `convertAudToUsd(aud, audToUsd)` rounds **up to the next cent** with `roundUpToCents()` (e.g. A$98 × 0.70246 = 68.841 → `68.85`) and is displayed with exactly 2 decimals (`≈ $68.85 USD`). USD is display-only; the AUD amount is always what is charged.
   - **Tokens.** 1 token = `tokenPriceAud` AUD (default **A$1**). The superadmin sets the token amount for every service and product sold, and the token price, in the price list (`platform_settings/pricing`, Section 6.6).
   - **Stripe amounts** are whole dollars expressed in cents (e.g. \$10 AUD = `1000`); the cents part is always `00`.
   - **Region & display currency.** Geolocation sets the default region (Section 2.2). Australia (`AU`) and New Zealand (`NZ`) see AUD. All other regions see an approximate USD conversion (AUD → USD daily live rate), but are still invoiced and charged in AUD.
   - **Disclaimers.** Every invoice, estimate, checkout and token wallet shows that all invoices are in AUD (`iasjCurrency.disclaimerHtml()`). Terms of Service: `/terms.html` (`#tokens`, `#currency`).
   - **GST.** 10% of the AUD subtotal, rounded up, on every invoice regardless of the viewer's region (Australian tax invoice).
   - Single source of truth: `shared/pricing.js` (imported by both the browser bundle and the `/api` functions).

---

## 2. Geolocation, Regional & Time Settings Contract

### 2.1 Regional & Geolocation State (`geoTimeState`)
Stored locally in `localStorage['iasj_regional_settings']` and synchronized across the thin footer bar and settings modal.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "GeoTimeStateContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "country",
    "suburb",
    "coords",
    "timeFormat",
    "dateFormat",
    "timezone",
    "tempUnit"
  ],
  "properties": {
    "country": {
      "type": "string",
      "enum": ["AU", "NZ", "US", "GB", "CA", "IE", "SG"],
      "description": "ISO 3166-1 alpha-2 country code auto-detected from geolocation or selected by user"
    },
    "suburb": {
      "type": "string",
      "minLength": 2,
      "maxLength": 120,
      "description": "Current suburb, city, and state"
    },
    "coords": {
      "type": "object",
      "additionalProperties": false,
      "required": ["lat", "lng"],
      "properties": {
        "lat": { "type": "number", "minimum": -90, "maximum": 90 },
        "lng": { "type": "number", "minimum": -180, "maximum": 180 }
      }
    },
    "timeFormat": {
      "type": "string",
      "enum": ["12h", "24h"],
      "default": "12h"
    },
    "dateFormat": {
      "type": "string",
      "enum": ["DD/MM/YYYY", "DD MMM YYYY", "MM/DD/YYYY", "YYYY-MM-DD"],
      "default": "DD/MM/YYYY"
    },
    "timezone": {
      "type": "string",
      "pattern": "^[A-Za-z_]+/[A-Za-z_]+$",
      "default": "Australia/Brisbane"
    },
    "tempUnit": {
      "type": "string",
      "enum": ["C", "F"],
      "default": "C"
    },
    "weather": {
      "type": "string",
      "description": "Cached human-readable weather label (e.g., 22°C Clear)"
    },
    "weatherIcon": {
      "type": "string",
      "pattern": "^fa-[a-z0-9-]+$"
    },
    "weatherLoaded": {
      "type": "boolean"
    }
  }
}
```

### 2.2 Default Region Resolution (Geolocation)
The visitor's region drives the display currency (`window.iasjCurrency.setCountry`). Precedence, highest first:

| Source | `countrySource` | Where it comes from |
| :--- | :--- | :--- |
| Visitor's saved choice | `saved` | Regional settings modal (`iasj_regional_settings` / `iasj_user_country`) |
| GPS / address reverse geocode | `gps` | Nominatim reverse geocode of the device location (also persisted to `iasj_user_country`) |
| IP geolocation | `ip` | `GET /api/pricing` → `country` (Vercel `x-vercel-ip-country`; `DEV_COUNTRY` locally) |
| Device time zone | `timezone` | `Intl.DateTimeFormat().resolvedOptions().timeZone` heuristic |
| Fallback | `default` | `AU` |

`AU` and `NZ` → display `AUD`; any other ISO 3166-1 alpha-2 code → display `USD` conversion.

---

## 3. OpenStreetMap (OSM) Address Autocomplete & Reverse Geocoding Contract

### 3.1 Normalized Address Object
Emitted by `formatOsmAddress(item)` when selecting an address from the front page autocomplete dropdown.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NormalizedOsmAddressContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["title", "subtitle", "formatted", "lat", "lng"],
  "properties": {
    "title": {
      "type": "string",
      "description": "Primary street address or landmark (e.g. 42 Surf Parade)"
    },
    "subtitle": {
      "type": "string",
      "description": "Locality, state, and postcode (e.g. Broadbeach QLD 4218, Australia)"
    },
    "formatted": {
      "type": "string",
      "description": "Complete standardized single-line address"
    },
    "lat": {
      "type": ["number", "null"],
      "minimum": -90,
      "maximum": 90
    },
    "lng": {
      "type": ["number", "null"],
      "minimum": -180,
      "maximum": 180
    }
  }
}
```

### 3.2 Connected Address Input Bindings Contract
All interactive location inputs are bound to the OpenStreetMap engine with live validation, status badges, and deterministic callbacks:

| Input ID | Label | Purpose | Selection Callback |
| :--- | :--- | :--- | :--- |
| `cust-address` | Job Address (Gold Coast / Australia) | Front-page instant booking address | Updates `appState.userCoords` & matches local providers |
| `courier-origin` | Pickup Origin | Courier dispatch origin location | Recalculates courier route distance, speed, and token quote |
| `courier-dest` | Delivery Destination | Courier dropoff destination location | Recalculates courier route distance, speed, and token quote |
| `contractor-search-location` | Search Location | Directory map search & filtering | Centers map & filters local trades within chosen radius |
| `inline-cust-address` | Primary Street Address & Suburb | Customer application & verification | Validates address and populates customer profile |

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ConnectedOsmInputBindingContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["inputId", "engine", "isLive", "hasGpsAction", "countryRestriction"],
  "properties": {
    "inputId": {
      "type": "string",
      "enum": [
        "cust-address",
        "courier-origin",
        "courier-dest",
        "contractor-search-location",
        "inline-cust-address"
      ]
    },
    "engine": {
      "type": "string",
      "enum": ["photon_osm", "nominatim_osm"]
    },
    "isLive": {
      "type": "boolean",
      "enum": [true]
    },
    "hasGpsAction": {
      "type": "boolean"
    },
    "countryRestriction": {
      "type": "string",
      "enum": ["AU"]
    }
  }
}
```

### 3.3 Leaflet OpenStreetMap Interactive Map Engine Contract
The application defaults to an ultra-reliable, zero-key Leaflet OpenStreetMap engine to prevent Google Maps `ApiTargetBlockedMapError` and gray canvas failures.

| Container ID | Map Type | Default Center | Features |
| :--- | :--- | :--- | :--- |
| `contractor-map` | Directory Map | Gold Coast (-28.0280, 153.4312) | User pin pulse dot, trade pins with category icons, popup contractor cards, radius filtering |
| `courier-route-map` | Route Map | Centered between Origin/Dest | Green pickup pin, red destination pin, brand-orange dashed polyline |

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LeafletOsmMapEngineContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "mapContainerId",
    "engine",
    "tileUrl",
    "centerLat",
    "centerLng",
    "zoomLevel",
    "hasInteractivePins"
  ],
  "properties": {
    "mapContainerId": {
      "type": "string",
      "enum": ["contractor-map", "courier-route-map"]
    },
    "engine": {
      "type": "string",
      "enum": ["leaflet_osm"]
    },
    "tileUrl": {
      "type": "string",
      "enum": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]
    },
    "centerLat": {
      "type": "number"
    },
    "centerLng": {
      "type": "number"
    },
    "zoomLevel": {
      "type": "integer",
      "minimum": 1,
      "maximum": 19
    },
    "hasInteractivePins": {
      "type": "boolean"
    }
  }
}
```

### 10.2 SuperAdmin Distance Tier Token Costs & Token Pricing Contract
- **SuperAdmin Authority**: Token price and distance tier token costs per order are set **ONLY by SuperAdmin**.
- **Real-Time SuperAdmin Editing**: SuperAdmin can edit token price (`tokenPriceAud`) and all 4 distance tier token costs (`tier0to20km`, `tier21to50km`, `tier51to100km`, `tier101PlusKm`) at any time from the SuperAdmin console.
- **Persistence**: Edits are persisted immediately to the Firestore database under `platform_settings/pricing` and synced across all client instances.
- **Immediate Effect on Driver Token Top-Ups**: Changing the token price immediately recalculates all driver token top-up packs (10, 50, 100 Tokens @ `$tokenPriceAud` AUD/token) and the distance token charges deducted from drivers when customer orders are placed.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SuperAdminTokenPricingAndDistanceTiersContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["tokenPriceAud", "driverOrderTokens", "updatedBy", "updatedAt"],
  "properties": {
    "tokenPriceAud": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000,
      "description": "AUD price of 1 token, set strictly by SuperAdmin (default 1)"
    },
    "driverOrderTokens": {
      "type": "object",
      "additionalProperties": false,
      "required": ["tier0to20km", "tier21to50km", "tier51to100km", "tier101PlusKm"],
      "properties": {
        "tier0to20km": { "type": "integer", "minimum": 1, "maximum": 1000 },
        "tier21to50km": { "type": "integer", "minimum": 1, "maximum": 1000 },
        "tier51to100km": { "type": "integer", "minimum": 1, "maximum": 1000 },
        "tier101PlusKm": { "type": "integer", "minimum": 1, "maximum": 1000 }
      }
    },
    "tokenPacks": {
      "type": "array",
      "items": { "type": "integer", "enum": [10, 50, 100] }
    },
    "updatedBy": { "type": "string", "format": "email" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```

---

### 3.4 Universal Mobile (Android/iOS) Leaflet & Touch Autocomplete Contract
Enforces zero-latency touch event bindings, ResizeObserver responsiveness, and fluid mobile geometry across Android Chrome, Samsung Internet, and iOS Safari.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "UniversalMobileLeafletTouchContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "touchEventsSupported",
    "resizeObserverActive",
    "multiIntervalInvalidation",
    "insecureOriginGpsFallback",
    "aiPromptAddressAutomation"
  ],
  "properties": {
    "touchEventsSupported": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["pointerdown", "touchstart", "mousedown", "click"]
      },
      "description": "Deterministic event matrix preventing blur-cancel on Android virtual keyboards"
    },
    "resizeObserverActive": {
      "type": "boolean",
      "enum": [true],
      "description": "ResizeObserver attached to container to force map invalidation on mobile tab display"
    },
    "multiIntervalInvalidation": {
      "type": "array",
      "items": { "type": "integer" },
      "description": "Array of millisecond delays [50, 150, 400] for post-tab-switch Leaflet tile recomputation"
    },
    "insecureOriginGpsFallback": {
      "type": "boolean",
      "enum": [true],
      "description": "Provides fallback location when navigator.geolocation is restricted on HTTP non-secure origins"
    },
    "aiPromptAddressAutomation": {
      "type": "boolean",
      "enum": [true],
      "description": "Automatically populates cust-address or courier-origin/dest from NLP prompt analysis"
    }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

## 4. UI Booking & Dispatch Contracts

### 4.1 Front Page Job Booking Contract (`confirmBooking`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CustomerJobBookingContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "custName",
    "custPhone",
    "custAddress",
    "tradeCategory",
    "shiftType",
    "businessId"
  ],
  "properties": {
    "custName": {
      "type": "string",
      "minLength": 2,
      "maxLength": 100,
      "pattern": "^[\\p{L} .'-]+$"
    },
    "custPhone": {
      "type": "string",
      "pattern": "^(?:\\+?61|0)[4-5]\\d{8}$",
      "description": "Australian mobile number for automated SMS arrival and docket updates"
    },
    "custAddress": {
      "type": "string",
      "minLength": 5,
      "maxLength": 250
    },
    "custNotes": {
      "type": "string",
      "maxLength": 500
    },
    "tradeCategory": {
      "type": "string",
      "enum": [
        "plumbing",
        "electrical",
        "carpentry",
        "handyman",
        "painting",
        "landscaping",
        "courier",
        "cleaning",
        "roofing",
        "tiling",
        "locksmith",
        "appliance"
      ]
    },
    "shiftType": {
      "type": "string",
      "enum": ["standard", "urgent_hotshot", "emergency_after_hours"]
    },
    "jobPhotos": {
      "type": "array",
      "items": { "type": "string", "format": "uri" },
      "maxItems": 10
    },
    "businessId": {
      "type": "string",
      "const": "its-a-simple-job"
    }
  }
}
```

### 4.2 Courier Route & Quote Contract (`calculateCourierQuote`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CourierRoutePricingContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "origin",
    "dest",
    "weightKg",
    "isAsap",
    "asapSurchargePct",
    "extraKmSurchargePct",
    "distanceKm",
    "totalTokens",
    "totalAud",
    "totalFiat",
    "fiatCurrency"
  ],
  "properties": {
    "origin": { "type": "string", "minLength": 3 },
    "dest": { "type": "string", "minLength": 3 },
    "weightKg": {
      "type": "integer",
      "minimum": 1,
      "maximum": 20,
      "description": "Standard parcel weight capped at 20kg (MAX_COURIER_WEIGHT_KG)"
    },
    "isAsap": { "type": "boolean" },
    "asapSurchargePct": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100,
      "description": "Superadmin price list courier.asapSurchargePct (+10%, +20%, +30% etc.)"
    },
    "extraKmSurchargePct": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100,
      "description": "Superadmin price list courier.extraKmSurchargePct, applied to each km beyond courier.includedKm (default 20 km)"
    },
    "distanceKm": {
      "type": "integer",
      "minimum": 1,
      "description": "Road distance rounded UP to whole km"
    },
    "totalTokens": {
      "type": "integer",
      "minimum": 1,
      "description": "Whole tokens, rounded up: ceil(totalAud / tokenPriceAud)"
    },
    "totalAud": {
      "type": "integer",
      "minimum": 1,
      "description": "Invoice total in whole AUD including GST (always charged in AUD)"
    },
    "totalFiat": {
      "type": "number",
      "minimum": 0.01,
      "multipleOf": 0.01,
      "description": "Display amount: totalAud (whole) for AU/NZ, otherwise convertAudToUsd(totalAud, audToUsd) (2 decimal places maximum, rounded up to the cent)"
    },
    "fiatCurrency": {
      "type": "string",
      "enum": ["AUD", "USD"],
      "description": "Display currency only: AUD for Australia and New Zealand via geolocation; USD conversion for all other regions"
    }
  }
}
```

Pricing (`priceCourier` in `shared/pricing.js`): `base = courier.baseLoading`; `distance = standardKm × perKm + ceil(extraKm × perKm × (100 + extraKmSurchargePct) / 100)`; `asap = ceil((base + distance) × asapSurchargePct / 100)`; `gst = ceil(subtotalAud × 10 / 100)`. GST applies regardless of the viewer's region.

### 4.3 Booking Pricing Object (`booking.pricing`)
Produced by `priceJob` / `priceCategoryJob` / `priceCourier` and saved with every booking. All amounts are whole AUD; `tokens` mirrors them in whole tokens.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BookingPricingContract",
  "type": "object",
  "required": ["currency", "tokenPriceAud", "gstPercent", "lines", "subtotal", "gst", "estimatedTotal", "tokens", "calloutFee", "baseLabour", "materialsEstimate"],
  "properties": {
    "currency": { "type": "string", "const": "AUD" },
    "tokenPriceAud": { "type": "integer", "minimum": 1 },
    "gstPercent": { "type": "integer", "const": 10 },
    "hours": { "type": "integer", "minimum": 1, "description": "Billable hours, rounded up (trade jobs)" },
    "hourlyRate": { "type": "integer", "minimum": 1, "description": "AUD per hour (trade jobs)" },
    "lines": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["key", "label", "tokens", "aud"],
        "properties": {
          "key": { "type": "string", "enum": ["labour", "callout", "materials", "base", "distance", "asap"] },
          "label": { "type": "string" },
          "tokens": { "type": "integer", "minimum": 0 },
          "aud": { "type": "integer", "minimum": 0 }
        }
      }
    },
    "subtotal": { "type": "integer", "minimum": 0 },
    "gst": { "type": "integer", "minimum": 0, "description": "ceil(subtotal × 10 / 100)" },
    "estimatedTotal": { "type": "integer", "minimum": 1, "description": "subtotal + gst, whole AUD; the amount charged by Stripe" },
    "calloutFee": { "type": "integer", "minimum": 0 },
    "baseLabour": { "type": "integer", "minimum": 0 },
    "materialsEstimate": { "type": "integer", "minimum": 0 },
    "tokens": {
      "type": "object",
      "required": ["subtotal", "gst", "estimatedTotal"],
      "properties": {
        "subtotal": { "type": "integer" },
        "gst": { "type": "integer" },
        "estimatedTotal": { "type": "integer", "description": "ceil(estimatedTotal / tokenPriceAud)" }
      }
    }
  }
}
```

Bookings saved before November 2026 may hold cents (e.g. `222.75`). `getInvoiceTotals()` rounds each line up, recalculates GST and uses that whole-dollar total for the invoice, dispatch feed and Stripe charge.

---

## 5. API Serverless Endpoints Data Contracts

### 5.1 `GET /api/me`
Returns the authenticated Firebase user profile, verified role, and superadmin status.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiMeResponseContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["authenticated"],
  "properties": {
    "authenticated": { "type": "boolean" },
    "uid": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "role": {
      "type": "string",
      "enum": ["customer", "provider", "franchise_admin", "superadmin"]
    },
    "isSuperAdmin": { "type": "boolean" },
    "allowedRoles": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["customer", "provider", "franchise_admin", "superadmin"]
      }
    }
  }
}
```

### 5.2 `GET /api/token-quote?tokens=&currency=`
Prices tokens in whole AUD (`tokens × tokenPriceAud`). Tokens are always charged in AUD; `usdEstimate` is a display-only conversion. Without `tokens`, returns the superadmin's token packs. Non-integer `tokens` → `400`.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiTokenQuoteResponseContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["country", "chargeCurrency", "displayCurrency", "defaultDisplayCurrency", "tokenPriceAud", "audToUsd", "quotes"],
  "properties": {
    "country": { "type": "string", "pattern": "^[A-Z]{2}$" },
    "chargeCurrency": { "type": "string", "const": "AUD" },
    "displayCurrency": { "type": "string", "enum": ["AUD", "USD"] },
    "defaultDisplayCurrency": { "type": "string", "enum": ["AUD", "USD"], "description": "AUD for AU/NZ by IP country, otherwise USD" },
    "tokenPriceAud": { "type": "integer", "minimum": 1 },
    "audToUsd": { "type": "number", "exclusiveMinimum": 0, "description": "Daily AUD -> USD rate (frankfurter.dev ECB, then open.er-api.com, then FX_FALLBACK_AUD_USD)" },
    "fxDate": { "type": ["string", "null"] },
    "fxSource": { "type": ["string", "null"] },
    "quotes": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["tokens", "totalAud", "totalCents", "usdEstimate"],
        "properties": {
          "tokens": { "type": "integer", "minimum": 1, "maximum": 10000 },
          "totalAud": { "type": "integer", "minimum": 1 },
          "totalCents": { "type": "integer", "minimum": 100, "description": "totalAud × 100" },
          "usdEstimate": { "type": "number", "minimum": 0.01, "multipleOf": 0.01, "description": "convertAudToUsd(totalAud, audToUsd): 2 decimal places maximum, rounded up to the cent; display only" }
        }
      }
    }
  }
}
```

### 5.3 `POST /api/token-purchase`
Starts a Stripe PaymentIntent for a token purchase. Always charged in AUD.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiTokenPurchaseRequestContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["tokens", "purchaseId"],
  "properties": {
    "tokens": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10000,
      "description": "Whole tokens only"
    },
    "purchaseId": {
      "type": "string",
      "pattern": "^[A-Za-z0-9-]{8,64}$"
    }
  }
}
```

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiTokenPurchaseResponseContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["paymentIntentId", "clientSecret", "tokens", "totalAud", "currency", "usdEstimate", "audToUsd"],
  "properties": {
    "paymentIntentId": { "type": "string", "pattern": "^pi_" },
    "clientSecret": { "type": "string" },
    "tokens": { "type": "integer", "minimum": 1 },
    "totalAud": { "type": "integer", "minimum": 1 },
    "currency": { "type": "string", "const": "AUD" },
    "usdEstimate": { "type": "number", "minimum": 0.01, "multipleOf": 0.01, "description": "Display only; 2 decimal places maximum, rounded up to the cent" },
    "audToUsd": { "type": "number", "exclusiveMinimum": 0 }
  }
}
```

Pending purchase record (`wallets/{uid}/purchases/{paymentIntentId}`): `{ uid, email, tokens, amountCents, currency: 'AUD', tokenPriceAud, purchaseId, status, createdAt, updatedAt }`.

### 5.4 `GET /api/wallet`
Retrieves a user's ledgered token balance and transaction history.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiWalletResponseContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["userId", "balance", "transactions"],
  "properties": {
    "userId": { "type": "string" },
    "balance": {
      "type": "integer",
      "minimum": 0,
      "description": "Strict integer token balance (Math.round)"
    },
    "transactions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "type", "amount", "timestamp"],
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string", "enum": ["purchase", "spend", "refund", "grant"] },
          "amount": { "type": "integer" },
          "description": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
}
```

### 5.5 `GET /api/pricing` and `PUT /api/pricing`
`GET` is public: the visitor's IP region, display currency, live AUD → USD rate and the superadmin price list. `PUT` requires a Firebase ID token for a verified superadmin email (`SUPERADMIN_EMAILS`) and the full price list (Section 6.6); every value is rounded up to a whole number and range-checked, and the first error is returned with `400`.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiPricingResponseContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["country", "isAudRegion", "displayCurrency", "baseCurrency", "gstPercent", "audToUsd", "pricing"],
  "properties": {
    "country": { "type": "string", "pattern": "^[A-Z]{2}$", "description": "x-vercel-ip-country (DEV_COUNTRY locally)" },
    "isAudRegion": { "type": "boolean", "description": "true for AU and NZ" },
    "displayCurrency": { "type": "string", "enum": ["AUD", "USD"] },
    "baseCurrency": { "type": "string", "const": "AUD" },
    "gstPercent": { "type": "integer", "const": 10 },
    "audToUsd": { "type": "number", "exclusiveMinimum": 0 },
    "fxDate": { "type": ["string", "null"] },
    "fxSource": { "type": ["string", "null"] },
    "pricing": { "$ref": "#/definitions/SuperadminPriceListContract" },
    "pricingUpdatedAt": { "type": ["string", "null"], "format": "date-time" }
  }
}
```

`PUT` responses: `200 { pricing, updatedAt }`, `400 { error, errors[] }`, `401` not signed in, `403` not a superadmin, `503` Firestore not configured.

### 5.6 `GET / POST / PATCH /api/messages` (Admin Page > Messages)
All methods require `Authorization: Bearer <Firebase ID token>`. Superadmins (verified `SUPERADMIN_EMAILS`) use the shared `superadmin` mailbox; everyone else uses their own. `401` signed out, `503` Firestore not configured.

- `GET ?folder=inbox|sent` → up to 50 newest messages, unread count and the price of a message to another user.
- `POST` → send. **Messages to the superadmin are free** (`to: 'superadmin'`, or any `SUPERADMIN_EMAILS` address, which is routed to the shared superadmin inbox), and so are the superadmin's own messages. Messages to other users cost `fees.message` tokens (Section 6.6), taken from the sender's wallet in the same transaction that delivers the message. Errors: `400` validation / messaging yourself, `402` not enough tokens, `404` no user with that email, `429` more than 20 messages in 10 minutes.
- `PATCH { id }` → mark an inbox message read; returns the new unread count.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiSendMessageRequestContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["to", "subject", "body", "clientMessageId"],
  "properties": {
    "to": { "type": "string", "description": "'superadmin' or the recipient's email address" },
    "subject": { "type": "string", "minLength": 1, "maxLength": 120 },
    "body": { "type": "string", "minLength": 1, "maxLength": 2000 },
    "clientMessageId": { "type": "string", "pattern": "^[A-Za-z0-9-]{8,64}$", "description": "Reused on retry so a message is delivered and charged once" }
  }
}
```

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiMessagesListResponseContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["mailbox", "isSuperadmin", "folder", "messages", "unread", "messagePriceTokens", "tokenPriceAud"],
  "properties": {
    "mailbox": { "type": "string", "enum": ["personal", "superadmin"] },
    "isSuperadmin": { "type": "boolean" },
    "folder": { "type": "string", "enum": ["inbox", "sent"] },
    "messages": { "type": "array", "items": { "$ref": "#/definitions/MessageContract" }, "maxItems": 50 },
    "unread": { "type": "integer", "minimum": 0 },
    "messagePriceTokens": { "type": "integer", "minimum": 0, "description": "0 for superadmins; otherwise fees.message" },
    "tokenPriceAud": { "type": "integer", "minimum": 1 }
  }
}
```

Send response: `{ message, tokensCharged, free, wallet }` (`wallet` = `{ available, held }` after a paid message, otherwise `null`).

---

## 6. Superadmin Platform Configuration Contract

Controls global feature flags in Cloud Firestore (`platform_settings/global`). Prices live separately in `platform_settings/pricing` (Section 6.6) and the daily AUD → USD rate in `platform_settings/fx_aud_usd`. `isAudEnabled` / `isUsdEnabled` are legacy: the display currency now always follows the visitor's region (AUD for AU/NZ, USD conversion elsewhere) and every charge is in AUD.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PlatformSettingsContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "isTokenSystemEnabled",
    "isAudEnabled",
    "isUsdEnabled",
    "updatedAt",
    "updatedBy"
  ],
  "properties": {
    "isTokenSystemEnabled": { "type": "boolean" },
    "isAudEnabled": { "type": "boolean" },
    "isUsdEnabled": { "type": "boolean" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "updatedBy": { "type": "string", "format": "email" },
    "superadminEmails": {
      "type": "array",
      "items": { "type": "string", "format": "email" }
    }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

### 6.2 Superadmin Multi-Role Perspective Contract
Stores the active simulated role perspective for superadmins in `sessionStorage['iasj_superadmin_view_role']`.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SuperadminRolePerspectiveContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["activePerspective", "superadminEmail", "timestamp"],
  "properties": {
    "activePerspective": {
      "type": "string",
      "enum": ["superadmin", "customer", "provider", "franchise_admin"],
      "description": "Simulated UI perspective for testing all site workflows"
    },
    "superadminEmail": {
      "type": "string",
      "format": "email"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

### 6.3 Firebase Cloud Firestore Security Rules Deployment Contract
Governs live security rule deployment for database `itsasimplejob` under project `ai-foundation-firebase`.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FirestoreSecurityRulesDeploymentContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "databaseId",
    "releaseName",
    "rulesetName",
    "deployedAt",
    "deployedBy",
    "status"
  ],
  "properties": {
    "projectId": { "type": "string", "const": "ai-foundation-firebase" },
    "databaseId": { "type": "string", "const": "itsasimplejob" },
    "releaseName": { "type": "string", "const": "projects/ai-foundation-firebase/releases/cloud.firestore/itsasimplejob" },
    "rulesetName": { "type": "string" },
    "deployedAt": { "type": "string", "format": "date-time" },
    "deployedBy": { "type": "string", "format": "email" },
    "status": { "type": "string", "enum": ["ACTIVE", "DEPRECATED"] }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

### 6.4 Token Price Item Display & Currency Hover Contract
Whole tokens and whole AUD on every price; USD conversions show 2 decimal places maximum. `formatTokenItemPrice(aud)` shows tokens first with money on hover; `formatPriceWithTokenHover(aud)` shows money first with tokens on hover. Money is `$98 AUD` in AU/NZ and `≈ $68.85 USD` elsewhere (rounded up to the cent); the hover title always states that invoices are in AUD. Each tag carries `data-price-aud`, `data-price-suffix` and `data-price-format` (`token` | `price` | `fiat`) so `refreshPriceTags()` can redraw it when the region, exchange rate or price list changes (`iasjPricingChanged` event).

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TokenPriceItemDisplayContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "tokens",
    "aud",
    "displayHtml",
    "displayCurrency",
    "displayAmount",
    "isTokenSystemEnabled"
  ],
  "properties": {
    "tokens": {
      "type": "integer",
      "minimum": 0,
      "description": "Whole tokens, rounded up: ceil(aud / tokenPriceAud)"
    },
    "aud": {
      "type": "integer",
      "minimum": 0,
      "description": "Whole AUD amount (data-price-aud)"
    },
    "displayHtml": {
      "type": "string",
      "description": "HTML snippet rendering the primary value and the hover reveal"
    },
    "displayCurrency": {
      "type": "string",
      "enum": ["AUD", "USD"],
      "description": "AUD for AU/NZ, USD conversion for all other regions"
    },
    "displayAmount": {
      "type": "string",
      "pattern": "^(\\$[0-9]{1,3}(,[0-9]{3})* AUD|≈ \\$[0-9]{1,3}(,[0-9]{3})*\\.[0-9]{2} USD)(/[a-z]+)?$",
      "description": "AUD in whole dollars; USD conversion with exactly 2 decimals, rounded up to the cent. e.g. '$98 AUD/hr' or '≈ $68.85 USD/hr'"
    },
    "isTokenSystemEnabled": { "type": "boolean" }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

### 6.5 Two-Step Confirm Delete Interaction Contract
Enforces strict two-step confirmation on all interactive deletion triggers across the entire application (work orders, team members, job photos, service fee rows, franchise staff members, blackout dates, and application form drafts). Prohibits accidental destructive actions.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ConfirmDeleteActionContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "targetId",
    "targetType",
    "isConfirmed",
    "armedAt",
    "confirmedAt",
    "userRole"
  ],
  "properties": {
    "targetId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "description": "Identifier of the record or element being deleted (e.g., job ID, SPN, photo index, row index)"
    },
    "targetType": {
      "type": "string",
      "enum": [
        "work_order",
        "roster_member",
        "job_photo",
        "service_fee_row",
        "staff_member",
        "blackout_date",
        "form_draft"
      ],
      "description": "Category of entity being deleted"
    },
    "isConfirmed": {
      "type": "boolean",
      "enum": [true],
      "description": "Strictly true; destructive mutations are forbidden without prior armed confirmation"
    },
    "armedAt": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
      "description": "ISO 8601 UTC timestamp when delete confirmation was armed"
    },
    "confirmedAt": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
      "description": "ISO 8601 UTC timestamp when confirmation button was pressed"
    },
    "userRole": {
      "type": "string",
      "enum": ["customer", "provider", "franchise", "superadmin", "guest"],
      "description": "Active role or view perspective of the operator"
    },
    "label": {
      "type": "string",
      "maxLength": 60,
      "description": "User-facing label displayed on the confirmation button"
    }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

### 6.6 Superadmin Price List Contract (`platform_settings/pricing`)
The superadmin sets the token amount for every service and product sold. Edited in the **Superadmin Price List** modal (`window.openSuperadminPricing()`, from the Superadmin Mode menu or the courier rate card) and saved with `PUT /api/pricing`. Defaults and field ranges live in `shared/pricing.js` (`DEFAULT_PRICING`, `PRICING_FIELDS`). Every value is a whole number; decimals are rounded up before saving.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SuperadminPriceListContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["tokenPriceAud", "hourlyTokens", "fees", "courier", "tokenPacks"],
  "properties": {
    "tokenPriceAud": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 1, "description": "AUD price of 1 token" },
    "hourlyTokens": {
      "type": "object",
      "additionalProperties": false,
      "required": ["plumbing", "electrical", "handyman", "garden", "painting", "appliance", "courier"],
      "description": "Tokens per hour for each trade (defaults 98, 110, 75, 68, 72, 90, 55)",
      "properties": {
        "plumbing": { "type": "integer", "minimum": 1, "maximum": 5000 },
        "electrical": { "type": "integer", "minimum": 1, "maximum": 5000 },
        "handyman": { "type": "integer", "minimum": 1, "maximum": 5000 },
        "garden": { "type": "integer", "minimum": 1, "maximum": 5000 },
        "painting": { "type": "integer", "minimum": 1, "maximum": 5000 },
        "appliance": { "type": "integer", "minimum": 1, "maximum": 5000 },
        "courier": { "type": "integer", "minimum": 1, "maximum": 5000 }
      }
    },
    "fees": {
      "type": "object",
      "additionalProperties": false,
      "required": ["calloutStandard", "calloutUrgent", "calloutCourier", "materialsBuffer", "message"],
      "properties": {
        "calloutStandard": { "type": "integer", "minimum": 0, "maximum": 5000, "default": 35 },
        "calloutUrgent": { "type": "integer", "minimum": 0, "maximum": 5000, "default": 55 },
        "calloutCourier": { "type": "integer", "minimum": 0, "maximum": 5000, "default": 25 },
        "materialsBuffer": { "type": "integer", "minimum": 0, "maximum": 5000, "default": 25 },
        "message": { "type": "integer", "minimum": 0, "maximum": 100, "default": 1, "description": "Tokens to send a message to another user. Never applied to messages to or from the superadmin (always free)" }
      }
    },
    "courier": {
      "type": "object",
      "additionalProperties": false,
      "required": ["baseLoading", "perKm", "includedKm", "extraKmSurchargePct", "asapSurchargePct"],
      "properties": {
        "baseLoading": { "type": "integer", "minimum": 0, "maximum": 5000, "default": 35 },
        "perKm": { "type": "integer", "minimum": 1, "maximum": 500, "default": 2, "description": "Tokens per km (was $1.20/km, rounded up)" },
        "includedKm": { "type": "integer", "minimum": 0, "maximum": 5000, "default": 20 },
        "extraKmSurchargePct": { "type": "integer", "minimum": 0, "maximum": 100, "default": 10 },
        "asapSurchargePct": { "type": "integer", "minimum": 0, "maximum": 100, "default": 20 }
      }
    },
    "tokenPacks": {
      "type": "array",
      "minItems": 4,
      "maxItems": 4,
      "uniqueItems": true,
      "items": { "type": "integer", "minimum": 1, "maximum": 10000 },
      "default": [10, 25, 50, 100],
      "description": "Token packs offered in the Token Wallet (products sold)"
    },
    "updatedAt": { "type": "string", "format": "date-time" },
    "updatedBy": { "type": "string", "format": "email" }
  }
}
```

**Messages to the superadmin are free.** Refund requests (and any other message to the superadmin) are never charged in tokens or AUD; no price list entry may be added for them. Refund requests must be made in writing to the superadmin (Terms of Service section 5).

A provider's own hourly rate (`providers/{id}.hourlyRate`, AUD) overrides `hourlyTokens` once the customer picks that provider; it is converted with `ceil(hourlyRate / tokenPriceAud)`. Superadmin tools are shown with the `.superadmin-only` class by `syncSuperadminControls()`; the server re-checks the role on every `PUT`.

---

### 6.7 Message Contract (`mailboxes/{owner}/inbox|sent/{messageId}`)
Written only by `/api/messages` (`server/messages.js`, Admin SDK); `firestore.rules` denies all browser access. `owner` is the user's uid or `superadmin` (shared by all superadmins). Each message is stored twice: the sender's `sent` copy (`read: true`) and the recipient's `inbox` copy (`read: false` until opened). `messageId` = `{senderUid}_{clientMessageId}`. A paid message also writes `wallets/{uid}/ledger/message_{messageId}` `{ type: 'message', tokens: -price, availableAfter, ref, createdAt }` in the same transaction. `mailboxes/{uid}` holds the sender's rate-limit window `{ rateWindowStart, rateCount }` (20 messages / 10 minutes; superadmins exempt).

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MessageContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["from", "to", "subject", "body", "createdAt", "tokensCharged", "read"],
  "definitions": {
    "party": {
      "type": "object",
      "additionalProperties": false,
      "required": ["uid", "name", "email", "role"],
      "properties": {
        "uid": { "type": ["string", "null"], "description": "null for the superadmin" },
        "name": { "type": "string", "maxLength": 200 },
        "email": { "type": ["string", "null"], "format": "email", "description": "null for the superadmin (personal superadmin emails are never shown)" },
        "role": { "type": "string", "enum": ["user", "superadmin"] }
      }
    }
  },
  "properties": {
    "from": { "$ref": "#/definitions/party" },
    "to": { "$ref": "#/definitions/party" },
    "subject": { "type": "string", "minLength": 1, "maxLength": 120 },
    "body": { "type": "string", "minLength": 1, "maxLength": 2000, "description": "Plain text; always HTML-escaped when shown" },
    "createdAt": { "type": "string", "format": "date-time" },
    "tokensCharged": { "type": "integer", "minimum": 0, "description": "0 when to or from the superadmin" },
    "read": { "type": "boolean" },
    "readAt": { "type": "string", "format": "date-time" }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

## 8. DOM Automation & Accessibility Testability Contract

All interactive elements (`<button>`, `<input>`, `<select>`, `<textarea>`) across the entire web application are strictly required to expose deterministic automation hooks and accessibility bindings.

### 8.1 Interactive Element DOM Attributes Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "InteractiveElementDomContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data-agent-id",
    "data-testid",
    "aria-label"
  ],
  "properties": {
    "data-agent-id": {
      "type": "string",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 2,
      "maxLength": 80,
      "description": "Deterministic slug identifier used by AI browser automation agents"
    },
    "data-testid": {
      "type": "string",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 2,
      "maxLength": 80,
      "description": "Standard selector hook for Playwright / Cypress / Vitest E2E testing suites"
    },
    "aria-label": {
      "type": "string",
      "minLength": 2,
      "maxLength": 100,
      "description": "Accessible label for screen readers and UI accessibility trees"
    }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

## 9. Change Log & Maintenance Rules

- Whenever a form field, API endpoint, or database collection schema is created or modified, **`data-contracts.MD` must be updated concurrently**.
- All data contracts must adhere to `additionalProperties: false` to ensure total payload determinism.
- Australian Privacy Act guidelines must be enforced on any field storing individual identity or contact information.

### Change log
- **2 November 2026 — AUD default currency & superadmin price list.** Everything is priced, invoiced and charged in AUD; 1 token = A$1 by default; whole numbers only, rounded up. Added `shared/pricing.js`, `js/currency.js`, `js/superadmin-pricing.js`, `GET/PUT /api/pricing` (5.5), the price list (6.6), default region resolution (2.2), the booking pricing object (4.3) and `/terms.html`. Token purchases are always charged in AUD (5.2, 5.3). FX is now AUD → USD (`platform_settings/fx_aud_usd`, env `FX_FALLBACK_AUD_USD`; the old `FX_FALLBACK_USD_AUD` is still read and inverted). Courier `over20kmSurchargePct` became `extraKmSurchargePct` with a configurable `includedKm`.

- **2 November 2026 — USD conversions to the cent.** USD conversions (display only) now show 2 decimal places maximum, rounded up to the next cent with `roundUpToCents()` / `convertAudToUsd()` in `shared/pricing.js` (e.g. `≈ $68.85 USD`, rate note `A$100 ≈ US$70.25`). `usdEstimate` (5.2, 5.3) and courier `totalFiat` (4.2) are now numbers with at most 2 decimals. AUD amounts, tokens and invoices remain whole numbers.
- **2 November 2026 — Refunds & superadmin messages.** Refund requests must be made in writing by sending a message to the superadmin (support@aifoundation.net.au; Terms of Service section 5, tokens FAQ, Token Wallet). Messages to the superadmin are free: never priced in tokens or AUD (6.6).
- **2 November 2026 — Messages panel.** Admin Page > Messages (`js/messages-panel.js`, `GET/POST/PATCH /api/messages`, `server/messages.js`): users message each other by email, or the superadmin. Messages to (and from) the superadmin are free; messages to other users cost `fees.message` tokens (default 1, set in the price list, 6.6), charged in the delivery transaction. Contracts 5.6 and 6.7; `mailboxes` is server-only in `firestore.rules`. Refund requests can now be sent to the superadmin from the Messages panel (or by email).

---

## 9. Courier Platform & Community Supporter Contracts

### 9.0 Community Supporter Registration Contract (`SupporterRegistrationContract`)
Supporters register with basic contact details (full name, email, mobile phone, and suburb/postcode) to access the network.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterRegistrationContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "fullName", "email", "phone", "suburb"],
  "properties": {
    "id": { "type": "string", "minLength": 3, "maxLength": 64 },
    "fullName": { "type": "string", "minLength": 2, "maxLength": 120 },
    "email": { "type": "string", "format": "email" },
    "phone": { "type": "string", "pattern": "^(?:\\+?61|0)[4-5]\\d{8}$" },
    "suburb": { "type": "string", "minLength": 2, "maxLength": 120 },
    "role": { "type": "string", "enum": ["supporter", "member", "admin"] },
    "isVerified": { "type": "boolean", "default": true },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```

### 9.1 Courier Driver Registration Contract (`CourierDriverRegistrationContract`)
Drivers register with licence details, address, phone, email, PayID, custom rates, maximum package dimensions, and live GPS position.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CourierDriverRegistrationContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id", "serviceProviderNumber", "name", "businessName", "category",
    "licenceNumber", "licenceState", "licenceClass", "licenceExpiry",
    "address", "phone", "email", "payIdType", "payIdValue", "payIdAccountName",
    "perKmRateAud", "sameDayFeeAud", "urgentFeeAud",
    "maxWeightKg", "maxHeightCm", "maxWidthCm", "maxLengthCm",
    "tokenBalance", "lat", "lng"
  ],
  "properties": {
    "id": { "type": "string", "minLength": 3, "maxLength": 64 },
    "serviceProviderNumber": { "type": "string", "pattern": "^(DRV|SPN)-\\d{6}$" },
    "name": { "type": "string", "minLength": 2, "maxLength": 120 },
    "businessName": { "type": "string", "minLength": 2, "maxLength": 160 },
    "category": { "type": "string", "enum": ["courier"] },
    "licenceNumber": { "type": "string", "minLength": 4, "maxLength": 32 },
    "licenceState": { "type": "string", "enum": ["QLD", "NSW", "VIC", "WA", "SA", "TAS", "ACT", "NT"] },
    "licenceClass": { "type": "string", "minLength": 1, "maxLength": 40 },
    "licenceExpiry": { "type": "string", "format": "date" },
    "address": { "type": "string", "minLength": 5, "maxLength": 240 },
    "phone": { "type": "string", "minLength": 8, "maxLength": 24 },
    "email": { "type": "string", "format": "email" },
    "payIdType": { "type": "string", "enum": ["phone", "email", "abn"] },
    "payIdValue": { "type": "string", "minLength": 5, "maxLength": 120 },
    "payIdAccountName": { "type": "string", "minLength": 2, "maxLength": 140 },
    "perKmRateAud": { "type": "number", "minimum": 0.5, "maximum": 100, "default": 2.20 },
    "sameDayFeeAud": { "type": "number", "minimum": 0, "maximum": 1000, "default": 0 },
    "urgentFeeAud": { "type": "number", "minimum": 0, "maximum": 1000, "default": 0 },
    "maxWeightKg": { "type": "number", "minimum": 1, "maximum": 20000, "default": 50 },
    "maxHeightCm": { "type": "number", "minimum": 10, "maximum": 600, "default": 70 },
    "maxWidthCm": { "type": "number", "minimum": 10, "maximum": 600, "default": 50 },
    "maxLengthCm": { "type": "number", "minimum": 10, "maximum": 1500, "default": 50 },
    "tokenBalance": { "type": "integer", "minimum": 0 },
    "lat": { "type": "number", "minimum": -90, "maximum": 90 },
    "lng": { "type": "number", "minimum": -180, "maximum": 180 }
  }
}
```

### 9.2 Customer Courier Order & 9am–4pm Pickup Contract (`CustomerCourierOrderContract`)
Recorded on the Driver Admin Page (`window.courierOrderDB`). Customers select a pickup time strictly between 09:00 AM and 04:00 PM.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CustomerCourierOrderContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "orderId", "createdAt", "driverId", "driverName", "driverPayIdType", "driverPayIdValue",
    "pickupDate", "pickupTime", "speedTier", "originAddress", "destAddress", "distanceKm",
    "customerName", "customerPhone", "customerEmail", "customerAddress", "packageContents",
    "weightKg", "heightCm", "widthCm", "lengthCm", "totalAud",
    "tokensChargedToDriver", "tokenTierLabel", "paymentMethod", "status"
  ],
  "properties": {
    "orderId": { "type": "string", "pattern": "^ORD-\\d{6}$" },
    "createdAt": { "type": "string", "format": "date-time" },
    "driverId": { "type": "string" },
    "driverName": { "type": "string" },
    "driverPayIdType": { "type": "string", "enum": ["phone", "email", "abn"] },
    "driverPayIdValue": { "type": "string" },
    "pickupDate": { "type": "string", "format": "date" },
    "pickupTime": {
      "type": "string",
      "enum": [
        "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
        "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM",
        "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
        "03:00 PM", "03:30 PM", "04:00 PM"
      ]
    },
    "speedTier": { "type": "string", "enum": ["standard", "same_day", "urgent"] },
    "originAddress": { "type": "string", "minLength": 5, "maxLength": 240 },
    "destAddress": { "type": "string", "minLength": 5, "maxLength": 240 },
    "distanceKm": { "type": "number", "minimum": 0.1 },
    "customerName": { "type": "string", "minLength": 2, "maxLength": 120 },
    "customerPhone": { "type": "string", "minLength": 8, "maxLength": 24 },
    "customerEmail": { "type": "string", "format": "email" },
    "customerAddress": { "type": "string", "minLength": 5, "maxLength": 240 },
    "packageContents": { "type": "string", "minLength": 2, "maxLength": 500 },
    "weightKg": { "type": "number", "minimum": 0.1, "maximum": 20000 },
    "heightCm": { "type": "number", "minimum": 1, "maximum": 600 },
    "widthCm": { "type": "number", "minimum": 1, "maximum": 600 },
    "lengthCm": { "type": "number", "minimum": 1, "maximum": 1500 },
    "totalAud": { "type": "number", "minimum": 0 },
    "tokensChargedToDriver": { "type": "integer", "minimum": 1 },
    "tokenTierLabel": { "type": "string", "enum": ["0–20 km", "21–50 km", "51–100 km", "101+ km"] },
    "paymentMethod": { "type": "string", "enum": ["Direct to Driver PayID (AUD)"] },
    "status": { "type": "string" }
  }
}
```

### 9.3 SuperAdmin Distance-Bracket Driver Token Charge Contract (`SuperAdminDistanceTokenTierContract`)
Drivers buy tokens in AUD. Every customer order deducts tokens according to 4 distance brackets:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SuperAdminDistanceTokenTierContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["tokenPriceAud", "tier0to20km", "tier21to50km", "tier51to100km", "tier101PlusKm"],
  "properties": {
    "tokenPriceAud": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 1 },
    "tier0to20km": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 2 },
    "tier21to50km": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 5 },
    "tier51to100km": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 10 },
    "tier101PlusKm": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 15 }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 }
  }
}
```

### 9.4 Supporter Bookings History & Re-booking Contract (`SupporterBookingsHistoryContract`)
When community supporters log in, they can view all their past and active courier delivery bookings, review pickup windows (9:00 AM – 4:00 PM), tracking status, PayID settlement details, and trigger new courier bookings with contact details pre-filled from their supporter profile.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SupporterBookingsHistoryContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["supporterId", "email", "totalBookings", "orders"],
  "properties": {
    "supporterId": { "type": "string", "minLength": 3 },
    "email": { "type": "string", "format": "email" },
    "totalBookings": { "type": "integer", "minimum": 0 },
    "orders": {
      "type": "array",
      "items": { "$ref": "#/definitions/CustomerCourierOrderContract" }
    }
  }
}
```

---

## 10. SuperAdmin Governance & Token Flow Contract

### 10.1 SuperAdmin Identity & Driver Approval Schema
- **Firebase Admin Email Binding**: SuperAdmin is authorized via the Firebase admin email address (`support@aifoundation.net.au`, `davidrobertson.info@gmail.com`, or configured `SUPERADMIN_EMAILS`).
- **Driver Approval Gate**: Newly registered courier drivers default to `approved: false` / `status: "pending_approval"`. Only drivers explicitly approved by SuperAdmin (`approved: true`, `status: "active"`) appear on the customer booking map and receive orders.
- **Automated Token Transfer**: On every confirmed customer courier order, the distance-tier token charge is automatically deducted from the driver's token account and credited to the SuperAdmin's token account vault (`iasj_superadmin_tokens_v1`).
- **SuperAdmin Token Wipe**: SuperAdmin has the unilateral authority to wipe all tokens from the SuperAdmin account (`iasjConfirmDelete` protocol), resetting the platform vault balance to 0.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SuperAdminGovernanceContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["superadminEmail", "isSuperAdmin", "driverApprovalsEnabled", "tokenVaultBalance"],
  "properties": {
    "superadminEmail": { "type": "string", "format": "email" },
    "isSuperAdmin": { "type": "boolean", "default": true },
    "driverApprovalsEnabled": { "type": "boolean", "default": true },
    "tokenVaultBalance": { "type": "integer", "minimum": 0 }
  }
}
```

### 10.2 SuperAdmin Distance Tier Token Costs & Token Pricing Contract
- **SuperAdmin Authority**: Token price and distance tier token costs per order are set **ONLY by SuperAdmin**.
- **Real-Time SuperAdmin Editing**: SuperAdmin can edit token price (`tokenPriceAud`) and all 4 distance tier token costs (`tier0to20km`, `tier21to50km`, `tier51to100km`, `tier101PlusKm`) at any time from the SuperAdmin console.
- **Persistence**: Edits are persisted immediately to the Firestore database under `platform_settings/pricing` and synced across all client instances.
- **Immediate Effect on Driver Token Top-Ups**: Changing the token price immediately recalculates all driver token top-up packs (10, 50, 100 Tokens @ `$tokenPriceAud` AUD/token) and the distance token charges deducted from drivers when customer orders are placed.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SuperAdminTokenPricingAndDistanceTiersContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["tokenPriceAud", "driverOrderTokens", "updatedBy", "updatedAt"],
  "properties": {
    "tokenPriceAud": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000,
      "description": "AUD price of 1 token, set strictly by SuperAdmin (default 1)"
    },
    "driverOrderTokens": {
      "type": "object",
      "additionalProperties": false,
      "required": ["tier0to20km", "tier21to50km", "tier51to100km", "tier101PlusKm"],
      "properties": {
        "tier0to20km": { "type": "integer", "minimum": 1, "maximum": 1000 },
        "tier21to50km": { "type": "integer", "minimum": 1, "maximum": 1000 },
        "tier51to100km": { "type": "integer", "minimum": 1, "maximum": 1000 },
        "tier101PlusKm": { "type": "integer", "minimum": 1, "maximum": 1000 }
      }
    },
    "tokenPacks": {
      "type": "array",
      "items": { "type": "integer", "enum": [10, 50, 100] }
    },
    "updatedBy": { "type": "string", "format": "email" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```


---

## 11. Role-Based Access Control (RBAC) & Driver Approval Contract

### 11.1 Hardwired Roles & Permissions Matrix
Defines the authoritative roles stored in the Firestore database (`users/{uid}`, `providers/{providerId}`, and `driver_applications/{appId}`) and enforced across both client and server:

- **`superadmin` (Supreme Ruler)**:
  * Supreme ruler with 100% unconditional full control and editing powers over the entire web application and Firestore database.
  * Can do anything across all views, collections, settings, and users without validator blocks (`allow read, write, delete: if isSuperAdmin();`).
  * Sets token prices (`tokenPriceAud`) dynamically at any time.
  * Sets price for Token Cost per Order Driver Receives across all distance tiers (0–20km, 21–50km, 51–100km, 101+km).
  * Manages the SuperAdmin Driver Approval Console: reviews applications, approves drivers (granting role: `driver`), rejects applications, revokes driver privileges, and wipes all platform tokens from the SuperAdmin token vault.

- **`driver` (Approved Courier Contractor)**:
  * Role activated strictly upon SuperAdmin approval of a driver application.
  * **Buy Tokens**: Can purchase token packs (10, 50, 100 in $ AUD) via Stripe to maintain balance for customer order deductions.
  * **Receive Bookings**: Sees incoming courier bookings dispatched or assigned in their Driver Dispatch Console.
  * **Accept Bookings**: Can accept pending bookings via the `Accept Booking` action (`acceptDriverBooking(orderId)`), transitioning order status to `Driver Accepted` and progressing through transit.
  * **Update Personal Details**: Updates their custom delivery rates (Rate per KM, same-day fee, urgent fee in $ AUD), vehicle details, package capacities (weight kg, dimensions H×W×L cm), PayID, and licence details.
  * **Strict Gating**: Cannot modify platform distance tier token deductions, cannot change token prices, and cannot approve other drivers.

- **`supporter` (Community Supporter / Customer)**:
  * Default role upon signing in with Google.
  * **Buy Tokens**: Can purchase tokens (10, 50, 100 packs in $ AUD) from the Supporter Status Bar token wallet.
  * **Make Bookings**: Can create courier bookings on `#courier-tab` with scheduled 9:00 AM – 4:00 PM pickup windows, package content, dimensions, and weight.
  * **Update Personal Details**: In `1. Register Details` (`#supporter-registration-form`), can update Full Name, Mobile Phone, Street Address, Suburb & Postcode, persisted locally and synced to Firestore `users/{uid}`.
  * **Apply to Become a Driver**: Can submit a Driver Application in `3. Driver Application`, which enters `status: "pending_approval"` awaiting SuperAdmin approval.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FirestoreUserRbacContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["uid", "email", "role"],
  "properties": {
    "uid": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "displayName": { "type": "string", "maxLength": 100 },
    "photoURL": { "type": "string" },
    "role": {
      "type": "string",
      "enum": ["superadmin", "driver", "supporter", "customer"]
    },
    "isSuperadmin": { "type": "boolean", "default": false },
    "isDriver": { "type": "boolean", "default": false },
    "approved": { "type": "boolean", "default": false },
    "driverId": { "type": "string" },
    "serviceProviderNumber": { "type": "string" },
    "approvedBy": { "type": ["string", "null"] },
    "approvedAt": { "type": ["string", "null"], "format": "date-time" },
    "revokedBy": { "type": ["string", "null"] },
    "revokedAt": { "type": ["string", "null"], "format": "date-time" },
    "businessId": { "type": "string", "const": "its-a-simple-job" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```

### 11.2 Driver Application Lifecycle Contract (`DriverApplicationContract`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DriverApplicationContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "appId", "uid", "name", "email", "phone", "address", 
    "licenceNumber", "licenceState", "licenceClass", 
    "payIdValue", "status", "approved"
  ],
  "properties": {
    "appId": { "type": "string" },
    "uid": { "type": "string" },
    "name": { "type": "string", "minLength": 2, "maxLength": 100 },
    "email": { "type": "string", "format": "email" },
    "phone": { "type": "string" },
    "address": { "type": "string" },
    "baseSuburb": { "type": "string" },
    "vehicle": { "type": "string" },
    "licenceNumber": { "type": "string" },
    "licenceState": { "type": "string" },
    "licenceClass": { "type": "string" },
    "licenceExpiry": { "type": "string" },
    "payIdType": { "type": "string", "enum": ["phone", "email", "abn"] },
    "payIdValue": { "type": "string" },
    "payIdAccountName": { "type": "string" },
    "perKmRateAud": { "type": "number", "minimum": 0.5 },
    "sameDayFeeAud": { "type": "number", "minimum": 0 },
    "urgentFeeAud": { "type": "number", "minimum": 0 },
    "maxWeightKg": { "type": "number", "minimum": 1 },
    "maxHeightCm": { "type": "number", "minimum": 10 },
    "maxWidthCm": { "type": "number", "minimum": 10 },
    "maxLengthCm": { "type": "number", "minimum": 10 },
    "status": {
      "type": "string",
      "enum": ["pending_approval", "active", "rejected"]
    },
    "approved": { "type": "boolean" },
    "approvedBy": { "type": ["string", "null"] },
    "approvedAt": { "type": ["string", "null"], "format": "date-time" },
    "businessId": { "type": "string", "const": "its-a-simple-job" },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```

### 11.3 SuperAdmin Driver Revocation Contract (`SuperAdminDriverRevocationContract`)
Defines the state transition and side-effects when SuperAdmin revokes an approved driver's status:

1. **Trigger & Two-Step Verification:**
   - Initiated via `handleRevokeDriverClick(btn, driverId)` using the `iasjConfirmDelete` standard two-step verification UI.
   - Arms a 5-second countdown with solid red styling and prompt `"Confirm Revoke?"`.
2. **State Transitions & Multi-Tenant Updates:**
   - **`providers/{driverId}`**: Sets `approved: false`, `status: "pending_approval"`, `isActive: false`, `revokedBy: superadminEmail`, `revokedAt: ISO8601`.
   - **`driver_applications/{appId}`**: Sets `approved: false`, `status: "pending_approval"`, `revokedBy: superadminEmail`, `revokedAt: ISO8601`.
   - **`users/{uid}`**: Role demoted back to `"supporter"` (`role: "supporter"`, `isDriver: false`, `approved: false`).
   - **`supporterDB`**: Supporter profile role demoted to `"supporter"`.
   - **Client Session (`localStorage['iasj_google_user']`)**: If the revoked driver is the active session user, role immediately drops back to `"supporter"`.
3. **UI Visibility & Exclusion:**
   - The revoked driver is immediately purged from the live public customer booking map and contractor selection dropdown.
   - In the SuperAdmin Driver Approval Console, the badge switches to yellow `"Pending SuperAdmin Approval"`, and the action button reverts to `"Approve Driver"`.
   - If the revoked driver navigates to the Driver Dispatch Console, the `#supporter-not-driver-notice` banner is rendered, preventing unauthorized dispatch.

