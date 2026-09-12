# FairRoom — Intelligent Housing Allocation System: Security and Ethics

## Implemented Controls

- Server-validated Bearer-token authentication
- Session restoration validation and backend logout invalidation
- Protected administrative frontend routes and endpoints
- Admin-only criteria management and preview endpoints; rule IDs are checked against the selected building on the server
- Frozen activated rule versions and per-draw snapshots prevent later policy changes from rewriting completed decisions
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
- Optional annual income and dates are used only when an administrator configures a legitimate policy. The public resident list and transparency report do not expose individual income or date values.
- The eligibility engine is deterministic and rule-based, not an opaque machine-learning model. Priority points are disclosed and do not choose lottery winners.
- The system must not replace legal review or final society approval.
- Rules and score penalties should be reviewed for indirect bias.
- Residents should receive appropriate access to reports and correction procedures.
- An “AI” label must not imply official verification or guaranteed fairness.

The project supports process transparency; it does not provide legal certification.
