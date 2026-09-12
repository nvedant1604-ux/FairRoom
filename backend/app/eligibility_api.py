"""Authenticated rule-set management and non-mutating eligibility previews."""
from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from .database import add_audit, get_connection, row_to_dict, rows_to_dicts, utc_now
from .auth import require_admin
from .eligibility import FIELDS, OPERATORS, active_rule_set, evaluate_building, evaluate_resident, rule_set_detail, validate_rule
from .schemas import EligibilityPolicyRule, EligibilityRuleSetCreate, EligibilityRuleSetUpdate

router = APIRouter(prefix="/api/buildings/{building_id}/eligibility", tags=["Eligibility"], dependencies=[Depends(require_admin)])


def _building(conn: sqlite3.Connection, building_id: int) -> None:
    if not conn.execute("SELECT 1 FROM buildings WHERE id=? AND archived_at IS NULL", (building_id,)).fetchone():
        raise HTTPException(404, "Building not found.")


def _set(conn: sqlite3.Connection, building_id: int, rule_set_id: int) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM eligibility_rule_sets WHERE id=? AND building_id=?", (rule_set_id, building_id)).fetchone()
    if not row:
        raise HTTPException(404, "Rule set not found for this building.")
    return dict(row)


def _draft(conn: sqlite3.Connection, building_id: int, rule_set_id: int) -> dict[str, Any]:
    item = _set(conn, building_id, rule_set_id)
    if item["status"] != "Draft":
        raise HTTPException(423, "This rule version is immutable. Create a new version to edit criteria.")
    return item


@router.get("/metadata")
def metadata(building_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        _building(conn, building_id)
        return {"fields": FIELDS, "operators": {key: sorted(value) for key, value in OPERATORS.items()},
                "categories": ["HARD_ELIGIBILITY", "PRIORITY"]}


@router.get("/rule-sets")
def list_rule_sets(building_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        _building(conn, building_id)
        return rows_to_dicts(conn.execute("SELECT * FROM eligibility_rule_sets WHERE building_id=? ORDER BY version DESC", (building_id,)).fetchall())


@router.get("/rule-sets/current")
def current_rule_set(building_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        _building(conn, building_id)
        current = active_rule_set(conn, building_id)
        return {"rule_set": rule_set_detail(conn, current) if current else None,
                "message": "No eligibility criteria configured; existing verification and consent rules apply." if not current else None}


@router.get("/rule-sets/{rule_set_id}")
def get_rule_set(building_id: int, rule_set_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        _building(conn, building_id)
        return rule_set_detail(conn, _set(conn, building_id, rule_set_id))


@router.post("/rule-sets", status_code=201)
def create_rule_set(building_id: int, payload: EligibilityRuleSetCreate, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        _building(conn, building_id)
        source = _set(conn, building_id, payload.copy_from_id) if payload.copy_from_id else None
        version = conn.execute("SELECT COALESCE(MAX(version),0)+1 FROM eligibility_rule_sets WHERE building_id=?", (building_id,)).fetchone()[0]
        now = utc_now()
        cursor = conn.execute("""INSERT INTO eligibility_rule_sets(building_id,version,name,description,status,created_by,updated_by,created_at,updated_at)
                                 VALUES(?,?,?,?,'Draft',?,?,?,?)""",
                              (building_id, version, payload.name.strip(), payload.description.strip(), admin, admin, now, now))
        rule_set_id = cursor.lastrowid
        if source:
            for rule in conn.execute("SELECT * FROM eligibility_rule_items WHERE rule_set_id=? ORDER BY sort_order,id", (source["id"],)).fetchall():
                conn.execute("""INSERT INTO eligibility_rule_items(rule_set_id,rule_name,category,field_name,operator,comparison_value,priority_points,is_active,explanation,sort_order,created_at)
                                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                             (rule_set_id, rule["rule_name"], rule["category"], rule["field_name"], rule["operator"],
                              rule["comparison_value"], rule["priority_points"], rule["is_active"], rule["explanation"], rule["sort_order"], now))
        add_audit(conn, "Eligibility rule version created", admin, f"Created rule set version {version}: {payload.name}.", building_id=building_id)
        return rule_set_detail(conn, _set(conn, building_id, rule_set_id))


@router.put("/rule-sets/{rule_set_id}")
def update_rule_set(building_id: int, rule_set_id: int, payload: EligibilityRuleSetUpdate, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        _draft(conn, building_id, rule_set_id)
        conn.execute("UPDATE eligibility_rule_sets SET name=?,description=?,updated_by=?,updated_at=? WHERE id=?",
                     (payload.name.strip(), payload.description.strip(), admin, utc_now(), rule_set_id))
        add_audit(conn, "Eligibility draft updated", admin, f"Updated draft rule set {rule_set_id}.", building_id=building_id)
        return rule_set_detail(conn, _set(conn, building_id, rule_set_id))


def _save_rule(conn: sqlite3.Connection, rule_set_id: int, payload: EligibilityPolicyRule, rule_id: int | None = None) -> int:
    try:
        validate_rule(payload.field_name, payload.operator, payload.comparison_value, payload.category, payload.priority_points)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    values = (payload.rule_name.strip(), payload.category, payload.field_name, payload.operator,
              payload.comparison_value, payload.priority_points, int(payload.is_active), payload.explanation.strip(), payload.sort_order)
    try:
        if rule_id is None:
            return conn.execute("""INSERT INTO eligibility_rule_items(rule_set_id,rule_name,category,field_name,operator,comparison_value,priority_points,is_active,explanation,sort_order,created_at)
                                   VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (rule_set_id, *values, utc_now())).lastrowid
        conn.execute("""UPDATE eligibility_rule_items SET rule_name=?,category=?,field_name=?,operator=?,comparison_value=?,priority_points=?,is_active=?,explanation=?,sort_order=? WHERE id=? AND rule_set_id=?""",
                     (*values, rule_id, rule_set_id))
        return rule_id
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "A rule with this name already exists in this version.") from exc


@router.post("/rule-sets/{rule_set_id}/rules", status_code=201)
def add_rule(building_id: int, rule_set_id: int, payload: EligibilityPolicyRule, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        _draft(conn, building_id, rule_set_id)
        rule_id = _save_rule(conn, rule_set_id, payload)
        conn.execute("UPDATE eligibility_rule_sets SET updated_at=?,updated_by=? WHERE id=?", (utc_now(), admin, rule_set_id))
        add_audit(conn, "Eligibility rule created", admin, f"Added {payload.rule_name} to version {rule_set_id}.", building_id=building_id)
        return row_to_dict(conn.execute("SELECT * FROM eligibility_rule_items WHERE id=?", (rule_id,)).fetchone())


@router.put("/rule-sets/{rule_set_id}/rules/{rule_id}")
def update_rule(building_id: int, rule_set_id: int, rule_id: int, payload: EligibilityPolicyRule, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        _draft(conn, building_id, rule_set_id)
        if not conn.execute("SELECT 1 FROM eligibility_rule_items WHERE id=? AND rule_set_id=?", (rule_id, rule_set_id)).fetchone():
            raise HTTPException(404, "Rule not found in this version.")
        _save_rule(conn, rule_set_id, payload, rule_id)
        conn.execute("UPDATE eligibility_rule_sets SET updated_at=?,updated_by=? WHERE id=?", (utc_now(), admin, rule_set_id))
        add_audit(conn, "Eligibility rule updated", admin, f"Updated {payload.rule_name} in version {rule_set_id}.", building_id=building_id)
        return row_to_dict(conn.execute("SELECT * FROM eligibility_rule_items WHERE id=?", (rule_id,)).fetchone())


@router.delete("/rule-sets/{rule_set_id}/rules/{rule_id}")
def delete_rule(building_id: int, rule_set_id: int, rule_id: int, admin: str = Depends(require_admin)) -> dict[str, str]:
    with get_connection() as conn:
        _draft(conn, building_id, rule_set_id)
        cursor = conn.execute("DELETE FROM eligibility_rule_items WHERE id=? AND rule_set_id=?", (rule_id, rule_set_id))
        if not cursor.rowcount:
            raise HTTPException(404, "Rule not found in this version.")
        add_audit(conn, "Eligibility draft rule removed", admin, f"Removed rule {rule_id} from draft version {rule_set_id}.", building_id=building_id)
        return {"message": "Draft rule removed."}


@router.post("/rule-sets/{rule_set_id}/activate")
def activate_rule_set(building_id: int, rule_set_id: int, admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        item = _draft(conn, building_id, rule_set_id)
        conn.execute("UPDATE eligibility_rule_sets SET status='Inactive',updated_by=?,updated_at=? WHERE building_id=? AND status='Active'",
                     (admin, utc_now(), building_id))
        conn.execute("UPDATE eligibility_rule_sets SET status='Active',updated_by=?,updated_at=? WHERE id=?",
                     (admin, utc_now(), rule_set_id))
        add_audit(conn, "Eligibility criteria activated", admin, f"Activated {item['name']} version {item['version']}.", building_id=building_id)
        return rule_set_detail(conn, _set(conn, building_id, rule_set_id))


def _preview_set(conn: sqlite3.Connection, building_id: int, rule_set_id: int | None) -> dict[str, Any] | None:
    item = _set(conn, building_id, rule_set_id) if rule_set_id else active_rule_set(conn, building_id)
    return rule_set_detail(conn, item) if item else None


@router.get("/residents/{resident_id}")
def preview_resident(building_id: int, resident_id: int, rule_set_id: int | None = Query(default=None)) -> dict[str, Any]:
    with get_connection() as conn:
        _building(conn, building_id)
        resident = conn.execute("SELECT * FROM residents WHERE building_id=? AND id=?", (building_id, resident_id)).fetchone()
        if not resident:
            raise HTTPException(404, "Resident not found for this building.")
        return evaluate_resident(dict(resident), _preview_set(conn, building_id, rule_set_id))


@router.post("/evaluate-all")
def preview_all(building_id: int, rule_set_id: int | None = Query(default=None), admin: str = Depends(require_admin)) -> dict[str, Any]:
    with get_connection() as conn:
        _building(conn, building_id)
        result = evaluate_building(conn, building_id, _preview_set(conn, building_id, rule_set_id))
        add_audit(conn, "Eligibility evaluation completed", admin,
                  f"Previewed {result['summary']['total_registered']} residents; {result['summary']['total_eligible']} eligible.",
                  building_id=building_id)
        return result
