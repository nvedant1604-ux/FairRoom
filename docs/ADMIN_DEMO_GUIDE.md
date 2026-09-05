# FairRoom — Intelligent Housing Allocation System: Administrator Demonstration Guide

Target duration: 7–10 minutes.

| Time | Demonstration | Suggested presenter dialogue |
|---:|---|---|
| 0:00 | Introduce problem | “Redevelopment allocation needs clear eligibility, repeatable draws and permanent evidence.” |
| 0:30 | Admin Login | “Administrative actions require a backend-validated Bearer session.” |
| 1:00 | Building selector | “Each building has independent residents, rooms, draws and audit history.” |
| 1:30 | Add/select building | “A room label can repeat in another building without mixing records.” |
| 2:00 | Residents | “The full ID is not stored; only a mask and hash are retained. Records are reviewed before verification.” |
| 2:45 | Rooms | “Availability and suitability are explicit. Used rooms cannot enter later draws.” |
| 3:20 | Create cycle | “Every phase gets a draw number, reference, name and reason.” |
| 4:00 | Eligibility setup | “Verified unallocated residents and unused rooms are suggested, then deliberately included.” |
| 5:00 | Confirm Ready | “Readable validation blocks empty lists, shortages and invalid resources.” |
| 5:30 | Start lottery | “A new seed deterministically shuffles priority groups and rooms.” |
| 6:15 | Results/explanation | “The explanation states eligibility, seed use and suitability; AI does not secretly choose a winner.” |
| 7:00 | Draw/Resident History | “Earlier phases remain immutable while later cycles can proceed.” |
| 7:45 | Audit/certificate | “Actions, seed, snapshots and downloadable evidence support review.” |
| 8:30 | Logout/public search | “Residents can check results without gaining admin access.” |

## Backup Demo Plan

If the current building is already locked or contains completed data:

1. Do not delete history.
2. Show the existing completed draw and certificate first.
3. Select another demo building, or add one with two residents and two rooms.
4. Create the next cycle for remaining residents if unused rooms exist.
5. If live draw time is limited, use Draw History and the saved Playwright screenshots/report to demonstrate completion.

Keep a pre-demo database backup. Avoid Demo Reset on any database containing submission evidence unless preservation behavior has been explained.
