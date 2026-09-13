"""Private resident portal, scoped exclusively by the authenticated session."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from .auth import SESSION_HOURS, hash_password, require_admin, require_resident, token_hash, verify_password
from .database import add_audit, get_connection, row_to_dict, rows_to_dicts, utc_now
from .eligibility import active_rule_set, evaluate_resident, rule_set_detail
from .schemas import ResidentLogin, ResidentPassword

router = APIRouter(prefix="/api")
_DUMMY_HASH = hash_password("unused-resident-account")


def _own_resident(conn: Any, resident_id: int) -> Any:
    row = conn.execute("""SELECT r.*,b.building_name,b.society_name,b.full_address,b.status building_status
        FROM residents r JOIN buildings b ON b.id=r.building_id
        WHERE r.id=? AND b.archived_at IS NULL""", (resident_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Resident account is unavailable. Please contact the administrator.")
    return row


@router.put("/buildings/{building_id}/residents/{resident_id}/portal-password")
def set_resident_password(building_id: int, resident_id: int, payload: ResidentPassword,
                          admin: str = Depends(require_admin)) -> dict[str, str]:
    with get_connection() as conn:
        row = conn.execute("SELECT id FROM residents WHERE id=? AND building_id=?", (resident_id, building_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Resident not found for this building.")
        conn.execute("""INSERT INTO resident_credentials(resident_id,password_hash,updated_at) VALUES(?,?,?)
            ON CONFLICT(resident_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at""",
            (resident_id, hash_password(payload.password), utc_now()))
        conn.execute("DELETE FROM resident_sessions WHERE resident_id=?", (resident_id,))
        conn.execute("DELETE FROM resident_login_attempts WHERE resident_id=?", (resident_id,))
        add_audit(conn, "Resident portal password set", admin,
                  f"Portal access was set for resident ID {resident_id}.", building_id=building_id,
                  resident_id=resident_id)
    return {"message": "Resident portal password updated."}


@router.post("/resident/login")
def resident_login(payload: ResidentLogin) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("""SELECT r.id,r.building_id,r.full_name,c.password_hash
            FROM residents r JOIN resident_credentials c ON c.resident_id=r.id
            JOIN buildings b ON b.id=r.building_id AND b.archived_at IS NULL
            WHERE r.id=?""", (payload.resident_id,)).fetchone()
        attempts = conn.execute("SELECT failed_attempts,locked_until FROM resident_login_attempts WHERE resident_id=?",
                                (payload.resident_id,)).fetchone() if row else None
        now = utc_now()
        locked = bool(attempts and attempts["locked_until"] and attempts["locked_until"] > now)
        valid = verify_password(payload.password, row["password_hash"] if row else _DUMMY_HASH)
        if not row or locked or not valid:
            if row and not locked:
                failures = (attempts["failed_attempts"] if attempts else 0) + 1
                lock_until = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(timespec="seconds") if failures >= 5 else None
                conn.execute("""INSERT INTO resident_login_attempts(resident_id,failed_attempts,locked_until)
                    VALUES(?,?,?) ON CONFLICT(resident_id) DO UPDATE SET
                    failed_attempts=excluded.failed_attempts,locked_until=excluded.locked_until""",
                    (row["id"], failures, lock_until))
                conn.commit()
            raise HTTPException(status_code=401, detail="Invalid resident ID or password.")
        conn.execute("DELETE FROM resident_login_attempts WHERE resident_id=?", (row["id"],))
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat(timespec="seconds")
        conn.execute("DELETE FROM resident_sessions WHERE resident_id=? OR expires_at<=?",
                     (row["id"], utc_now()))
        conn.execute("INSERT INTO resident_sessions(token_hash,resident_id,expires_at) VALUES(?,?,?)",
                     (token_hash(token), row["id"], expires))
        add_audit(conn, "Resident login", f"Resident {row['id']}", "Resident logged in.",
                  building_id=row["building_id"], resident_id=row["id"])
        return {"token": token, "role": "resident", "resident_id": row["id"], "full_name": row["full_name"]}


@router.get("/resident/session")
def resident_session(resident_id: int = Depends(require_resident)) -> dict[str, Any]:
    with get_connection() as conn:
        row = _own_resident(conn, resident_id)
        return {"role": "resident", "resident_id": row["id"], "full_name": row["full_name"]}


@router.post("/resident/logout")
def resident_logout(resident_id: int = Depends(require_resident)) -> dict[str, str]:
    with get_connection() as conn:
        conn.execute("DELETE FROM resident_sessions WHERE resident_id=?", (resident_id,))
        row = conn.execute("SELECT building_id FROM residents WHERE id=?", (resident_id,)).fetchone()
        if row:
            add_audit(conn, "Resident logout", f"Resident {resident_id}", "Resident logged out.",
                      building_id=row["building_id"], resident_id=resident_id)
    return {"message": "Logged out."}


@router.get("/resident/me")
@router.get("/resident/profile")
def resident_profile(resident_id: int = Depends(require_resident)) -> dict[str, Any]:
    with get_connection() as conn:
        row = _own_resident(conn, resident_id)
        return {key: row[key] for key in (
            "id", "full_name", "aadhaar_masked", "old_room_number", "family_members",
            "contact_number", "priority_category", "building_wing", "consent",
            "verification_status", "created_at", "date_of_birth", "residency_start_date",
            "resident_category", "building_id", "building_name", "society_name",
            "full_address", "building_status")}


@router.get("/resident/eligibility")
def resident_eligibility(resident_id: int = Depends(require_resident)) -> dict[str, Any]:
    with get_connection() as conn:
        row = _own_resident(conn, resident_id)
        current = active_rule_set(conn, row["building_id"])
        rule_set = rule_set_detail(conn, current) if current else None
        result = evaluate_resident(dict(row), rule_set)
        return {key: result[key] for key in (
            "status", "eligible", "priority_score", "rule_version", "configuration_status",
            "rules_evaluated", "rules_passed", "rules_failed", "results", "explanation", "evaluated_at")}


@router.get("/resident/lottery")
def resident_lottery(resident_id: int = Depends(require_resident)) -> dict[str, Any]:
    with get_connection() as conn:
        row = _own_resident(conn, resident_id)
        draws = rows_to_dicts(conn.execute("""SELECT ld.draw_number,ld.draw_reference,ld.draw_name,
            ld.status draw_status,ld.lottery_mode,ld.completed_at,cr.eligibility_status participation_status,
            ee.status eligibility_status,ee.priority_score,da.allocation_status,da.allocated_room_snapshot room_number,
            COALESCE(wl.position,da.waiting_list_position) waiting_list_position
            FROM lottery_draws ld
            LEFT JOIN draw_cycle_residents cr ON cr.draw_id=ld.id AND cr.resident_id=?
            LEFT JOIN eligibility_evaluations ee ON ee.draw_id=ld.id AND ee.resident_id=?
            LEFT JOIN draw_allocations da ON da.draw_id=ld.id AND da.resident_id=?
            LEFT JOIN draw_waiting_list wl ON wl.draw_id=ld.id AND wl.resident_id=?
            WHERE ld.building_id=? AND (cr.id IS NOT NULL OR ee.id IS NOT NULL OR da.id IS NOT NULL OR wl.id IS NOT NULL)
            ORDER BY ld.draw_number DESC""",
            (resident_id, resident_id, resident_id, resident_id, row["building_id"])).fetchall())
        for draw in draws:
            if draw["waiting_list_position"] is not None or draw["allocation_status"] == "Waiting List":
                draw["result"] = "Waiting List"
            elif draw["allocation_status"] in ("Winner", "Allocated"):
                draw["result"] = "Winner"
            elif draw["allocation_status"] in ("Not Selected", "Unallocated") or (
                draw["draw_status"] == "Completed" and draw["participation_status"] == "Included"):
                draw["result"] = "Not Selected"
            elif draw["draw_status"] == "Cancelled":
                draw["result"] = "Cancelled"
            elif draw["participation_status"] == "Excluded" or draw["eligibility_status"] == "Ineligible":
                draw["result"] = "Ineligible"
            else:
                draw["result"] = "Participating" if draw["participation_status"] == "Included" else "Registered"
        return {"draws": draws, "latest": draws[0] if draws else None}


@router.get("/resident/allocation")
def resident_allocation(resident_id: int = Depends(require_resident)) -> dict[str, Any]:
    with get_connection() as conn:
        row = _own_resident(conn, resident_id)
        allocation = conn.execute("""SELECT a.created_at allocated_at,rm.room_number,rm.wing,rm.floor,rm.size,
            ld.draw_number,ld.draw_reference FROM allocations a
            JOIN rooms rm ON rm.id=a.room_id AND rm.building_id=a.building_id
            LEFT JOIN lottery_draws ld ON ld.id=a.draw_id AND ld.building_id=a.building_id
            WHERE a.resident_id=? AND a.building_id=?""", (resident_id, row["building_id"])).fetchone()
        return {"building_name": row["building_name"], "allocation": row_to_dict(allocation)}


@router.get("/resident/history")
def resident_history(resident_id: int = Depends(require_resident)) -> dict[str, Any]:
    with get_connection() as conn:
        row = _own_resident(conn, resident_id)
        events = rows_to_dicts(conn.execute("""SELECT event_type,title,description,created_at,draw_id
            FROM resident_history_events WHERE resident_id=? AND building_id=? ORDER BY created_at DESC,id DESC""",
            (resident_id, row["building_id"])).fetchall())
        return {"events": events}
