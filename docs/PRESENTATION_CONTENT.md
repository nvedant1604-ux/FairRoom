# FairRoom — Intelligent Housing Allocation System: Presentation Content (15 Slides)

## 1. Title
- FairRoom — Intelligent Housing Allocation System
- AI-Assisted Transparent Room Allocation
- Student, guide and college placeholders
- **Visual:** dashboard hero
- **Notes:** Introduce redevelopment allocation in one sentence.

## 2. Problem Statement
- Manual records are difficult to audit
- Eligibility and priorities may be unclear
- Later phases can overwrite earlier evidence
- **Visual:** paper/spreadsheet versus system
- **Notes:** Focus on transparency, not accusations.

## 3. Existing System
- Paper slips and meetings
- Separate spreadsheets
- Manual explanations and reports
- Weak historical traceability
- **Visual:** simple before-process diagram
- **Notes:** Existing methods may work but lack one controlled record.

## 4. Proposed Solution
- Building-scoped digital records
- Reviewed draw-cycle eligibility
- Stored-seed deterministic lottery
- Immutable history and reports
- **Visual:** six-step workflow
- **Notes:** State that legal approval remains external.

## 5. Objectives
- Prevent mixed-building data
- Apply explicit priority rules
- Preserve all draw phases
- Explain and audit allocations
- Provide public result lookup
- **Visual:** target/check icons
- **Notes:** Link objectives to the problem.

## 6. Technology Stack
- React 19 + TypeScript + Tailwind
- FastAPI + Python
- SQLite
- Playwright
- CSV/PDF reporting
- **Visual:** technology logos
- **Notes:** Explain why these tools suit an MVP.

## 7. System Architecture
- Shared React shell and BuildingContext
- Bearer-authenticated API client
- FastAPI validation and services
- Fairness/reporting modules
- SQLite persistence
- **Visual:** Mermaid architecture from ARCHITECTURE.md
- **Notes:** Follow one request from browser to database.

## 8. Major Modules
- Buildings, residents and rooms
- Draw cycles and lottery
- Results and history
- Audit and reports
- Public search
- **Visual:** module grid
- **Notes:** Mention protected versus public modules.

## 9. Multi-Building Management
- Independent residents and rooms
- Independent draw cycles/locks
- Scoped settings and audits
- Cross-building requests return 404
- **Visual:** Building A/B separation diagram
- **Notes:** Explain repeated room labels are safe across buildings.

## 10. Lottery Algorithm
- Confirm included residents and rooms
- Generate and store seed
- Priority-group deterministic shuffle
- Suitability matching
- Unique allocation and persistence
- **Visual:** lottery flowchart
- **Notes:** AI does not secretly select winners.

## 11. AI Fairness Role
- Duplicate and suspicious-data checks
- Eligibility and suitability assistance
- Fairness score
- Explanations and summaries
- Rule-based/AI-style in current version
- **Visual:** “supports / does not do” split
- **Notes:** Avoid claims of legal fairness.

## 12. Resident and Draw History
- Permanent resident timeline
- Multiple-cycle participation
- Immutable allocation snapshots
- Draw-specific seed and certificate
- **Visual:** Draw 1/Draw 2 timeline
- **Notes:** Give unallocated-then-allocated example.

## 13. Security and Transparency
- Bearer authentication
- Masked ID plus hash
- Building ownership checks
- Audit logs and backups
- Locked completed draws
- **Visual:** shield around seed/snapshot/audit
- **Notes:** Also state production improvements needed.

## 14. Testing and Results
- Python compile and frontend build
- Temporary SQLite test database
- One Playwright worker
- 8 passed, 0 failed
- Includes backend restart persistence
- **Visual:** Playwright report screenshot
- **Notes:** Production DB is never used by tests.

## 15. Conclusion and Future Scope
- Transparent, explainable workflow achieved
- Multiple buildings and repeated cycles supported
- PostgreSQL/cloud/roles/notifications next
- Legal and security review before real use
- **Visual:** roadmap arrow
- **Notes:** End with the accurate transparency claim and invite questions.
