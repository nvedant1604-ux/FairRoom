# FairRoom — Intelligent Housing Allocation System

## AI-Assisted Transparent Room Allocation System for Building Redevelopment

### BSc IT Final-Year Project Report

**Student:** [Student Name]  
**Roll number:** [Roll Number]  
**Guide:** [Guide Name]  
**College:** [College Name]  
**University:** [University Name]  
**Academic year:** 2025–2026

---

## Certificate Placeholder

This is to certify that **[Student Name]** completed the project titled **FairRoom — Intelligent Housing Allocation System** under the guidance of **[Guide Name]** as part of the BSc IT final-year curriculum. Add the required guide, department head, principal and external examiner signatures here.

## Declaration Placeholder

I, **[Student Name]**, declare that this report and implementation are my original academic work, completed under appropriate guidance. Sources used are acknowledged in the references. Add date, place and student signature here.

## Acknowledgement

I thank my project guide, faculty members, college, family and classmates for their guidance and feedback. I also acknowledge the open-source communities behind Python, FastAPI, React, TypeScript, SQLite, Tailwind CSS and Playwright.

## Abstract

Redevelopment projects require old occupants to be assigned rooms in a new building. Informal records and manual draws can make eligibility, priority and room selection difficult to verify. FairRoom is a full-stack prototype that supports multiple buildings and controlled allocation phases. Administrators review residents and rooms, confirm a draw cycle and run a stored-seed deterministic lottery. Priority groups and room-suitability rules are applied consistently. The application records current allocations, immutable snapshots, resident history, draw history and audit events. It generates CSV/PDF reports and transparency certificates and offers a public resident search. AI-style components assist with validation, warnings, scoring and explanations; they do not secretly choose winners or replace legal approval. Playwright validates authentication, isolation, history, reporting, multiple cycles and restart persistence.

The transparent rule-based eligibility engine evaluates building-specific, versioned hard and priority rules after verification and before lottery selection. Hard failures exclude a resident; priority points explain policy matches without selecting winners. Draws retain the exact criteria version and per-resident evaluations, so later policy changes cannot rewrite historical decisions. The existing seeded lottery, fairness score and suitability logic remain distinct. The current automated suite has 21 Playwright scenarios and five backend eligibility tests.

## Table of Contents

1. Introduction and problem analysis
2. Proposed system, objectives and scope
3. Requirements and feasibility
4. Architecture and modules
5. Database and lottery algorithm
6. Functional modules
7. Security, testing and results
8. Limitations, future scope and conclusion

## 1. Introduction

Building redevelopment replaces an older property with a new project. Existing residents may have different family sizes, old rooms and approved priority needs. Allocation must therefore be understandable, consistent and recorded. This project demonstrates a web-based workflow in which eligibility is reviewed before a seeded draw and every important result is retained.

## 2. Problem Statement

How can a society conduct repeated room-allocation draws across multiple buildings while preventing mixed data, duplicate room use, unexplained manual preference and loss of earlier results?

## 3. Existing System

Common small-project methods include paper slips, meetings, spreadsheets and verbal confirmation. These methods can work socially but often lack one controlled source of residents, rooms, eligibility, seeds, reports and historical evidence.

## 4. Problems in the Existing System

- Eligibility may be unclear at draw time.
- Priority and suitability decisions may be inconsistent.
- Manual edits can be difficult to trace.
- A spreadsheet may mix projects or overwrite earlier phases.
- Residents may not receive a clear allocation explanation.
- Reports and certificates require repeated manual preparation.

## 5. Proposed System

The proposed system uses a React interface, FastAPI service and SQLite database. Building-scoped records prevent mixing. An administrator prepares a draw cycle, includes reviewed residents and rooms, confirms readiness and starts the deterministic lottery. The backend generates a seed, applies explicit rules and persists results and snapshots.

## 6. Project Objectives

- Provide a usable multi-building administration interface.
- Validate resident identity hashes, old rooms, contact details and verification.
- Track room availability and suitability.
- Support Draw 1, Draw 2 and later phases independently.
- Preserve earlier completed results permanently.
- Produce explainable and auditable allocations.
- Offer reports, certificates and public lookup.
- Test essential workflows automatically.

## 7. Project Scope

The prototype covers local society administration, controlled eligibility, room allocation, repeated phases, history and reports. It does not perform official identity verification, legal adjudication, online payment, government integration or large-scale cloud operations.

## 8. Functional Requirements

The system shall authenticate an administrator; create/select/archive buildings; register, verify and reject residents; add rooms; create and cancel cycles; manage participant eligibility; run Ready cycles; prevent room reuse; display results and history; record audits; export files; and support building-scoped public search.

## 9. Non-Functional Requirements

- **Security:** protected backend actions and masked sensitive identifiers.
- **Integrity:** foreign keys, uniqueness rules and immutable history.
- **Usability:** responsive screens and readable errors.
- **Reliability:** transaction-based writes, backups and restart persistence.
- **Maintainability:** separated frontend, API, fairness and reporting modules.
- **Testability:** isolated deterministic E2E environment.

## 10. Hardware Requirements

For local demonstration: a modern 64-bit laptop/desktop, dual-core processor or better, 4 GB RAM minimum (8 GB recommended), approximately 1 GB free space and a display capable of running a modern browser.

## 11. Software Requirements

Windows 10/11, Python 3.11 or newer, Node.js/npm, a Chromium-compatible browser, FastAPI/Uvicorn dependencies, React/TypeScript/Vite packages and SQLite support included with Python.

## 12. Feasibility Study

- **Technical:** all technologies are mature, open source and suitable for a college prototype.
- **Economic:** development uses existing hardware and free tools.
- **Operational:** forms follow the actual sequence of building, resident, room and draw preparation.
- **Schedule:** modular development permits features and tests to be added incrementally.
- **Legal/ethical:** the prototype minimizes displayed identity data but still requires stakeholder rules and independent legal review before real deployment.

## 13. System Architecture

The browser renders React pages and calls JSON endpoints through a shared API client. FastAPI performs authentication, validation, building ownership checks, transactions and reporting. The fairness module performs seeded allocation. SQLite stores both current state and immutable history. See [ARCHITECTURE.md](ARCHITECTURE.md).

## 14. Module Description

The main modules are Authentication, Building Management, Residents, Rooms, Draw Cycles, Fairness Engine, Allocation Results, History, Audit, Reporting, Resident Search and Automated Testing.

## 15. Database Design

Operational tables are linked by `building_id`. `lottery_draws` is the draw-cycle master; participant tables record eligibility and `draw_allocations` records completed results. Masked identifiers support display while hashes support duplicate protection. See [DATABASE_DESIGN.md](DATABASE_DESIGN.md).

## 16. Lottery Algorithm

After readiness validation, a secure seed is generated. Residents are grouped in configured priority order and shuffled deterministically within each group. Rooms are separately shuffled. Special categories receive a suitable remaining room when possible. Each room is removed after assignment. Explanations and a fairness score are stored. See [LOTTERY_ALGORITHM.md](LOTTERY_ALGORITHM.md).

## 17. AI Role in Fairness

AI-style logic supports duplicate detection, warnings, suitability, scoring, explanations and summaries. The deterministic algorithm—not a hidden AI model—performs allocation. See [AI_FAIRNESS_ROLE.md](AI_FAIRNESS_ROLE.md).

## 18. Multi-Building Management

Each building has its own residents, rooms, settings, cycles, history, allocations and audits. Endpoints validate ownership and return 404 for cross-building resource requests. Identical room labels such as A-101 are permitted in separate buildings.

## 19. Resident Management

The administrator records a name, Aadhaar/ID, old room, family count, contact, wing, priority, document name and consent. The backend stores only the masked ID and SHA-256 hash. Residents begin Pending Verification and may be verified or rejected.

## 20. Room Management

Rooms contain number, wing, floor, size, status and suitability notes. Only available, unused rooms can be included. Reserved rooms must first be released through current room management; previously allocated historical rooms cannot be silently reused.

## 21. Multiple Draw Cycles

One active non-completed cycle is allowed per building. Preparing cycles are editable, Ready cycles have locked lists, and In Progress cycles are executing. Completed results are immutable. Preparing or Ready cycles may be cancelled with a reason. Each later draw receives a new number, reference, seed, allocation snapshot and report.

## 22. Resident and Draw History

Resident history shows verification events and participation across cycles. Draw history shows status-dependent actions and permanent completed results. A resident may be unallocated in one draw and allocated later without altering the first record.

## 23. Authentication and Authorization

The backend validates configured credentials and issues a secure random Bearer token. Protected requests require the token. The frontend protects administrative routes, validates restored sessions and clears state on logout or expiry. Default credentials are strictly for local demonstration.

## 24. Audit and Transparency

Audit entries record log-relevant actions, actor, timestamp, reason and optional building/draw/resident/room references. Completed draw modification attempts receive HTTP 423 and are audited. Stored seeds, snapshots and reports make the process understandable.

## 25. Report and Certificate Generation

Current and historical allocation CSV files, PDF reports and transparency certificates include project/draw context, seed, algorithm version, counts, score and results. PDFs use the project's internal lightweight PDF generator.

## 26. Public Resident Search

After selecting a public building, residents can search by exact old-room number or Aadhaar/ID last four digits. The response includes masked identity, allocation status, latest room and multiple completed draw participations. Admin-only reasons and override details are not returned.

## 27. Testing Strategy

Static Python compilation and TypeScript/Vite production builds catch syntax and type errors. Playwright runs one Chromium worker against separate servers and a temporary SQLite file. API assertions and browser interaction cover protected routes, validation, downloads, isolation, cycles, immutability and restart persistence.

## 28. Test Results

At documentation time: backend compilation passed, frontend production build passed, and Playwright reported **8 passed, 0 failed**. See [TEST_REPORT.md](TEST_REPORT.md).

## 29. Security and Privacy

The project uses backend authorization, masked identity display, hashed duplicate identifiers, scoped queries, audit logs, immutable snapshots and database backups. Local storage and a single token are acceptable demonstration choices but require stronger deployment controls for production. See [SECURITY_AND_ETHICS.md](SECURITY_AND_ETHICS.md).

## 30. Limitations

SQLite has limited concurrent-write scaling. Credentials are demonstration defaults. Verification is manual. AI-style functions are rule-based. There are no digital signatures, notifications, multilingual screens or formal regulatory integrations.

## 31. Future Scope

Potential work includes PostgreSQL, cloud hosting, role-based accounts, resident portals, OCR, notifications, digital signatures, multilingual support, independently verifiable hashes and professional security/compliance review.

## 32. Conclusion

The project successfully combines deterministic lottery logic with building isolation, eligibility controls, history, auditing and explanations. It demonstrates how software can support a transparent redevelopment process while clearly leaving final approval and legal responsibility with authorized stakeholders.

## 33. References

- FastAPI documentation — https://fastapi.tiangolo.com/
- React documentation — https://react.dev/
- TypeScript documentation — https://www.typescriptlang.org/docs/
- SQLite documentation — https://www.sqlite.org/docs.html
- Playwright documentation — https://playwright.dev/docs/intro
- Python documentation — https://docs.python.org/3/
