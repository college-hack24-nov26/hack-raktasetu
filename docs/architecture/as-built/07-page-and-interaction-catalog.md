# RaktaSetu — Page-by-Page, Button-by-Button Interaction Catalog

This catalog documents the critical user actions and workflows across all portals, specifying UI controls, handlers, validation, API routes, database queries, and downstream side effects.

---

### Interaction ID: REQ-NEW-SUBMIT
- **Visible label:** "Submit Emergency Blood Request"
- **Location:** Page `/requests/new`, Main Form Submission Button
- **Visible to:** Authenticated Users (`Role.USER`, `Role.DONOR`, `Role.ADMIN`)
- **Preconditions:** User is signed in with a valid JWT; form contains patient name, admitted hospital, units (>0), component type, and designated blood bank.
- **User action:** Clicks "Submit Emergency Blood Request"
- **Frontend handler:** `handleSubmit()` in [`apps/web/app/requests/new/page.tsx`](file:///d:/MyProject/RaktSetu/apps/web/app/requests/new/page.tsx)
- **Validation:** Client checks required fields (`patientName.trim()`, `unitsRequested > 0`, `assignedBankId != null`).
- **API request:** `POST /api/v1/blood-requests`
- **Request payload:**
  ```json
  {
    "patientName": "Kunal Deshmukh",
    "bloodGroup": "B_POS",
    "component": "PACKED_RED_BLOOD_CELLS",
    "units": 3,
    "urgency": "CRITICAL",
    "hospitalName": "Ruby Hall Clinic Pune",
    "hospitalCode": "HOSP-PUNE-01",
    "assignedBankId": "a08a30e0-cb21-40b0-bf83-35a0670f684d"
  }
  ```
- **Authentication:** Bearer token via `authFetch()` (`localStorage.getItem('raktasetu_token')`)
- **Authorization:** `requireAuth` middleware
- **Backend route:** `requestsRouter.post('/blood-requests')` in [`apps/api/src/routes/requests.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/routes/requests.ts)
- **Service/business logic:** `BloodRequestCoordinationService.createCanonicalBloodRequest()`
- **Database operation:** `prisma.bloodRequest.create()` inserting record with `status: 'OPEN'`, `allocatedUnits: 0`, and canonical routing JSON in `message`.
- **Transaction:** Standard single-row Prisma operation.
- **Side effects:** Writes `AuditLog` entry; dispatches WebSocket notification.
- **Realtime behavior:** Emits `blood_request.created` to room `org:{assignedBankId}`.
- **Frontend result:** Displays success banner; redirects to `/requests/[id]`.
- **Failure behavior:** Displays error callout with API message.
- **Next workflow step:** Request enters the designated Blood Bank's incoming queue.
- **Implementation status:** `[IMPLEMENTED & VERIFIED]`
- **Evidence:** `apps/web/app/requests/new/page.tsx`, `apps/api/src/routes/requests.ts`.

---

### Interaction ID: BB-REQ-MATCHING-TRIGGER
- **Visible label:** "Request Donor Matching (Shortfall: N)"
- **Location:** Page `/organisation/portal` (Requests Tab), Action Column on Table Row
- **Visible to:** `OrgRole.ORG_ADMIN`, `OrgRole.INVENTORY_STAFF`
- **Preconditions:** Request is assigned to this organisation; in-house inventory allocation is less than required units (`shortfallCount > 0`); matching status is `NOT_REQUESTED`.
- **User action:** Clicks "Request Donor Matching (Shortfall: 3)"
- **Frontend handler:** `handleRequestDonorMatching(request.id, shortfallCount)` in [`HospitalIntegrationView.tsx`](file:///d:/MyProject/RaktSetu/apps/web/app/organisation/portal/HospitalIntegrationView.tsx#L535)
- **Validation:** Ensures `shortfallCount > 0` before initiating API call.
- **API request:** `POST /api/v1/organisation/:orgId/requests/:requestId/request-matching`
- **Request payload:** `{"shortfallCount": 3}`
- **Authentication:** Bearer token via `authFetch()`
- **Authorization:** `requireAuth` + `requireOrgPermission('operational:write')`
- **Backend route:** `hospitalRouter.post('/organisation/:orgId/requests/:requestId/request-matching')` in [`apps/api/src/routes/hospital.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/routes/hospital.ts#L61)
- **Service/business logic:** `AdminMatchingService.requestDonorMatching()`
- **Database operation:** `prisma.bloodRequest.update()` updating `message.matchingRequest` with `id: mr_...`, `status: 'REQUESTED'`, `requestedShortfall: 3`.
- **Transaction:** Atomic update of metadata.
- **Side effects:** Broadcasts realtime matching request event to system administration.
- **Realtime behavior:** Emits `blood_request.matching_requested` to room `admin:requests`.
- **Frontend result:** Button transforms immediately into amber badge: `"Matching Requested (Awaiting Admin Run)"`.
- **Failure behavior:** Displays toast notification; button re-enables.
- **Next workflow step:** Appears in System Admin Donor Matching Operations console.
- **Implementation status:** `[IMPLEMENTED & VERIFIED]`
- **Evidence:** `apps/web/app/organisation/portal/HospitalIntegrationView.tsx`, `apps/api/src/services/adminMatchingService.ts`.

---

### Interaction ID: ADMIN-MATCHING-RUN
- **Visible label:** "Run Matching Algorithm"
- **Location:** Page `/organisation/portal` (Admin Requests Tab), Pending Requests Table
- **Visible to:** `Role.ADMIN`
- **Preconditions:** Matching request exists with status `'REQUESTED'`.
- **User action:** Clicks "Run Matching Algorithm"
- **Frontend handler:** `handleRunMatching(requestId)` in [`BloodRequestOperationsView.tsx`](file:///d:/MyProject/RaktSetu/apps/web/app/organisation/portal/BloodRequestOperationsView.tsx#L320)
- **Validation:** None (admin override).
- **API request:** `POST /api/v1/admin/donor-matching/requests/:requestId/run`
- **Request payload:** `{"searchScope": "EXACT_CENTRE"}`
- **Authentication:** Bearer token via `authFetch()`
- **Authorization:** `requireAuth` + `requireRole('ADMIN')`
- **Backend route:** `adminMatchingRouter.post('/requests/:requestId/run')` in [`apps/api/src/routes/adminMatching.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/routes/adminMatching.ts#L35)
- **Service/business logic:** `AdminMatchingService.executeMatchingRun()`
- **Database operation:** Queries `prisma.donorProfile` with hard filters (ABO compatibility, 90-day interval, active); updates `message.matchingRequest` with `status: 'CANDIDATES_FOUND'`, `rankedCandidates: [...]`; writes `prisma.auditLog.create()`.
- **Transaction:** Audit log and metadata update in service logic.
- **Side effects:** Realtime event dispatched to requesting blood bank.
- **Realtime behavior:** Emits `blood_request.matching_searched` to room `org:{requestingOrgId}`.
- **Frontend result:** Displays candidate review table with scored candidate cards and reason codes.
- **Failure behavior:** Displays error alert banner with failure explanation.
- **Next workflow step:** System Admin reviews candidate list for approval.
- **Implementation status:** `[IMPLEMENTED & VERIFIED]`
- **Evidence:** `apps/api/src/services/adminMatchingService.ts#L205-L530`.

---

### Interaction ID: ADMIN-CANDIDATE-RELEASE
- **Visible label:** "Release Approved Candidates (N Selected)"
- **Location:** Page `/organisation/portal` (Admin Requests Tab), Candidate Review Modal
- **Visible to:** `Role.ADMIN`
- **Preconditions:** Algorithm run completed; at least one candidate checkbox is checked.
- **User action:** Checks candidate checkboxes and clicks "Release Approved Candidates"
- **Frontend handler:** `handleReleaseCandidates(requestId)` in [`BloodRequestOperationsView.tsx`](file:///d:/MyProject/RaktSetu/apps/web/app/organisation/portal/BloodRequestOperationsView.tsx#L410)
- **Validation:** Prevents submission if 0 candidates are selected.
- **API request:** `POST /api/v1/admin/donor-matching/requests/:requestId/release`
- **Request payload:**
  ```json
  {
    "selectedCandidateIds": [
      "0db9fff9-7000-4b85-a151-1bad4eb62211",
      "9ced1f15-fae0-4871-9129-babc9da6b52a"
    ],
    "releaseNotes": "Approved for emergency shortfall"
  }
  ```
- **Authentication:** Bearer token via `authFetch()`
- **Authorization:** `requireAuth` + `requireRole('ADMIN')`
- **Backend route:** `adminMatchingRouter.post('/requests/:requestId/release')` in [`apps/api/src/routes/adminMatching.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/routes/adminMatching.ts#L65)
- **Service/business logic:** `AdminMatchingService.releaseCandidateList()`
- **Database operation:** `prisma.bloodRequest.update()` updating `status: 'RELEASED'`, `releasedCandidateIds: [...]`, `releasedAt: now()`; creates immutable entry in `prisma.auditLog`.
- **Transaction:** Audit log created with admin ID.
- **Side effects:** Broadcasts release unlock event to requesting blood bank.
- **Realtime behavior:** Emits `blood_request.matching_released` to room `org:{requestingOrgId}`.
- **Frontend result:** Closes admin modal; shows release confirmation toast.
- **Failure behavior:** Displays error notification; retains selected checkboxes.
- **Next workflow step:** Requesting Blood Bank UI reactively unlocks the candidate pool.
- **Implementation status:** `[IMPLEMENTED & VERIFIED]`
- **Evidence:** `apps/api/src/services/adminMatchingService.ts#L580-L660`.

---

### Interaction ID: BB-REVIEW-RELEASED-POOL
- **Visible label:** "Review Released Candidate Pool"
- **Location:** Page `/organisation/portal` (Requests Tab), Action Column on Table Row
- **Visible to:** `OrgRole.ORG_ADMIN`, `OrgRole.INVENTORY_STAFF`
- **Preconditions:** Matching request status is `'RELEASED'`.
- **User action:** Clicks "Review Released Candidate Pool"
- **Frontend handler:** `handleOpenCandidatesModal(request)` in [`HospitalIntegrationView.tsx`](file:///d:/MyProject/RaktSetu/apps/web/app/organisation/portal/HospitalIntegrationView.tsx#L610)
- **Validation:** None.
- **API request:** `GET /api/v1/organisation/:orgId/requests/:requestId/matching-candidates`
- **Request payload:** Empty (GET request)
- **Authentication:** Bearer token via `authFetch()`
- **Authorization:** `requireAuth` + `requireOrgPermission('operational:read')` + Verification that `orgId === assignedBankId`.
- **Backend route:** `hospitalRouter.get('/organisation/:orgId/requests/:requestId/matching-candidates')` in [`apps/api/src/routes/hospital.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/routes/hospital.ts#L80)
- **Service/business logic:** `AdminMatchingService.getReleasedCandidatesForBank()`
- **Database operation:** `prisma.donorProfile.findMany({ where: { id: { in: releasedCandidateIds } } })`.
- **Privacy enforcement:** Direct phone numbers and GPS coordinates are masked (`disclosureAuthorized: false`).
- **Frontend result:** Opens Candidate Outreach Modal displaying approved voluntary donors with match level, distance, and outreach triggers.
- **Failure behavior:** If called by unauthorized organization, returns `403 Forbidden`.
- **Next workflow step:** Blood Bank staff initiates outreach to donors.
- **Implementation status:** `[IMPLEMENTED & VERIFIED]`
- **Evidence:** Verified live in runtime test with Pune Central Blood Centre (2 candidates returned).

