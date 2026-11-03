# RaktaSetu — Demo Accounts, Credentials & RBAC Access Matrix

**Document Purpose:** This guide provides the complete verified credentials, authentication procedures, role assignments, permitted operations, and failure diagnostics for the synthetic demonstration dataset seeded in the RaktaSetu environment.

---

## 1. Quick Reference: Demo Accounts Matrix

All accounts in this development environment authenticate using the **Demo Verification Flow**. Enter the 10-digit mobile number and input the fixed prototype verification code `123456` (or click **Use Code 123456** in the UI).

| Role Title | Synthetic Display Name | Login Identifier | Demo OTP | Primary Portal / URL | Role / Membership | Associated Facility / Scope | Key Permitted Operations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Platform Administrator** | Platform Admin Vikramaditya | `9999980001` (`+919999980001`) | `123456` | `/organisation/portal` (Applications tab) or API | User: `ADMIN`, Org: `ORG_ADMIN` | Global Platform & Pune Metro Blood Centre | Review/approve blood-bank onboarding applications, global oversight. |
| **Blood Bank 1 — Org Administrator** | Dr. Anand Joshi | `9999980002` (`+919999980002`) | `123456` | `/organisation/portal` | `ORG_ADMIN` | Pune Metro Regional Blood Centre (`DEMO-ORG-PUN-001`) | Full centre operations, staff provisioning, camp approvals, hospital issue authorisation. |
| **Blood Bank 1 — Inventory Staff** | Suresh More | `9999980003` (`+919999980003`) | `123456` | `/organisation/portal` | `INVENTORY_STAFF` | Pune Metro Regional Blood Centre (`DEMO-ORG-PUN-001`) | Component separation, storage location movements, camp handover receipt reconciliation. |
| **Blood Bank 1 — Clinical Staff / Pathologist** | Dr. Sunita Deshpande | `9999980004` (`+919999980004`) | `123456` | `/organisation/portal` | `CLINICAL_STAFF` | Pune Metro Regional Blood Centre (`DEMO-ORG-PUN-001`) | Clinical screening at camps, TTI laboratory test verification, **clinical release** of components to `AVAILABLE`. |
| **Blood Bank 1 — Collection Staff** | Rahul Kulkarni | `9999980005` (`+919999980005`) | `123456` | `/organisation/portal` | `COLLECTION_STAFF` | Pune Metro Regional Blood Centre (`DEMO-ORG-PUN-001`) | Camp operational readiness checklist, walk-in registration, donor check-in, whole blood collection bag tagging. |
| **Blood Bank 1 — Compliance Auditor** | Auditor Meera Nair | `9999980006` (`+919999980006`) | `123456` | `/organisation/portal` | `AUDITOR` | Pune Metro Regional Blood Centre (`DEMO-ORG-PUN-001`) | Read-only inspection of inventory, manifests, and audit trail logs. Cannot write or transition units. |
| **Blood Bank 2 — Isolated Org Admin** | Dr. Robert D'Souza | `9999980007` (`+919999980007`) | `123456` | `/organisation/portal` | `ORG_ADMIN` | Sahyadri Community Blood Bank (`DEMO-ORG-PUN-002`) | Independent centre management. Strictly isolated from Blood Bank 1 inventory and camps. |
| **Hospital Facility Staff** | Nurse Preeti Sharma | `9999980008` (`+919999980008`) | `123456` | `/organisation/portal` | `ORG_ADMIN` | Deenanath Mangeshkar Memorial Hospital (`DEMO-ORG-PUN-HOSP-001`) | Hospital receiving dock verification, cold-chain receipt, discrepancy logging, transfusion documentation. |
| **Community Camp Organiser** | Amitabh Sen | `9999980009` (`+919999980009`) | `123456` | `/organisation/register-camp` | `USER` | Rotary Club Pune Central | Propose community blood drives selecting licensed parent blood banks. |
| **Patient Requester** | Kavita Patel | `9999980010` (`+919999980010`) | `123456` | `/requests/new`, `/requests` | `USER` | Individual Requester | Create emergency patient blood requests, track donor invitation responses, execute closure workflows. |
| **Donor 1 — Responding & Donating** | Aditya Verma | `9999980011` (`+919999980011`) | `123456` | `/donor-dashboard`, `/profile` | `DONOR` (Group: `O_POS`) | Pune District (`521`) | Accepts emergency invitations, completes voluntary phlebotomy at donation drives. |
| **Donor 2 — Invitation Toggle** | Pooja Iyer | `9999980012` (`+919999980012`) | `123456` | `/donor-dashboard`, `/profile` | `DONOR` (Group: `O_POS`) | Pune District (`521`) | Demonstrates declining an invitation and dynamically toggling back to `ACCEPTED`. |
| **Donor 3 — Deferred Donor** | Nikhil Shinde | `9999980013` (`+919999980013`) | `123456` | `/donor-dashboard`, `/profile` | `DONOR` (Group: `B_POS`) | Pune District (`521`) | Demonstrates eligibility safeguard (recent donation within deferral interval; excluded from search). |
| **Prospective Applicant (Pending)** | Dr. Ramesh Gupta | `9999980014` (`+919999980014`) | `123456` | `/organisation/portal` (Track App) | `USER` | Gupta Charitable Blood Centre (`SUBMITTED`) | Tracks submitted onboarding application; has no portal workspace access until platform approval. |

---

## 2. Access Workflows & Administrative Operations

### Q1: Which account logs in as the platform administrator?
**Account:** `Platform Admin Vikramaditya`  
**Phone:** `9999980001`  
**Verification Code:** `123456`  
**Database Role:** `User.role === 'ADMIN'`.

### Q2: Which account approves or rejects a blood-bank application?
Only an account with `User.role === 'ADMIN'` (such as `Platform Admin Vikramaditya`) can review applications. Applicants cannot approve their own application (enforced by the Conflict of Interest guard in `OrganisationService.reviewApplication`).

### Q3: What exact procedure does that account use?
**Browser UI Method:**
1. Log in via `http://localhost:3000/organisation/login` using `9999980001` and code `123456`.
2. Open the **Track Application** tab in the Organisation Portal.
3. Enter the Application ID for the pending application (e.g., `00000000-0000-4000-c000-000000000002` for *Gupta Charitable Blood Centre*).
4. Click **Check Status**.
5. As a Platform Admin, you will see the **✓ Approve & Provision Blood Bank** and **Reject Application** buttons.
6. Click **Approve**.

**API / Curl Method:**
```bash
# 1. Login to obtain session token
curl -X POST http://localhost:4000/api/v1/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+919999980001", "otp": "123456"}'

# 2. Approve application
curl -X POST http://localhost:4000/api/v1/organisations/applications/00000000-0000-4000-c000-000000000002/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN_FROM_STEP_1>" \
  -d '{"status": "APPROVED", "reviewNotes": "CDSCO license compliant. Approved."}'
```

### Q4: How do I log in as the blood-bank applicant after approval?
1. Open `http://localhost:3000/organisation/login`.
2. Enter the applicant's mobile number: `9999980014` (Dr. Ramesh Gupta).
3. Enter code `123456` and click **Verify & Continue**.
4. Once approved, the backend automatically transitions their membership, and the user is routed directly into `http://localhost:3000/organisation/portal`.

### Q5: Is the applicant's `ORG_ADMIN` membership created automatically?
**Yes.** When a Platform Admin approves an application, `OrganisationService.reviewApplication` executes an atomic Prisma transaction that:
1. Updates the `OrganisationApplication` status to `APPROVED`.
2. Upserts the `Organisation` record with status `VERIFIED`.
3. Creates or links the applicant's `User` account by mobile number.
4. Atomically provisions a `UserMembership` with `role: 'ORG_ADMIN'` and `status: 'ACTIVE'`.

### Q6: What happens if the application is pending or rejected?
- **If Pending (`SUBMITTED` / `UNDER_REVIEW`):** When the applicant signs in at `/organisation/login`, the portal detects zero active memberships and displays the **No Active Blood Bank Memberships Found** screen with guidance to track their Application ID.
- **If Rejected (`REJECTED`):** The application status displays `REJECTED` along with the reviewer's auditable explanation notes. No organisation record or staff membership is ever provisioned.

### Q7: Which account can access inventory management?
- `Dr. Anand Joshi` (`ORG_ADMIN`, `9999980002`)
- `Suresh More` (`INVENTORY_STAFF`, `9999980003`)
- `Dr. Sunita Deshpande` (`CLINICAL_STAFF`, `9999980004`)
- `Auditor Meera Nair` (`AUDITOR`, `9999980006` — Read-only mode)

### Q8: Which account can create and manage camp operations?
- **Public Community Proposer:** `Amitabh Sen` (`9999980009`) at `/organisation/register-camp`.
- **Camp Operator / Collection Staff:** `Rahul Kulkarni` (`COLLECTION_STAFF`, `9999980005`) manages readiness checklists, attendance, donor check-in, and collection unit tagging.

### Q9: Who approves a camp proposal?
The parent blood bank's `ORG_ADMIN` (`Dr. Anand Joshi`, `9999980002`) or a Platform Admin (`9999980001`). In the portal, open the **Camps** tab, click on any `PROPOSED` camp, and click **✓ Approve Camp Proposal**.

### Q10: Which role can perform clinical screening, lab testing, clinical release, and hospital issue?
- **Clinical Screening at Camps:** Strictly `CLINICAL_STAFF` (`Dr. Sunita Deshpande`, `9999980004`) or `ORG_ADMIN`.
- **Laboratory Testing & Verification:** Performed by `INVENTORY_STAFF` or `CLINICAL_STAFF`; verified by `CLINICAL_STAFF`.
- **Clinical Release (Quarantined -> Available):** **Strictly `CLINICAL_STAFF`** (`Dr. Sunita Deshpande`). In accordance with NBTC and drug safety guidelines, this permission is intentionally omitted from `ORG_ADMIN` to preserve clinical accountability.
- **Hospital Issue Order Authorisation:** `ORG_ADMIN` (`Dr. Anand Joshi`) or `CLINICAL_STAFF`.

---

## 3. Session Isolation & Troubleshooting Guide

### How do I switch roles cleanly without session bleed?
1. Click **Sign Out** in the navigation header, OR open DevTools Application Tab -> Clear Storage -> Clear Site Data.
2. The custom `raktasetu:auth-change` event ensures the header and all mounted components instantly purge cached user states.
3. For multi-actor testing (such as Requester vs Donor), use **two distinct browser windows** (e.g., standard Chrome window and Chrome Incognito window, or Chrome and Firefox).

### Diagnosing "No Active Organisation Memberships"
- **Cause 1:** You logged in using a normal donor account (e.g., `9999980011`) at the staff login page `/organisation/login`.
- **Cause 2:** You logged in as a prospective blood bank applicant whose application is still in `SUBMITTED` status and has not yet been approved by a Platform Admin.
- **Resolution:** Use a verified staff mobile (e.g., `9999980002` for Blood Bank Admin).

### Diagnosing redirect to the wrong portal
- If a donor signs in at `/login`, they are routed to `/donor-dashboard`.
- If an institutional officer signs in at `/organisation/login`, they are routed to `/organisation/portal`.
- If your account holds both roles, the header avatar menu allows seamless switching between **Donor Dashboard** and **Organisation Workspace**.
