# FairRoom — Intelligent Housing Allocation System: API Reference

Base URL during normal local use: `http://127.0.0.1:8000/api`. Protected endpoints require `Authorization: Bearer <token>`.

Roles are validated on the server. Except for `/health`, `/public/buildings`, and the two login endpoints, every API path requires a bearer token. Legacy building, report, resident-search and eligibility routes are Admin-only. Resident tokens are accepted only under the private `/resident/` routes listed below; these routes infer resident and building IDs from the token.

## Endpoint Catalogue

| Group | Method and path | Auth | Purpose |
|---|---|---:|---|
| Health | `GET /health` | No | Service readiness. |
| Authentication | `POST /admin/login` | No | Accepts `email`, `password`; returns token and email. |
| Authentication | `GET /admin/session` | Yes | Validates restored session. |
| Authentication | `POST /admin/logout` | Yes | Invalidates token; returns 204. |
| Resident auth | `POST /resident/login` | No | Accepts existing numeric `resident_id` and password; returns resident token and role. |
| Resident auth | `GET /resident/session` | Resident | Validates token and returns role, ID and name. |
| Resident auth | `POST /resident/logout` | Resident | Invalidates the resident session. |
| Resident account | `PUT /buildings/{building_id}/residents/{resident_id}/portal-password` | Admin | Sets/resets a password; invalidates existing resident sessions. |
| Resident portal | `GET /resident/me` or `/resident/profile` | Resident | Own profile with masked ID; excludes credential hash and income. |
| Resident portal | `GET /resident/eligibility` | Resident | Own live result from the active building rule version, explanation and priority points. |
| Resident portal | `GET /resident/lottery` | Resident | Own draw participation, result, room and waiting-list position where recorded. |
| Resident portal | `GET /resident/allocation` | Resident | Own current allocation, or null. |
| Resident portal | `GET /resident/history` | Resident | Own existing history events. |
| Buildings | `GET /buildings` | Yes | Active building list. |
| Buildings | `GET /public/buildings` | No | Limited building directory without resident or draw data. |
| Buildings | `POST /buildings` | Yes | Create from building/project/address fields. |
| Buildings | `GET /buildings/{building_id}` | Yes | Building details. |
| Buildings | `PUT /buildings/{building_id}` | Yes | Update editable building fields. |
| Buildings | `POST /buildings/{building_id}/archive` | Yes | Archive building if rules allow. |
| Dashboard | `GET /buildings/{building_id}/dashboard` | Admin | Building statistics; `/dashboard` is legacy default-building alias. |
| Residents | `GET /buildings/{building_id}/residents` | Admin | Building residents. |
| Residents | `POST /buildings/{building_id}/residents` | Yes | Register resident with consent and identity/contact validation. |
| Residents | `POST /buildings/{building_id}/residents/{resident_id}/verify` | Yes | Mark verified. |
| Residents | `POST /buildings/{building_id}/residents/{resident_id}/reject` | Yes | Mark rejected. |
| Rooms | `GET /buildings/{building_id}/rooms` | Admin | Building rooms. |
| Rooms | `POST /buildings/{building_id}/rooms` | Yes | Add room. |
| Eligibility | `GET /buildings/{building_id}/eligibility/metadata` | Yes | Supported resident fields, types and operators. |
| Eligibility | `GET /buildings/{building_id}/eligibility/rule-sets` | Yes | Building-specific version history. |
| Eligibility | `GET .../rule-sets/current` | Yes | Active criteria or explicit no-rules fallback. |
| Eligibility | `GET .../rule-sets/{rule_set_id}` | Yes | Version with its rules. |
| Eligibility | `POST .../rule-sets` | Yes | Create a draft version, optionally copying another version in the same building. |
| Eligibility | `PUT .../rule-sets/{rule_set_id}` | Yes | Edit draft metadata only. |
| Eligibility | `POST/PUT/DELETE .../rule-sets/{rule_set_id}/rules[/{rule_id}]` | Yes | Add, edit or remove draft rules. |
| Eligibility | `POST .../rule-sets/{rule_set_id}/activate` | Yes | Activate and freeze one version; previous active version becomes inactive. |
| Eligibility | `GET .../residents/{resident_id}?rule_set_id=` | Yes | Non-mutating resident preview for active or chosen version. |
| Eligibility | `POST .../evaluate-all?rule_set_id=` | Yes | Non-mutating building-wide preview and counts. |
| Draw cycles | `POST /buildings/{building_id}/draw-cycles` | Yes | Create Preparing cycle from name, phase, reason, date and notes. |
| Draw cycles | `GET /buildings/{building_id}/draw-cycles/{draw_id}` | Yes | Cycle, residents, rooms and totals. |
| Draw cycles | `GET .../{draw_id}/eligibility` | Yes | Alias returning cycle setup data. |
| Draw cycles | `PUT /buildings/{building_id}/draw-cycles/{draw_id}` | Yes | Edit Preparing metadata. |
| Draw cycles | `POST .../{draw_id}/residents` | Yes | Include/exclude resident; accepts ID, flag, reason and override confirmation. |
| Draw cycles | `DELETE .../{draw_id}/residents/{resident_id}` | Yes | Exclude participant. |
| Draw cycles | `POST .../{draw_id}/rooms` | Yes | Include/exclude room. |
| Draw cycles | `DELETE .../{draw_id}/rooms/{room_id}` | Yes | Exclude room. |
| Draw cycles | `POST .../{draw_id}/confirm` | Yes | Validate policy eligibility, snapshot version/results and mark Ready. |
| Draw cycles | `POST .../{draw_id}/draw` | Yes | Run selected Ready cycle. |
| Draw cycles | `POST .../{draw_id}/cancel` | Yes | Cancel Preparing/Ready cycle with reason and confirmation. |
| Legacy lottery | `POST /buildings/{building_id}/lottery/draw` | Yes | Original first-draw path retained for compatibility. |
| Allocations | `GET /buildings/{building_id}/allocations` | Admin | Current building allocations. |
| Resident history | `GET /buildings/{building_id}/residents/history` | Yes | Search/list history summaries. |
| Resident history | `GET /buildings/{building_id}/residents/{resident_id}/history` | Yes | Profile, events and all cycle participation. |
| Draw history | `GET /buildings/{building_id}/draws` | Yes | All cycle statuses newest first. |
| Draw history | `GET /buildings/{building_id}/draws/{draw_id}` | Yes | Draw metadata, allocations and immutable eligibility snapshot. |
| Draw history | `GET .../{draw_id}/allocations` | Yes | Historical snapshots; `/residents` is an alias. |
| Draw history | `GET .../{draw_id}/audit` | Yes | Audit window for draw. |
| Draw history | `POST .../{draw_id}/archive` | Yes | Mark historical draw archived. |
| Draw history | `PUT .../draws/{draw_id}` | Yes | Intentionally blocks completed-history modification with 423. |
| Audits | `GET /buildings/{building_id}/audit` | Yes | Building audit entries. |
| Reports | `GET /buildings/{building_id}/report` | Admin | Current JSON transparency report. |
| Reports | `GET /buildings/{building_id}/report.csv` | Admin | Current CSV. |
| Reports | `GET /buildings/{building_id}/report.pdf` | Admin | Current PDF. |
| Certificates | `GET /buildings/{building_id}/report/certificate` | Admin | Current certificate PDF. |
| Historical files | `GET .../draws/{draw_id}/report.csv` | Yes | Draw-specific CSV. |
| Historical files | `GET .../draws/{draw_id}/report.pdf` | Yes | Draw-specific PDF. |
| Historical files | `GET .../draws/{draw_id}/certificate.pdf` | Yes | Draw-specific certificate. |
| Admin search | `GET /resident/search?building_id=&query=` | Admin | Exact old room or ID last-four search; returns completed participation. |
| Admin certificate | `GET /resident/certificate?building_id=&query=` | Admin | Resident allocation certificate. |
| Admin assistant | `POST /chat` | Admin | Rule-based allocation/process answers. |
| Demo reset | `POST /buildings/{building_id}/demo/reset` | Yes | Reset current demo state while preserving completed history. |

Legacy default-building aliases (`/residents`, `/rooms`, `/allocations`, `/audit`, `/report`, `/lottery/start`, `/demo/reset`) remain available.

## Common Responses

- `200/201`: request completed (creation routes currently commonly return 200).
- `204`: logout completed.
- `401`: missing, invalid or expired session token.
- `403`: valid token with the wrong role.
- `404`: building/resource not found, including cross-building mismatch.
- `409`: duplicate data, invalid eligibility or invalid draw state.
- `422`: Pydantic/FastAPI field validation failure.
- `423`: locked lottery data or immutable completed history.

FastAPI validation errors contain a `detail` list. Application errors normally contain `{ "detail": "Readable message" }`. Never put a real token in reports, screenshots or source control.
