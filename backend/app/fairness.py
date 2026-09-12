from __future__ import annotations

import random
import re
import secrets
import sqlite3
from typing import Any

from .database import add_audit, get_setting, rows_to_dicts, set_setting, utc_now

PRIORITY_RANK = {
    "Disabled": 1,
    "Senior Citizen": 2,
    "Medical Emergency": 3,
    "Widow": 4,
    "Large Family": 5,
    "General": 6,
}


def _shuffle(items: list[dict[str, Any]], seed: str, label: str) -> list[dict[str, Any]]:
    copied = list(items)
    random.Random(f"{seed}:{label}").shuffle(copied)
    return copied


def _size_number(size: str) -> int:
    match = re.search(r"\d+", size or "")
    return int(match.group(0)) if match else 0


def room_is_suitable(room: dict[str, Any], priority_category: str) -> bool:
    suitable_for = (room.get("suitable_for") or "").lower()
    floor = int(room.get("floor") or 0)
    size = _size_number(room.get("size") or "")

    if priority_category == "Disabled":
        return "wheelchair" in suitable_for or "lower floor" in suitable_for or floor <= 2
    if priority_category == "Senior Citizen":
        return "senior" in suitable_for or "lower floor" in suitable_for or floor <= 2
    if priority_category == "Medical Emergency":
        return "medical" in suitable_for or "lower floor" in suitable_for or "wheelchair" in suitable_for or floor <= 2
    if priority_category == "Large Family":
        return "large family" in suitable_for or size >= 650
    return True


def _choose_room(
    resident: dict[str, Any],
    remaining_rooms: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, bool]:
    if not remaining_rooms:
        return None, False

    priority = resident["priority_category"]
    if priority in {"Disabled", "Senior Citizen", "Medical Emergency", "Large Family"}:
        for room in remaining_rooms:
            if room_is_suitable(room, priority):
                return room, True

    return remaining_rooms[0], room_is_suitable(remaining_rooms[0], priority)


def detect_data_issues(conn: sqlite3.Connection, building_id: int) -> dict[str, Any]:
    aadhaar_duplicates = rows_to_dicts(
        conn.execute(
            """
            SELECT aadhaar_masked, COUNT(*) AS count
            FROM residents
            WHERE building_id = ?
            GROUP BY aadhaar_hash
            HAVING COUNT(*) > 1
            """
        , (building_id,)).fetchall()
    )
    old_room_duplicates = rows_to_dicts(
        conn.execute(
            """
            SELECT old_room_number, COUNT(*) AS count
            FROM residents
            WHERE building_id = ?
            GROUP BY old_room_number
            HAVING COUNT(*) > 1
            """
        , (building_id,)).fetchall()
    )
    invalid_priority = rows_to_dicts(
        conn.execute(
            """
            SELECT id, full_name, priority_category
            FROM residents
            WHERE building_id = ? AND priority_category NOT IN (
                'Senior Citizen', 'Disabled', 'Widow',
                'Medical Emergency', 'Large Family', 'General'
            )
            """
        , (building_id,)).fetchall()
    )
    suspicious = rows_to_dicts(
        conn.execute(
            """
            SELECT id, full_name, family_members, contact_number
            FROM residents
            WHERE building_id = ? AND (family_members > 8 OR contact_number IN (
                '0000000000', '1111111111', '9999999999'
            ))
            """
        , (building_id,)).fetchall()
    )
    return {
        "aadhaar_duplicates": aadhaar_duplicates,
        "old_room_duplicates": old_room_duplicates,
        "invalid_priority": invalid_priority,
        "suspicious": suspicious,
    }


def fairness_score(conn: sqlite3.Connection, building_id: int, suitability_misses: int = 0) -> float:
    issues = detect_data_issues(conn, building_id)
    pending = conn.execute(
        "SELECT COUNT(*) AS count FROM residents WHERE building_id=? AND verification_status = 'Pending Verification'", (building_id,)
    ).fetchone()["count"]
    verified = conn.execute(
        "SELECT COUNT(*) AS count FROM residents WHERE building_id=? AND verification_status = 'Verified'", (building_id,)
    ).fetchone()["count"]
    draw_capacity = conn.execute(
        "SELECT COUNT(*) AS count FROM rooms WHERE building_id=? AND status IN ('Available', 'Allocated')", (building_id,)
    ).fetchone()["count"]
    shortage = max(0, verified - draw_capacity)

    penalty = (
        len(issues["aadhaar_duplicates"]) * 20
        + len(issues["old_room_duplicates"]) * 20
        + len(issues["invalid_priority"]) * 15
        + len(issues["suspicious"]) * 3
        + pending * 2
        + shortage * 5
        + suitability_misses * 4
    )
    return max(0.0, round(100.0 - penalty, 1))


def fairness_status(conn: sqlite3.Connection, building_id: int) -> str:
    score = fairness_score(conn, building_id)
    if score >= 90:
        return "Ready for transparent draw"
    if score >= 75:
        return "Review recommended before draw"
    return "Needs verification cleanup"


def build_allocation_explanation(resident: dict[str, Any], room: dict[str, Any], seed: str, suitable: bool) -> str:
    suitability_text = (
        "The room also matched the resident's priority suitability rules."
        if suitable
        else "No ideal special-suitability room remained, so the next locked shuffled room was used."
    )
    return (
        f"Resident {resident['full_name']} was allocated Room {room['room_number']} because they were eligible, "
        f"verified, and selected through the locked random lottery process using seed {seed}. "
        f"{suitability_text} No manual override was used."
    )


def run_lottery(conn: sqlite3.Connection, building_id: int, performed_by: str = "Admin", eligible_ids: set[int] | None = None) -> dict[str, Any]:
    existing_count = conn.execute("SELECT COUNT(*) AS count FROM allocations WHERE building_id=?", (building_id,)).fetchone()["count"]
    if existing_count:
        seed = get_setting(conn, "lottery_seed", "", building_id)
        return {
            "lottery_seed": seed,
            "fairness_score": fairness_score(conn, building_id),
            "message": "Lottery was already completed. Existing locked allocations were returned.",
            "allocations_created": 0,
        }

    verified_count = conn.execute(
        "SELECT COUNT(*) AS count FROM residents WHERE building_id=? AND verification_status = 'Verified' AND consent = 1", (building_id,)
    ).fetchone()["count"]
    if eligible_ids is not None:
        verified_count = len(eligible_ids)
    available_count = conn.execute(
        "SELECT COUNT(*) AS count FROM rooms WHERE building_id=? AND status = 'Available'", (building_id,)
    ).fetchone()["count"]
    if verified_count == 0:
        raise ValueError("Lottery cannot start because no eligible verified residents are available." if eligible_ids is not None else "Lottery cannot start because no verified residents are available.")
    if available_count == 0:
        raise ValueError("Lottery cannot start because no available rooms are available.")
    if verified_count > available_count:
        raise ValueError("Lottery cannot start because there are more eligible residents than available rooms." if eligible_ids is not None else "Lottery cannot start because there are more verified residents than available rooms.")

    seed = secrets.token_hex(8)
    set_setting(conn, "lottery_locked", "true", building_id)
    set_setting(conn, "lottery_seed", seed, building_id)
    set_setting(conn, "lottery_started_at", utc_now(), building_id)
    add_audit(
        conn,
        "Lottery started",
        performed_by,
        f"Resident list and room list were locked. Lottery seed generated: {seed}.", building_id=building_id,
    )

    verified_residents = rows_to_dicts(
        conn.execute(
            """
            SELECT *
            FROM residents
            WHERE building_id=? AND verification_status = 'Verified' AND consent = 1
            """
        , (building_id,)).fetchall()
    )
    if eligible_ids is not None:
        verified_residents = [resident for resident in verified_residents if resident["id"] in eligible_ids]
    available_rooms = rows_to_dicts(
        conn.execute("SELECT * FROM rooms WHERE building_id=? AND status = 'Available'", (building_id,)).fetchall()
    )

    grouped: list[dict[str, Any]] = []
    for priority, rank in sorted(PRIORITY_RANK.items(), key=lambda item: item[1]):
        group = [resident for resident in verified_residents if resident["priority_category"] == priority]
        grouped.extend(_shuffle(group, seed, f"residents:{rank}:{priority}"))

    remaining_rooms = _shuffle(available_rooms, seed, "rooms")
    pending_score = fairness_score(conn, building_id)
    suitability_misses = 0
    created = 0

    for resident in grouped:
        room, suitable = _choose_room(resident, remaining_rooms)
        if room is None:
            add_audit(
                conn,
                "Resident unallocated",
                "AI Fairness Engine",
                f"{resident['full_name']} could not be allocated because no available rooms remained.", building_id=building_id,
            )
            continue

        if not suitable:
            suitability_misses += 1
        reason = build_allocation_explanation(resident, room, seed, suitable)
        conn.execute(
            """
            INSERT INTO allocations (
                building_id, resident_id, room_id, priority_category, allocation_reason,
                lottery_seed, fairness_score, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                building_id, resident["id"],
                room["id"],
                resident["priority_category"],
                reason,
                seed,
                pending_score,
                utc_now(),
            ),
        )
        conn.execute("UPDATE rooms SET status = 'Allocated' WHERE id = ?", (room["id"],))
        remaining_rooms = [candidate for candidate in remaining_rooms if candidate["id"] != room["id"]]
        created += 1
        add_audit(
            conn,
            "Allocation generated",
            "AI Fairness Engine",
            f"{resident['full_name']} was allocated Room {room['room_number']} through locked lottery seed {seed}.", building_id=building_id,
        )

    final_score = fairness_score(conn, building_id, suitability_misses)
    conn.execute("UPDATE allocations SET fairness_score = ? WHERE building_id=?", (final_score, building_id))
    set_setting(conn, "lottery_completed_at", utc_now(), building_id)
    set_setting(conn, "fairness_score", str(final_score), building_id)
    add_audit(
        conn,
        "Lottery completed",
        performed_by,
        f"{created} allocations generated. Fairness score: {final_score}.", building_id=building_id,
    )
    conn.execute("UPDATE buildings SET status='Lottery Completed', updated_at=? WHERE id=?", (utc_now(), building_id))

    return {
        "lottery_seed": seed,
        "fairness_score": final_score,
        "message": "Lottery completed with locked, auditable seeded random allocation.",
        "allocations_created": created,
    }


def run_lottery_cycle(conn: sqlite3.Connection, building_id: int, draw_id: int, performed_by: str) -> dict[str, Any]:
    """Run the established seeded priority/suitability allocator on one confirmed cycle."""
    residents = rows_to_dicts(conn.execute("""SELECT r.* FROM draw_cycle_residents cr JOIN residents r ON r.id=cr.resident_id WHERE cr.draw_id=? AND cr.building_id=? AND cr.eligibility_status='Included'""", (draw_id, building_id)).fetchall())
    rooms = rows_to_dicts(conn.execute("""SELECT rm.* FROM draw_cycle_rooms cm JOIN rooms rm ON rm.id=cm.room_id WHERE cm.draw_id=? AND cm.building_id=? AND cm.eligibility_status='Included'""", (draw_id, building_id)).fetchall())
    cycle = conn.execute("SELECT lottery_mode, waiting_list_enabled FROM lottery_draws WHERE id=? AND building_id=?", (draw_id, building_id)).fetchone()
    if not cycle or not residents or not rooms:
        raise ValueError("Confirmed draw-cycle eligibility is no longer valid.")
    competitive = cycle["lottery_mode"] == "Competitive Lottery"
    if not competitive and len(residents) > len(rooms):
        raise ValueError("Confirmed draw-cycle eligibility is no longer valid.")
    seed = secrets.token_hex(8)
    grouped: list[dict[str, Any]] = []
    for priority, rank in sorted(PRIORITY_RANK.items(), key=lambda item: item[1]):
        grouped.extend(_shuffle([r for r in residents if r["priority_category"] == priority], seed, f"residents:{rank}:{priority}"))
    remaining_rooms = _shuffle(rooms, seed, "rooms")
    score = fairness_score(conn, building_id)
    misses = 0
    winners: list[dict[str, Any]] = []
    non_winners: list[dict[str, Any]] = []
    winner_count = min(len(residents), len(rooms))
    for position, resident in enumerate(grouped):
        if position >= winner_count:
            non_winners.append(resident)
            continue
        room, suitable = _choose_room(resident, remaining_rooms)
        if not room: continue
        misses += 0 if suitable else 1
        reason = build_allocation_explanation(resident, room, seed, suitable)
        # Explicit resident overrides replace only the current projection; prior snapshots remain immutable.
        conn.execute("DELETE FROM allocations WHERE building_id=? AND resident_id=?", (building_id, resident["id"]))
        conn.execute("""INSERT INTO allocations(building_id,resident_id,room_id,priority_category,allocation_reason,lottery_seed,fairness_score,created_at,draw_id) VALUES(?,?,?,?,?,?,?,?,?)""", (building_id,resident["id"],room["id"],resident["priority_category"],reason,seed,score,utc_now(),draw_id))
        conn.execute("UPDATE rooms SET status='Allocated' WHERE id=?", (room["id"],))
        remaining_rooms = [candidate for candidate in remaining_rooms if candidate["id"] != room["id"]]
        winners.append({"resident": resident, "room": room, "reason": reason, "suitable": suitable})
    final_score = fairness_score(conn, building_id, misses)
    conn.execute("UPDATE allocations SET fairness_score=? WHERE draw_id=?", (final_score, draw_id))
    return {"lottery_seed": seed, "fairness_score": final_score, "message": "Lottery completed with locked, auditable seeded random allocation.", "allocations_created": len(winners), "winners": winners, "non_winners": non_winners, "waiting_list_enabled": bool(cycle["waiting_list_enabled"])}
