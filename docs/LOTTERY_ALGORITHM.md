# FairRoom — Intelligent Housing Allocation System: Lottery Algorithm

The implementation is in `backend/app/fairness.py`. It is a deterministic seeded allocation algorithm with AI-style supporting checks; it is not a machine-learning model choosing winners.

## Inputs and Eligibility

The controlled-cycle function loads only residents marked `Included` in `draw_cycle_residents` and rooms marked `Included` in `draw_cycle_rooms`. Confirmation has already checked verification, availability, building ownership, previous room use and capacity. The legacy first-draw route filters verified residents with consent and available rooms directly.

Before either route selects winners, the transparent eligibility engine evaluates the building's active criteria. Hard-rule failures exclude a resident; priority matches generate an auditable score only. If no criteria are active, verified residents with consent remain eligible as before. Draw confirmation snapshots the criteria version and each resident's evaluation. The established seeded lottery then receives only the eligible pool. Its priority-category ordering, deterministic shuffle, suitability choice and fairness calculation remain separate from eligibility scoring.

## Priority Order

The current order is:

1. Disabled
2. Senior Citizen
3. Medical Emergency
4. Widow
5. Large Family
6. General

Residents are grouped by category and deterministically shuffled inside each group using the stored seed plus a group label.

## Room Suitability

- Disabled, senior and medical categories prefer lower floors or matching suitability text.
- Large families prefer a `large family` marker or rooms of at least 650 square feet.
- Other categories accept the next shuffled room.
- If an ideal room is unavailable, allocation continues with the next locked shuffled room and the explanation records the suitability miss.

## Determinism and Uniqueness

Python's seeded pseudo-random shuffle receives a value derived from the secure draw seed and a list label. The same input snapshots, ordering rules and seed reproduce the same shuffled order. Each selected room is removed from the remaining-room list. Database uniqueness constraints provide an additional safeguard.

## Fairness Score

The score starts at 100 and applies transparent penalties for duplicate data, invalid categories, suspicious values, pending verification, capacity shortage and suitability misses. It is a review indicator, not a legal fairness certificate.

## Pseudocode

```text
validate building and selected draw cycle
require cycle status Ready
load included verified residents
load included available rooms
reject empty lists or, in Full Allocation mode, residents greater than rooms
generate cryptographically random seed
for each priority group in configured order:
    deterministically shuffle its residents using seed + group label
deterministically shuffle rooms using seed + rooms label
for each resident:
    select a suitable remaining room when possible
    otherwise select the next remaining room
    generate a human-readable explanation
    save current allocation and mark room Allocated
calculate final fairness score
save immutable allocation and resident-history snapshots
store seed, score, counts and completion timestamp
set draw status Completed
```

## Persistence and Locking

Every allocation stores the seed, score, timestamp and explanation. Completion copies resident and room display values into `draw_allocations`. Earlier draws remain unchanged. Participant lists are editable in Preparing, locked in Ready/In Progress, and permanently immutable after completion.

## Competitive Lottery mode

Competitive Lottery reuses the same priority grouping, seeded shuffle, room suitability and explanation logic. When selected participants exceed included available rooms, the system selects `min(eligible_resident_count, available_room_count)` winners. Every remaining participant is immutably recorded as **Not Selected**, or as a **Waiting List** entry with a deterministic position from that same seeded ordering. This is rule-based, deterministic and auditable; it is not an ML model.
