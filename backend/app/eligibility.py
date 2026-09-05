from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timezone
from typing import Any

RULE_TYPES = {
    "Verification Status": {"equals", "not equals", "is verified"},
    "Building Membership": {"is valid"},
    "Identity Validation": {"is valid"},
    "Required Document Status": {"is valid"},
    "Minimum Residency Duration": {"greater than", "greater than or equal", "less than", "less than or equal"},
    "Age Requirement": {"greater than", "greater than or equal", "less than", "less than or equal", "equals"},
    "Resident Category": {"equals", "not equals", "contains"},
}
RULE_CATEGORIES = {"Mandatory Eligibility", "Attribute Eligibility", "Priority Rule"}


def _date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None


def _compare(actual: Any, operator: str, required: Any) -> bool:
    if operator == "equals": return str(actual).casefold() == str(required).casefold()
    if operator == "not equals": return str(actual).casefold() != str(required).casefold()
    if operator == "contains": return str(required).casefold() in str(actual).casefold()
    try:
        left, right = float(actual), float(required)
    except (TypeError, ValueError):
        return False
    return {"greater than": left > right, "greater than or equal": left >= right, "less than": left < right, "less than or equal": left <= right}.get(operator, False)


def validate_rule(rule_type: str, operator: str, value: str | None, category: str, priority_points: int) -> None:
    if rule_type not in RULE_TYPES: raise ValueError("Unsupported rule type.")
    if operator not in RULE_TYPES[rule_type]: raise ValueError("This operator is not valid for the selected rule type.")
    if category not in RULE_CATEGORIES: raise ValueError("Unsupported rule category.")
    if category == "Priority Rule" and priority_points < 0: raise ValueError("Priority points cannot be negative.")
    if rule_type in {"Minimum Residency Duration", "Age Requirement"}:
        try:
            if float(value or "") < 0: raise ValueError
        except ValueError as exc:
            raise ValueError("This rule requires a non-negative numeric value.") from exc
    elif rule_type == "Resident Category" and not (value or "").strip():
        raise ValueError("Resident category rules require a value.")


def active_rules(conn: sqlite3.Connection, building_id: int) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute("SELECT * FROM eligibility_rules WHERE building_id=? AND is_active=1 ORDER BY priority,id", (building_id,)).fetchall()]


def evaluate_resident(conn: sqlite3.Connection, building_id: int, resident: dict[str, Any], rules: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if resident["building_id"] != building_id:
        raise ValueError("Resident does not belong to this building.")
    rules = active_rules(conn, building_id) if rules is None else rules
    results: list[dict[str, Any]] = []
    priority_score = 0
    for rule in rules:
        kind, operator, required = rule["rule_type"], rule["operator"], rule["value"]
        actual: Any = None
        if kind == "Verification Status":
            actual = resident["verification_status"]; passed = actual == "Verified" if operator == "is verified" else _compare(actual, operator, required)
            explanation = "Resident is verified." if passed else "Resident does not have the required verification status."
        elif kind == "Building Membership":
            actual = resident["building_id"]; passed = True
            explanation = "Resident belongs to the selected building."
        elif kind == "Identity Validation":
            actual = "Valid" if resident.get("aadhaar_hash") and resident.get("aadhaar_masked") else "Invalid"; passed = actual == "Valid"
            explanation = "Resident identity is valid." if passed else "Resident identity is incomplete or invalid."
        elif kind == "Required Document Status":
            actual = "Valid" if resident.get("document_name") else "Missing"; passed = actual == "Valid"
            explanation = "Required resident document is present." if passed else "Required resident document is missing."
        elif kind == "Minimum Residency Duration":
            start = _date(resident.get("residency_start_date")) or _date(resident.get("created_at")); actual = round((date.today() - start).days / 365.25, 2) if start else None
            passed = _compare(actual, operator, required); explanation = "Resident satisfies the configured residency-duration rule." if passed else "Resident does not satisfy the configured residency-duration rule."
        elif kind == "Age Requirement":
            born = _date(resident.get("date_of_birth")); actual = int((date.today() - born).days / 365.25) if born else None
            passed = _compare(actual, operator, required); explanation = "Resident satisfies the configured age rule." if passed else "Resident does not satisfy the configured age rule."
        else:
            actual = resident.get("resident_category") or resident.get("priority_category")
            passed = _compare(actual, operator, required); explanation = "Resident satisfies the configured category rule." if passed else "Resident does not satisfy the configured category rule."
        if rule["rule_category"] == "Priority Rule" and passed:
            priority_score += int(rule["priority_points"] or 0)
        results.append({"rule_id": rule["id"], "rule_name": rule["rule_name"], "rule_type": kind, "category": rule["rule_category"], "passed": passed, "required_value": required, "actual_value": actual, "priority_points": int(rule["priority_points"] or 0), "explanation": explanation})
    failures = [item for item in results if not item["passed"] and item["category"] != "Priority Rule"]
    return {"resident_id": resident["id"], "eligible": not failures and resident["verification_status"] == "Verified" and bool(resident["consent"]), "status": "Eligible" if not failures and resident["verification_status"] == "Verified" and bool(resident["consent"]) else "Not Eligible", "rules_evaluated": len(results), "rules_passed": sum(item["passed"] for item in results), "rules_failed": len(failures), "priority_score": priority_score, "results": results}


def evaluate_building(conn: sqlite3.Connection, building_id: int) -> dict[str, Any]:
    rules = active_rules(conn, building_id)
    residents = [dict(row) for row in conn.execute("SELECT * FROM residents WHERE building_id=? ORDER BY full_name", (building_id,)).fetchall()]
    evaluations = [evaluate_resident(conn, building_id, resident, rules) for resident in residents]
    return {"building_id": building_id, "rules": rules, "evaluations": evaluations, "summary": {"total_registered": len(residents), "total_verified": sum(r["verification_status"] == "Verified" for r in residents), "total_eligible": sum(e["eligible"] for e in evaluations), "total_not_eligible": sum(not e["eligible"] for e in evaluations)}}


def save_cycle_evaluations(conn: sqlite3.Connection, building_id: int, draw_id: int, evaluations: list[dict[str, Any]], rules: list[dict[str, Any]]) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    conn.execute("INSERT OR REPLACE INTO draw_rule_snapshots(draw_id,building_id,rules_json,created_at) VALUES(?,?,?,?)", (draw_id, building_id, json.dumps(rules, default=str, sort_keys=True), now))
    for evaluation in evaluations:
        conn.execute("INSERT OR REPLACE INTO eligibility_evaluations(draw_id,building_id,resident_id,status,eligible,priority_score,rules_evaluated,rules_passed,rules_failed,results_json,evaluated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", (draw_id,building_id,evaluation["resident_id"],evaluation["status"],int(evaluation["eligible"]),evaluation["priority_score"],evaluation["rules_evaluated"],evaluation["rules_passed"],evaluation["rules_failed"],json.dumps(evaluation["results"],default=str),now))
