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


### 11.4 Bicycle Courier & Unique Driver Application Contract (`BicycleCourierAndUniqueApplicationContract`)
Defines the strict database schema, business rules, and UI behavior for courier service modes (Motor Vehicle vs. Bicycle) and unique email application enforcement:

1. **Unique Application per Email Address:**
   - **Constraint:** Strictly only one driver application is permitted per email address across `driver_applications`, `providers`, and `localStorage`.
   - **Behavior on Resubmission:** If an application exists with the given email address, resubmission updates the existing record (`updatedAt: ISO8601`) rather than creating a duplicate entry.
   - **Form Pre-fill & Status Banner:** Opening the Driver Application tab checks `window.providerDB.getAll()` for the logged-in supporter's email. If found, an alert banner (`#drv-reg-existing-notice`) displays the current status and pre-populates all vehicle/bicycle rates and limits, switching the submit button to `"Update Driver Profile, Modes & Rates ($ AUD)"`.

2. **Dual Service Modes & Independent Custom Rates ($ AUD):**
   - **Motor Vehicle Courier (`hasVehicleCourier: boolean`, default `true`):**
     - Covers cars, vans, utes, and light trucks.
     - Custom rates: `vehiclePerKmRateAud` (minimum $0.50/km, default $2.20), `vehicleSameDayFeeAud` (minimum $0.00), `vehicleUrgentFeeAud` (minimum $0.00).
     - Package capacity: Configurable weight (default 50kg) and package dimensions (default 70H × 50W × 50L cm).
   - **Bicycle Courier Option (`hasBicycleCourier: boolean`, default `false`):**
     - Covers push bicycles, e-bikes, and cargo delivery bikes.
     - **Item Restriction:** Strictly limited to small items: letters, documents, and food deliveries only.
     - **Bicycle Limits:** Maximum 8 kg, dimensions maximum 35 cm (H) × 30 cm (W) × 40 cm (L) (standard courier backpack or pannier).
     - Custom rates: `bicyclePerKmRateAud` (minimum $0.50/km, default $1.80), `bicycleSameDayFeeAud` (minimum $0.00), `bicycleUrgentFeeAud` (minimum $0.00).
   - **Mode Selection Freedom:**
     - A driver can offer **Vehicle Only**, **Bicycle Only**, or **BOTH**.
     - When offering both, the driver chooses independent custom rates for each mode.
     - Direct payment via PayID remains 100% in AUD directly to the driver's PayID account.

3. **Customer Booking & Dispatch Integration:**
   - **Delivery Mode Selector (`#courier-delivery-mode`):**
     - `'auto'`: Auto-detects based on package description and size. If item is <= 8kg, fits 35×30×40cm, and is a letter/food/document/small parcel, bicycle courier rates are preferred when supported by the driver.
     - `'bicycle'`: Strictly filters to drivers with `hasBicycleCourier === true`. Enforces <= 8kg and <= 35×30×40cm.
     - `'vehicle'`: Strictly filters to drivers with `hasVehicleCourier !== false`.
   - **Order Record (`courierOrderDB.addOrder`):** Records `deliveryMode` (`'vehicle' | 'bicycle'`) and `deliveryModeLabel` alongside the item dimensions and specific custom rates charged.

### 11.5 Driver Approval RBAC Role Promotion Contract (`DriverApprovalRbacRolePromotionContract`)
Defines the authoritative state transitions, permissions, and multi-tenant persistence when a driver application is approved by SuperAdmin:

1. **Trigger & Authorization:**
   - Initiated exclusively by SuperAdmin clicking "Approve Driver" in the SuperAdmin Driver Approval Console (`approveDriverBySuperadmin(driverId)`).
   - Only authenticated users with `isSuperAdmin()` authority can execute this promotion.

2. **Atomic Multi-Tenant State Transitions:**
   - **`providers/{driverId}`**: Sets `role: "driver"`, `isDriver: true`, `approved: true`, `status: "active"`, `isActive: true`, `approvedBy: superadminEmail`, `approvedAt: ISO8601`, `updatedAt: ISO8601`.
   - **`driver_applications/{appId}`**: Sets `role: "driver"`, `isDriver: true`, `approved: true`, `status: "active"`, `approvedBy: superadminEmail`, `approvedAt: ISO8601`, `updatedAt: ISO8601`.
   - **`users/{uid}` in Firestore**: Granted RBAC role: `role: "driver"`, `isDriver: true`, `approved: true`, `driverId: driverId`, `approvedBy: superadminEmail`, `approvedAt: ISO8601`.
   - **`window.supporterDB`**: Supporter profile role promoted to `"driver"`, `approved: true`, `isDriver: true`, `driverId: driverId`.
   - **Client Session (`localStorage['iasj_google_user']`)**: If the approved driver is the active session user, role immediately updates to `"driver"`, `isDriver: true`.

3. **Immediate Reactive UI Privileges:**
   - **Driver Dispatch Console (`#supporter-dispatch-subtab`)**:
     * Guidance notice (`#supporter-not-driver-notice`) is immediately hidden (`display: none`).
     * Full Driver Dispatch Console (`#driver-dispatch-console`) is unlocked and displayed.
     * Driver can accept customer bookings (`acceptDriverBooking(orderId)` transitioning status to `"Driver Accepted"`), manage custom delivery rates in AUD, update live GPS, and buy driver tokens.
   - **Supporter Profile Bar**:
     * Role pill dynamically renders: `<i class="fa-solid fa-truck-fast" style="color:#3B82F6;"></i> Approved Courier Driver`.
   - **Google Profile Chip Dropdown**:
     * Displays `Active Approved Courier Driver • Logged In`.
   - **Customer Directory & Map**:
     * Driver becomes visible as active and available on the live customer booking map and driver selection cards.

### 11.6 SuperAdmin All-Roles Perspective Contract (`SuperAdminAllRolesViewPerspectiveContract`)
Defines the state persistence, session simulation, and UI adaptation enabling SuperAdmin to preview and experience the platform from all roles:

1. **Role Perspectives Available:**
   - **`superadmin`**: Supreme Ruler (All Access). Unconditional full control over distance tiers, token prices, driver approvals, wiping tokens, and full admin tools.
   - **`driver`**: Approved Courier Driver View. Experiences the active Driver Dispatch Console (`#supporter-dispatch-subtab`), booking acceptance, token balance purchases, and custom rate settings ($ AUD). SuperAdmin controls are hidden.
   - **`supporter`**: Community Supporter View. Experiences supporter personal details, booking history, and the `#supporter-not-driver-notice` banner on the dispatch tab. SuperAdmin controls and dispatch console are hidden.
   - **`customer`**: Public Customer Booking View. Redirects to `#courier-tab` to experience the public courier booking form, package limits, and closest drivers map. Supporter portal and dispatch consoles are inaccessible.

2. **Persistence & Execution Architecture:**
   - Perspective selection is stored in `sessionStorage['iasj_superadmin_view_role']`.
   - `getActiveUserRole()` authoritatively honors `sessionStorage['iasj_superadmin_view_role']` when the authenticated user is SuperAdmin, ensuring all downstream components react consistently.
   - `switchSuperadminViewRole(role)` coordinates navigation, UI updates, and perspective indicators.

3. **Floating Banner & 1-Click Return:**
   - When previewing as Driver, Supporter, or Customer, the persistent floating banner (`#superadmin-viewing-banner`) remains fixed at the top of the viewport.
   - Displays the active perspective, an in-banner perspective selector dropdown (`#sa-banner-role-select`), and a 1-click `"Return to Superadmin"` button (`#btn-reset-superadmin-view`).
   - Also accessible via the Google Profile Menu dropdown (`#google-menu-superadmin-switcher`) and the SuperAdmin Console card (`#superadmin-role-switcher-section`).

### 11.7 Live Map Search Radius Radar Contract (`LiveMapSearchRadiusRadarContract`)
Defines the real-time visual synchronization between the search radius input controls and the Leaflet OpenStreetMap canvas in the "Drivers Closest to Your Pickup Address" directory:

1. **Visual Radius Overlay (`L.circle`):**
   - **Styling:** Rendered centered at the search location (`userCoords.lat`, `userCoords.lng`) with brand orange dashed border (`color: '#FF5A1F'`, `dashArray: '6, 6'`, `weight: 2`, `opacity: 0.85`) and translucent radar fill (`fillColor: '#FF5A1F'`, `fillOpacity: 0.08`).
   - **Radius Scaling:** Strictly computed as `searchRadiusKm * 1000` meters (5,000m to 200,000m range).

2. **Real-Time Reactive Dragging & Debounced Viewport Fitting:**
   - **Continuous Dragging (`oninput="updateRadiusDisplay(this.value, false)"`):**
     * Immediately adjusts `osmRadiusCircle.setRadius(radiusMeters)` on the map with 0 latency.
     * Updates radius badge `#radius-val-display` and `#contractor-filter-summary`.
     * Filters active drivers within the radius and updates `#contractor-cards-container` and driver count badge.
   - **Smooth Bounds Fit (`onchange="updateRadiusDisplay(this.value, true)"` / 180ms debounce):**
     * Smoothly fits the Leaflet map bounds (`map.fitBounds(circle.getBounds(), { padding: [30, 30], maxZoom: 14 })`) so the full search circumference and all drivers inside remain clearly in view.

3. **Center Point Dynamic Relocation:**
   - When the user selects a new pickup address/suburb (`onContractorLocationSelected(place)`) or clicks "Locate with GPS" (`locateCustomer(...)`), the search center marker and the radius circle automatically relocate (`setLatLng([lat, lng])`) with immediate bounds recalculation.

### 11.8 Dual-Mode Customer-Facing Driver Profile Contract (`DualModeCustomerFacingDriverProfileContract`)
Defines the customer-facing interface controls and dynamic quoting behavior for drivers who register for both standard motor vehicle courier and bicycle courier services:

1. **Eligibility Criteria:**
   - Evaluated on each driver record: `driver.hasVehicleCourier !== false && driver.hasBicycleCourier === true`.
   - Single-mode drivers (vehicle-only or bicycle-only) display their respective mode badge and rate without toggle buttons.
   - Dual-registered drivers display interactive toggle buttons in their profiles across all customer touchpoints.

2. **Customer Touchpoints & UI Integration:**
   - **Courier Tab Driver Cards (`#courier-driver-selection-list`):**
     * Contains `[🚗 Motor Vehicle ($X.XX/km)]` (`data-agent-id="btn-courier-mode-vehicle-${d.id}"`, `data-testid="btn-courier-mode-vehicle-${d.id}"`) and `[🚲 Bicycle Courier ($Y.YY/km)]` (`data-agent-id="btn-courier-mode-bicycle-${d.id}"`, `data-testid="btn-courier-mode-bicycle-${d.id}"`).
     * Clicking triggers `selectCourierDriverMode(driverId, mode, event)`.
     * Active button receives solid fill (`btn-primary`); inactive button receives outline styling (`btn-outline`).
     * Dynamically switches calculated booking total, breakdown (per-km, same-day, urgent), and package capacity badge (8kg small item limit for bicycle vs vehicle capacity).
   - **Live Driver Directory Cards (`#contractor-cards-container`):**
     * Displays `[🚗 Motor Vehicle ($X.XX/km)]` and `[🚲 Bicycle Courier ($Y.YY/km)]` (`data-agent-id="btn-contractor-mode-vehicle-${c.id}"`, `data-testid="btn-contractor-mode-bicycle-${c.id}"`).
     * Clicking triggers `toggleContractorCardMode(providerId, mode, event)`.
     * Card values update in real time: Rate $/km, Same-Day Fee, Urgent Fee, Max Weight, and Max Dimensions.
   - **OpenStreetMap Leaflet Popups (`updateOsmContractorMarkers`):**
     * Displays interactive `[🚗 Vehicle]` and `[🚲 Bicycle]` buttons inside the popup bubble.
     * Clicking updates displayed rates, limits, and the booking button icon/action.

3. **Booking Hand-off & State Persistence:**
   - Selecting a mode in the directory or map popup sets `appState.contractorCardModeOverrides[providerId]` and `appState.driverServiceModeOverrides[providerId]`.
   - Clicking "Book Driver" preserves the customer's selected mode, navigating to `#courier-tab` with the chosen driver and delivery mode pre-activated.

### 11.9 Map Pin Color Coding & Driver Gender Contract (`MapPinColorCodingAndDriverGenderContract`)
Defines the visual pin color taxonomy on OpenStreetMap (Leaflet) canvases and gender declaration across driver onboarding and directories:

1. **Driver Gender Onboarding & Persistence:**
   - **Form Field (`#drv-reg-gender`):** Dropdown selector in the Driver Application form (`#driver-registration-form`) with options:
     * `female`: "Female (Pink Map Pin)"
     * `male`: "Male (Blue Map Pin)"
   - **Data Schema:** Stored on the driver record as `gender: 'female' | 'male'` across Firestore (`providers/{id}` and `driver_applications/{id}`) and local `providerDB`.
   - **Heuristic Fallback:** If `gender` is unassigned on legacy records, `normalizeDriver` infers gender from known given names, defaulting to `'male'` if unspecified.

2. **Pin Color Taxonomy & Visual Encodings:**
   - **Customer Address Pin (Pickup Origin / Search Center):**
     * **Color:** Emerald Green (`#10B981`, border `#FFFFFF`).
     * **Icon:** `<i class="fa-solid fa-house-user"></i>` / `<i class="fa-solid fa-box"></i>`.
     * **Popup Title:** "Customer Address (Search Center)" / "Customer Pickup Address (Green Pin)".
   - **Female Courier Driver Pin:**
     * **Color:** Vibrant Pink (`#EC4899`, border `#FFFFFF`, shadow `rgba(0,0,0,0.35)`).
     * **Icon:** `<i class="fa-solid fa-truck-fast"></i>` or `<i class="fa-solid fa-bicycle"></i>`.
     * **Popup/Card Badge:** `<i class="fa-solid fa-venus"></i> Female Driver (Pink Pin)` (`#FCE7F3` background, `#BE185D` text).
   - **Male Courier Driver Pin:**
     * **Color:** Vibrant Blue (`#2563EB`, border `#FFFFFF`, shadow `rgba(0,0,0,0.35)`).
     * **Icon:** `<i class="fa-solid fa-truck-fast"></i>` or `<i class="fa-solid fa-bicycle"></i>`.
     * **Popup/Card Badge:** `<i class="fa-solid fa-mars"></i> Male Driver (Blue Pin)` (`#EFF6FF` background, `#1D4ED8` text).

3. **Map Canvas Legend:**
   - Surfaced on the "Closest Drivers Map" header bar (`#map-pin-color-legend`) displaying:
     * Green Pin: Customer Address
     * Pink Pin: Female Driver
     * Blue Pin: Male Driver

### 11.10 Bottom Driver Application & Supporter Registration Gating Contract (`BottomDriverApplicationSupporterGatingContract`)
Defines the architectural separation of the Driver Application from the Supporter Portal / Admin console and its relocation to the bottom of the web application, gated strictly behind Community Supporter registration:

1. **Supporter Portal Sub-Navigation Refactor:**
   - The Supporter Portal sub-navigation bar (`.supporter-subnav-bar`) consists of 3 primary view subtabs plus one dedicated scroll trigger:
     * `1. Register Details` (`#subtab-btn-details`) -> `#supporter-details-subtab`
     * `2. My Bookings History` (`#subtab-btn-bookings`) -> `#supporter-bookings-subtab`
     * `3. Driver Dispatch Console` (`#subtab-btn-dispatch`) -> `#supporter-dispatch-subtab`
     * `Apply to Drive (Bottom of Page)` (`#subtab-btn-driver-app-scroll`) -> executes `scrollToDriverApplication()`.
   - Legacy calls to `switchSupporterSubTab('supporter-driver-app-subtab')` automatically delegate to `scrollToDriverApplication()`.

2. **Web App Bottom Placement:**
   - Container `#driver-application-bottom-section` (`class="driver-app-bottom-section container"`) sits prominently at the bottom of the web application right above the global `<footer class="site-footer">`.
   - Supports smooth scroll alignment via CSS `scroll-margin-top: 100px`.

3. **Two-Tier Gating Lifecycle (`updateDriverApplicationGateUI`):**
   - **Gating Predicate (`isSupporterRegistered()`):**
     * Checks if current visitor has an authenticated and stored supporter profile (`getCurrentSupporter()` returns object with valid email or name).
     * **SuperAdmin Role Simulation Override:** If SuperAdmin switches perspective to `customer` (`sessionStorage['iasj_superadmin_view_role'] === 'customer'`), `isSupporterRegistered()` strictly returns `false`, enabling immediate testing of the locked gate experience.
   - **Tier 1 — Locked State (`#driver-app-gate-locked`):**
     * Displayed when visitor is NOT registered as a Community Supporter.
     * Contains explanatory messaging: "Community Supporter Registration Required".
     * Interactive unlock buttons:
       - `[Sign In with Google to Unlock Application]` (`data-agent-id="btn-gate-google-signup"`, `data-testid="btn-gate-google-signup"`) invoking `signUpWithGoogle('supporter')`.
       - `[Open Supporter Portal]` (`data-agent-id="btn-gate-goto-supporter-portal"`, `data-testid="btn-gate-goto-supporter-portal"`) invoking `switchTab('driver-admin-tab')`.
     * The driver form is strictly hidden (`display: none`).
   - **Tier 2 — Unlocked State (`#driver-app-gate-unlocked`):**
     * Displayed when visitor IS registered as a Community Supporter.
     * Displays verified supporter badge: `#driver-app-unlocked-supporter-name` (`${supporter.name} (${supporter.email})`).
     * Displays existing driver application notice `#drv-reg-existing-notice` if application already on file.
     * Reveals the complete `#driver-registration-form` with pre-filled supporter details (Name, Email, Phone, Address/Suburb) via `prefillDriverRegistrationForm(supporter)`.

4. **Form Submission & State Synchronization:**
   - Submitting `#driver-registration-form` (`handleDriverRegistrationSubmit`) saves or updates the driver profile in `providerDB` and Firestore, resets input fields, triggers `updateDriverApplicationGateUI()`, and navigates to `#driver-admin-tab` dispatch view with status toast feedback.

### 11.11 Driver Dispatch Console RBAC Visibility Contract (`DriverDispatchConsoleRbacVisibilityContract`)
Defines the strict role-based access control (RBAC) ensuring the Driver Dispatch Console is visible ONLY to approved Courier Drivers and SuperAdmin:

1. **Role Gating Predicate:**
   - Evaluated as `canSeeDispatch = (activeRole === 'driver' || activeRole === 'superadmin')`.
   - Any other role (such as `'supporter'`, `'customer'`, or unauthenticated visitor) evaluates `canSeeDispatch` as `false`.

2. **Supporter Subnav Tab Button (`#subtab-btn-dispatch`):**
   - Given class `.driver-and-superadmin-only` and initialized with `style="display:none;"`.
   - Dynamically toggled by `renderSupporterPanel()`:
     * When `canSeeDispatch === true`: `style.display = 'inline-flex'`.
     * When `canSeeDispatch === false`: `style.display = 'none'` (completely hidden from Community Supporters).

3. **Subtab View & Dispatch Console Container Gating:**
   - Both `#supporter-dispatch-subtab` and `#driver-dispatch-console` are strictly hidden (`display: none`) when `canSeeDispatch === false`.
   - If an unauthorized user or standard supporter attempts to navigate to `#supporter-dispatch-subtab` (via `switchSupporterSubTab`), the action is rejected:
     * Surfaces security toast: `🔒 Driver Dispatch Console is only accessible to approved Courier Drivers and SuperAdmin.`
     * Automatically redirects to `#supporter-details-subtab`.

4. **SuperAdmin Multi-Role Simulation Compatibility:**
   - When SuperAdmin simulates the `'supporter'` perspective, `#subtab-btn-dispatch` and `#driver-dispatch-console` are hidden instantly, allowing the administrator to verify the restricted supporter view.
   - When SuperAdmin switches back to `'driver'` or `'superadmin'`, `#subtab-btn-dispatch` and the console are immediately restored.

### 11.12 Unified Supporter Role & Customer Role Retirement Contract (`UnifiedSupporterRoleContract`)
Formally retires the separate `'customer'` RBAC role and unifies all client and community member capabilities under the `'supporter'` role:

1. **Role Taxonomy:**
   - Authoritative system roles are strictly:
     * `superadmin`: Supreme Ruler with full administrative privileges, driver approvals, distance tier pricing, token economy controls, and role simulation.
     * `driver`: Approved courier drivers with access to live dispatch, order acceptance, auto-geolocation, vehicle/bicycle mode settings, and token wallet management.
     * `supporter`: Community supporters and booking customers who can book courier pickups, review booking history, buy tokens, and apply to become independent drivers.
   - The `'customer'` role identifier is completely retired. Any legacy references or sessions with `role: 'customer'` automatically resolve to `'supporter'`.

2. **UI & Navigation Unification:**
   - SuperAdmin switcher panels (`#superadmin-role-switcher-section`, `#sa-banner-role-select`, `#google-menu-superadmin-switcher`) display strictly the three canonical roles:
     * `👑 SuperAdmin (Supreme Ruler)`
     * `🚚 Driver (Approved Courier Driver)`
     * `🤝 Supporter (Community & Bookings)`
   - The former `🛒 Customer` perspective button and dropdown option have been removed from the user interface.

### 11.13 SuperAdmin Driver Approval Map Visibility Gating Contract (`SuperadminDriverApprovalMapGatingContract`)
Enforces the mandatory rule that unapproved drivers cannot be shown on any map, while approved drivers are immediately visible:

1. **Authoritative Approval Helper (`isDriverApproved`):**
   - Implemented in `js/providers-data.js` and registered as `window.isDriverApproved`.
   - Criteria: `driver.approved === true || (driver.approved !== false && driver.status === 'active' && driver.status !== 'pending_approval' && driver.status !== 'revoked' && driver.isActive !== false)`.
   - Any driver with `approved === false`, `status === 'pending_approval'`, `status === 'revoked'`, or `isActive === false` is considered unapproved.

2. **Map Visibility Enforcement:**
   - **Contractor Directory Map (`updateOsmContractorMarkers`):** Leaflet marker generation iterates through all providers and strictly filters via `isDriverApproved(provider)`. Unapproved drivers are never placed on the map, never included in the distance radius, and never shown in the public map directory.
   - **Courier Route Map (`renderOsmCourierRouteMap`):** Real-time driver pins (Pink for female, Blue for male) plotted along the pickup-to-destination route strictly filter `allDrivers` with `isDriverApproved(drv)`. Unapproved drivers are never plotted around the customer's route polyline.
   - **Contractor List Filtering (`filterContractors`):** Excludes unapproved drivers from directory search results and contractor listings.

3. **SuperAdmin Driver Approval Console (`renderSuperadminDriverApprovals`):**
   - Status badge explicitly communicates map visibility:
     * Approved: `"Approved by SuperAdmin (Shown on Map)"` (`#065F46` / `#ECFDF5`).
     * Pending/Revoked: `"Pending SuperAdmin Approval (Hidden from Map)"` (`#92400E` / `#FEF3C7`).
   - Driver row info indicator:
     * Approved: `<strong style="color:#059669;"><i class="fa-solid fa-map-location-dot"></i> Shown on Map</strong>`.
     * Pending/Revoked: `<strong style="color:#D97706;"><i class="fa-solid fa-eye-slash"></i> Hidden from Map</strong>`.
   - Action buttons:
     * `[<i class="fa-solid fa-check"></i> Approve (Show on Map)]`
     * `[<i class="fa-solid fa-ban"></i> Revoke (Hide from Map)]`

4. **Live Reactive Map Updates:**
   - `approveDriverBySuperadmin(driverId)`: Sets `approved = true`, `status = 'active'`, updates Firestore, re-renders the SuperAdmin approvals table, and immediately triggers `updateOsmContractorMarkers()` and `renderOsmCourierRouteMap()`. Displays toast: `"✅ Driver '<name>' has been APPROVED by SuperAdmin and is now LIVE ON THE MAP!"`.
   - `revokeDriverBySuperadmin(driverId)`: Sets `approved = false`, `status = 'pending_approval'`, updates Firestore, re-renders the table, and immediately triggers `updateOsmContractorMarkers()` and `renderOsmCourierRouteMap()`. Displays toast: `"⚠️ Driver '<name>' approval has been REVOKED by SuperAdmin and REMOVED FROM THE MAP."`.

### 11.14 Separate Motor Vehicle & Bicycle Courier Services Contract (`SeparateVehicleAndBicycleServicesContract`)
Enforces the mandatory architectural rule that Motor Vehicle Courier and Bicycle Courier are two completely separate services with independent pricing and distinct physical constraints:

1. **Independent Rate & Capacity Schemas:**
   - **Motor Vehicle Courier Service:**
     * `vehiclePerKmRateAud`: Per-kilometer rate in $ AUD (e.g. $2.20 AUD / km default).
     * `vehicleSameDayFeeAud`: Flat same-day dispatch fee in $ AUD (default $0).
     * `vehicleUrgentFeeAud`: Flat urgent dispatch fee in $ AUD (default $0).
     * `vehicleMaxWeightKg`: Maximum payload weight in kg (default 50 kg, configurable up to 10,000 kg for vans/utes).
     * `vehicleMaxHeightCm`: Maximum item height in cm (default 70 cm).
     * `vehicleMaxWidthCm`: Maximum item width in cm (default 50 cm).
     * `vehicleMaxLengthCm`: Maximum item length in cm (default 50 cm).
   - **Bicycle Courier Service (Letters, Documents & Food Deliveries Only):**
     * `bicyclePerKmRateAud`: Per-kilometer rate in $ AUD (e.g. $1.80 AUD / km default).
     * `bicycleSameDayFeeAud`: Flat same-day fee in $ AUD (default $0).
     * `bicycleUrgentFeeAud`: Flat urgent fee in $ AUD (default $0).
     * `bicycleMaxWeightKg`: Maximum backpack/pannier weight in kg (default 8 kg, strictly capped for cycling safety).
     * `bicycleMaxHeightCm`: Maximum backpack height in cm (default 35 cm).
     * `bicycleMaxWidthCm`: Maximum backpack width in cm (default 30 cm).
     * `bicycleMaxLengthCm`: Maximum backpack length in cm (default 40 cm).

2. **Form Architecture & DOM Automation:**
   - **Driver Registration Form (`#driver-registration-form`):**
     * Motor Vehicle box (`#drv-reg-vehicle-rates-box`): Contains `drv-reg-per-km`, `drv-reg-sameday-fee`, `drv-reg-urgent-fee`, `drv-reg-max-weight`, `drv-reg-max-height`, `drv-reg-max-width`, `drv-reg-max-length`.
     * Bicycle Courier box (`#drv-reg-bicycle-rates-box`): Contains `drv-reg-bike-per-km`, `drv-reg-bike-sameday-fee`, `drv-reg-bike-urgent-fee`, `drv-reg-bike-max-weight`, `drv-reg-bike-max-height`, `drv-reg-bike-max-width`, `drv-reg-bike-max-length`.
   - **Driver Admin Profile Form (`#adm-drv-form`):**
     * Motor Vehicle box (`#adm-vehicle-rates-box`): Contains `adm-drv-per-km`, `adm-drv-sameday-fee`, `adm-drv-urgent-fee`, `adm-drv-max-weight`, `adm-drv-max-height`, `adm-drv-max-width`, `adm-drv-max-length`.
     * Bicycle Courier box (`#adm-bicycle-rates-box`): Contains `adm-drv-bike-per-km`, `adm-drv-bike-sameday-fee`, `adm-drv-bike-urgent-fee`, `adm-drv-bike-max-weight`, `adm-drv-bike-max-height`, `adm-drv-bike-max-width`, `adm-drv-bike-max-length`.
   - All 20 inputs are bound with `data-agent-id`, `data-testid`, and descriptive `aria-label` attributes.

3. **Quoting, Fit & Pricing Enforcement:**
   - When a job is quoted under Bicycle mode, package weight and dimensions are strictly tested against `driver.bicycleMaxWeightKg` and `driver.bicycleMaxHeightCm/Width/Length`, and priced via `driver.bicyclePerKmRateAud`.
   - When quoted under Motor Vehicle mode, package weight and dimensions are tested against `driver.vehicleMaxWeightKg` and `driver.vehicleMaxHeightCm/Width/Length`, and priced via `driver.vehiclePerKmRateAud`.
   - Contractor cards and Leaflet map popups provide instant toggle buttons (`[🚗 Motor Vehicle]` and `[🚲 Bicycle Courier]`), dynamically switching displayed rates, fees, max weight, and max dimensions to reflect the chosen service.
   - SuperAdmin Driver Approval Console displays both service profiles side-by-side with complete rate and dimension breakdowns.

### 11.15 Footer Driver Application Placement Contract (`FooterDriverApplicationPlacementContract`)
Defines the mandatory layout and navigation contract ensuring the Courier Driver Application is accessible directly from the bottom of the footer adjacent to Terms of Service:

1. **Footer Layout & Peer Placement:**
   - In `<footer class="site-footer">`:
     * Main Navigation Links Row: Placed immediately after `Terms of Service`:
       `<a href="#driver-application-bottom-section" onclick="scrollToDriverApplication(event); return false;" data-agent-id="footer-driver-app-link" data-testid="footer-driver-app-link"><i class="fa-solid fa-truck-fast"></i> Courier Driver Application</a>`.
     * Bottom Sub-Footer Legal Row: Positioned next to the copyright and legal notice:
       `<a href="/terms.html">Terms of Service</a> • <a href="#driver-application-bottom-section" onclick="scrollToDriverApplication(event); return false;" data-agent-id="footer-bottom-driver-app-link" data-testid="footer-bottom-driver-app-link"><i class="fa-solid fa-truck-fast"></i> Courier Driver Application</a>`.
   - In `terms.html` footer:
     * Added direct reciprocal link next to `Terms of Service`:
       `<a href="/terms.html">Terms of Service</a> • <a href="/#driver-application-bottom-section"><i class="fa-solid fa-truck-fast"></i> Courier Driver Application</a>`.

2. **Smooth Scroll & Navigation Synchronization:**
   - `scrollToDriverApplication(event)`:
     * Prevents default jump and smoothly scrolls the viewport to `#driver-application-bottom-section`.
     * Updates the browser URL hash to `#driver-application-bottom-section` without triggering page reload.
   - `initApp()` router handles deep-links containing `#register`, `#driver-application`, or `#driver-application-bottom-section` by auto-scrolling directly to the application card upon page readiness.

3. **DOM Automation & Accessibility:**
   - Attributes: `data-agent-id="footer-driver-app-link"`, `data-testid="footer-driver-app-link"`, `aria-label="Courier Driver Application"`.

### 11.16 Apply to Drive Footer-Exclusivity Contract (`ApplyToDriveFooterExclusivityContract`)
Enforces that the application entry point to become a driver is exclusively accessible via the bottom footer next to Terms of Service, eliminating clutter and redundant buttons in the Supporter Portal:

1. **Elimination of Redundant Portal Buttons:**
   - `#subtab-btn-driver-app-scroll` ("Apply to Drive (Bottom of Page)") is strictly removed from the `.supporter-subnav-bar`.
   - `#btn-goto-driver-app` ("Apply to Become Driver (Bottom of Page)") is strictly removed from the `#supporter-not-driver-notice` inside the Dispatch subtab.
   - Any other non-footer buttons or tabs for applying to drive are deprecated and removed.

2. **Clean Supporter Subnavigation Architecture:**
   - The Supporter Portal subnav contains exclusively:
     * `1. Register Details` (`#subtab-btn-details`)
     * `2. My Bookings History` (`#subtab-btn-bookings`)
     * `Driver Dispatch Console` (`#subtab-btn-dispatch` — visible only to approved drivers & superadmin).

3. **Footer-Only Entry Point:**
   - The Courier Driver Application is exclusively linked via:
     * `#footer-driver-app-link`: Main footer navigation row, immediately following `Terms of Service`.
     * `#footer-bottom-driver-app-link`: Bottom sub-footer row, adjacent to `Terms of Service`.
     * `#terms-footer-driver-app-link`: `terms.html` reciprocal footer link.

### 11.17 Unified Single-Section Footer Contract (`UnifiedSingleSectionFooterContract`)
Combines the site footer into a single, cohesive section with consistent vertical rhythm, eliminating fragmented sub-footer dividers or split boxes:

1. **Unified Container Layout:**
   - `<footer class="site-footer">`:
     * Single vertical flex column container (`.container` with `display:flex; flex-direction:column; gap:1.15rem;`).
     * No internal divider lines (`border-top: 1px solid rgba(255,255,255,0.1)` removed).
   - Component Flow:
     1. Brand Title & Tagline: `It's A Simple Job — Short-Haul Couriers` with regional coverage, 9:00 AM – 4:00 PM window, and PayID AUD settlement note.
     2. Primary Navigation Row: `Book Service`, `Closest Drivers`, `Supporter Portal` (gated), `How It Works`, `Terms of Service`, and `Courier Driver Application` (gated to supporters).
     3. Legal & Copyright Row: Clean copyright notice with ABN and AUD currency declaration (duplicate bottom Terms of Service and Courier Driver Application links removed).

2. **DOM Automation & Testing Selectors:**
   - All interactive footer links maintain their explicit `data-agent-id`, `data-testid`, and `aria-label` attributes.

### 11.18 Supporter-Gated Application & Driver Information Contract (`SupporterGatedApplicationAndDriverInfoContract`)
Defines the strict visibility and operational contracts for the driver application and driver information lifecycle:

1. **Supporter-Only Driver Application Gating:**
   - Section `#driver-application-bottom-section` ("The Driver Network • Join the Fleet — Courier Driver Application") is hidden by default (`display:none;`) and exclusively made visible once a user is verified as a registered supporter (`isSupporterRegistered() === true`).
   - The Courier Driver Application link in the footer (`#footer-driver-app-link`) is strictly hidden until the user is a registered supporter.
   - Deep-linking or attempting navigation to `#driver-application-bottom-section` without supporter registration redirects to the Supporter Portal with an instructive toast message.

2. **SuperAdmin Approval Transition:**
   - Upon driver application submission, the driver record is created with `status: 'pending_approval'` and `approved: false`.
   - SuperAdmin reviews and approves the application via `approveDriverBySuperadmin(driverId)`.
   - Once approved, the user's role is promoted to `driver`, granting access to driver dispatch and profile management features.

3. **Driver Information Placement Next to Driver Dispatch Console:**
   - In the Supporter Portal navigation subnav (`.supporter-subnav-bar`), the `Driver Information` button (`#subtab-btn-driver-info`) is placed immediately adjacent to `Driver Dispatch Console` (`#subtab-btn-dispatch`). Both buttons are gated with class `driver-and-superadmin-only` (strictly hidden from ordinary supporters).
   - In `#driver-dispatch-console`, a dedicated header banner (`#driver-dispatch-quick-info-bar`) displays the active driver's name, approval badge, and direct button (`#btn-quick-goto-driver-info`) to view/edit full driver information.
   - Dedicated subtab view `#supporter-driver-info-subtab` displays the complete driver profile, verified approval badge, PayID address, live GPS location with auto-geolocate trigger, driver token balance with top-up trigger, and complete editable rates and package limits form (`#driver-info-settings-form`) with real-time quote and map synchronization.

### 11.19 SuperAdmin Universal Token Management Contract (`SuperadminUniversalTokenManagementContract`)
Defines the strict contracts and interfaces for universal token balance management across all platform roles by SuperAdmin:

1. **Target Account Aggregation (`getSuperadminManageableAccounts()`):**
   - Aggregates accounts across three distinct ledger sources:
     1. Platform Vault (`id: 'superadmin_vault'`): SuperAdmin revenue and balance from `window.superadminDB`.
     2. Courier Drivers (`id: 'driver:<id>'`): Active and registered drivers from `window.providerDB`.
     3. Supporters (`id: 'supporter:<id>'`): Registered community supporters from `window.supporterDB`.
   - Returns structured records with `id`, `rawId`, `type` (`'superadmin' | 'driver' | 'supporter'`), `name`, `email`, `roleLabel`, and strict integer `balance`.

2. **The Three Core SuperAdmin Token Operations:**
   - **Refresh to 0 Tokens (`handleSuperadminRefreshTokenZero(btn)`):**
     * Immediately resets the selected account's token balance to strict `0`.
     * Zero-out action is protected by the `iasjConfirmDelete` two-step confirmation protocol to prevent accidental balance wipe.
   - **Add Tokens (`handleSuperadminAddTokens()`):**
     * Credits a positive integer number of tokens (`Math.max(1, Math.round(Number(amount)))`) to the selected account's balance.
     * Quick preset chips provided: `+5`, `+10`, `+25`, `+50`, `+100`.
   - **Minus Tokens (`handleSuperadminMinusTokens()`):**
     * Deducts a positive integer number of tokens from the selected account's balance.
     * Enforces strict lower bound of `0` (`Math.max(0, balance - amount)`). Never produces negative token balances.
     * Quick preset chips provided: `-5`, `-10`, `-15`, `-25`, `-50`.

3. **Inline Driver Approval Console Quick Controls:**
   - In each driver row rendered inside `#superadmin-driver-approvals-list`, SuperAdmin is provided:
     * Current token balance badge (`<i class="fa-solid fa-coins"></i> <balance>`).
     * Instant inline quick action buttons:
       - `+10` (`quickModifyDriverTokens(driverId, 10)`): Instant credit of 10 tokens.
       - `-5` (`quickModifyDriverTokens(driverId, -5)`): Instant debit of 5 tokens (floored at 0).
       - `0` (`quickRefreshDriverTokensZero(driverId)`): Instant reset to 0 tokens.

4. **Multi-View Balance Synchronization (`syncAllTokenDisplays()`):**
   - Automatically synchronizes token counts across all active platform views and headers:
     * `#superadmin-token-vault-balance`
     * `#sa-token-target-balance`
     * `#driver-admin-token-balance`
     * `#nav-driver-token-count`
     * `#driver-info-tokens`
     * `#supporter-token-balance`
     * `#topup-driver-balance`
     * `#superadmin-driver-approvals-list` (re-renders row balances)

### 11.20 Thin Geolocation Footer Bar Clean Layout Contract (`ThinGeolocationFooterBarContract`)
Defines the layout and elements of the absolute bottom fixed footer bar (`#geo-time-footer-bar`):
1. **Content Sequence:**
   - Geolocation Suburb Pill (`#geo-bar-suburb-pill`): Location pin icon + Suburb, State (e.g. `📍 Southport, QLD`).
   - Weather Pill (`#geo-bar-weather-pill`): Weather icon + current temperature & condition (e.g. `☀️ 24°C Sunny`).
   - Time Pill (`#geo-bar-time-pill`): Clock icon + localized time in 12h/24h format (e.g. `🕒 1:30 PM AEST`).
   - Regional Settings Link (`.geo-bar-config-link`): Sliders icon + "Regional Settings" (opens `#geo-time-modal`).
2. **Exclusion of Redundant Country / AU AU Indicators:**
   - Any country pill, flag emoji (`#geo-bar-flag`), or country text (`#geo-bar-country-name`) rendering redundant "AU AU" is strictly removed from the bar.
   - The platform exclusively serves Australia (South Brisbane to Coolangatta in AUD), so the bar begins directly with the local geolocation suburb.

### 11.21 Courier Driver Application Popup Modal & Draft Persistence Contract (`DriverAppModalAndDraftContract`)
Defines the modal architecture and draft lifecycle for the Courier Driver Application:
1. **Supporter Page Flow Protection:**
   - The Courier Driver Application is strictly excluded from the in-page document flow of the Supporter Portal and cannot appear in the middle of the supporter page.
   - Encapsulated entirely in `#driver-application-modal` (`.modal-overlay`, `role="dialog"`, `aria-modal="true"`).
   - Triggered exclusively by clicking the "Courier Driver Application" link in the bottom footer (`#footer-driver-app-link`) or calling `openDriverApplicationModal()`.

2. **Draft Persistence & "Save Application & Return Later" Lifecycle:**
   - **Save Draft (`saveDriverApplicationDraft(notify)`):**
     * Captures all entered application data (personal details, gender pin color, vehicle, street address, GPS coordinates, licence details, PayID, delivery modes, custom per-km rates, same-day/urgent fees, and max parcel limits).
     * Saves to `localStorage['iasj_driver_application_draft']` and user-keyed `localStorage['iasj_driver_draft_<email>']`.
     * Displays a live draft status pill (`#driver-app-draft-status`) and in-progress draft banner (`#drv-app-draft-banner`).
     * Dedicated button `#btn-save-driver-app-draft` ("Save Application & Come Back Later") allows applicants to save progress and close the modal anytime.
   - **Auto-Save on Input (`initDriverAppDraftAutoSave()`):**
     * Automatically saves draft with 400ms debounce on all form inputs and changes, ensuring no user effort is lost if the window is closed unexpectedly.
   - **Draft Loading (`loadDriverApplicationDraft(email)`):**
     * Restores draft values into `#driver-registration-form` when opened by an applicant who does not yet have a finalized profile in `providerDB`.
   - **Draft Clearing (`clearDriverApplicationDraft(email)`):**
     * Clears draft from localStorage immediately upon successful registration submission via `handleDriverRegistrationSubmit`.

3. **Modal UI & Keyboard Controls:**
   - Fixed header with title, subtitle, draft status pill, and close button (`#btn-close-driver-app-modal`).
   - Scrollable modal body (`max-height: 90vh; overflow-y: auto;`) hosting both Gate 1 (Supporter registration required) and Gate 2 (Unlocked application form).
   - Backdrop click and Escape key automatically save in-progress draft before closing the modal.

### 11.22 Active Driver Profile Ownership RBAC & Dual-Gate Map Visibility Contract (`ActiveDriverProfileOwnershipAndMapVisibilityContract`)
Defines strict profile ownership isolation for Active Driver Profile views and the dual-condition gate required for a driver to appear on customer maps:
1. **Active Driver Profile Ownership & RBAC Isolation (`getOwnedDriverProfile`, `canUserAccessDriverProfile`, `getAccessibleDriverProfilesForCurrentUser`):**
   - **Registered Driver (Profile Owner):**
     * Can ONLY view, select, geolocate, and edit their own registered driver profile (`getAccessibleDriverProfilesForCurrentUser()` returns `[ownedDriver]`).
     * `#driver-admin-select` is populated exclusively with their own profile and locked (`disabled = true`), displaying `#active-driver-ownership-badge` (`Your Owned Profile Only`).
     * Recorded customer orders in `#driver-admin-orders-container` are strictly filtered to `driverOrders` for that driver (`o.driverId === activeDriver.id`), never exposing other drivers' orders.
   - **SuperAdmin:**
     * Can view, switch between, and manage all registered driver profiles (`getAccessibleDriverProfilesForCurrentUser()` returns `providerDB.getAll()`, `selectEl.disabled = false`).
   - **Non-Driver Supporter / Guest:**
     * `getAccessibleDriverProfilesForCurrentUser()` returns `[]`; `#active-driver-profile-selector-wrap`, `#driver-dispatch-console`, and `#supporter-driver-info-subtab` are strictly hidden.

2. **Dual-Gate Map Visibility (`isDriverProfileTurnedOn`, `isDriverApproved`, `isDriverVisibleOnMap`):**
   - **Condition 1 — Driver Profile Turned ON (`isDriverProfileTurnedOn(driver)`):**
     * Controlled by the driver (or SuperAdmin) via `#btn-toggle-driver-profile-on` (in Driver Dispatch Console) and `#btn-info-toggle-driver-profile-on` (in Driver Information tab), calling `toggleActiveDriverProfileOn()` / `providerDB.setDriverProfileTurnedOn(driverId, isTurnedOn)`.
     * Stored on the driver record as `profileTurnedOn: boolean` and `profileActive: boolean` (default `true`).
   - **Condition 2 — SuperAdmin Approved (`isDriverApproved(driver)`):**
     * Controlled exclusively by SuperAdmin in the Driver Approval Console via `approveDriverBySuperadmin(driverId)` / `revokeDriverBySuperadmin(driverId)`.
   - **Combined Map Visibility Rule (`isDriverVisibleOnMap(driver) === isDriverApproved(driver) && isDriverProfileTurnedOn(driver)`):**
     * A driver is shown on customer maps (`updateOsmContractorMarkers`, `drawCourierRouteOnOsmMap`, `filterContractors`, and `updateCourierPricingWithSettings`) **ONLY IF** the driver has their profile turned ON **AND** SuperAdmin has approved the driver.
     * If the driver turns their profile OFF, or if SuperAdmin has not approved / revokes the driver, the driver is immediately hidden from all maps and customer driver selection lists.

