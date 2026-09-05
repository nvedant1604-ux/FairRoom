# FairRoom — Intelligent Housing Allocation System: Limitations and Future Scope

## Current Limitations

- SQLite is best suited to local/MVP workloads, not heavy concurrent administration.
- Default credentials and one admin session are demonstration choices.
- Document verification is manual and not connected to government systems.
- AI modules are rule-based/AI-style; no trained model is integrated.
- There is no cloud deployment, SMS/email notification or official digital signature.
- Aadhaar is not externally verified.
- Residents do not have authenticated self-service accounts.
- The interface is currently English-only.
- Real-time multi-admin conflict resolution is not implemented.
- Simple internal PDF generation offers limited visual customization.
- Google Maps requires a separately billed Google Cloud project, enabled Maps JavaScript API, network access and correctly restricted browser key.
- Address lookup quality depends on Google data and complete address fields; manual coordinate selection remains the fallback.
- Browser-delivered Maps keys are visible to the browser by design and must be protected with API and HTTP-referrer restrictions.

## Future Scope

- PostgreSQL and managed cloud deployment
- Role-based society, builder, auditor and authority accounts
- Resident portal and mobile application
- Structured document review and OCR
- Digital signatures and independently verifiable certificate hashes
- SMS/email allocation notifications
- Marathi and Hindi localization
- Public draw-verification portal
- Analytics and capacity planning
- Automated encrypted backup/disaster recovery
- Optional blockchain/hash anchoring after a cost-benefit review
- External penetration testing and legal/compliance review
- Optional server-mediated address validation, saved-place review workflow and map-provider abstraction

Future enhancements must preserve explainability, data minimization, immutable history and building isolation.
They must not add 3D mapping, resident/room markers or route tracking without a separately reviewed requirement, privacy assessment and performance budget.
