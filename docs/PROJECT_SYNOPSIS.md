# FairRoom — Intelligent Housing Allocation System: Project Synopsis

## Submission Details

- **Subtitle:** AI-Assisted Transparent Room Allocation System for Building Redevelopment
- **Student:** [Student Name]
- **Guide:** [Guide Name]
- **College:** [College Name]
- **University:** [University Name]
- **Academic year:** 2025–2026

## Introduction and Problem Definition

Redevelopment projects must assign new rooms to residents whose old premises are being replaced. Manual draws, spreadsheets and informal decisions can create uncertainty about eligibility, priority and room selection. Residents also need a durable explanation of what happened in each draw.

FairRoom is a local web application that supports transparent allocation with building-separated data, reviewed eligibility, a stored random seed, deterministic shuffling, audit entries and immutable historical snapshots.

## Objectives

1. Maintain residents, rooms and draw cycles separately for each building.
2. Admit only reviewed, verified residents and available rooms to a draw.
3. apply approved priority and suitability rules consistently.
4. Create reproducible, one-resident-to-one-room allocations.
5. Record seeds, explanations, audit logs and historical snapshots.
6. Provide downloadable reports and a public resident lookup.
7. Prevent modification of completed results.

## Proposed Solution

An administrator signs in, selects a building, registers and verifies residents, enters rooms, and creates a controlled draw cycle. The administrator reviews suggested eligibility lists and marks the cycle Ready. At draw time, the backend generates a secure seed and uses that seed for deterministic shuffling within ordered priority groups. Suitable rooms are preferred where applicable. Results are stored in the current allocation view and in permanent draw snapshots.

## Technology Stack

- React 19, TypeScript, Vite and Tailwind CSS frontend
- FastAPI backend written in Python
- SQLite persistent database
- Bearer-token admin authentication
- CSV and simple PDF generation
- Playwright end-to-end tests

## Main Modules

- Authentication and protected routes
- Multi-building management
- Resident registration and verification
- Room inventory and suitability
- Draw-cycle preparation and eligibility
- Seeded fairness engine
- Allocation results and explanations
- Resident history, draw history and audits
- Reports, certificates and public search

## AI Role

AI-style assistance provides validation warnings, suitability matching, fairness scoring, explanations, report summaries and resident query responses. It does not secretly select winners. Allocation is performed by explicit seeded rules that can be audited.

## Expected Outcome and Scope

The expected outcome is a college-level working prototype that demonstrates a safer and more understandable alternative to informal redevelopment allocation. Its scope covers local administration, multiple buildings, repeated phases, permanent history, exports and public result lookup.

## Limitations

SQLite and one demonstration administrator are appropriate for an MVP, not a large concurrent deployment. Document verification is manual and is not connected to Aadhaar or another official system. The AI-style logic is rule-based. The application has no official digital signature, cloud hosting or legal approval.

## Future Enhancements

PostgreSQL, role-based accounts, multilingual screens, OCR-assisted document review, notifications, digital signatures, cloud deployment, public seed verification and independent compliance review could be added.

## Conclusion

The project shows how deterministic lottery logic, eligibility controls, building isolation, immutable history and understandable explanations can support fair and transparent room allocation. Final legal and society approval remains with authorized stakeholders.
