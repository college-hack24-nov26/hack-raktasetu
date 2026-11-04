# RaktaSetu — Architecture Findings, Gaps & Technical Debt

## 1. Audit Methodology & Scope

This audit performed a thorough, evidence-grounded inspection across the entire monorepo (`D:\MyProject\RaktSetu`), cross-referencing Prisma schemas, Express routes, RBAC middlewares, WebSocket event streams, Next.js components, and React Native mobile screens against live runtime states and database records.

---

## 2. Critical Findings Discovered & Remediated

During the architectural audit of the blood bank matching workflow and API runtime, several critical integration defects were uncovered and resolved:

### Finding CRIT-01: Express Router Authentication Middleware Scope (HTTP 401 Disconnect)
- **Classification:** `[INTEGRATION ISSUE — RESOLVED]`
- **Location:** [`apps/api/src/routes/hospital.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/routes/hospital.ts#L40-L45)
- **Description:** The router previously mounted authentication middleware only as `hospitalRouter.use('/hospital', requireAuth)`. All endpoints under `/organisation/:orgId/...` (including incoming requests, matching triggers, and candidate release endpoints) were unauthenticated at the router mount point. Consequently, when incoming requests reached `requireOrgPermission`, `req.user` was `undefined`, triggering a silent `401 Unauthorized` response.
- **Architectural Impact:** The Blood Bank portal showed `Incoming Requests: (0)` and `Designated Patient Blood Requests: (0)` despite active database records.
- **Remediation Applied:** 
  1. Explicitly mounted `hospitalRouter.use('/organisation', requireAuth)` and `hospitalRouter.use('/organisations', requireAuth)`.
  2. In [`apps/api/src/middleware/rbac.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/middleware/rbac.ts), introduced defense-in-depth: if `!req.user`, `requireOrgPermission` automatically invokes `requireAuth` first.

### Finding CRIT-02: Prisma Query Filter Exclusion for Canonical Requests
- **Classification:** `[LOGIC BUG — RESOLVED]`
- **Location:** [`apps/api/src/services/hospitalIntegration.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/services/hospitalIntegration.ts#L784-L810)
- **Description:** `getIncomingBloodRequests()` filtered incoming requests by checking only `{ hospitalCode: { in: targetCodes } }`. When a patient created a blood request admitted at an external facility (e.g. Ruby Hall Clinic) but designated a canonical blood bank (e.g. Pune Central Blood Centre, `ORG-P3-BANK-A`), the blood bank was stored inside `message.assignedBankId`. The query ignored this metadata field, omitting canonically assigned requests from the bank's incoming queue.
- **Architectural Impact:** Requests canonically designated to a blood bank did not appear on that blood bank's dashboard.
- **Remediation Applied:** Added `{ message: { contains: `"assignedBankId":"${organisationId}"` } }` to the Prisma `OR` query, and updated `isDirectDesignation` calculation to verify `metadata.assignedBankId === organisationId`.

### Finding HIGH-01: Missing `CANDIDATES_FOUND` State in Blood Bank UI
- **Classification:** `[UI STATE GAP — RESOLVED]`
- **Location:** [`apps/web/app/organisation/portal/HospitalIntegrationView.tsx`](file:///d:/MyProject/RaktSetu/apps/web/app/organisation/portal/HospitalIntegrationView.tsx)
- **Description:** When the System Admin executed the donor matching algorithm, `matchingRequest.status` transitioned to `'CANDIDATES_FOUND'`. The Blood Bank portal only handled `'REQUESTED'`, `'SEARCH_RUNNING'`, and `'RELEASED'`. The status fell through with no badge rendered, leaving staff unaware that admin review was underway.
- **Remediation Applied:** Added explicit UI badges and alert callouts for `'CANDIDATES_FOUND'` ("Candidates Under Admin Review") and `'NO_CANDIDATES'` ("No Eligible Donors Found in Scope").

---

## 3. Residual Architecture Findings & Technical Debt

### Finding MED-01: Metadata Storage in JSONB vs. Dedicated Normalized Tables
- **Classification:** `[TECHNICAL DEBT — MONITORED]`
- **Description:** Matching request metadata (`matchingRequest`), runs (`matchingRun`), and released candidate IDs (`releasedCandidateIds`) are currently persisted within the JSONB-serialized `BloodRequest.message` column. While this preserved backward compatibility and rapid prototyping across Phases 1–5, high-throughput statewide querying would benefit from decomposing these into dedicated first-class Prisma models (`DonorMatchingRequest`, `MatchingRun`, `MatchingCandidate`).
- **Severity:** Medium. Currently fully functional and indexed via PostgreSQL JSONB operators.

### Finding LOW-01: Mobile Web View Fallback
- **Classification:** `[PARITY LIMITATION]`
- **Description:** Several complex desktop consoles (e.g., Blood Component Derivation Table, Handover Reconciliation Discrepancy Matrix, System Admin Candidate Review Table) are intentionally web-exclusive and do not have native mobile screens. Mobile focuses on Donor engagement and on-site Phlebotomy.
- **Severity:** Low. Aligns with standard clinical operational roles (medical officers and lab technicians operate from desktop workstations).

---

## 4. Viva Voce & Audit Summary Checkpoint

| Verification Criteria | As-Built Status | Audit Evidence |
|---|---|---|
| **Inventory-First Enforced?** | **Yes** | Shortfall button is disabled if `shortfallCount === 0`. |
| **Admin-Controlled Matching?** | **Yes** | Only `Role.ADMIN` can invoke `POST /admin/donor-matching/requests/:id/run`. |
| **Masked Candidate PII?** | **Yes** | `disclosureAuthorized: false` and `contactNumber: null` returned to blood bank. |
| **Dual Handover Confirmation?** | **Yes** | Requires both hospital receipt and patient bedside acknowledgment before closure. |
| **Realtime Push Verified?** | **Yes** | WebSocket broker delivers events across 19 room channels without manual refresh. |
| **Compiles with Zero Errors?** | **Yes** | `@raktasetu/api` build and `@raktasetu/web` typecheck exited with code 0. |

