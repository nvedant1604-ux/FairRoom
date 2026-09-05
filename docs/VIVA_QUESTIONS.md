# FairRoom — Intelligent Housing Allocation System: Viva Questions and Simple Answers

1. **What is the project purpose?** To support transparent, building-specific redevelopment room allocation.
2. **What problem does it solve?** It replaces scattered/manual eligibility and draw records with an auditable workflow.
3. **Why does redevelopment allocation matter?** A room affects a resident's home and must be assigned consistently and transparently.
4. **What is the frontend?** A React and TypeScript single-page application.
5. **Why React?** It supports reusable, state-driven UI components.
6. **Why TypeScript?** It catches many data-shape errors during development.
7. **What is Vite?** The development server and production build tool.
8. **What is the backend?** A Python FastAPI application.
9. **Why FastAPI?** It provides typed validation, routing and clear JSON APIs with little boilerplate.
10. **What database is used?** SQLite.
11. **Why SQLite?** It is portable, simple and sufficient for a local college MVP.
12. **What is an API?** A defined interface through which the frontend requests backend operations and data.
13. **What is REST-style routing?** Resources are addressed by paths and standard HTTP methods.
14. **What is CORS?** A browser security policy controlling requests between different origins/ports.
15. **Which local origins are allowed?** Frontend ports 5173 and test port 5174 on localhost/127.0.0.1.
16. **How does admin authentication work?** Valid credentials produce a secure random server-recognized Bearer token.
17. **What is a Bearer token?** A credential sent in the HTTP Authorization header.
18. **How is logout handled?** The backend token is invalidated and browser session data is cleared.
19. **What are protected routes?** Frontend pages and backend endpoints requiring a valid admin session.
20. **What does BuildingContext do?** It loads buildings and shares the selected building across React pages.
21. **How is building isolation enforced?** Queries include building IDs and ownership mismatches return 404.
22. **Can two buildings use Room A-101?** Yes; room number uniqueness is per building.
23. **Can two residents share the same old room in one building?** No; old room is unique per building.
24. **How is the same Aadhaar prevented across buildings?** Its normalized SHA-256 hash has a global unique constraint.
25. **Is full Aadhaar stored?** No; only a masked display value and hash are stored.
26. **What are primary and foreign keys?** A primary key identifies a row; a foreign key links it to another table.
27. **What is a draw cycle?** A named allocation phase with separate residents, rooms, seed and results.
28. **How does the system support Draw 2?** It creates the next per-building cycle while preserving Draw 1 snapshots.
29. **Which cycle states exist?** Preparing, Ready, In Progress, Completed, Failed, Cancelled and Archived.
30. **Why only one active cycle per building?** To avoid ambiguous concurrent eligibility lists.
31. **Who is eligible by default?** Verified, unallocated residents belonging to the building.
32. **Which rooms are eligible?** Available, unused rooms belonging to the building.
33. **Can an allocated room be reused?** No; history checks block it.
34. **Can an allocated resident enter another cycle?** Only through an explicit reason and confirmed audited override.
35. **What is a lottery seed?** A stored random value used to initialize deterministic shuffling.
36. **What is deterministic shuffle?** The same seed and inputs produce the same shuffled order.
37. **How do you prove the draw is fair?** Review eligibility snapshots, priority rules, seed, algorithm, allocations and audit logs; this supports verification but is not legal proof by itself.
38. **What priority order is used?** Disabled, Senior Citizen, Medical Emergency, Widow, Large Family and General.
39. **How is suitability handled?** Special categories prefer appropriate lower-floor or size/suitability-tagged rooms.
40. **Does AI choose winners?** No; deterministic explicit logic performs allocation.
41. **Why call it FairRoom?** FairRoom emphasizes a transparent, fair room-allocation process supported by AI-style rule components that validate data, match suitability, score fairness and generate explanations.
42. **What is the fairness score?** A transparent indicator starting at 100 with penalties for defined data/process issues.
43. **Does 100 guarantee legal fairness?** No; it is a project metric, not legal certification.
44. **What is an AI explanation?** Human-readable text describing eligibility, seed use and room suitability.
45. **What is an audit log?** A timestamped record of an important action, actor and reason.
46. **Can an administrator change a completed result?** No; completed history modification is blocked with HTTP 423.
47. **Why are historical snapshots necessary?** Current names or project details can change, but past draw evidence must not.
48. **What is Resident History?** A timeline of registration/verification events and draw participation.
49. **What is Draw History?** A building-specific list of every preparing, completed, cancelled or archived cycle.
50. **What happens if the server restarts?** SQLite data persists and idempotent migrations do not duplicate cycles.
51. **What reports are generated?** JSON summaries, CSV allocations, PDF reports and transparency certificates.
52. **Why provide CSV?** It is easy to inspect and analyze in spreadsheet software.
53. **Why provide PDF?** It creates a portable human-readable submission/evidence file.
54. **How does public search work?** It searches a selected building by exact old room or ID last four digits.
55. **What public data is hidden?** Full IDs, admin-only override details and session information.
56. **What is Playwright?** A browser automation framework used for end-to-end testing.
57. **Why one test worker?** Tests intentionally share one temporary application/database state.
58. **How is production protected during tests?** `AI_LOTTERY_DB` points the backend to a temporary test-results database.
59. **What does the E2E suite cover?** Auth, validation, lottery, downloads, isolation, history, cycles and restart persistence.
60. **What is Demo Reset?** An authenticated confirmed reset of current demo state that preserves completed history.
61. **What are the largest current limitations?** SQLite concurrency, one demo admin, manual verification and no official integrations.
62. **How would you deploy for production?** Use HTTPS, PostgreSQL, managed secrets, real accounts, monitoring, encrypted backups and security/legal review.
63. **Would blockchain automatically improve fairness?** No; it may anchor hashes but cannot correct biased rules or invalid inputs.
64. **How would PostgreSQL help?** Better concurrency, operational tooling, access controls and deployment support.
65. **How would you add multilingual support?** Extract interface strings into translation files and provide locale selection.
