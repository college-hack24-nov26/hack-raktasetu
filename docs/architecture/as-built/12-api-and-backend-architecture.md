# RaktaSetu — API & Backend Architecture

## 1. API Architecture Overview

The RaktaSetu REST API is powered by Express.js 4 mounted on port 4000. All operational endpoints are prefixed with `/api/v1` and grouped into 19 dedicated routers in [`apps/api/src/routes/`](file:///d:/MyProject/RaktSetu/apps/api/src/routes).

### Universal Response Contract
All API responses adhere to a consistent standardized envelope:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable feedback"
}
```
Error responses return structured error objects:
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Insufficient permissions for organisation: clinical:release required."
  }
}
```

---

## 2. API Endpoints Master Catalog

### Module: Admin Matching Operations (`routes/adminMatching.ts`)
| Method | Path | Required Role / Permission | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/admin/donor-matching/requests` | `Role.ADMIN` | List pending matching requests across all blood banks |
| `POST`| `/api/v1/admin/donor-matching/requests/:id/run` | `Role.ADMIN` | Execute deterministic donor matching algorithm |
| `POST`| `/api/v1/admin/donor-matching/requests/:id/release` | `Role.ADMIN` | Explicitly approve and release candidate list |
| `POST`| `/api/v1/admin/donor-matching/requests/:id/cancel` | `Role.ADMIN` | Cancel matching run or request |

### Module: Blood Bank Incoming & Shortfall Operations (`routes/hospital.ts`)
| Method | Path | Required Role / Permission | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/organisation/:orgId/incoming-requests` | `operational:read` | Fetch patient blood requests designated to this centre |
| `POST`| `/api/v1/organisation/:orgId/requests/:id/request-matching` | `operational:write` | Initiate donor matching request for shortfall |
| `GET` | `/api/v1/organisation/:orgId/requests/:id/matching-candidates` | `operational:read` | Fetch admin-released candidates (masked PII) |
| `POST`| `/api/v1/organisation/:orgId/requests/:id/donor-invitation` | `operational:write` | Send outreach invitation or record donor response |
| `POST`| `/api/v1/organisation/:orgId/hospital-issue-orders` | `handover:create` | Generate hospital issue order for patient fulfillment |
| `POST`| `/api/v1/blood-requests/:id/patient-acknowledge` | `requireAuth` | Patient bedside confirmation of unit receipt |

### Module: Blood Requests & Directory (`routes/requests.ts`, `routes/bloodCentres.ts`)
| Method | Path | Required Role / Permission | Purpose |
|---|---|---|---|
| `POST`| `/api/v1/blood-requests` | `requireAuth` | Submit canonical emergency blood request |
| `GET` | `/api/v1/blood-requests` | `requireAuth` | List blood requests created by authenticated user |
| `GET` | `/api/v1/blood-requests/:id` | `requireAuth` | Get comprehensive request details and tracking state |
| `POST`| `/api/v1/blood-requests/:id/cancel` | `requireAuth` | Cancel active blood request |
| `GET` | `/api/v1/blood-centres` | Public | Search certified blood centres by district/state |
| `GET` | `/api/v1/blood-centres/:id` | Public | Get detailed profile and availability of a centre |
| `GET` | `/api/v1/blood-availability` | Public | Query component availability across centres |

### Module: Inventory & Clinical Processing (`routes/inventory.ts`, `routes/processing.ts`, `routes/traceability.ts`)
| Method | Path | Required Role / Permission | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/organisations/:orgId/inventory/summary` | `inventory:view` | Aggregated inventory counts by group and status |
| `POST`| `/api/v1/organisations/:orgId/components/derive` | `component:derive` | Derive PRBC, FFP, Platelets from Whole Blood |
| `POST`| `/api/v1/organisations/:orgId/components/:id/lab-tests` | `lab:record` | Enter TTI lab test results (HIV, HBsAg, HCV, etc.) |
| `POST`| `/api/v1/organisations/:orgId/components/:id/release` | `clinical:release` | Medical Officer clinical sign-off into available stock |
| `GET` | `/api/v1/traceability/requests/:id/lineage` | `operational:read` | End-to-end audit tree from request to fulfillment |

### Module: Voluntary Donors & Location Sharing (`routes/donors.ts`, `routes/donorLocation.ts`)
| Method | Path | Required Role / Permission | Purpose |
|---|---|---|---|
| `POST`| `/api/v1/donor-registration/submit` | `requireAuth` | Submit multi-step donor health questionnaire |
| `GET` | `/api/v1/donors/me` | `requireAuth` | Fetch donor profile, donation history, cooldown |
| `POST`| `/api/v1/donor-location/session/start` | `requireAuth` | Start live GPS tracking session with consent |
| `POST`| `/api/v1/donor-location/session/stop` | `requireAuth` | Stop active location sharing session |
| `POST`| `/api/v1/donor-location/update` | `requireAuth` | Ingest mobile GPS coordinates (lat, lng, accuracy) |
| `GET` | `/api/v1/donor-location/admin/snapshot` | `Role.ADMIN` / Staff | View active donor fleet on live map |

---

## 3. API-to-UI Traceability Matrix

| Web UI Page / View | User Action | API Endpoint Called | Backend Route Handler | Business Service |
|---|---|---|---|---|
| `/requests/new` | Click "Submit Request" | `POST /api/v1/blood-requests` | `requestsRouter.post` | `BloodRequestCoordinationService` |
| `/requests/[id]` | View Request Stage | `GET /api/v1/blood-requests/:id` | `requestsRouter.get` | `BloodRequestCoordinationService` |
| `HospitalIntegrationView` | Click "Request Matching" | `POST /api/v1/organisation/:orgId/requests/:id/request-matching` | `hospitalRouter.post` | `AdminMatchingService` |
| `BloodRequestOperationsView`| Click "Run Algorithm" | `POST /api/v1/admin/donor-matching/requests/:id/run` | `adminMatchingRouter.post` | `AdminMatchingService` |
| `BloodRequestOperationsView`| Click "Release Candidates"| `POST /api/v1/admin/donor-matching/requests/:id/release` | `adminMatchingRouter.post` | `AdminMatchingService` |
| `HospitalIntegrationView` | Open Candidate Modal | `GET /api/v1/organisation/:orgId/requests/:id/matching-candidates` | `hospitalRouter.get` | `AdminMatchingService` |
| `ProcessingAndInventoryView`| Click "Derive Components"| `POST /api/v1/organisations/:orgId/components/derive` | `processingRouter.post` | `ProcessingAndInventoryService` |
| `ProcessingAndInventoryView`| Click "Clinical Release" | `POST /api/v1/organisations/:orgId/components/:id/release` | `processingRouter.post` | `ProcessingAndInventoryService` |
| `/donor-dashboard` | Toggle GPS Sharing | `POST /api/v1/donor-location/session/start` | `donorLocationRouter.post` | `DonorLocationService` |
| `/requests/[id]` | Bedside Receipt Ack | `POST /api/v1/blood-requests/:id/patient-acknowledge` | `hospitalRouter.post` | `HospitalIntegrationService` |

