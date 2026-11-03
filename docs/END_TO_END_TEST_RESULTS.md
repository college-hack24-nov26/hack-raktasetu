# RaktaSetu — End-to-End Test Execution Evidence & Route Matrix

**Document Purpose:** This document provides the concrete test evidence, pass/fail results, and verified route-to-workflow inventory across automated test suites, production builds, and browser QA scenarios for RaktaSetu.

---

## 1. Verified Route-to-Workflow Inventory

| Feature | Actual Frontend Page | Actual API Route | Required Role | Preconditions | Resulting State | Persisted Entities | Verification Method |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Public Blood Availability** | `/find-blood` | `GET /api/v1/availability` | Public | None | Displays live released stock & external directory | `ComponentUnit`, `BloodAvailabilitySnapshot` | Automated API test & Browser Search |
| **Public Camps Directory** | `/camps` | `GET /api/v1/camps` | Public | Camp approved by parent blood bank | Displays approved upcoming drives | `Camp` (`status: APPROVED`) | Automated Phase 3 test & Browser `/camps` |
| **Donor Authentication** | `/login` | `POST /api/v1/auth/demo-login` | Public | 10-digit mobile number | Session token issued; redirects to `/donor-dashboard` | `Session`, `AuditLog` | Automated Phase 2 test & Browser Login |
| **Donor Registration** | `/donor-registration`| `POST /api/v1/donors` | `USER` | Authenticated session | Donor profile created; searchable opt-in | `DonorProfile` | Automated Phase 2 test & Browser `/donor-registration` |
| **Donor Dashboard & WS** | `/donor-dashboard` | `GET /api/v1/donors/me/requests` | `DONOR` | Active donor profile | Real-time emergency requests rendered | `DonorResponse` | WebSocket outbox dispatch & Browser Dashboard |
| **Emergency Blood Request**| `/requests/new` | `POST /api/v1/requests` | `USER` | Authenticated session | Request opened; eligible nearby donors matched | `BloodRequest`, `DonorResponse` | Automated Phase 8 test & Browser `/requests/new` |
| **Request Closure** | `/requests` | `PATCH /api/v1/requests/:id/close` | `USER` (Requester) | Open request with responses | Request fulfilled/cancelled; active matching stopped | `BloodRequest` (`status: CLOSED`) | Browser modal test with Escape/Scroll tests |
| **Blood Bank Onboarding** | `/organisation/register-bank` | `POST /api/v1/organisations/applications` | Public | CDSCO license, valid mobile | Application queued for platform verification | `OrganisationApplication` (`SUBMITTED`) | Automated Phase 2 test & Browser form |
| **Application Approval** | `/organisation/portal` (Track App) | `POST /api/v1/organisations/applications/:id/review` | Platform `ADMIN` | Application submitted; reviewer not applicant | Organisation verified; applicant gets `ORG_ADMIN` | `Organisation`, `UserMembership` | Automated Phase 2 test (Assertion 8) & Portal |
| **Staff Member Login** | `/organisation/login` | `POST /api/v1/auth/demo-login` & `/organisations/me/memberships` | Active Org Staff | Active membership in verified organisation | Token issued; routes to `/organisation/portal` | `Session`, `OrganisationMembership` | Automated Phase 2 test & Browser `/organisation/login` |
| **Camp Proposal** | `/organisation/register-camp` | `POST /api/v1/camps` | Community Organiser / Public | Verified parent blood bank selected | Camp created in `PROPOSED` status; hidden publicly | `Camp` (`status: PROPOSED`) | Automated Phase 3 test & Browser `/register-camp` |
| **Camp Approval** | `/organisation/portal` (Camps tab) | `PATCH /api/v1/camps/:id/status` | `ORG_ADMIN` (Parent Org) | Proposed camp pending | Camp approved; becomes visible in public `/camps` | `Camp` (`status: APPROVED`) | Automated Phase 3 test (Assertion 6) & Portal |
| **Camp Operational Readiness** | `/organisation/portal` (Camps tab) | `POST /api/v1/camps/:id/readiness` | `COLLECTION_STAFF` / `ORG_ADMIN` | Approved camp | Readiness verified; collection authorized | `Camp` (`isReadyForCollection: true`) | Automated Phase 3 test (Assertion 7) & Portal |
| **Camp Attendance Check-In** | `/organisation/portal` (Camps tab) | `POST /api/v1/camps/:id/attendance/:id/check-in` | `COLLECTION_STAFF` / `ORG_ADMIN` | Registered attendee | Donor checked in at physical camp venue | `CampAttendance` (`CHECKED_IN`) | Automated Phase 3 test (Assertion 14) & Portal |
| **Clinical Donor Screening** | `/organisation/portal` (Camps tab) | `POST /api/v1/camps/:id/attendance/:id/screening` | `CLINICAL_STAFF` | Checked-in donor | Informed consent & clearance/deferral recorded | `ClinicalScreening` (`CLEARED`) | Automated Phase 3 test (Assertion 21) & Portal |
| **Whole Blood Collection** | `/organisation/portal` (Camps tab) | `POST /api/v1/camps/:id/attendance/:id/donation` | `COLLECTION_STAFF` / `ORG_ADMIN` | Clinically cleared donor | Donation event & physical `CollectionUnit` created | `DonationEvent`, `CollectionUnit` | Automated Phase 3 test (Assertion 28) & Portal |
| **Custody Handover Dispatch** | `/organisation/portal` (Handover tab) | `POST /api/v1/handover/manifests` & `dispatch` | `COLLECTION_STAFF` / `ORG_ADMIN` | Collected units packaged | Handover manifest dispatched with cold chain info | `HandoverManifest`, `HandoverItem` | Automated Phase 5 test & Portal console |
| **Handover Receiving & Reconcile** | `/organisation/portal` (Handover tab) | `POST /api/v1/handover/manifests/:id/reconcile` | `INVENTORY_STAFF` / `ORG_ADMIN` | Dispatched manifest | Items verified; collection unit reaches centre | `HandoverManifest` (`RECONCILED`) | Automated Phase 5 test & Portal console |
| **Component Separation** | `/organisation/portal` (Processing tab) | `POST /api/v1/processing/components` | `INVENTORY_STAFF` / `CLINICAL_STAFF` | Received collection unit | Child PRBC, FFP, Platelet units derived | `ComponentUnit` (`QUARANTINED`) | Automated Phase 6 test & Portal console |
| **Mandatory TTI Lab Testing** | `/organisation/portal` (Processing tab) | `POST /api/v1/processing/lab-tests` | `INVENTORY_STAFF` / `CLINICAL_STAFF` | Quarantined component | 5 required TTI assays recorded & verified | `LaboratoryTestRecord` | Automated Phase 6 test & Portal console |
| **Clinical Release Decision** | `/organisation/portal` (Processing tab) | `POST /api/v1/processing/clinical-release` | `CLINICAL_STAFF` (Strict role gate) | 5 non-reactive TTI tests; no holds | Component released to live inventory | `ClinicalReleaseRecord`, `ComponentUnit` (`AVAILABLE`) | Automated Phase 6 test & Portal console |
| **Hospital Issue & Dispatch** | `/organisation/portal` (Hospital tab) | `POST /api/v1/hospital/issue-orders` | `ORG_ADMIN` / `CLINICAL_STAFF` | Available released component | Hospital issue order dispatched | `HospitalIssueOrder`, `HospitalIssueItem` | Automated Phase 9 test & Portal console |
| **Hospital Dock Receipt** | `/organisation/portal` (Hospital tab) | `POST /api/v1/hospital/issue-orders/:id/receive` | Receiving Hospital Staff | Dispatched hospital order | Verified intact or flagged with discrepancy | `HospitalIssueOrder`, `HospitalDiscrepancy` | Automated Phase 9 test & Portal console |
| **Transfusion Documentation** | `/organisation/portal` (Hospital tab) | `POST /api/v1/hospital/dispositions` | Hospital Clinical Staff | Received hospital component | Final clinical transfusion permanently logged | `ComponentDispositionRecord` | Automated Phase 9 test & Portal console |

---

## 2. Test Execution Evidence & Pass/Fail Records

### Test Suite 1: Full TypeScript Compilation Check
- **Execution Command:** `npm run typecheck`
- **Scope:** `@raktasetu/api`, `@raktasetu/web`, `@raktasetu/shared`
- **Exit Code:** `0`
- **Result:** **PASS**
- **Evidence:** Clean compile across all 3 monorepo workspaces without type errors.

### Test Suite 2: Next.js Production Build & Route Prerendering
- **Execution Command:** `npm run build --workspace=@raktasetu/web`
- **Scope:** 33 Next.js App Router endpoints
- **Exit Code:** `0`
- **Result:** **PASS**
- **Evidence:** Compiled successfully; generated static pages using 3 workers (33/33). Zero prerender or dynamic server errors.

### Test Suite 3: Phase 2 Identity, Onboarding & RBAC Test Suite
- **Execution Command:** `npm run test:phase2 --workspace=@raktasetu/api`
- **Total Assertions:** 40
- **Passed:** 40
- **Failed:** 0
- **Result:** **PASS**
- **Critical Assertions Verified:**
  - `[PASS] 5. Applicant self-approval rejected with HTTP 403 (Conflict of Interest)`
  - `[PASS] 8. Platform Admin approves application successfully`
  - `[PASS] 9. Applicant atomically receives ORG_ADMIN membership on approval`
  - `[PASS] 12. Cross-organisation profile access rejected with HTTP 403 (Boundary Enforced)`
  - `[PASS] 20. Auditor write attempt rejected with HTTP 403 (Read-only Enforced)`
  - `[PASS] 24. CRITICAL: Attempt to remove last active ORG_ADMIN rejected by safety guard`
  - `[PASS] 29. Strictly zero password, OTP, or session token leaks in audit log`

### Test Suite 4: Phase 3 Camp Operations, Screening & Phlebotomy
- **Execution Command:** `npm run test:phase3 --workspace=@raktasetu/api`
- **Total Assertions:** 35
- **Passed:** 35
- **Failed:** 0
- **Result:** **PASS**
- **Critical Assertions Verified:**
  - `[PASS] 2. Camp proposed successfully with initial status PROPOSED`
  - `[PASS] 3. Public camps endpoint strictly withholds unapproved PROPOSED camps`
  - `[PASS] 5. Operational readiness check rejected for unapproved PROPOSED camp`
  - `[PASS] 6. Org Admin approves camp status to APPROVED`
  - `[PASS] 7. Operational readiness checklist verified by COLLECTION_STAFF`
  - `[PASS] 8. Approved camp is now safely displayed in public directory`
  - `[PASS] 20. Clinical screening rejected if informed consent is not recorded`
  - `[PASS] 26. CRITICAL: Completed donation rejected for clinically DEFERRED donor`
  - `[PASS] 28. Completed whole blood donation event recorded for clinically cleared donor`

### Test Suite 5: Synthetic Demo Dataset Seeding
- **Execution Command:** `npm run seed:demo`
- **Scope:** PostgreSQL / Neon
- **Exit Code:** `0`
- **Result:** **PASS**
- **Evidence:** Upserted 14 synthetic users, 3 donor profiles, 3 organisations, 8 memberships, 3 applications, 3 camps, 2 collection units, 7 component units across all lifecycle states, 5 mandatory TTI lab tests, 2 clinical release records, 1 handover manifest, 2 hospital orders with discrepancy and transfusion records, 4 blood requests, and 1 external directory snapshot.

---

## 3. Scope Boundaries & Current Intentional Constraints

1. **Clinical Release Exclusivity:** The system enforces that `ORG_ADMIN` cannot perform clinical release of components (`clinical:release`); this strictly requires `CLINICAL_STAFF` (`Dr. Sunita Deshpande`) in compliance with Schedule F(K) / NBTC guidelines.
2. **External Directory Separation:** External e-RaktKosh snapshot data is strictly marked as directory demonstration data and is never conflated with live verified RaktaSetu inventory.
3. **Audit Log Masking:** All phone numbers, passwords, OTPs, and authentication secrets are strictly scrubbed from public endpoints and audit log metadata.
