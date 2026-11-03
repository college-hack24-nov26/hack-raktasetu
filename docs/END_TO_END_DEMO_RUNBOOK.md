# RaktaSetu — End-to-End Browser QA Execution Runbook

**Document Purpose:** This runbook gives a software engineer or QA tester a click-by-click, browser-based walkthrough to execute and verify the complete RaktaSetu application from homepage navigation through clinical release, hospital transfusion, and donor coordination.

---

## Prerequisites & Environment Launch

1. **Verify Services Are Running:**
   - Express API Server: `http://localhost:4000` (WebSocket at `ws://localhost:4000/ws`)
   - Next.js Web Application: `http://localhost:3000`
2. **Seed Synthetic Dataset:**
   ```bash
   npm run seed:demo
   ```
   *(Safe and repeatable. Uses upserts on isolated demo records without modifying preexisting user data).*
3. **Browser Setup:**
   - Use two browser windows or profiles (e.g. Standard Chrome Window for Blood Bank Staff / Requester; Incognito Chrome Window for Donors).

---

## Scenario 1: Public Discovery, Navigation & Header Synchronization

- **Scenario ID:** `TC-PUB-001`
- **Purpose:** Validate public availability discovery, camp directory, responsive header links, and auth state transitions.
- **Starting URL:** `http://localhost:3000/`
- **Actor:** Public Visitor (Unauthenticated)

### Steps & Verification:
1. Open `http://localhost:3000/` in the browser.
2. Verify the top header renders:
   - Logo: **RaktaSetu**
   - Public Links: **Find Blood**, **Blood Centres**, **Donation Camps**, **Blood Requests**
   - Auth CTA: **Register / Sign In** (Desktop) or Avatar menu.
   - Institutional Link: Note that `/organisation/portal` is **not visible** in the main navigation for unauthenticated visitors.
3. Click **Find Blood** (`/find-blood`):
   - Select District: `Pune`
   - Group: `O+`
   - Click **Search Live Inventory**.
   - **Expected Visible Result:** The results table displays **Pune Metro Regional Blood Centre** with a distinct green badge: `RaktaSetu Participating Centre — Live Verified Inventory` showing available released units (`DEMO-CMP-PRBC-001`). Also displays external demonstration entries tagged `e-RaktKosh Directory`.
4. Click **Donation Camps** (`/camps`):
   - **Expected Visible Result:** Displays **Rotary Club Deccan Mega Blood Drive** (`DEMO-CAMP-PUN-001`) and **COEP Tech University Voluntary Camp** (`DEMO-CAMP-PUN-002`).
   - Verify each card shows the parent blood bank attribution: `Supervised by Pune Metro Regional Blood Centre`.
   - **Negative Assertion:** Verify the pending camp *Kothrud Youth Festival Blood Drive* is **not displayed** in this public list.

---

## Scenario 2: Donor Registration, Phone Normalization & Profile Management

- **Scenario ID:** `TC-DNR-002`
- **Purpose:** Verify voluntary donor authentication, E.164 phone formatting (no duplicate `+91`), and live header synchronization.
- **Starting URL:** `http://localhost:3000/login`
- **Actor:** `Aditya Verma` (Donor)

### Steps & Verification:
1. Navigate to `http://localhost:3000/login`.
2. In the mobile field, enter: `9999980011`.
3. Click **Use Code 123456** (or type `123456`).
4. Click **Verify & Continue**.
5. **Expected Visible Result:**
   - Instantly redirects to `/donor-dashboard`.
   - Header updates immediately without page refresh:
     - "Register / Sign In" button disappears.
     - Profile badge displays `Aditya Verma` and `+91 99999 80011`.
     - Confirms **NO** duplicate prefixes (e.g. `+91 +91...` is strictly eliminated).
     - Confirms the **Organisation Workspace** button remains hidden because Aditya is a voluntary donor without institutional staff memberships.
6. Click the profile avatar -> **Profile** (`/profile`):
   - Verify Blood Group displays `O+ (O_POS)`.
   - Verify District displays `Pune (521)`.
   - Verify Search Availability toggle is set to `Active`.
7. Sign out by clicking profile avatar -> **Sign Out**. Header immediately reverts to public unauthenticated state.

---

## Scenario 3: Blood Bank Onboarding, Platform Review & Portal Access

- **Scenario ID:** `TC-ORG-003`
- **Purpose:** Exercise the full lifecycle: self-service registration -> platform admin approval -> atomic `ORG_ADMIN` provisioning -> verified portal access.
- **Starting URL:** `http://localhost:3000/organisation/register-bank`
- **Actors:** `Dr. Ramesh Gupta` (Applicant), `Platform Admin Vikramaditya` (Admin)

### Steps & Verification:
1. Open `http://localhost:3000/organisation/register-bank`.
2. Fill out the application form:
   - Organization Name: `Gupta Life Blood Centre`
   - License Number: `MH-PUN-BB-DEMO-TEST-01`
   - Contact Person: `Dr. Ramesh Gupta`
   - Mobile: `9999980014`
   - Email: `dr.gupta@charityblood.demo`
   - District: `Pune`
   - Components: Check `Packed Red Blood Cells` and `Whole Blood`.
3. Click **Submit Onboarding Application**.
4. **Expected Visible Result:** Success card displays with generated Application ID (copy this UUID).
5. Open `http://localhost:3000/organisation/login`.
6. Enter mobile `9999980014`, code `123456`, and verify.
7. **Expected Visible Result (Negative Precondition):** Displays **No Active Blood Bank Memberships Found**. The application is pending review; access to the operational portal is safely blocked.
8. Click **Sign Out** in the header.
9. Now log in as **Platform Admin**:
   - URL: `http://localhost:3000/organisation/login`
   - Mobile: `9999980001`
   - Code: `123456`
   - Click **Verify & Continue**.
10. System routes directly to `/organisation/portal`.
11. Click the **Track Application** tab.
12. Paste the Application ID from Step 4 (or use the pre-seeded pending Application ID: `00000000-0000-4000-c000-000000000002`).
13. Click **Check Status**.
14. Status renders as `SUBMITTED`. Because you are logged in as a Platform Admin, the **✓ Approve & Provision Blood Bank** button appears!
15. Click **✓ Approve & Provision Blood Bank**.
16. **Database State Transition:** Application status becomes `APPROVED`; `Organisation` becomes `VERIFIED`; Dr. Ramesh Gupta atomically receives `ORG_ADMIN` membership in PostgreSQL.
17. Sign out of the Platform Admin account.
18. Log back in as `Dr. Ramesh Gupta` (`9999980014` / `123456`).
19. **Expected Result:** Login succeeds and routes directly into `/organisation/portal`. Header shows active organisation workspace!

---

## Scenario 4: Organisation Portal, Inventory Workspace & RBAC Gating

- **Scenario ID:** `TC-INV-004`
- **Purpose:** Verify multi-tenant isolation, stock accounting, and separation of administrative from clinical permissions.
- **Starting URL:** `http://localhost:3000/organisation/login`
- **Actors:** `Dr. Anand Joshi` (`ORG_ADMIN`), `Auditor Meera Nair` (`AUDITOR`)

### Steps & Verification:
1. Log in as `Dr. Anand Joshi` (`9999980002` / `123456`).
2. Navigate to `/organisation/portal`.
3. **Verify Header State:**
   - Organisation Banner: `Pune Metro Regional Blood Centre` (`DEMO-ORG-PUN-001`).
   - Role badge: `ORG_ADMIN`.
4. Open the **Processing & Inventory** tab:
   - Summary Counters render:
     - Total In Stock: `2 Units` (PRBC `DEMO-CMP-PRBC-001` and FFP `DEMO-CMP-FFP-001`).
     - Safety Holds / Pending Review: `2 Units` (Quarantined `DEMO-CMP-PRBC-002`, Hold `DEMO-CMP-PRBC-003`).
     - Expired: `1 Unit` (`DEMO-CMP-PLT-001`).
5. Open the **Traceability** tab:
   - Lists parent collection units (`CU-DEMO-PUN-001`) and traceable component lineage.
6. Open the **Staff Management** tab:
   - Displays all assigned staff members for Blood Bank 1 (`Dr. Anand Joshi`, `Suresh More`, `Dr. Sunita Deshpande`, etc.).
7. **Cross-Organisation Isolation Test:**
   - Sign out and log in as `Dr. Robert D'Souza` (`9999980007` / `123456`) of *Sahyadri Community Blood Bank* (`DEMO-ORG-PUN-002`).
   - Verify that Sahyadri's inventory is completely isolated; none of Blood Bank 1's units, manifests, or staff are visible.
8. **Auditor Read-Only Test:**
   - Sign out and log in as `Auditor Meera Nair` (`9999980006` / `123456`).
   - Notice that action buttons (+ Add Staff, Verify Readiness, Dispatch) are completely hidden or disabled.

---

## Scenario 5: Camp Proposal, Parent Blood Bank Review & Public Publication

- **Scenario ID:** `TC-CMP-005`
- **Purpose:** Verify community camp proposals, district parent bank grouping, approval workflow, and public directory visibility.
- **Starting URL:** `http://localhost:3000/organisation/register-camp`
- **Actors:** `Amitabh Sen` (Organiser), `Dr. Anand Joshi` (`ORG_ADMIN`)

### Steps & Verification:
1. Open `http://localhost:3000/organisation/register-camp`.
2. Notice the **Licensed Parent Blood Centre** dropdown queries real verified organisations from PostgreSQL:
   - Select `Pune Metro Regional Blood Centre`.
3. Enter proposal details:
   - Entity: `Lions Club Swargate`
   - Proposed Date: Select any future date (e.g., 14 days from today).
   - Expected Donors: `100`
   - Venue: `Tilak Smarak Mandir, Tilak Road, Pune`
   - Coordinator Contact: `9999980009` (Amitabh Sen).
4. Click **Submit Camp Proposal**.
5. **Expected Visible Result:** Success card displays: `Your proposal has been routed to Pune Metro Regional Blood Centre`.
6. Open `http://localhost:3000/camps` in a new tab:
   - **Verification:** The newly proposed camp is **NOT** listed in the public directory.
7. Log in as parent blood bank administrator `Dr. Anand Joshi` (`9999980002` / `123456`) at `/organisation/portal`.
8. Open the **Camps** tab:
   - Click on the newly submitted proposal card (`PROPOSED` badge).
   - In the camp details header, click **✓ Approve Camp Proposal**.
9. Notice status badge transitions to `APPROVED`.
10. Refresh the public `http://localhost:3000/camps` page:
    - **Expected Visible Result:** The camp is now publicly published and categorized under Upcoming Camps!

---

## Scenario 6: Camp Operations, Clinical Screening & Whole Blood Collection

- **Scenario ID:** `TC-OPS-006`
- **Purpose:** Verify operational readiness gates, walk-in registration, doctor clinical screening, and whole blood bag tagging.
- **Starting URL:** `http://localhost:3000/organisation/portal`
- **Actors:** `Rahul Kulkarni` (`COLLECTION_STAFF`), `Dr. Sunita Deshpande` (`CLINICAL_STAFF`)

### Steps & Verification:
1. Log in as `Rahul Kulkarni` (`9999980005` / `123456`) at `/organisation/portal`.
2. Open the **Camps** tab and select `Rotary Club Deccan Mega Blood Drive` (`DEMO-CAMP-PUN-001`).
3. If not already verified, click **✓ Verify Readiness Checklist**:
   - Check all 5 regulatory items (Cold Chain, Consumables Stocked, Phlebotomy Staff Assigned, etc.).
   - Click **Authorize Blood Collection**.
4. Register a walk-in attendee:
   - In the Walk-in Attendance Bar, enter Phone: `9822334455`, Name: `Tanmay Deshmukh`, Group: `B_POS`.
   - Click **+ Register Attendance**.
   - Tanmay appears in the table with status `REGISTERED`.
5. Click **Check In** next to Tanmay. Status transitions to `CHECKED_IN`.
6. **Clinical Screening Gate:**
   - Sign out and log in as authorized clinical staff `Dr. Sunita Deshpande` (`9999980004` / `123456`).
   - Return to the Camp console and find Tanmay.
   - Click **Screen Donor**:
     - Check: Informed Consent Given.
     - Decision: `CLEARED`.
     - Notes: `Hb: 13.8 g/dL, BP: 122/82. Medically cleared.`
     - Click **Commit Screening Decision**.
7. **Record Donation Event:**
   - Click **Record Donation**:
     - Outcome: `COMPLETED`.
     - Volume: `450` ml.
     - Bag Barcode: `BAG-TEST-99881`.
     - Click **Commit Donation Event & Generate Collection Unit**.
8. **Verification:** System records the donation event, generates a unique traceable `CollectionUnit` (`CU-2026-PUN-...`), and updates metric counters.

---

## Scenario 7: Camp Handover, Transport & Receiving Dock Reconciliation

- **Scenario ID:** `TC-HND-007`
- **Purpose:** Exercise physical custody transfer, cold-chain departure logging, receipt verification, and discrepancy exceptions.
- **Starting URL:** `http://localhost:3000/organisation/portal`
- **Actors:** `Rahul Kulkarni` (`COLLECTION_STAFF`), `Suresh More` (`INVENTORY_STAFF`)

### Steps & Verification:
1. Log in as `Rahul Kulkarni` (`9999980005` / `123456`).
2. Open the **Handover & Reconciliation** tab.
3. Locate manifest `DEMO-HM-2026-001`:
   - Status is `DISPATCHED`.
   - Contains unit `CU-DEMO-PUN-002` in transit with driver Sanjay Deshmukh.
4. Sign out and log in as receiving inventory officer `Suresh More` (`9999980003` / `123456`).
5. Open `/organisation/portal` -> **Handover & Reconciliation** tab.
6. Select `DEMO-HM-2026-001` and click **Receive & Reconcile**:
   - For unit `CU-DEMO-PUN-002`, select Outcome: `VERIFIED_INTACT`.
   - Record Temperature: `4.1°C`.
   - Click **Confirm Receipt**.
7. Click **Finalise Reconciliation**:
   - Manifest transitions to `RECONCILED`.
   - Collection Unit status transitions from `COLLECTED` to `RECEIVED_BY_CENTRE`.

---

## Scenario 8: Laboratory Testing, Clinical Release & Inventory Availability

- **Scenario ID:** `TC-LAB-008`
- **Purpose:** Verify mandatory 5-test TTI screening and clinical release boundary.
- **Starting URL:** `http://localhost:3000/organisation/portal`
- **Actor:** `Dr. Sunita Deshpande` (`CLINICAL_STAFF`)

### Steps & Verification:
1. Log in as `Dr. Sunita Deshpande` (`9999980004` / `123456`).
2. Open the **Processing & Inventory** tab.
3. Find quarantined component unit `DEMO-CMP-PRBC-002`:
   - Note its status is `QUARANTINED`.
4. Click **Record Lab Tests**:
   - Record mandatory assays: HIV-1/2, HCV, HBsAg, Syphilis RPR, Malaria Pan-LDH.
   - Enter all results as `NON_REACTIVE`.
   - Click **Save Laboratory Record**.
5. Once all 5 assays are confirmed non-reactive, click **Clinical Release**:
   - Decision: `RELEASED`.
   - Protocol Reference: `NBTC Schedule F(K) Clinical Release Protocol`.
   - Storage Location: `Main Cold Room Refrigerator 1`.
   - Click **Authorize Clinical Release**.
6. **Expected Visible Result:** Component unit transitions to `AVAILABLE`.
7. Open `http://localhost:3000/find-blood` in an unauthenticated window and search for `O+` PRBC in Pune.
8. **Verification:** Live available inventory count increases by 1 unit immediately!

---

## Scenario 9: Emergency Blood Request & Donor Coordination

- **Scenario ID:** `TC-REQ-009`
- **Purpose:** Test real-time donor invitations, decline/re-accept toggle, and viewport-safe closure modal.
- **Starting URLs:** Window A (`/requests/new`), Window B (`/donor-dashboard`)
- **Actors:** Window A (`Kavita Patel`), Window B (`Pooja Iyer`)

### Steps & Verification:
1. **Window A (Requester):**
   - Log in as `Kavita Patel` (`9999980010` / `123456`).
   - Navigate to `/requests/new`.
   - Enter Patient: `Aarav Patel`, Blood Group: `O+`, Units: `1`, Hospital: `Pune Metro Regional Blood Centre`.
   - Click **Broadcast Emergency Blood Request**.
2. **Window B (Donor):**
   - In an Incognito window, log in as `Pooja Iyer` (`9999980012` / `123456`).
   - Open `/donor-dashboard`.
   - Pre-seeded Request `00000000-0000-4000-4000-000000000001` shows an invitation for Pooja.
   - Click **Decline Invitation**.
   - Notice that rather than locking the user out, the button dynamically allows **Accept Invitation**.
   - Click **Accept Invitation**.
3. **Window A (Requester):**
   - In Window A (`/requests`), notice the accepted donor count increments to 2 in real-time.
   - Click **Close Request**:
     - Verify the modal is centered, contained within `max-h-[90vh]`, and scrollable without viewport overflow.
     - Press **Escape** -> Modal cleanly closes. Reopen modal.
     - Select Closure Reason: `DONATION_COMPLETED`.
     - The donor dropdown appears, populated exclusively with accepted respondents (`Aditya Verma` and `Pooja Iyer`).
     - Select `Aditya Verma`.
     - Click **Confirm Closure**.
4. **Verification:** Request transitions to `FULFILLED` / `CLOSED`. Active matching controls are hidden.

---

## Scenario 10: Hospital Issue, Dock Receipt, Discrepancy & Transfusion

- **Scenario ID:** `TC-HSP-010`
- **Purpose:** Verify cross-organisation issue order, hospital cold-chain inspection, discrepancy logging, and transfusion documentation.
- **Starting URL:** `http://localhost:3000/organisation/portal`
- **Actors:** `Dr. Anand Joshi` (`ORG_ADMIN`), `Nurse Preeti Sharma` (Hospital Staff)

### Steps & Verification:
1. Log in as `Dr. Anand Joshi` (`9999980002` / `123456`).
2. Open `/organisation/portal` -> **Hospital Disposition** tab.
3. Review pre-seeded orders:
   - Order `DEMO-HO-2026-001`: Issued to *Deenanath Mangeshkar Memorial Hospital*, status `RECEIVED`.
   - Order `DEMO-HO-2026-002`: Flagged with open discrepancy `DAMAGED_CONTAINER`.
4. Sign out and log in as hospital staff `Nurse Preeti Sharma` (`9999980008` / `123456`).
5. Open `/organisation/portal` (Hospital Workspace).
6. View `DEMO-HO-2026-001`:
   - Component `DEMO-CMP-PRBC-004` is displayed.
   - Click **Document Transfusion**:
     - Patient MRN: `MRN-9022-PUN`.
     - Clinical Notes: `Transfusion completed successfully. Vital signs stable post-procedure.`
     - Click **Commit Transfusion Record**.
7. **Verification:** Component unit commits a permanent `ComponentDispositionRecord` (`TRANSFUSION_DOCUMENTED`). Further issue or modification of this unit is permanently prohibited.

---

## Scenario 11: Public Blood Availability & External Provenance Badging

- **Scenario ID:** `TC-PUB-011`
- **Purpose:** Confirm clean separation between live verified RaktaSetu inventory and external e-RaktKosh demonstration entries.
- **Starting URL:** `http://localhost:3000/find-blood`
- **Actor:** Public Visitor

### Steps & Verification:
1. Open `http://localhost:3000/find-blood`.
2. Filter by District `Pune` and Blood Group `B+`.
3. Notice two distinct results:
   - **Participating Centre:** Shows verified available units badged with:
     `🟢 RaktaSetu Participating Centre — Live Verified Inventory`
   - **External Directory:** Shows external demo snapshot badged with:
     `🔵 e-RaktKosh Directory` (e.g. *District Hospital Aundh Blood Bank*).
4. Verify that expired platelets (`DEMO-CMP-PLT-001`), held units (`DEMO-CMP-PRBC-003`), and unreleased units (`DEMO-CMP-PRBC-002`) are **strictly excluded** from public counts.

---

## Scenario 12: Security Isolation, Audit Trail & Regression Verification

- **Scenario ID:** `TC-SEC-012`
- **Purpose:** Verify cross-tenant isolation, last-admin deletion safety guards, and audit log hygiene.
- **Starting URL:** Automated Test Suite / API

### Steps & Verification:
1. Execute the Phase 2 Identity and RBAC test suite:
   ```bash
   npm run test:phase2 --workspace=@raktasetu/api
   ```
   - **Result:** 40 passed, 0 failed.
   - Validates that cross-organisation access is rejected with `HTTP 403 Forbidden`.
   - Validates that an applicant attempting self-approval is rejected with `Conflict of Interest`.
   - Validates that removing the last active `ORG_ADMIN` is prohibited by the safety guard.
2. Execute the Phase 3 Camp Operations test suite:
   ```bash
   npm run test:phase3 --workspace=@raktasetu/api
   ```
   - **Result:** 35 passed, 0 failed.
   - Validates that unapproved camps are hidden from public endpoints.
   - Validates that clinically deferred donors cannot commit completed donations.
   - Validates zero password, OTP, or private token leaks in audit log entries.
