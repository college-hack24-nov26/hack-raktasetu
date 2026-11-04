# RaktaSetu — Module-by-Module Functional Architecture

## Module Inventory Overview

The RaktaSetu codebase comprises 18 cohesive functional modules:

| Module Number & Name | Primary Service & Route Files | Database Models | Implementation Status |
|---|---|---|---|
| **M01: Authentication & User Profiles** | `auth.ts`, `profile.ts` | `User`, `Session` | `[IMPLEMENTED & VERIFIED]` |
| **M02: Blood Availability & Directory** | `availability.ts`, `bloodCentres.ts`, `eraktkosh.ts` | `BloodCentre`, `BloodAvailabilitySnapshot` | `[IMPLEMENTED & VERIFIED]` |
| **M03: Patient Emergency Requests** | `requests.ts`, `bloodRequestCoordination.ts` | `BloodRequest` | `[IMPLEMENTED & VERIFIED]` |
| **M04: Blood Bank Designation & Routing** | `hospitalIntegration.ts`, `requests.ts` | `BloodRequest`, `Organisation` | `[IMPLEMENTED & VERIFIED]` |
| **M05: Inventory Allocation & Shortfall** | `hospitalIntegration.ts`, `inventory.ts` | `BloodRequest`, `ComponentUnit` | `[IMPLEMENTED & VERIFIED]` |
| **M06: System Admin Matching Control** | `adminMatching.ts`, `adminMatchingService.ts` | `BloodRequest`, `DonorProfile`, `AuditLog` | `[IMPLEMENTED & VERIFIED]` |
| **M07: Donor Eligibility & Deterministic Ranking** | `adminMatchingService.ts`, `matching.ts` | `DonorProfile`, `DonorLatestLocation` | `[IMPLEMENTED & VERIFIED]` |
| **M08: Candidate Release & Privacy Masking**| `adminMatchingService.ts`, `hospital.ts` | `BloodRequest`, `AuditLog` | `[IMPLEMENTED & VERIFIED]` |
| **M09: Donor Outreach & Acceptance Tracking**| `hospital.ts`, `hospitalIntegration.ts` | `DonorResponse` | `[IMPLEMENTED & VERIFIED]` |
| **M10: Donor Registration & Location Tracking**| `donorRegistration.ts`, `donorLocation.ts` | `DonorProfile`, `DonorLocationSession` | `[IMPLEMENTED & VERIFIED]` |
| **M11: Camp Operations & Readiness** | `organisations.ts`, `campOperations.ts` | `Camp`, `CampStaffAssignment` | `[IMPLEMENTED & VERIFIED]` |
| **M12: Clinical Screening & Deferral** | `campOperations.ts`, `organisations.ts` | `CampAttendance`, `ClinicalScreening` | `[IMPLEMENTED & VERIFIED]` |
| **M13: Phlebotomy & Blood Collection** | `campOperations.ts`, `traceability.ts` | `DonationEvent`, `CollectionUnit` | `[IMPLEMENTED & VERIFIED]` |
| **M14: Laboratory Testing & TTI Screening** | `traceability.ts`, `processingAndInventory.ts` | `LaboratoryTestRecord` | `[IMPLEMENTED & VERIFIED]` |
| **M15: Clinical Release Sign-Off** | `traceability.ts`, `processingAndInventory.ts` | `ClinicalReleaseRecord`, `ComponentUnit` | `[IMPLEMENTED & VERIFIED]` |
| **M16: Component Derivation & Cold Storage**| `processing.ts`, `processingAndInventory.ts` | `ComponentUnit`, `StorageLocation` | `[IMPLEMENTED & VERIFIED]` |
| **M17: Custody Handover & Manifests** | `handover.ts`, `hospitalIntegration.ts` | `HandoverManifest`, `HospitalIssueOrder` | `[IMPLEMENTED & VERIFIED]` |
| **M18: Realtime Broker & WebSocket Outbox** | `realtime.ts`, `realtimeRouter.ts` | `OutboxEvent` | `[IMPLEMENTED & VERIFIED]` |

---

## Detailed Analysis of Core Operational Modules

### Module M06: System Admin Donor Matching Operations
- **Core Purpose:** Empowers the state administrator to supervise matching requests, apply deterministic scoring, review ranked candidates, and explicitly release candidate lists to designated blood banks.
- **Entry Point:** Web portal `/organisation/portal` (Tab: `admin-requests`, rendered for `Role.ADMIN`).
- **Backend Service:** [`apps/api/src/services/adminMatchingService.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/services/adminMatchingService.ts)
- **Key Methods:**
  - `getPendingMatchingRequests()`: Returns all open requests with active `message.matchingRequest`.
  - `executeMatchingRun(requestId, searchScope, adminId)`: Applies hard clinical filters, scores donors across Level 1/2/3 proximity tiers, and generates deterministic tie-break rankings.
  - `releaseCandidateList(requestId, selectedCandidateIds, adminId)`: Validates admin authorization, persists released candidate IDs, logs an immutable audit trail, and emits realtime unlock events.
- **Security Guard:** Restricted strictly by `requireRole('ADMIN')`. Non-admin callers receive HTTP 403 Forbidden.

### Module M14 & M15: Laboratory Testing & Clinical Release
- **Core Purpose:** Guarantees transfusion safety by enforcing mandatory Transfusion-Transmitted Infection (TTI) testing and requiring Medical Officer sign-off before any blood component transitions from `QUARANTINED` to `AVAILABLE`.
- **Backend Service:** [`apps/api/src/services/processingAndInventory.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/services/processingAndInventory.ts)
- **Clinical Protocol Reference:** All whole blood collections undergo mandatory screening for:
  1. HIV-1 and HIV-2 Antibodies
  2. Hepatitis B Surface Antigen (HBsAg)
  3. Hepatitis C Virus (HCV) Antibodies
  4. Syphilis (RPR / TPHA)
  5. Malaria Parasite Antigen
- **Clinical Release Authorization:**
  - Only users holding `OrgRole.CLINICAL_STAFF` (`clinical:release` permission) can invoke `POST /api/v1/organisations/:orgId/components/:componentId/release`.
  - The service verifies that all TTI tests have been recorded with `resultOutcome: 'NON_REACTIVE'` and verified. If any test is reactive, the component is automatically placed on `DISCARD_ORDERED` hold.

