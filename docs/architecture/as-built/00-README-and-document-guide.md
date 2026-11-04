# RaktaSetu — As-Built Architecture & Complete Engineering Reference


> **Documentation Suite Version:** 1.0.0  
> **Repository Root:** `D:\MyProject\RaktSetu`  
> **Audit Date:** November 2026  
> **System Status:** Fully Integrated & Functionally Operational (Phases 1–10)  
> **Target Audience:** System Architects, Lead Engineers, Evaluators, Examiners (Viva Voce), Security Auditors, and Technical Contributors.

---

## 1. Executive Summary & Purpose

This documentation suite constitutes the **authoritative, implementation-grounded as-built architecture** of the **RaktaSetu** Blood Bank Management, Emergency Allocation, and Donor Matching Platform. 

Unlike aspirational design proposals or high-level specifications, every statement, workflow diagram, data model attribute, API endpoint, security gate, and user interaction cataloged herein reflects the **exact codebase as implemented in this repository today**.

RaktaSetu bridges the critical gap between emergency clinical blood demand and verified voluntary donor supply across Indian districts, integrating national availability datasets (e-RaktKosh), real-time cold-chain custody, inventory-first shortfall evaluation, platform-controlled deterministic donor matching, and multi-tenant blood bank operations.

---

## 2. Document Map & Reading Guide

This comprehensive reference is structured into modular architectural volumes:

| Document File | Core Subject | Primary Focus & Deliverables |
|---|---|---|
| [`01-system-overview.md`](./01-system-overview.md) | **System Overview & Context** | System context, problem statement, key actors, external ecosystem, and foundational domain rules. |
| [`02-repository-and-technology-stack.md`](./02-repository-and-technology-stack.md) | **Repo & Stack Audit** | Monorepo layout, workspace packages, package manifests, runtime environments, and technology matrices. |
| [`03-high-level-design.md`](./03-high-level-design.md) | **High-Level Design (HLD)** | Multi-tier logical architecture, request routing, data flows (Level 0 & 1), and boundary responsibilities. |
| [`04-component-architecture.md`](./04-component-architecture.md) | **Component Architecture** | Web components, Express API routers, domain services, and database persistence mapping. |
| [`05-user-roles-and-permissions.md`](./05-user-roles-and-permissions.md) | **Roles & RBAC Architecture** | Platform roles vs. Organisation roles, token lifecycle, permission matrices, and clinical access boundaries. |
| [`06-portal-navigation-inventory.md`](./06-portal-navigation-inventory.md) | **Portal & Navigation Inventory** | Master inventory of every web route, screen, tab, modal, header element, and role-based redirect. |
| [`07-page-and-interaction-catalog.md`](./07-page-and-interaction-catalog.md) | **Button-by-Button Catalog** | Exhaustive interaction-level catalog of forms, actions, handlers, payloads, DB queries, and side effects. |
| [`08-module-architecture.md`](./08-module-architecture.md) | **Functional Modules** | In-depth breakdown of all 18 functional modules from donor registration to custody handover. |
| [`09-end-to-end-blood-request-workflow.md`](./09-end-to-end-blood-request-workflow.md) | **Canonical Request Lifecycle** | Complete 12-stage lifecycle: creation, canonical routing, inventory evaluation, shortfall, matching, release, and closure. |
| [`10-donor-matching-architecture.md`](./10-donor-matching-architecture.md) | **Donor Matching Engine** | Hard eligibility filters, deterministic ranking tiers, search scopes, admin approval gates, and donor privacy. |
| [`11-database-and-erd.md`](./11-database-and-erd.md) | **Database & Data Models** | Complete Prisma schema analysis, 33 tables, enums, foreign keys, unique constraints, and transaction boundaries. |
| [`12-api-and-backend-architecture.md`](./12-api-and-backend-architecture.md) | **API & Backend Architecture** | Exhaustive HTTP REST API catalog, middleware guards, request/response contracts, and API-to-UI traceability. |
| [`13-realtime-and-event-architecture.md`](./13-realtime-and-event-architecture.md) | **Realtime & Event Delivery** | WebSocket engine, room authentication, 35+ event types, transactional outbox pattern, and state reconciliation. |
| [`14-web-mobile-parity.md`](./14-web-mobile-parity.md) | **Web vs. Mobile Parity** | Comparative matrix of Next.js web portal vs. React Native mobile app features, contracts, and platform capabilities. |
| [`15-security-privacy-and-safety.md`](./15-security-privacy-and-safety.md) | **Security, Privacy & Safety** | Defense-in-depth, token security, multi-tenant isolation, donor PII/GPS masking, and clinical safety gates. |
| [`16-deployment-and-runtime-architecture.md`](./16-deployment-and-runtime-architecture.md) | **Deployment & Runtime** | Process trees, ports, environment variables, Neon cloud DB connection pooling, and startup sequences. |
| [`17-architecture-findings-and-gaps.md`](./17-architecture-findings-and-gaps.md) | **Findings, Gaps & Tech Debt** | Evidence-based audit findings, resolved integration gaps, residual risks, and architectural recommendations. |

---

## 3. Visual Diagrams Index (`diagrams/`)

The accompanying `diagrams/` folder contains native Mermaid (`.mmd`) source files representing all standard software architecture diagrams:

1. `system-context.mmd` — System Context Diagram (Actors, Platform, External Portals).
2. `hld.mmd` — High-Level Design Multi-Tier Architecture Diagram.
3. `component-architecture.mmd` — Component Architecture Diagram.
4. `deployment.mmd` — Deployment and Physical Runtime Diagram.
5. `use-case.mmd` — Multi-Actor Unified Use Case Diagram.
6. `blood-request-activity.mmd` — End-to-End Activity Flowchart with Decision Branches.
7. `blood-request-sequence.mmd` — End-to-End Cross-Role Message Sequence Diagram.
8. `blood-request-state-machine.mmd` — Finite State Machine for Blood Requests.
9. `donor-matching-sequence.mmd` — Detailed Sequence for Shortfall Matching & Candidate Release.
10. `donor-eligibility-flow.mmd` — Deterministic Decision Tree for Donor Eligibility & Ranking.
11. `candidate-release-authorization.mmd` — System Admin Authorization & Privacy Isolation Flow.
12. `erd.mmd` — Entity Relationship Diagram for Core Database Tables.
13. `dfd-level-0.mmd` — Data Flow Diagram Level 0 (System Boundary).
14. `dfd-level-1.mmd` — Data Flow Diagram Level 1 (Subsystems & Stores).
15. `dfd-level-2-blood-request.mmd` — Data Flow Diagram Level 2 (Blood Request & Fulfillment Subsystem).
16. `realtime-events.mmd` — WebSocket Broker, Outbox, and Event Broadcast Topology.
17. `security-boundaries.mmd` — Network, Identity, RBAC, and Privacy Security Boundaries.
18. `web-mobile-parity.mmd` — Architectural Feature Distribution across Web and Mobile.

---

## 4. Implementation Status Classification Standard

Throughout this documentation, every architectural component, API, database entity, and interaction is annotated with one of the following verified status badges:

- `[IMPLEMENTED & VERIFIED]` — The feature exists in the codebase, compiles cleanly, has been verified in end-to-end integration traces, and is fully functional in runtime operations.
- `[IMPLEMENTED BUT NOT FULLY VERIFIED]` — Code exists in services and routes but has not been exercised through automated end-to-end multi-role tests in this session.
- `[PARTIALLY IMPLEMENTED]` — Foundational logic or database persistence exists, but certain edge branches or UI controls are incomplete.
- `[UI-ONLY / MOCK]` — Visual UI controls or mock state exist without corresponding backend API or database integration.
- `[BROKEN / INTEGRATION ISSUE]` — An integration mismatch was identified during audit (details documented with root cause and remediation).
- `[PLANNED / NOT IMPLEMENTED]` — Described in design or roadmap discussions but with zero supporting code in the repository.
