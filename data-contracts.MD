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
   - Token amounts must strictly be positive integers (`Math.round`, no floating decimals).
   - Stripe amounts must strictly be positive integer cents (e.g., \$10.00 AUD = `1000`).
   - AUD displays exclusively in Australia (`AU`) via geolocation; USD displays for international visitors.
   - Admin controls `isTokenSystemEnabled`, `isAudEnabled`, `isUsdEnabled`, and item CRUD independently.

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
  "title": "CourierQuoteContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["origin", "dest", "weightKg", "urgency", "distanceKm", "totalAudCents"],
  "properties": {
    "origin": { "type": "string", "minLength": 3 },
    "dest": { "type": "string", "minLength": 3 },
    "weightKg": { "type": "integer", "minimum": 1, "maximum": 1000 },
    "urgency": {
      "type": "string",
      "enum": ["standard", "express"]
    },
    "distanceKm": { "type": "number", "minimum": 0.1 },
    "totalAudCents": {
      "type": "integer",
      "minimum": 500,
      "description": "Total delivery cost strictly in integer AUD cents"
    }
  }
}
```

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

### 5.2 `GET /api/token-quote`
Calculates live token pricing in AUD or USD based on visitor location and daily FX rates.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ApiTokenQuoteResponseContract",
  "type": "object",
  "additionalProperties": false,
  "required": ["country", "currency", "defaultCurrency", "tokenPriceUsd", "fxRate", "quotes"],
  "properties": {
    "country": { "type": "string", "pattern": "^[A-Z]{2}$" },
    "currency": { "type": "string", "enum": ["AUD", "USD"] },
    "defaultCurrency": { "type": "string", "enum": ["AUD", "USD"] },
    "tokenPriceUsd": { "type": "number", "minimum": 0 },
    "fxRate": { "type": "number", "minimum": 0 },
    "fxDate": { "type": ["string", "null"] },
    "fxSource": { "type": ["string", "null"] },
    "quotes": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["tokens", "total", "totalCents"],
        "properties": {
          "tokens": { "type": "integer", "minimum": 1 },
          "total": { "type": "number" },
          "totalCents": { "type": "integer", "minimum": 0 }
        }
      }
    }
  }
}
```

### 5.3 `POST /api/token-purchase`
Initiates a Stripe Checkout Session or PaymentIntent for purchasing token packages.

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
      "minimum": 5,
      "maximum": 50000,
      "description": "Whole integer tokens only"
    },
    "currency": {
      "type": "string",
      "enum": ["AUD", "USD"]
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
  "required": ["purchaseId", "clientSecret", "amountCents", "currency", "tokens"],
  "properties": {
    "purchaseId": { "type": "string" },
    "clientSecret": { "type": "string" },
    "amountCents": { "type": "integer", "minimum": 50 },
    "currency": { "type": "string", "enum": ["aud", "usd"] },
    "tokens": { "type": "integer" }
  }
}
```

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

---

## 6. Superadmin Platform Configuration Contract

Controls global feature flags in Cloud Firestore (`platform_settings/global`).

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

---


### 6.4 Token Price Item Display & Currency Hover Contract
Enforces integer tokens as primary value across all service items, with AUD/USD strictly on hover based on geolocation.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TokenPriceItemDisplayContract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "tokens",
    "displayHtml",
    "hoverCurrency",
    "hoverAmount",
    "isAudEnabled",
    "isUsdEnabled",
    "isTokenSystemEnabled"
  ],
  "properties": {
    "tokens": {
      "type": "integer",
      "minimum": 0,
      "description": "Strict integer tokens (Math.round, no decimals)"
    },
    "displayHtml": {
      "type": "string",
      "description": "HTML snippet rendering primary token tag and hover fiat reveal"
    },
    "hoverCurrency": {
      "type": "string",
      "enum": ["AUD", "USD"]
    },
    "hoverAmount": {
      "type": "string",
      "pattern": "^\d+\.\d{2}$"
    },
    "isAudEnabled": { "type": "boolean" },
    "isUsdEnabled": { "type": "boolean" },
    "isTokenSystemEnabled": { "type": "boolean" }
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

---

## 7. Change Log & Maintenance Rules

- Whenever a form field, API endpoint, or database collection schema is created or modified, **`data-contracts.MD` must be updated concurrently**.
- All data contracts must adhere to `additionalProperties: false` to ensure total payload determinism.
- Australian Privacy Act guidelines must be enforced on any field storing individual identity or contact information.

