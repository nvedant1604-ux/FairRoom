# FairRoom — Intelligent Housing Allocation System: Test Report

## Strategy

- `python -m compileall backend\app` validates Python compilation.
- `python -m pytest` covers typed rules, versioning, isolation, fallback, draw outcomes, migration safety and Resident portal authorization.
- `npm.cmd run build` performs strict TypeScript checking and a Vite production build.
- Playwright combines browser interaction with API assertions.
- The suite runs one Chromium worker to avoid shared-state collisions.
- Global setup launches backend port **8010** and frontend port **5174**.
- `AI_LOTTERY_DB` points to `frontend/test-results/ai-lottery-e2e.sqlite`.
- Setup removes only that temporary database and its WAL files.
- Windows teardown uses PowerShell `Stop-Process` on recorded test PIDs. Setup refuses occupied E2E ports before clearing the temporary database.
- CORS explicitly permits local ports 5173 and 5174.

## Current Result

**22 Playwright tests passed, 0 failed; six backend tests passed, 0 failed.** The Resident portal adds backend role/ownership tests and an isolated Playwright login, dashboard, eligibility, lottery, allocation, history, logout and API isolation flow. Production `backend/lottery.db` is not used by either suite.

An additional read-only backup of the existing project database was migrated twice in a temporary directory. All 8 buildings, 22 residents, 36 rooms, 14 allocations, 7 draws, 144 resident-history events and 142 audit entries remained present.

## Test Cases

| ID | Scenario | Expected and actual result | Status |
|---|---|---|---|
| T01 | Protected Resident route | Redirected to dedicated login and returned after login. | Pass |
| T02 | Protected Lottery route | Redirect and return path worked. | Pass |
| T03 | Login/session refresh | Wrong password failed; correct session survived refresh. | Pass |
| T04 | Logout/invalid token | Session cleared and invalid token redirected. | Pass |
| T05 | Demo reset | Logged-out disabled; confirmation reset 5 residents/16 rooms in fresh test DB. | Pass |
| T06 | Resident validation | Unique registration, duplicate ID/room, invalid contact, verify/reject covered. | Pass |
| T07 | Lottery execution | Countdown, seed, unique allocation, lock and blocked registration covered. | Pass |
| T08 | Reports/certificates | CSV/PDF/certificate downloads were non-empty. | Pass |
| T09 | Audit/public search | Required actions and public explanation were present. | Pass |
| T10 | Multi-building isolation | Residents, rooms, locks, reports and searches did not mix. | Pass |
| T11 | Permanent history | Snapshots survived rename/reset; cross-building history returned 404. | Pass |
| T12 | Multiple cycles | Draw 1/2 had distinct seeds and snapshots; old room reuse failed. | Pass |
| T13 | Cancellation/state rules | Preparing cycle remained Cancelled with no draw; invalid draw returned 409. | Pass |
| T14 | Process persistence | A second backend process opened the same temporary DB; three cycles remained. | Pass |
| T15 | Eligibility criteria UI and API | Admin creates and activates versions, previews residents and checks authentication and validation. | Pass |
| T16 | Eligibility snapshot immutability | Draw 1 retains version 1 after version 2 becomes active. | Pass |
| T17 | Typed hard and priority rules | Numeric and date boundaries, null handling, inactive rules and scores are checked in backend tests. | Pass |
| T18 | Eligibility integration | Full Allocation and Competitive Waiting List retain expected outcomes after filtering. | Pass |
| T19 | Resident role and ownership | Resident token sees only its own profile, eligibility, draw, allocation and events; Admin paths return 403. | Pass |
| T20 | Resident session security | Wrong passwords, lockout, reset, expiry, logout and CORS-visible authorization errors are covered. | Pass |
| T21 | Resident browser flow | Welcome, Resident login, dashboard, all Resident pages, Admin-route block, mobile/tablet navigation and logout are covered. | Pass |

## Commands

```powershell
python -m compileall backend\app
python -m pytest
cd frontend
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:report
```

The HTML report is written to `frontend/playwright-report/index.html`. Failed tests retain screenshots, video and traces; the main flow also creates explicit completion and public-search screenshots.
