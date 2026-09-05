# FairRoom — Intelligent Housing Allocation System: Test Report

## Strategy

- `python -m compileall backend\app` validates Python compilation.
- `npm.cmd run build` performs strict TypeScript checking and a Vite production build.
- Playwright combines browser interaction with API assertions.
- The suite runs one Chromium worker to avoid shared-state collisions.
- Global setup launches backend port **8010** and frontend port **5174**.
- `AI_LOTTERY_DB` points to `frontend/test-results/ai-lottery-e2e.sqlite`.
- Setup removes only that temporary database and its WAL files.
- Windows teardown uses `taskkill /T /F` on recorded test PIDs.
- CORS explicitly permits local ports 5173 and 5174.

## Current Result

**8 passed, 0 failed.** Production `backend/lottery.db` is not used by Playwright.

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
| T14 | Restart persistence | Backend was restarted against the same temporary DB; three cycles remained. | Pass |

## Commands

```powershell
python -m compileall backend\app
cd frontend
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:report
```

The HTML report is written to `frontend/playwright-report/index.html`. Failed tests retain screenshots, video and traces; the main flow also creates explicit completion and public-search screenshots.
