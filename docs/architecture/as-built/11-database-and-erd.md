# RaktaSetu — Database & Data Model Architecture

## 1. Database Topology & Engine Details

- **Database Engine:** PostgreSQL 16.x hosted on Neon Serverless Cloud (AWS Oregon).
- **ORM & Client:** Prisma ORM 6.4.1 / 6.19.3.
- **Connection Architecture:**
  - **Pooled Connection (`DATABASE_URL`):** Connects via PgBouncer on port 6543 (`?sslmode=require&pgbouncer=true`). Used by API server runtime.
  - **Direct Session Connection (`DIRECT_URL`):** Connects directly to PostgreSQL engine on port 5432 (`?sslmode=require`). Used by Prisma CLI for DDL migrations.
- **Schema Source of Truth:** [`prisma/schema.prisma`](file:///d:/MyProject/RaktSetu/prisma/schema.prisma) (1,451 lines, 33 tables, 36 enumerations).

---

## 2. Comprehensive Prisma Models Inventory

The 33 models are grouped into logical operational domains:

### Domain A: Identity, Authentication & Permissions
1. **`User`:** Root user account storing normalized E.164 phone number, display name, system role (`USER`, `DONOR`, `ADMIN`), and soft-deletion timestamp.
2. **`Session`:** Tracks active user session tokens and expiration.
3. **`Organisation`:** Certified blood banks, storage centres, and receiving facilities. Stores state/district codes, licenses, and verified status.
4. **`OrganisationMembership`:** Maps users to blood centres with specific `OrgRole` (`ORG_ADMIN`, `CLINICAL_STAFF`, `INVENTORY_STAFF`, `COLLECTION_STAFF`, `AUDITOR`).
5. **`OrganisationApplication`:** State-level onboarding applications submitted by new blood centres awaiting System Admin review.
6. **`AuditLog`:** Append-only compliance log capturing user ID, action name, resource ID, IP address, and JSON details.

### Domain B: Directory & Emergency Blood Requests
7. **`BloodCentre`:** Canonical directory of blood banks synchronized from e-RaktKosh (stores `hospitalCode`, `hospitalName`, phone, address).
8. **`BloodAvailabilitySnapshot`:** Time-stamped external availability data scraped from national portal (stores component, count, lastUpdated).
9. **`BloodRequest`:** Canonical patient blood request (stores requested units, allocated units, blood group, urgency, admitted hospital, and matching state).
10. **`DonorResponse`:** Tracks invitations dispatched to voluntary donors and their explicit responses (`PENDING`, `ACCEPTED`, `DECLINED`).

### Domain C: Voluntary Donors & Realtime Location
11. **`DonorProfile`:** Extended donor health record (blood group, availability toggle, consent, total completed donations, last donation date).
12. **`DonorCentrePreference`:** Many-to-many linkage between donors and their preferred blood centres.
13. **`DonorLocationSession`:** Time-bounded GPS tracking sessions authorized by the donor with explicit consent versions.
14. **`DonorLatestLocation`:** Realtime snapshot of the donor's latest geographic coordinates, accuracy, battery, and staleness flag.

### Domain D: Camps & Phlebotomy Collection
15. **`Camp`:** Community blood donation drives (stores venue, organizer, target date, readiness verification checklist).
16. **`CampStaffAssignment`:** Rosters assigned blood bank personnel to specific camp drives.
17. **`CampAttendance`:** Donor check-in record at camps and blood centres.
18. **`ClinicalScreening`:** Medical Officer pre-donation health screening and deferral records (stores consent, hemoglobin, decision, duration).
19. **`DonationEvent`:** Phlebotomy bleed event (stores donation type, volume in mL, adverse events).
20. **`CollectionUnit`:** Whole blood collection bag (stores unique unit number, barcode, bag identifier, and transit status).

### Domain E: Processing, Laboratory Testing & Inventory
21. **`ComponentUnit`:** Derived transfusable blood components (PRBC, FFP, Platelets) with expiration date and status.
22. **`UnitStatusHistory`:** Immutable lifecycle audit trail tracking status transitions on collection and component units.
23. **`LaboratoryTestRecord`:** Mandatory TTI screening results (HIV, HBsAg, HCV, Syphilis, Malaria) and ABO confirmation.
24. **`ClinicalReleaseRecord`:** Medical Officer clinical sign-off authorizing unit transition from quarantine to available inventory.
25. **`StorageLocation`:** Cold-chain storage units (refrigerators, deep freezers, platelet agitators) with target temperature ranges.
26. **`StorageMovementRecord`:** Physical movement logs tracking bag transfers between shelves and observed temperatures.
27. **`ComponentDispositionRecord`:** Documented discard authorization for contaminated, reactive, or expired blood units.

### Domain F: Handover, Custody & Event Delivery
28. **`HandoverManifest`:** Multi-unit transfer documents between camps and blood banks.
29. **`HandoverItem`:** Individual bags associated with a manifest and their receipt condition.
30. **`ReconciliationException`:** Log of cold-chain breaches, damaged bags, or quantity discrepancies during transport.
31. **`HospitalIssueOrder`:** Authorized blood issue orders prepared for patient fulfillment at receiving hospitals.
32. **`HospitalIssueItem`:** Individual component units allocated to a hospital issue order.
33. **`HospitalDiscrepancy`:** Handover exceptions reported upon delivery at the hospital.
34. **`OutboxEvent`:** Transactional outbox table guaranteeing reliable event delivery and WebSocket replay.

---

## 3. Important Transaction Boundaries & Concurrency

RaktaSetu uses Prisma interactive transactions (`prisma.$transaction`) to protect critical clinical and inventory operations:

1. **Component Derivation Transaction:**
   When a whole blood unit (`CollectionUnit`) is derived into components (e.g. 1 PRBC + 1 FFP):
   - Updates `CollectionUnit.status` to `PROCESSING_COMPLETED`.
   - Inserts multiple `ComponentUnit` rows atomically.
   - Writes corresponding `UnitStatusHistory` audit entries.
   - If any insert fails, the collection unit rollback preserves the original state.
2. **Matching Candidate Release Transaction:**
   - Updates `BloodRequest.message` with released candidate IDs and status `RELEASED`.
   - Inserts immutable `AuditLog` entry recording admin ID, client IP, and candidate count.
   - Inserts outbox notification record in `OutboxEvent`.

