# FairRoom — Intelligent Housing Allocation System: Security and Ethics

## Implemented Controls

- Server-validated Bearer-token authentication
- Session restoration validation and backend logout invalidation
- Protected administrative frontend routes and endpoints
- Full Aadhaar/ID not stored; masked value plus SHA-256 hash
- Global ID duplicate protection
- Building-scoped resource ownership checks
- Cross-building mismatches returned as 404
- Participant readiness validation and room-reuse prevention
- Immutable completed draws and historical snapshots
- Audit entries linked to relevant building/draw/resource
- Timestamped database backups before production migrations
- Admin-only, confirmation-based Demo Reset

## Deployment Warnings

The local token is stored in browser local storage and a single configured admin identity is used. Production should use HTTPS, expiring server-side sessions, password hashing/identity-provider integration, separate user accounts, secure secrets, access monitoring and database-level backup policy. Default credentials must be changed.

## Ethical Considerations

- Authorized stakeholders must approve priority and eligibility rules.
- Explanations must remain understandable and challengeable.
- Hidden manual preference must not be introduced.
- Sensitive data collection and display should be minimized.
- The system must not replace legal review or final society approval.
- Rules and score penalties should be reviewed for indirect bias.
- Residents should receive appropriate access to reports and correction procedures.
- An “AI” label must not imply official verification or guaranteed fairness.

The project supports process transparency; it does not provide legal certification.
