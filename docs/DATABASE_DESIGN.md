# FairRoom — Intelligent Housing Allocation System: Database Design

SQLite is used for local persistence. Migrations in `backend/app/database.py` are idempotent and preserve existing records.

## Main Tables

| Table | Purpose and important fields |
|---|---|
| `buildings` | Building master. PK `id`; names, project, address, nullable map location, status and archive timestamp. |
| `building_settings` | Per-building lottery/session state. Composite PK `(building_id, key)`; FK to building. |
| `residents` | Building resident records. PK `id`; FK `building_id`; masked Aadhaar, SHA-256 hash, old room, priority, consent and verification. Optional date of birth, residency start, policy category and annual income support configured rules. |
| `resident_credentials` | One-to-one portal password hash for an existing resident ID; no duplicate resident identity. |
| `resident_sessions` | SHA-256 token hash, resident ID and UTC expiry. Logout/password reset removes sessions. |
| `resident_login_attempts` | Failed login counter and temporary lockout for an existing resident ID. |
| `rooms` | Building room inventory. PK `id`; FK `building_id`; room number, wing, floor, size, status and suitability. |
| `allocations` | Current allocation projection. PK `id`; FKs to building, resident, room and draw; seed, score and explanation. |
| `lottery_draws` | Authoritative draw-cycle record. Draw number/reference/name/phase, status, counts, seed, score, timestamps, reasons and building snapshots. |
| `draw_cycle_residents` | Eligibility record for every resident considered in a cycle, including snapshot and override reason. Unique `(draw_id, resident_id)`. |
| `draw_cycle_rooms` | Eligibility record for every room considered in a cycle and room snapshots. Unique `(draw_id, room_id)`. |
| `draw_allocations` | Immutable completed-draw allocation snapshots, including allocated and unallocated participants. Unique `(draw_id, resident_id)`. |
| `resident_history_events` | Chronological resident events linked optionally to a draw. |
| `eligibility_rule_sets` | Building-specific numbered Draft/Active/Inactive criteria versions with author and timestamps. Active and inactive versions are immutable through the API. |
| `eligibility_rule_items` | Typed hard or priority conditions within a version, with operator, value, explanation, points and active state. |
| `draw_rule_snapshots` | Exact JSON copy of the criteria and evaluation summary used at draw confirmation. One per draw. |
| `eligibility_evaluations` | Per-resident, per-draw decision, priority score, rule results and evaluation timestamp. |
| `audit_logs` | Action, administrator, reason, timestamp and optional building/draw/resident/room links. |
| `settings` | Global application settings, including the current admin session token and email. |
| `society` | Legacy society information retained for compatibility. |

## Uniqueness and Integrity

- Aadhaar/ID hashes are globally unique across buildings.
- Old-room numbers are unique within a building.
- New-room numbers are unique within a building.
- Current `allocations` enforce unique resident and room references.
- Draw numbers are unique per building and draw references are globally unique.
- Historical tables store display snapshots rather than relying only on mutable current rows.
- Rule-set versions are unique within each building; rule names are unique within a version. A draw stores the rule-set ID and version as well as its immutable JSON snapshot.
- Resident credential and session tables are added idempotently and do not alter resident, allocation or history IDs. Passwords and raw resident tokens are never stored in SQLite.

## Building Location Columns

| Column | Type | Meaning |
|---|---|---|
| `latitude` | nullable REAL | WGS84 latitude, validated from -90 to 90. |
| `longitude` | nullable REAL | WGS84 longitude, validated from -180 to 180. |
| `map_zoom` | INTEGER | Preferred 2D zoom, default 17 and validated from 3 to 20. |
| `location_status` | TEXT | `Not Set`, `Located`, `Manual` or `Failed`. |
| `location_updated_at` | nullable TEXT | UTC timestamp of the last location change. |
| `google_place_id` | nullable TEXT | Optional place identifier from a confirmed address result. |

Latitude and longitude are both null or both present. Existing buildings remain valid with null coordinates. `migrate_google_maps()` checks each column before adding it, normalizes safe defaults and is non-destructive, idempotent and restart-safe. A location edit writes a building-scoped `Building Map Location Updated` audit record without any API key.

## ER Diagram

```mermaid
erDiagram
  BUILDINGS ||--o{ RESIDENTS : contains
  RESIDENTS ||--o| RESIDENT_CREDENTIALS : signs_in_with
  RESIDENTS ||--o{ RESIDENT_SESSIONS : opens
  RESIDENTS ||--o| RESIDENT_LOGIN_ATTEMPTS : limits
  BUILDINGS ||--o{ ROOMS : contains
  BUILDINGS ||--o{ BUILDING_SETTINGS : configures
  BUILDINGS ||--o{ LOTTERY_DRAWS : conducts
  BUILDINGS ||--o{ AUDIT_LOGS : records
  LOTTERY_DRAWS ||--o{ DRAW_CYCLE_RESIDENTS : considers
  LOTTERY_DRAWS ||--o{ DRAW_CYCLE_ROOMS : considers
  LOTTERY_DRAWS ||--o{ DRAW_ALLOCATIONS : snapshots
  RESIDENTS ||--o{ RESIDENT_HISTORY_EVENTS : has
  RESIDENTS ||--o{ DRAW_CYCLE_RESIDENTS : participates
  ROOMS ||--o{ DRAW_CYCLE_ROOMS : participates
  RESIDENTS ||--o| ALLOCATIONS : receives
  ROOMS ||--o| ALLOCATIONS : assigned
```

## Historical Immutability

A completed draw retains its building, rules, participant and allocation values. The update endpoint for completed draw history returns HTTP 423. Normal demo reset preserves completed history. A separate backup is created before material production migrations.
