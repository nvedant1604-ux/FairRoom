from __future__ import annotations

import os
import re
import secrets
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from .database import (
    PRIORITY_CATEGORIES,
    ROOM_STATUSES,
    add_audit,
    add_resident_history,
    get_connection,
    get_setting,
    hash_identifier,
    init_db,
    insert_sample_data,
    is_lottery_locked,
    mask_identifier,
    normalize_identifier,
    reset_demo_data,
    row_to_dict,
    rows_to_dicts,
    set_setting,
    utc_now,
    HISTORY_RULES,
    _snapshot_allocations,
)
from .fairness import detect_data_issues, fairness_score, fairness_status, run_lottery, run_lottery_cycle
from .reporting import allocation_rows, allocations_csv, report_payload, simple_pdf
from .schemas import AdminLogin, BuildingCreate, BuildingUpdate, ChatRequest, ResidentCreate, RoomCreate, DrawCycleCreate, CycleResidentChange, CycleRoomChange, CycleCancel, EligibilityRuleCreate
from .eligibility import RULE_TYPES, active_rules, evaluate_building, evaluate_resident, save_cycle_evaluations, validate_rule

app = FastAPI(
    title="FairRoom — Intelligent Housing Allocation System API",
    description="Transparent, fair, auditable room allocation for redevelopment projects.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    insert_sample_data()


def require_admin(authorization: Annotated[str | None, Header()] = None) -> str:
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    with get_connection() as conn:
        stored = get_setting(conn, "admin_token")
        email = get_setting(conn, "admin_email", "Admin")
    if not stored or not token or not secrets.compare_digest(token, stored):
        raise HTTPException(status_code=401, detail="Admin session is missing or expired. Please log in again.")
    return email


def _building(conn: Any, building_id: int | None) -> Any:
    row = conn.execute("SELECT * FROM buildings WHERE id=? AND archived_at IS NULL", (building_id,)).fetchone() if building_id else conn.execute("SELECT * FROM buildings WHERE archived_at IS NULL ORDER BY id LIMIT 1").fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Building not found.")
    return row


def _locked_guard(conn: Any, attempted_action: str, building_id: int) -> None:
    if is_lottery_locked(conn, building_id):
        detail = (
            "Resident registration is locked because lottery has already started."
            if attempted_action == "Resident registration"
            else "Lottery is locked. No resident or room changes are allowed after the draw starts."
        )
        add_audit(
            conn,
            "Admin override attempted",
            "Admin",
            f"{attempted_action} was blocked because the lottery is locked.",
            "Lottery lists are locked after draw start.",
            building_id=building_id,
        )
        conn.commit()
        raise HTTPException(
            status_code=423,
            detail=detail,
        )


def _validate_contact(contact_number: str) -> str:
    digits = re.sub(r"\D", "", contact_number or "")
    if len(digits) != 10:
        raise HTTPException(status_code=422, detail="Contact number must contain exactly 10 digits.")
    return digits


def _resident_warnings(payload: ResidentCreate) -> list[str]:
    warnings: list[str] = []
    normalized_id = normalize_identifier(payload.aadhaar_number)
    if len(set(normalized_id)) <= 2:
        warnings.append("Aadhaar or ID number has repeated characters and should be checked manually.")
    if payload.family_members > 8:
        warnings.append("Family member count is unusually high. AI suggests document verification.")
    if len(set(re.sub(r"\D", "", payload.contact_number))) <= 2:
        warnings.append("Contact number looks repetitive. AI suggests a verification call.")
    return warnings


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "FairRoom API"}


@app.post("/api/admin/login")
def admin_login(payload: AdminLogin) -> dict[str, str]:
    expected_email = os.getenv("AI_LOTTERY_ADMIN_EMAIL", "admin@example.com")
    expected_password = os.getenv("AI_LOTTERY_ADMIN_PASSWORD", "admin123")
    if payload.email != expected_email or payload.password != expected_password:
        raise HTTPException(status_code=401, detail="Invalid admin email or password.")

    token = secrets.token_urlsafe(32)
    with get_connection() as conn:
        set_setting(conn, "admin_token", token)
        set_setting(conn, "admin_email", payload.email)
        add_audit(conn, "Admin login", payload.email, "Admin logged in successfully.")
    return {"token": token, "admin_name": "Society Admin", "email": payload.email}


@app.get("/api/admin/session")
def admin_session(admin: str = Depends(require_admin)) -> dict[str, str]:
    return {"email": admin}


@app.post("/api/admin/logout", status_code=204)
def admin_logout(admin: str = Depends(require_admin)) -> Response:
    with get_connection() as conn:
        set_setting(conn, "admin_token", "")
        add_audit(conn, "Admin logout", admin, "Admin logged out successfully.")
    return Response(status_code=204)


def _building_payload(conn: Any, row: Any) -> dict[str, Any]:
    item = row_to_dict(row)
    building_id = row["id"]
    item.update({
        "resident_count": conn.execute("SELECT COUNT(*) count FROM residents WHERE building_id=?", (building_id,)).fetchone()["count"],
        "room_count": conn.execute("SELECT COUNT(*) count FROM rooms WHERE building_id=?", (building_id,)).fetchone()["count"],
        "allocation_count": conn.execute("SELECT COUNT(*) count FROM allocations WHERE building_id=?", (building_id,)).fetchone()["count"],
        "lottery_locked": is_lottery_locked(conn, building_id),
        "lottery_completed_at": get_setting(conn, "lottery_completed_at", building_id=building_id),
    })
    return item


@app.get("/api/buildings")
def list_buildings(admin: str = Depends(require_admin)) -> list[dict[str, Any]]:
    with get_connection() as conn:
        return [_building_payload(conn, row) for row in conn.execute("SELECT * FROM buildings WHERE archived_at IS NULL ORDER BY id").fetchall()]


@app.get("/api/public/buildings")
def public_buildings() -> list[dict[str, Any]]:
    with get_connection() as conn:
        return rows_to_dicts(conn.execute("SELECT id,building_name,society_name,redevelopment_project_name,full_address,city,status FROM buildings WHERE archived_at IS NULL ORDER BY id").fetchall())


@app.post("/api/buildings")
def add_building(payload: BuildingCreate, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        duplicate = conn.execute("SELECT id FROM buildings WHERE lower(building_name)=lower(?) AND lower(society_name)=lower(?)", (payload.building_name, payload.society_name)).fetchone()
        if duplicate:
            raise HTTPException(status_code=409, detail="A building with this building and society name already exists.")
        now = utc_now()
        location_updated_at = now if payload.latitude is not None else None
        cursor = conn.execute(
            """INSERT INTO buildings(
                 building_name,society_name,redevelopment_project_name,full_address,city,district,state,pin_code,
                 number_of_wings,description,status,created_at,updated_at,latitude,longitude,map_zoom,
                 location_status,location_updated_at,google_place_id
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                payload.building_name,payload.society_name,payload.redevelopment_project_name,payload.full_address,
                payload.city,payload.district,payload.state,payload.pin_code,payload.number_of_wings,
                payload.description.strip(),"Setup",now,now,payload.latitude,payload.longitude,payload.map_zoom,
                payload.location_status,location_updated_at,payload.google_place_id,
            ),
        )
        building_id = cursor.lastrowid
        set_setting(conn, "lottery_locked", "false", building_id)
        add_audit(conn, "Building Added", admin, f"{payload.building_name} was added.", building_id=building_id)
        return {"message": "Building added successfully.", "building": _building_payload(conn, conn.execute("SELECT * FROM buildings WHERE id=?", (building_id,)).fetchone())}


@app.get("/api/buildings/{building_id}")
def get_building(building_id: int, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        return _building_payload(conn, _building(conn, building_id))


@app.put("/api/buildings/{building_id}")
def update_building(building_id: int, payload: BuildingUpdate, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        existing = _building(conn, building_id)
        duplicate = conn.execute("SELECT id FROM buildings WHERE id<>? AND lower(building_name)=lower(?) AND lower(society_name)=lower(?)", (building_id,payload.building_name,payload.society_name)).fetchone()
        if duplicate: raise HTTPException(status_code=409, detail="A building with this building and society name already exists.")
        location_changed = any([
            existing["latitude"] != payload.latitude,
            existing["longitude"] != payload.longitude,
            existing["map_zoom"] != payload.map_zoom,
            existing["location_status"] != payload.location_status,
            existing["google_place_id"] != payload.google_place_id,
        ])
        now = utc_now()
        location_updated_at = now if location_changed else existing["location_updated_at"]
        conn.execute(
            """UPDATE buildings SET
                 building_name=?,society_name=?,redevelopment_project_name=?,full_address=?,city=?,district=?,
                 state=?,pin_code=?,number_of_wings=?,description=?,updated_at=?,latitude=?,longitude=?,
                 map_zoom=?,location_status=?,location_updated_at=?,google_place_id=?
               WHERE id=?""",
            (
                payload.building_name,payload.society_name,payload.redevelopment_project_name,payload.full_address,
                payload.city,payload.district,payload.state,payload.pin_code,payload.number_of_wings,
                payload.description.strip(),now,payload.latitude,payload.longitude,payload.map_zoom,
                payload.location_status,location_updated_at,payload.google_place_id,building_id,
            ),
        )
        add_audit(conn, "Building Updated", admin, f"{payload.building_name} was updated.", building_id=building_id)
        if location_changed:
            add_audit(
                conn,
                "Building Map Location Updated",
                admin,
                f"Building ID {building_id} map location was updated by {admin} at {now}.",
                building_id=building_id,
            )
        return {
            "message": "Building map location updated successfully." if location_changed else "Building updated successfully.",
            "building": _building_payload(conn, conn.execute("SELECT * FROM buildings WHERE id=?", (building_id,)).fetchone()),
        }


@app.post("/api/buildings/{building_id}/archive")
def archive_building(building_id: int, admin: str = Depends(require_admin)) -> dict[str, str]:
    with get_connection() as conn:
        building = _building(conn, building_id)
        conn.execute("UPDATE buildings SET status='Archived', archived_at=?, updated_at=? WHERE id=?", (utc_now(), utc_now(), building_id))
        add_audit(conn, "Building Archived", admin, f"{building['building_name']} was archived safely.", building_id=building_id)
        return {"message": "Building archived successfully."}


@app.get("/api/buildings/{building_id}/dashboard")
@app.get("/api/dashboard")
def dashboard(building_id: int | None = None) -> dict[str, Any]:
    with get_connection() as conn:
        building = _building(conn, building_id); building_id = building["id"]
        total_residents = conn.execute("SELECT COUNT(*) AS count FROM residents WHERE building_id=?", (building_id,)).fetchone()["count"]
        verified_residents = conn.execute(
            "SELECT COUNT(*) AS count FROM residents WHERE building_id=? AND verification_status = 'Verified'", (building_id,)
        ).fetchone()["count"]
        total_rooms = conn.execute("SELECT COUNT(*) AS count FROM rooms WHERE building_id=?", (building_id,)).fetchone()["count"]
        available_rooms = conn.execute("SELECT COUNT(*) AS count FROM rooms WHERE building_id=? AND status = 'Available'", (building_id,)).fetchone()["count"]
        allocated_rooms = conn.execute("SELECT COUNT(*) AS count FROM allocations WHERE building_id=?", (building_id,)).fetchone()["count"]
        pending = conn.execute(
            "SELECT COUNT(*) AS count FROM residents WHERE building_id=? AND verification_status = 'Pending Verification'", (building_id,)
        ).fetchone()["count"]
        society = {"id": building_id, "name": building["society_name"], "address": building["full_address"], "redevelopment_project_name": building["redevelopment_project_name"]}
        return {
            "society": society,
            "total_residents": total_residents,
            "verified_residents": verified_residents,
            "total_rooms": total_rooms,
            "available_rooms": available_rooms,
            "allocated_rooms": allocated_rooms,
            "building": row_to_dict(building), "transparency_score": fairness_score(conn, building_id),
            "pending_verification": pending,
            "fairness_status": fairness_status(conn, building_id),
            "lottery_locked": is_lottery_locked(conn, building_id),
            "lottery_seed": get_setting(conn, "lottery_seed", building_id=building_id),
            "lottery_completed_at": get_setting(conn, "lottery_completed_at", building_id=building_id),
            "issues": detect_data_issues(conn, building_id),
        }


@app.post("/api/buildings/{building_id}/demo/reset")
@app.post("/api/demo/reset")
def demo_reset(building_id: int | None = None, admin: str = Depends(require_admin)) -> dict[str, Any]:
    return reset_demo_data(admin, building_id)


@app.get("/api/buildings/{building_id}/residents")
@app.get("/api/residents")
def list_residents(building_id: int | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]
        return rows_to_dicts(conn.execute("SELECT * FROM residents WHERE building_id=? ORDER BY id DESC", (building_id,)).fetchall())


@app.post("/api/buildings/{building_id}/residents")
@app.post("/api/residents")
def create_resident(payload: ResidentCreate, building_id: int | None = None, admin: str = Depends(require_admin)) -> dict[str, Any]:
    if payload.priority_category not in PRIORITY_CATEGORIES:
        raise HTTPException(status_code=422, detail="Priority category is not valid.")
    if not payload.consent:
        raise HTTPException(status_code=422, detail="Resident consent is required before saving.")

    contact = _validate_contact(payload.contact_number)
    aadhaar_hash = hash_identifier(payload.aadhaar_number)
    warnings = _resident_warnings(payload)

    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]; _locked_guard(conn, "Resident registration", building_id)
        duplicate_aadhaar = conn.execute(
            "SELECT id FROM residents WHERE aadhaar_hash = ?", (aadhaar_hash,)
        ).fetchone()
        if duplicate_aadhaar:
            raise HTTPException(status_code=409, detail="Duplicate Aadhaar or ID number detected.")

        duplicate_old_room = conn.execute(
            "SELECT id FROM residents WHERE building_id=? AND UPPER(old_room_number) = UPPER(?)",
            (building_id, payload.old_room_number.strip()),
        ).fetchone()
        if duplicate_old_room:
            raise HTTPException(status_code=409, detail="Duplicate old room number detected.")

        cursor = conn.execute(
            """
            INSERT INTO residents (
                building_id, full_name, aadhaar_masked, aadhaar_hash, old_room_number, family_members,
                contact_number, priority_category, building_wing, document_name, consent,
                verification_status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', ?)
            """,
            (
                building_id, payload.full_name.strip(),
                mask_identifier(payload.aadhaar_number),
                aadhaar_hash,
                payload.old_room_number.strip().upper(),
                payload.family_members,
                contact,
                payload.priority_category,
                payload.building_wing.strip().upper(),
                payload.document_name,
                1,
                utc_now(),
            ),
        )
        add_audit(
            conn,
            "Resident added",
            admin,
            f"{payload.full_name.strip()} was added with masked Aadhaar {mask_identifier(payload.aadhaar_number)}.",
            building_id=building_id,
        )
        resident = row_to_dict(conn.execute("SELECT * FROM residents WHERE id = ?", (cursor.lastrowid,)).fetchone())
        add_resident_history(conn, building_id, cursor.lastrowid, "Resident Registered", "Resident Registered", f"{payload.full_name.strip()} was registered.", admin)
        add_resident_history(conn, building_id, cursor.lastrowid, "Verification Pending", "Verification Pending", "Resident is awaiting document verification.", admin, new_value="Pending Verification")
        return {"resident": resident, "warnings": warnings}


@app.post("/api/buildings/{building_id}/residents/{resident_id}/verify")
@app.patch("/api/residents/{resident_id}/verify")
def verify_resident(resident_id: int, building_id: int | None = None, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]; _locked_guard(conn, "Resident verification change", building_id)
        resident = conn.execute("SELECT full_name FROM residents WHERE id=? AND building_id=?", (resident_id, building_id)).fetchone()
        if not resident:
            raise HTTPException(status_code=404, detail="Resident not found.")
        conn.execute("UPDATE residents SET verification_status = 'Verified' WHERE id = ?", (resident_id,))
        add_audit(conn, "Document verified", admin, f"{resident['full_name']} was marked as verified.", building_id=building_id)
        add_resident_history(conn, building_id, resident_id, "Resident Verified", "Resident Verified", "Resident documents were verified.", admin, previous_value="Pending Verification", new_value="Verified")
        return {"status": "Verified"}


@app.post("/api/buildings/{building_id}/residents/{resident_id}/reject")
@app.patch("/api/residents/{resident_id}/reject")
def reject_resident(resident_id: int, building_id: int | None = None, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]; _locked_guard(conn, "Resident verification change", building_id)
        resident = conn.execute("SELECT full_name FROM residents WHERE id=? AND building_id=?", (resident_id, building_id)).fetchone()
        if not resident:
            raise HTTPException(status_code=404, detail="Resident not found.")
        conn.execute("UPDATE residents SET verification_status = 'Rejected' WHERE id = ?", (resident_id,))
        add_audit(conn, "Document rejected", admin, f"{resident['full_name']} was marked as rejected.", building_id=building_id)
        add_resident_history(conn, building_id, resident_id, "Resident Rejected", "Resident Rejected", "Resident documents were rejected.", admin, previous_value="Pending Verification", new_value="Rejected")
        return {"status": "Rejected"}


@app.get("/api/buildings/{building_id}/rooms")
@app.get("/api/rooms")
def list_rooms(building_id: int | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]
        return rows_to_dicts(conn.execute("SELECT * FROM rooms WHERE building_id=? ORDER BY wing, floor, room_number", (building_id,)).fetchall())


@app.post("/api/buildings/{building_id}/rooms")
@app.post("/api/rooms")
def create_room(payload: RoomCreate, building_id: int | None = None, admin: str = Depends(require_admin)) -> dict[str, Any]:
    if payload.status not in ROOM_STATUSES:
        raise HTTPException(status_code=422, detail="Room status is not valid.")

    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]; _locked_guard(conn, "Room add/edit", building_id)
        duplicate = conn.execute(
            "SELECT id FROM rooms WHERE building_id=? AND UPPER(room_number) = UPPER(?)",
            (building_id, payload.room_number.strip()),
        ).fetchone()
        if duplicate:
            raise HTTPException(status_code=409, detail="Duplicate room number detected.")

        cursor = conn.execute(
            """
            INSERT INTO rooms (building_id, room_number, wing, floor, size, status, suitable_for)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                building_id, payload.room_number.strip().upper(),
                payload.wing.strip().upper(),
                payload.floor,
                payload.size.strip(),
                payload.status,
                payload.suitable_for.strip(),
            ),
        )
        add_audit(conn, "Room added", admin, f"Room {payload.room_number.strip().upper()} was added.", building_id=building_id)
        return row_to_dict(conn.execute("SELECT * FROM rooms WHERE id = ?", (cursor.lastrowid,)).fetchone())


@app.post("/api/buildings/{building_id}/lottery/draw")
@app.post("/api/lottery/start")
def start_lottery(building_id: int | None = None, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]
        building = _building(conn, building_id)
        existing = conn.execute("SELECT COUNT(*) count FROM allocations WHERE building_id=?", (building_id,)).fetchone()["count"]
        if existing:
            result = run_lottery(conn, building_id, admin); result["allocations"] = allocation_rows(conn, building_id); return result
        draw_number = conn.execute("SELECT COALESCE(MAX(draw_number),0)+1 number FROM lottery_draws WHERE building_id=?", (building_id,)).fetchone()["number"]
        now = utc_now(); reference = f"B{building_id}-{now[:4]}-DRAW-{draw_number:03d}"
        totals = {
            "residents": conn.execute("SELECT COUNT(*) count FROM residents WHERE building_id=?",(building_id,)).fetchone()["count"],
            "verified": conn.execute("SELECT COUNT(*) count FROM residents WHERE building_id=? AND verification_status='Verified'",(building_id,)).fetchone()["count"],
            "rooms": conn.execute("SELECT COUNT(*) count FROM rooms WHERE building_id=?",(building_id,)).fetchone()["count"],
            "available": conn.execute("SELECT COUNT(*) count FROM rooms WHERE building_id=? AND status='Available'",(building_id,)).fetchone()["count"],
        }
        draw_cursor = conn.execute("""INSERT INTO lottery_draws(building_id,draw_number,draw_reference,draw_name,status,algorithm_version,total_residents,total_verified_residents,total_rooms,total_available_rooms,started_at,performed_by_admin,building_name_snapshot,society_name_snapshot,project_name_snapshot,address_snapshot,rules_snapshot,created_at) VALUES(?,?,?,?,'In Progress','1.0',?,?,?,?,?,?,?,?,?,?,?,?)""",(building_id,draw_number,reference,f"Draw {draw_number}",totals["residents"],totals["verified"],totals["rooms"],totals["available"],now,admin,building["building_name"],building["society_name"],building["redevelopment_project_name"],building["full_address"],HISTORY_RULES,now))
        draw_id = draw_cursor.lastrowid
        try:
            result = run_lottery(conn, building_id, admin)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        _snapshot_allocations(conn, building_id, draw_id, admin)
        conn.execute("UPDATE allocations SET draw_id=? WHERE building_id=? AND draw_id IS NULL",(draw_id,building_id))
        allocated = conn.execute("SELECT COUNT(*) count FROM draw_allocations WHERE draw_id=? AND allocation_status='Allocated'",(draw_id,)).fetchone()["count"]
        unallocated = conn.execute("SELECT COUNT(*) count FROM draw_allocations WHERE draw_id=? AND allocation_status='Unallocated'",(draw_id,)).fetchone()["count"]
        conn.execute("UPDATE lottery_draws SET status='Completed',lottery_seed=?,fairness_score=?,total_allocated=?,total_unallocated=?,completed_at=? WHERE id=?",(result["lottery_seed"],result["fairness_score"],allocated,unallocated,utc_now(),draw_id))
        result["allocations"] = allocation_rows(conn, building_id)
        result["draw_id"] = draw_id; result["draw_reference"] = reference
        return result


@app.get("/api/buildings/{building_id}/allocations")
@app.get("/api/allocations")
def list_allocations(building_id: int | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]; return allocation_rows(conn, building_id)


@app.get("/api/buildings/{building_id}/audit")
@app.get("/api/audit")
def audit_logs(building_id: int | None = None, admin: str = Depends(require_admin)) -> list[dict[str, Any]]:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]
        return rows_to_dicts(conn.execute("SELECT * FROM audit_logs WHERE building_id=? ORDER BY id DESC", (building_id,)).fetchall())


@app.get("/api/buildings/{building_id}/report")
@app.get("/api/report")
def transparency_report(building_id: int | None = None) -> dict[str, Any]:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]; return report_payload(conn, building_id)


@app.get("/api/buildings/{building_id}/report.csv")
@app.get("/api/report/csv")
def export_csv(building_id: int | None = None) -> Response:
    with get_connection() as conn:
        building = _building(conn, building_id); building_id = building["id"]
        content = allocations_csv(conn, building_id)
        add_audit(conn, "Report downloaded", "Report Viewer", "CSV allocation report was downloaded.", building_id=building_id)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=building-{building_id}-allocations.csv"},
    )


@app.get("/api/buildings/{building_id}/report.pdf")
@app.get("/api/report/pdf")
def export_pdf(building_id: int | None = None) -> Response:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]; report = report_payload(conn, building_id)
        add_audit(conn, "Report downloaded", "Report Viewer", "PDF transparency report was downloaded.", building_id=building_id)
    society = report["society"] or {}
    lines = [
        f"Society: {society.get('name', 'Not configured')}",
        f"Project: {society.get('redevelopment_project_name', 'Not configured')}",
        f"Total residents: {report['totals']['total_residents']}",
        f"Total rooms: {report['totals']['total_rooms']}",
        f"Total allocated: {report['totals']['total_allocated']}",
        f"Remaining rooms: {report['totals']['remaining_rooms']}",
        f"Fairness score: {report['totals']['fairness_score']}",
        f"Lottery seed: {report['lottery_seed']}",
        "Rules: verified residents only, locked seed, no manual override.",
        "AI role: validation, duplicate checks, explanations, and audit report generation.",
    ]
    for allocation in report["allocations"][:20]:
        lines.append(
            f"{allocation['full_name']} | {allocation['old_room_number']} -> {allocation['new_room_number']} | {allocation['priority_category']}"
        )
    return Response(
        content=simple_pdf("FairRoom — Intelligent Housing Allocation System Transparency Report", lines),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=transparency-report.pdf"},
    )


@app.get("/api/buildings/{building_id}/report/certificate")
@app.get("/api/report/certificate")
def export_certificate_pdf(building_id: int | None = None) -> Response:
    with get_connection() as conn:
        building_id = _building(conn, building_id)["id"]; report = report_payload(conn, building_id)
        add_audit(conn, "Report downloaded", "Report Viewer", "Transparency certificate PDF was downloaded.", building_id=building_id)
    society = report["society"] or {}
    lines = [
        f"Society: {society.get('name', 'Not configured')}",
        f"Project: {society.get('redevelopment_project_name', 'Not configured')}",
        f"Lottery date and time: {report.get('lottery_completed_at') or 'Not completed yet'}",
        f"Lottery seed: {report['lottery_seed']}",
        f"Total residents: {report['totals']['total_residents']}",
        f"Total rooms: {report['totals']['total_rooms']}",
        f"Total allocated: {report['totals']['total_allocated']}",
        f"Fairness score: {report['totals']['fairness_score']}",
        "This allocation was generated through a locked and auditable lottery process.",
        "AI fairness checks validated eligibility, suspicious entries, and explanations.",
        "No manual room selection was used.",
    ]
    return Response(
        content=simple_pdf("FairRoom — Intelligent Housing Allocation System Transparency Certificate", lines),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=transparency-certificate.pdf"},
    )


ACTIVE_CYCLE_STATUSES = ("Preparing", "Ready", "In Progress")


def _cycle(conn: Any, building_id: int, draw_id: int) -> Any:
    _building(conn, building_id)
    row = conn.execute("SELECT * FROM lottery_draws WHERE id=? AND building_id=?", (draw_id, building_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Draw cycle not found for this building.")
    return row


@app.post("/api/buildings/{building_id}/draw-cycles")
def create_draw_cycle(building_id: int, payload: DrawCycleCreate, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        building = _building(conn, building_id)
        active = conn.execute("SELECT id FROM lottery_draws WHERE building_id=? AND status IN ('Preparing','Ready','In Progress')", (building_id,)).fetchone()
        if active:
            raise HTTPException(status_code=409, detail="This building already has an active draw cycle.")
        number = conn.execute("SELECT COALESCE(MAX(draw_number),0)+1 n FROM lottery_draws WHERE building_id=?", (building_id,)).fetchone()["n"]
        now = utc_now(); reference = f"B{building_id}-{now[:4]}-DRAW-{number:03d}"
        cur = conn.execute("""INSERT INTO lottery_draws(building_id,draw_number,draw_reference,draw_name,phase_name,status,algorithm_version,performed_by_admin,building_name_snapshot,society_name_snapshot,project_name_snapshot,address_snapshot,rules_snapshot,creation_reason,planned_draw_date,notes,lottery_mode,waiting_list_enabled,created_at) VALUES(?,?,?,?,?,'Preparing','1.0',?,?,?,?,?,?,?,?,?,?,?,?)""", (building_id,number,reference,payload.draw_name,payload.phase_name,admin,building["building_name"],building["society_name"],building["redevelopment_project_name"],building["full_address"],HISTORY_RULES,payload.reason,payload.planned_draw_date,payload.notes,payload.lottery_mode,int(payload.waiting_list_enabled),now))
        draw_id = cur.lastrowid
        residents = conn.execute("SELECT * FROM residents WHERE building_id=?", (building_id,)).fetchall()
        for resident in residents:
            allocated = conn.execute("SELECT 1 FROM draw_allocations WHERE building_id=? AND resident_id=? AND allocation_status IN ('Allocated','Winner')", (building_id,resident["id"])).fetchone()
            if resident["verification_status"] == "Verified" and not allocated:
                status, inc, exc = "Eligible", "Verified and unallocated; suggested automatically.", None
            elif allocated:
                status, inc, exc = "Already Allocated", None, "Resident received a room in an earlier completed draw."
            else:
                status, inc, exc = resident["verification_status"], None, f"Resident status is {resident['verification_status']}."
            conn.execute("""INSERT INTO draw_cycle_residents(draw_id,building_id,resident_id,eligibility_status,inclusion_reason,exclusion_reason,priority_snapshot,old_room_snapshot,verification_status_snapshot,added_by_admin,added_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (draw_id,building_id,resident["id"],status,inc,exc,resident["priority_category"],resident["old_room_number"],resident["verification_status"],admin,now))
        for room in conn.execute("SELECT * FROM rooms WHERE building_id=?", (building_id,)).fetchall():
            used = conn.execute("SELECT 1 FROM draw_allocations WHERE building_id=? AND room_id=? AND allocation_status IN ('Allocated','Winner')", (building_id,room["id"])).fetchone()
            if room["status"] == "Available" and not used: status, inc, exc = "Eligible", "Available and unused; suggested automatically.", None
            elif used or room["status"] == "Allocated": status, inc, exc = "Already Allocated", None, "Room was allocated in an earlier completed draw."
            else: status, inc, exc = "Excluded", None, f"Room status is {room['status']}."
            conn.execute("""INSERT INTO draw_cycle_rooms(draw_id,building_id,room_id,eligibility_status,inclusion_reason,exclusion_reason,room_number_snapshot,wing_snapshot,floor_snapshot,size_snapshot,added_by_admin,added_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""", (draw_id,building_id,room["id"],status,inc,exc,room["room_number"],room["wing"],room["floor"],room["size"],admin,now))
        add_audit(conn,"Draw Cycle Created",admin,f"Created {reference}: {payload.draw_name}.",payload.reason,building_id,draw_id=draw_id)
        add_audit(conn,"Lottery Mode Selected",admin,f"{payload.lottery_mode} selected; waiting list {'enabled' if payload.waiting_list_enabled else 'disabled'}.",building_id=building_id,draw_id=draw_id)
        return {"message":"New draw cycle created successfully.","draw_id":draw_id,"draw_reference":reference,"draw_number":number}


@app.get("/api/buildings/{building_id}/draw-cycles/{draw_id}")
@app.get("/api/buildings/{building_id}/draw-cycles/{draw_id}/eligibility")
def get_draw_cycle(building_id: int, draw_id: int, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        cycle = _cycle(conn,building_id,draw_id)
        residents=rows_to_dicts(conn.execute("""SELECT cr.*,r.full_name,r.verification_status,(SELECT da.draw_id FROM draw_allocations da WHERE da.building_id=cr.building_id AND da.resident_id=cr.resident_id AND da.allocation_status IN ('Allocated','Winner') LIMIT 1) previous_draw_id FROM draw_cycle_residents cr JOIN residents r ON r.id=cr.resident_id WHERE cr.draw_id=? ORDER BY r.full_name""",(draw_id,)).fetchall())
        rooms=rows_to_dicts(conn.execute("""SELECT cm.*,rm.status current_status FROM draw_cycle_rooms cm JOIN rooms rm ON rm.id=cm.room_id WHERE cm.draw_id=? ORDER BY cm.room_number_snapshot""",(draw_id,)).fetchall())
        included_residents=sum(r["eligibility_status"]=="Included" for r in residents); included_rooms=sum(r["eligibility_status"]=="Included" for r in rooms)
        return {"cycle":row_to_dict(cycle),"residents":residents,"rooms":rooms,"totals":{"eligible_residents":sum(r["eligibility_status"] in ("Eligible","Included") for r in residents),"included_residents":included_residents,"eligible_rooms":sum(r["eligibility_status"] in ("Eligible","Included") for r in rooms),"included_rooms":included_rooms,"expected_winners":min(included_residents,included_rooms),"expected_non_winners":max(0,included_residents-min(included_residents,included_rooms))}}


@app.put("/api/buildings/{building_id}/draw-cycles/{draw_id}")
def update_draw_cycle(building_id:int,draw_id:int,payload:DrawCycleCreate,admin:str=Depends(require_admin))->dict[str,str]:
    with get_connection() as conn:
        cycle=_cycle(conn,building_id,draw_id)
        if cycle["status"]!="Preparing": raise HTTPException(status_code=409,detail="Only a Preparing draw cycle can be edited.")
        conn.execute("UPDATE lottery_draws SET draw_name=?,phase_name=?,creation_reason=?,planned_draw_date=?,notes=?,lottery_mode=?,waiting_list_enabled=? WHERE id=?",(payload.draw_name,payload.phase_name,payload.reason,payload.planned_draw_date,payload.notes,payload.lottery_mode,int(payload.waiting_list_enabled),draw_id))
    return {"message":"Draw cycle updated successfully."}


@app.post("/api/buildings/{building_id}/draw-cycles/{draw_id}/residents")
def cycle_resident(building_id:int,draw_id:int,payload:CycleResidentChange,admin:str=Depends(require_admin))->dict[str,str]:
    with get_connection() as conn:
        cycle=_cycle(conn,building_id,draw_id)
        if cycle["status"]!="Preparing": raise HTTPException(status_code=409,detail="Resident eligibility is locked for this draw cycle.")
        resident=conn.execute("SELECT * FROM residents WHERE id=? AND building_id=?",(payload.resident_id,building_id)).fetchone()
        if not resident: raise HTTPException(status_code=404,detail="Resident not found for this building.")
        entry=conn.execute("SELECT * FROM draw_cycle_residents WHERE draw_id=? AND resident_id=?",(draw_id,payload.resident_id)).fetchone()
        if resident["verification_status"]!="Verified" and payload.include: raise HTTPException(status_code=409,detail="Only verified residents may be included.")
        allocated=conn.execute("SELECT 1 FROM draw_allocations WHERE building_id=? AND resident_id=? AND allocation_status IN ('Allocated','Winner')",(building_id,payload.resident_id)).fetchone()
        if allocated and payload.include:
            add_audit(conn,"Previously Allocated Resident Override Attempted",admin,f"Attempted to include {resident['full_name']}.",payload.reason,building_id,draw_id=draw_id,resident_id=payload.resident_id)
            if not payload.override_confirmed or not payload.reason: raise HTTPException(status_code=409,detail="This resident already received a room in an earlier completed draw. An override reason and confirmation are required.")
            add_audit(conn,"Previously Allocated Resident Override Approved",admin,f"Approved inclusion of {resident['full_name']}.",payload.reason,building_id,draw_id=draw_id,resident_id=payload.resident_id)
        status="Included" if payload.include else "Excluded"
        conn.execute("UPDATE draw_cycle_residents SET eligibility_status=?,inclusion_reason=?,exclusion_reason=?,override_reason=?,added_by_admin=?,added_at=? WHERE id=?",(status,payload.reason if payload.include else None,payload.reason if not payload.include else None,payload.reason if allocated else None,admin,utc_now(),entry["id"]))
        add_audit(conn,"Resident Added to Draw Cycle" if payload.include else "Resident Excluded from Draw Cycle",admin,f"{resident['full_name']} eligibility changed to {status}.",payload.reason,building_id,draw_id=draw_id,resident_id=payload.resident_id)
        return {"message":f"Resident marked {status}."}


@app.delete("/api/buildings/{building_id}/draw-cycles/{draw_id}/residents/{resident_id}")
def exclude_cycle_resident(building_id:int,draw_id:int,resident_id:int,admin:str=Depends(require_admin))->dict[str,str]:
    return cycle_resident(building_id,draw_id,CycleResidentChange(resident_id=resident_id,include=False,reason="Removed by administrator"),admin)


@app.post("/api/buildings/{building_id}/draw-cycles/{draw_id}/rooms")
def cycle_room(building_id:int,draw_id:int,payload:CycleRoomChange,admin:str=Depends(require_admin))->dict[str,str]:
    with get_connection() as conn:
        cycle=_cycle(conn,building_id,draw_id)
        if cycle["status"]!="Preparing": raise HTTPException(status_code=409,detail="Room eligibility is locked for this draw cycle.")
        room=conn.execute("SELECT * FROM rooms WHERE id=? AND building_id=?",(payload.room_id,building_id)).fetchone()
        if not room: raise HTTPException(status_code=404,detail="Room not found for this building.")
        used=conn.execute("SELECT 1 FROM draw_allocations WHERE building_id=? AND room_id=? AND allocation_status IN ('Allocated','Winner')",(building_id,payload.room_id)).fetchone()
        if payload.include and (used or room["status"]!="Available"): raise HTTPException(status_code=409,detail=f"Room {room['room_number']} was already allocated or is not available.")
        status="Included" if payload.include else "Excluded"
        conn.execute("UPDATE draw_cycle_rooms SET eligibility_status=?,inclusion_reason=?,exclusion_reason=?,added_by_admin=?,added_at=? WHERE draw_id=? AND room_id=?",(status,payload.reason if payload.include else None,payload.reason if not payload.include else None,admin,utc_now(),draw_id,payload.room_id))
        add_audit(conn,"Room Added to Draw Cycle" if payload.include else "Room Excluded from Draw Cycle",admin,f"Room {room['room_number']} eligibility changed to {status}.",payload.reason,building_id,draw_id=draw_id,room_id=payload.room_id)
        return {"message":f"Room marked {status}."}


@app.delete("/api/buildings/{building_id}/draw-cycles/{draw_id}/rooms/{room_id}")
def exclude_cycle_room(building_id:int,draw_id:int,room_id:int,admin:str=Depends(require_admin))->dict[str,str]:
    return cycle_room(building_id,draw_id,CycleRoomChange(room_id=room_id,include=False,reason="Removed by administrator"),admin)


@app.post("/api/buildings/{building_id}/draw-cycles/{draw_id}/confirm")
def confirm_cycle(building_id:int,draw_id:int,admin:str=Depends(require_admin))->dict[str,str]:
    with get_connection() as conn:
        cycle=_cycle(conn,building_id,draw_id)
        if cycle["status"]!="Preparing": raise HTTPException(status_code=409,detail="Only a Preparing draw cycle can be marked Ready.")
        residents=conn.execute("""SELECT r.full_name,r.verification_status FROM draw_cycle_residents cr JOIN residents r ON r.id=cr.resident_id WHERE cr.draw_id=? AND cr.eligibility_status='Included'""",(draw_id,)).fetchall()
        rooms=conn.execute("""SELECT rm.room_number,rm.status,rm.id FROM draw_cycle_rooms cm JOIN rooms rm ON rm.id=cm.room_id WHERE cm.draw_id=? AND cm.eligibility_status='Included'""",(draw_id,)).fetchall()
        if not residents: raise HTTPException(status_code=409,detail="Select at least one eligible resident.")
        if not rooms: raise HTTPException(status_code=409,detail="Select at least one available room.")
        if cycle["lottery_mode"] != "Competitive Lottery" and len(residents)>len(rooms): raise HTTPException(status_code=409,detail="There are more eligible residents than available rooms. Select Competitive Lottery to allow all eligible residents to participate.")
        if any(r["verification_status"]!="Verified" for r in residents): raise HTTPException(status_code=409,detail="Only verified residents may be included.")
        for room in rooms:
            if room["status"]!="Available" or conn.execute("SELECT 1 FROM draw_allocations WHERE building_id=? AND room_id=? AND allocation_status IN ('Allocated','Winner')",(building_id,room["id"])).fetchone(): raise HTTPException(status_code=409,detail=f"Room {room['room_number']} was already allocated in an earlier draw.")
        conn.execute("UPDATE lottery_draws SET status='Ready',eligibility_confirmed_at=?,total_eligible=?,total_available_rooms=? WHERE id=?",(utc_now(),len(residents),len(rooms),draw_id))
        add_audit(conn,"Eligibility Confirmed",admin,"Final resident and room eligibility was confirmed.",building_id=building_id,draw_id=draw_id)
        if cycle["lottery_mode"] == "Competitive Lottery": add_audit(conn,"Competitive Lottery Readiness Confirmed",admin,f"{len(residents)} participants, {len(rooms)} rooms, {min(len(residents),len(rooms))} potential winners.",building_id=building_id,draw_id=draw_id)
        add_audit(conn,"Draw Cycle Marked Ready",admin,"Participant lists were locked.",building_id=building_id,draw_id=draw_id)
        return {"message":"Eligibility confirmed. Draw cycle is Ready."}


@app.post("/api/buildings/{building_id}/draw-cycles/{draw_id}/draw")
def run_cycle(building_id:int,draw_id:int,admin:str=Depends(require_admin))->dict[str,Any]:
    with get_connection() as conn:
        cycle=_cycle(conn,building_id,draw_id)
        if cycle["status"]!="Ready": raise HTTPException(status_code=409,detail="Draw cycle must be Ready before the lottery starts.")
        conn.execute("UPDATE lottery_draws SET status='In Progress',started_at=? WHERE id=?",(utc_now(),draw_id)); add_audit(conn,"Draw Cycle Started",admin,f"Started {cycle['draw_reference']}.",building_id=building_id,draw_id=draw_id)
        try: result=run_lottery_cycle(conn,building_id,draw_id,admin)
        except ValueError as exc:
            conn.execute("UPDATE lottery_draws SET status='Failed',failure_reason=? WHERE id=?",(str(exc),draw_id)); add_audit(conn,"Draw Cycle Failed",admin,"Draw cycle failed safely.",str(exc),building_id,draw_id=draw_id); return {"status":"Failed","message":str(exc)}
        _snapshot_allocations(conn,building_id,draw_id,admin,cycle_only=True)
        competitive = cycle["lottery_mode"] == "Competitive Lottery"
        if competitive:
            for index, item in enumerate(result["non_winners"], start=1):
                status = "Waiting List" if result["waiting_list_enabled"] else "Not Selected"
                waiting_position = index if result["waiting_list_enabled"] else None
                conn.execute("UPDATE draw_allocations SET allocation_status=?,waiting_list_position=?,allocation_reason=?,ai_explanation=? WHERE draw_id=? AND resident_id=?",(status,waiting_position,"Participation result recorded by the seeded competitive lottery.","The resident participated in the seeded, deterministic draw but was not selected within the available-room winner count.",draw_id,item["id"]))
                if waiting_position: conn.execute("INSERT INTO draw_waiting_list(building_id,draw_id,resident_id,position,status,created_at) VALUES(?,?,?,?,?,?)",(building_id,draw_id,item["id"],waiting_position,status,utc_now()))
                add_resident_history(conn,building_id,item["id"],status,status,f"{status} recorded for {cycle['draw_reference']}" + (f" at position {waiting_position}." if waiting_position else "."),admin,draw_id,new_value=str(waiting_position) if waiting_position else status)
                add_audit(conn,"Waiting-list creation" if waiting_position else "Non-winner results recorded",admin,f"{item['full_name']}: {status}.",building_id=building_id,draw_id=draw_id,resident_id=item["id"])
        allocated=conn.execute("SELECT COUNT(*) c FROM draw_allocations WHERE draw_id=? AND allocation_status IN ('Allocated','Winner')",(draw_id,)).fetchone()["c"]
        not_selected=conn.execute("SELECT COUNT(*) c FROM draw_allocations WHERE draw_id=? AND allocation_status='Not Selected'",(draw_id,)).fetchone()["c"]
        waiting=conn.execute("SELECT COUNT(*) c FROM draw_allocations WHERE draw_id=? AND allocation_status='Waiting List'",(draw_id,)).fetchone()["c"]
        eligible=conn.execute("SELECT COUNT(*) c FROM draw_cycle_residents WHERE draw_id=? AND eligibility_status='Included'",(draw_id,)).fetchone()["c"]
        room_count=conn.execute("SELECT COUNT(*) c FROM draw_cycle_rooms WHERE draw_id=? AND eligibility_status='Included'",(draw_id,)).fetchone()["c"]
        conn.execute("UPDATE lottery_draws SET status='Completed',lottery_seed=?,fairness_score=?,total_allocated=?,total_unallocated=?,total_eligible=?,total_not_selected=?,total_waiting_list=?,total_verified_residents=?,total_available_rooms=?,completed_at=? WHERE id=?",(result["lottery_seed"],result["fairness_score"],allocated,not_selected+waiting,eligible,not_selected,waiting,eligible,room_count,utc_now(),draw_id))
        if competitive: add_audit(conn,"Winner selection",admin,f"Selected {allocated} winners from {eligible} eligible residents.",building_id=building_id,draw_id=draw_id)
        add_audit(conn,"Draw Cycle Completed",admin,f"Completed {cycle['draw_reference']} with {allocated} allocations.",building_id=building_id,draw_id=draw_id)
        return {**result,"draw_id":draw_id,"draw_reference":cycle["draw_reference"]}


@app.post("/api/buildings/{building_id}/draw-cycles/{draw_id}/cancel")
def cancel_cycle(building_id:int,draw_id:int,payload:CycleCancel,admin:str=Depends(require_admin))->dict[str,str]:
    with get_connection() as conn:
        cycle=_cycle(conn,building_id,draw_id)
        if cycle["status"] not in ("Preparing","Ready"): raise HTTPException(status_code=409,detail="Only Preparing or Ready draw cycles can be cancelled.")
        if not payload.confirmed: raise HTTPException(status_code=409,detail="Cancellation confirmation is required.")
        conn.execute("UPDATE lottery_draws SET status='Cancelled',cancellation_reason=? WHERE id=?",(payload.reason,draw_id)); add_audit(conn,"Draw Cycle Cancelled",admin,f"Cancelled {cycle['draw_reference']}.",payload.reason,building_id,draw_id=draw_id)
        return {"message":"Draw cycle cancelled successfully."}


def _draw(conn: Any, building_id: int, draw_id: int) -> Any:
    _building(conn, building_id)
    row = conn.execute("SELECT * FROM lottery_draws WHERE id=? AND building_id=?",(draw_id,building_id)).fetchone()
    if not row: raise HTTPException(status_code=404,detail="Lottery draw not found for this building.")
    return row


@app.get("/api/buildings/{building_id}/residents/history")
def residents_history(building_id:int, admin:str=Depends(require_admin)) -> list[dict[str,Any]]:
    with get_connection() as conn:
        _building(conn,building_id)
        return rows_to_dicts(conn.execute("""SELECT r.*, (SELECT da.allocated_room_snapshot FROM draw_allocations da WHERE da.resident_id=r.id AND da.building_id=r.building_id ORDER BY da.id DESC LIMIT 1) latest_allocated_room,(SELECT ld.draw_reference FROM draw_allocations da JOIN lottery_draws ld ON ld.id=da.draw_id WHERE da.resident_id=r.id AND da.building_id=r.building_id ORDER BY ld.draw_number DESC LIMIT 1) latest_draw_reference,(SELECT ld.completed_at FROM draw_allocations da JOIN lottery_draws ld ON ld.id=da.draw_id WHERE da.resident_id=r.id AND da.building_id=r.building_id ORDER BY ld.draw_number DESC LIMIT 1) latest_draw_date,(SELECT COUNT(*) FROM draw_allocations da WHERE da.resident_id=r.id AND da.building_id=r.building_id) draws_participated FROM residents r WHERE r.building_id=? ORDER BY r.id DESC""",(building_id,)).fetchall())


@app.get("/api/buildings/{building_id}/residents/{resident_id}/history")
def resident_history(building_id:int,resident_id:int,admin:str=Depends(require_admin))->dict[str,Any]:
    with get_connection() as conn:
        building=_building(conn,building_id); resident=conn.execute("SELECT * FROM residents WHERE id=? AND building_id=?",(resident_id,building_id)).fetchone()
        if not resident: raise HTTPException(status_code=404,detail="Resident not found.")
        events=rows_to_dicts(conn.execute("SELECT * FROM resident_history_events WHERE building_id=? AND resident_id=? ORDER BY created_at,id",(building_id,resident_id)).fetchall())
        draws=rows_to_dicts(conn.execute("""SELECT cr.id,cr.eligibility_status,cr.inclusion_reason,cr.exclusion_reason,cr.priority_snapshot,ld.draw_number,ld.draw_reference,ld.draw_name,ld.completed_at,ld.lottery_seed,da.old_room_snapshot,da.allocated_room_snapshot,COALESCE(da.allocation_status,CASE WHEN cr.eligibility_status='Included' THEN 'Pending' ELSE cr.eligibility_status END) allocation_status,da.fairness_score,da.ai_explanation FROM draw_cycle_residents cr JOIN lottery_draws ld ON ld.id=cr.draw_id LEFT JOIN draw_allocations da ON da.draw_id=cr.draw_id AND da.resident_id=cr.resident_id WHERE cr.building_id=? AND cr.resident_id=? UNION ALL SELECT da.id,'Included',NULL,NULL,da.priority_category_snapshot,ld.draw_number,ld.draw_reference,ld.draw_name,ld.completed_at,ld.lottery_seed,da.old_room_snapshot,da.allocated_room_snapshot,da.allocation_status,da.fairness_score,da.ai_explanation FROM draw_allocations da JOIN lottery_draws ld ON ld.id=da.draw_id WHERE da.building_id=? AND da.resident_id=? AND NOT EXISTS(SELECT 1 FROM draw_cycle_residents cr WHERE cr.draw_id=da.draw_id AND cr.resident_id=da.resident_id) ORDER BY draw_number DESC""",(building_id,resident_id,building_id,resident_id)).fetchall())
        return {"resident":row_to_dict(resident),"building":row_to_dict(building),"events":events,"draws":draws}


@app.get("/api/buildings/{building_id}/draws")
def draw_history(building_id:int,admin:str=Depends(require_admin))->list[dict[str,Any]]:
    with get_connection() as conn: _building(conn,building_id); return rows_to_dicts(conn.execute("SELECT * FROM lottery_draws WHERE building_id=? ORDER BY draw_number DESC",(building_id,)).fetchall())


@app.get("/api/buildings/{building_id}/draws/{draw_id}")
def draw_details(building_id:int,draw_id:int,admin:str=Depends(require_admin))->dict[str,Any]:
    with get_connection() as conn:
        draw=_draw(conn,building_id,draw_id); allocations=rows_to_dicts(conn.execute("SELECT * FROM draw_allocations WHERE draw_id=? AND building_id=? ORDER BY CASE WHEN waiting_list_position IS NULL THEN 0 ELSE 1 END, waiting_list_position, id",(draw_id,building_id)).fetchall())
        return {"draw":row_to_dict(draw),"allocations":allocations}


@app.get("/api/buildings/{building_id}/draws/{draw_id}/allocations")
@app.get("/api/buildings/{building_id}/draws/{draw_id}/residents")
def historical_allocations(building_id:int,draw_id:int,admin:str=Depends(require_admin))->list[dict[str,Any]]:
    with get_connection() as conn: _draw(conn,building_id,draw_id); return rows_to_dicts(conn.execute("SELECT * FROM draw_allocations WHERE draw_id=? AND building_id=? ORDER BY CASE WHEN waiting_list_position IS NULL THEN 0 ELSE 1 END, waiting_list_position, id",(draw_id,building_id)).fetchall())


@app.get("/api/buildings/{building_id}/draws/{draw_id}/audit")
def draw_audit(building_id:int,draw_id:int,admin:str=Depends(require_admin))->list[dict[str,Any]]:
    with get_connection() as conn:
        draw=_draw(conn,building_id,draw_id); return rows_to_dicts(conn.execute("SELECT * FROM audit_logs WHERE building_id=? AND timestamp>=? AND timestamp<=COALESCE(?,timestamp) ORDER BY id",(building_id,draw["started_at"],draw["completed_at"])).fetchall())


def _history_csv(conn:Any,building_id:int,draw_id:int)->str:
    import csv,io
    draw=_draw(conn,building_id,draw_id); out=io.StringIO(); writer=csv.writer(out); writer.writerow(["Building Snapshot","Society Snapshot","Project Snapshot","Address Snapshot","Draw Number","Draw Reference","Draw Name","Lottery Mode","Eligible Residents","Available Rooms","Winners","Not Selected","Waiting List","Lottery Seed","Algorithm Version","Resident","Old Room","Allocated Room","Status","Waiting-list Position","Priority","Fairness Score","AI Explanation"])
    for row in conn.execute("SELECT * FROM draw_allocations WHERE draw_id=? AND building_id=? ORDER BY id",(draw_id,building_id)).fetchall(): writer.writerow([draw["building_name_snapshot"],draw["society_name_snapshot"],draw["project_name_snapshot"],draw["address_snapshot"],draw["draw_number"],draw["draw_reference"],draw["draw_name"],draw["lottery_mode"],draw["total_eligible"],draw["total_available_rooms"],draw["total_allocated"],draw["total_not_selected"],draw["total_waiting_list"],draw["lottery_seed"],draw["algorithm_version"],row["resident_name_snapshot"],row["old_room_snapshot"],row["allocated_room_snapshot"],row["allocation_status"],row["waiting_list_position"],row["priority_category_snapshot"],row["fairness_score"],row["ai_explanation"]])
    return out.getvalue()


@app.get("/api/buildings/{building_id}/draws/{draw_id}/report.csv")
def historical_csv(building_id:int,draw_id:int,admin:str=Depends(require_admin))->Response:
    with get_connection() as conn: draw=_draw(conn,building_id,draw_id); content=_history_csv(conn,building_id,draw_id)
    return Response(content=content,media_type="text/csv",headers={"Content-Disposition":f"attachment; filename=building-{building_id}-draw-{draw['draw_number']:03d}-allocations.csv"})


def _history_pdf(conn:Any,building_id:int,draw_id:int,title:str)->bytes:
    draw=_draw(conn,building_id,draw_id); rows=conn.execute("SELECT * FROM draw_allocations WHERE draw_id=? AND building_id=?",(draw_id,building_id)).fetchall(); lines=[f"Building: {draw['building_name_snapshot']}",f"Society: {draw['society_name_snapshot']}",f"Project: {draw['project_name_snapshot']}",f"Historical address: {draw['address_snapshot']}",f"Draw: {draw['draw_number']} - {draw['draw_reference']}",f"Draw name: {draw['draw_name']}",f"Lottery mode: {draw['lottery_mode']}",f"Eligible residents: {draw['total_eligible']}",f"Available rooms: {draw['total_available_rooms']}",f"Winners: {draw['total_allocated']}",f"Not selected: {draw['total_not_selected']}",f"Waiting list: {draw['total_waiting_list']}",f"Seed: {draw['lottery_seed']}",f"Algorithm: {draw['algorithm_version']}",f"Fairness: {draw['fairness_score']}",f"Completed: {draw['completed_at']}"]+[f"{r['resident_name_snapshot']} | {r['old_room_snapshot']} -> {r['allocated_room_snapshot'] or 'No room'} | {r['allocation_status']}" for r in rows]
    return simple_pdf(title,lines)


@app.get("/api/buildings/{building_id}/draws/{draw_id}/report.pdf")
def historical_pdf(building_id:int,draw_id:int,admin:str=Depends(require_admin))->Response:
    with get_connection() as conn: draw=_draw(conn,building_id,draw_id); content=_history_pdf(conn,building_id,draw_id,"FairRoom — Intelligent Housing Allocation System Historical Lottery Report")
    return Response(content=content,media_type="application/pdf",headers={"Content-Disposition":f"attachment; filename=building-{building_id}-draw-{draw['draw_number']:03d}-report.pdf"})


@app.get("/api/buildings/{building_id}/draws/{draw_id}/certificate.pdf")
def historical_certificate(building_id:int,draw_id:int,admin:str=Depends(require_admin))->Response:
    with get_connection() as conn: draw=_draw(conn,building_id,draw_id); content=_history_pdf(conn,building_id,draw_id,"FairRoom — Intelligent Housing Allocation System Historical Transparency Certificate")
    return Response(content=content,media_type="application/pdf",headers={"Content-Disposition":f"attachment; filename=building-{building_id}-draw-{draw['draw_number']:03d}-certificate.pdf"})


@app.post("/api/buildings/{building_id}/draws/{draw_id}/archive")
def archive_draw(building_id:int,draw_id:int,admin:str=Depends(require_admin))->dict[str,str]:
    with get_connection() as conn: _draw(conn,building_id,draw_id); conn.execute("UPDATE lottery_draws SET archived_at=? WHERE id=? AND building_id=?",(utc_now(),draw_id,building_id)); add_audit(conn,"Draw Archived",admin,f"Draw {draw_id} archived.",building_id=building_id)
    return {"message":"Lottery draw archived successfully."}


@app.put("/api/buildings/{building_id}/draws/{draw_id}")
def block_history_edit(building_id:int,draw_id:int,admin:str=Depends(require_admin))->None:
    with get_connection() as conn: _draw(conn,building_id,draw_id); add_audit(conn,"Historical modification blocked",admin,f"Attempted modification of completed draw {draw_id}.","Completed lottery history is locked and cannot be modified.",building_id)
    raise HTTPException(status_code=423,detail="Completed lottery history is locked and cannot be modified.")


@app.get("/api/resident/search")
def resident_search(query: str = Query(min_length=2, max_length=30), building_id: int = Query(gt=0)) -> dict[str, Any]:
    cleaned = query.strip().upper()
    last_four = re.sub(r"\D", "", cleaned)[-4:]
    with get_connection() as conn:
        building = _building(conn, building_id)
        row = conn.execute(
            """
            SELECT
                residents.full_name,
                residents.aadhaar_masked,
                residents.old_room_number,
                residents.priority_category,
                residents.verification_status,
                allocations.allocation_reason,
                allocations.lottery_seed,
                allocations.fairness_score,
                allocations.created_at,
                rooms.room_number AS new_room_number,
                rooms.floor,
                rooms.wing,
                rooms.size
                , buildings.building_name, buildings.society_name, buildings.redevelopment_project_name
            FROM residents
            JOIN buildings ON buildings.id = residents.building_id
            LEFT JOIN allocations ON allocations.resident_id = residents.id
            LEFT JOIN rooms ON rooms.id = allocations.room_id
            WHERE residents.building_id=? AND (UPPER(residents.old_room_number) = ?
               OR residents.aadhaar_masked LIKE ?)
            LIMIT 1
            """,
            (building["id"], cleaned, f"%{last_four}" if last_four else "NO_MATCH"),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No resident found for this search.")
        result = row_to_dict(row)
        resident_id = conn.execute("SELECT id FROM residents WHERE building_id=? AND (UPPER(old_room_number)=? OR aadhaar_masked LIKE ?) LIMIT 1", (building["id"], cleaned, f"%{last_four}" if last_four else "NO_MATCH")).fetchone()["id"]
        result["draw_history"] = rows_to_dicts(conn.execute("""SELECT ld.draw_number,ld.draw_reference,ld.draw_name,ld.lottery_mode,ld.completed_at,da.allocation_status,da.waiting_list_position,da.allocated_room_snapshot,da.ai_explanation FROM draw_allocations da JOIN lottery_draws ld ON ld.id=da.draw_id WHERE da.building_id=? AND da.resident_id=? ORDER BY ld.draw_number""", (building["id"],resident_id)).fetchall())
        return result


@app.get("/api/resident/certificate")
def resident_certificate(query: str = Query(min_length=2, max_length=30), building_id: int = Query(gt=0)) -> Response:
    result = resident_search(query, building_id)
    lines = [
        f"Resident: {result['full_name']}",
        f"Old room: {result['old_room_number']}",
        f"New room: {result.get('new_room_number') or 'Not allocated yet'}",
        f"Priority category: {result['priority_category']}",
        f"Verification status: {result['verification_status']}",
        f"Lottery seed: {result.get('lottery_seed') or 'Not generated yet'}",
        f"Fairness score: {result.get('fairness_score') or 'Pending'}",
        f"Explanation: {result.get('allocation_reason') or 'Allocation has not been completed yet.'}",
    ]
    return Response(
        content=simple_pdf("FairRoom — Intelligent Housing Allocation System Allocation Certificate", lines),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=allocation-certificate.pdf"},
    )


@app.post("/api/chat")
def resident_chat(payload: ChatRequest) -> dict[str, str]:
    question = payload.question.lower()
    resident_context = ""
    if payload.resident_query:
        try:
            if not payload.building_id: raise HTTPException(status_code=422, detail="Select a building first.")
            result = resident_search(payload.resident_query, payload.building_id)
            resident_context = (
                f"{result['full_name']} is "
                f"{'allocated to Room ' + result['new_room_number'] if result.get('new_room_number') else 'not allocated yet'}."
            )
        except HTTPException:
            resident_context = "No matching resident record was found."

    with get_connection() as conn:
        seed = get_setting(conn, "lottery_seed", "not generated yet", payload.building_id) if payload.building_id else "not generated yet"

    if "why" in question or "room" in question:
        answer = (
            f"{resident_context} Allocation explanations are generated from eligibility, priority category, room suitability, "
            f"and the locked seed {seed}. No manual override is used."
        )
    elif "manual" in question or "partiality" in question:
        answer = "Manual selection is blocked after the lottery lock. Any override attempt is written to the audit trail."
    elif "how" in question or "lottery" in question:
        answer = (
            f"The system locks verified residents and available rooms, generates seed {seed}, shuffles records deterministically, "
            "handles priority groups first, then stores every allocation and audit entry."
        )
    elif "status" in question:
        answer = resident_context or "Search with Aadhaar last 4 digits or old room number to view allocation status."
    else:
        answer = (
            "I can explain allocation reasons, lottery rules, manual override safeguards, or a resident's allocation status."
        )
    return {"answer": answer}
