"""Building-scoped deterministic policy evaluation. Scores never enter lottery ordering."""
from __future__ import annotations

import json
import math
import sqlite3
from datetime import date, datetime, timezone
from typing import Any

FIELDS = {
    "verification_status": "text", "priority_category": "text", "building_wing": "text",
    "resident_category": "text", "family_members": "number", "annual_income": "number",
    "age": "number", "residency_years": "number", "consent": "boolean",
    "document_present": "boolean",
}
OPERATORS = {
    "text": {"equals", "not equals", "contains", "exists", "does not exist"},
    "number": {"equals", "not equals", "greater than", "greater than or equal", "less than", "less than or equal", "between", "exists", "does not exist"},
    "boolean": {"is true", "is false", "exists", "does not exist"},
}
CATEGORIES = {"HARD_ELIGIBILITY", "PRIORITY"}


def validate_rule(field_name: str, operator: str, value: str | None, category: str, points: int) -> None:
    if field_name not in FIELDS:
        raise ValueError("Unsupported resident field.")
    kind = FIELDS[field_name]
    if operator not in OPERATORS[kind]:
        raise ValueError("Operator is not valid for this resident field.")
    if category not in CATEGORIES:
        raise ValueError("Unsupported rule category.")
    if points < 0 or points > 10000 or (category == "HARD_ELIGIBILITY" and points != 0):
        raise ValueError("Only priority rules may have non-negative points up to 10000.")
    if operator in {"exists", "does not exist", "is true", "is false"}:
        return
    if value is None or not str(value).strip():
        raise ValueError("A comparison value is required.")
    if kind == "number":
        try:
            numbers = [float(part.strip()) for part in value.split(",")]
        except ValueError as exc:
            raise ValueError("Numeric comparison values are required.") from exc
        if not all(math.isfinite(number) for number in numbers):
            raise ValueError("Numeric comparison values must be finite.")
        if len(numbers) != (2 if operator == "between" else 1) or (operator == "between" and numbers[0] > numbers[1]):
            raise ValueError("Between needs two ascending numbers; other numeric operators need one.")


def active_rule_set(conn: sqlite3.Connection, building_id: int) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM eligibility_rule_sets WHERE building_id=? AND status='Active' ORDER BY version DESC LIMIT 1", (building_id,)).fetchone()
    return dict(row) if row else None


def rule_set_detail(conn: sqlite3.Connection, rule_set: dict[str, Any]) -> dict[str, Any]:
    return {**rule_set, "rules": [dict(row) for row in conn.execute("SELECT * FROM eligibility_rule_items WHERE rule_set_id=? ORDER BY sort_order,id", (rule_set["id"],)).fetchall()]}


def _years(since: str | None, as_of: date) -> int | None:
    if not since:
        return None
    try:
        start = date.fromisoformat(since[:10])
    except ValueError:
        return None
    return as_of.year - start.year - ((as_of.month, as_of.day) < (start.month, start.day))


def _actual(resident: dict[str, Any], field: str, as_of: date) -> Any:
    if field == "age":
        return _years(resident.get("date_of_birth"), as_of)
    if field == "residency_years":
        return _years(resident.get("residency_start_date"), as_of)
    if field == "document_present":
        return bool(resident.get("document_name"))
    return resident.get(field)


def _matches(actual: Any, operator: str, required: str | None, kind: str) -> bool:
    missing = actual is None or actual == ""
    if operator == "exists": return not missing
    if operator == "does not exist": return missing
    if missing: return False
    if operator == "is true": return bool(actual)
    if operator == "is false": return not bool(actual)
    if kind == "number":
        try:
            number = float(actual)
            values = [float(part.strip()) for part in (required or "").split(",")]
        except ValueError:
            return False
        if operator == "between": return values[0] <= number <= values[1]
        target = values[0]
        return {"equals": number == target, "not equals": number != target,
                "greater than": number > target, "greater than or equal": number >= target,
                "less than": number < target, "less than or equal": number <= target}[operator]
    left, right = str(actual).casefold(), str(required).casefold()
    return {"equals": left == right, "not equals": left != right, "contains": right in left}[operator]


def evaluate_resident(resident: dict[str, Any], rule_set: dict[str, Any] | None, as_of: date | None = None) -> dict[str, Any]:
    as_of = as_of or datetime.now(timezone.utc).date()
    results = []
    score = 0
    for rule in (rule_set or {}).get("rules", []):
        if not rule["is_active"]:
            continue
        actual = _actual(resident, rule["field_name"], as_of)
        passed = _matches(actual, rule["operator"], rule["comparison_value"], FIELDS[rule["field_name"]])
        points = int(rule["priority_points"]) if passed and rule["category"] == "PRIORITY" else 0
        score += points
        results.append({"rule_id": rule["id"], "rule_name": rule["rule_name"], "category": rule["category"],
                        "passed": passed, "points_awarded": points, "explanation": rule["explanation"] or rule["rule_name"],
                        "missing_field": actual is None or actual == ""})
    failures = [r for r in results if r["category"] == "HARD_ELIGIBILITY" and not r["passed"]]
    baseline = resident.get("verification_status") == "Verified" and bool(resident.get("consent"))
    eligible = baseline and not failures
    reasons = [r["explanation"] for r in failures]
    if resident.get("verification_status") != "Verified": reasons.insert(0, "Resident is not verified.")
    if not resident.get("consent"): reasons.insert(0, "Resident consent is missing.")
    return {"resident_id": resident["id"], "eligible": eligible, "status": "Eligible" if eligible else "Ineligible",
            "rule_set_id": rule_set["id"] if rule_set else None, "rule_version": rule_set["version"] if rule_set else None,
            "configuration_status": "Configured" if rule_set else "No eligibility criteria configured; existing verification and consent rules apply.",
            "rules_evaluated": len(results), "rules_passed": sum(r["passed"] for r in results),
            "rules_failed": len(failures), "priority_score": score, "results": results,
            "explanation": "Resident satisfies all mandatory eligibility requirements." if eligible else " ".join(reasons),
            "evaluated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def evaluate_building(conn: sqlite3.Connection, building_id: int, rule_set: dict[str, Any] | None = None) -> dict[str, Any]:
    if rule_set is None:
        current = active_rule_set(conn, building_id)
        rule_set = rule_set_detail(conn, current) if current else None
    residents = [dict(row) for row in conn.execute("SELECT * FROM residents WHERE building_id=? ORDER BY full_name,id", (building_id,))]
    evaluations = [evaluate_resident(resident, rule_set) for resident in residents]
    return {"building_id": building_id, "rule_set": rule_set, "evaluations": evaluations,
            "summary": {"total_registered": len(residents), "total_eligible": sum(e["eligible"] for e in evaluations),
                        "total_ineligible": sum(not e["eligible"] for e in evaluations)}}


def save_cycle_evaluations(conn: sqlite3.Connection, building_id: int, draw_id: int, evaluation: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rule_set = evaluation["rule_set"]
    snapshot = {"rule_set": rule_set, "fallback": "Verified residents with consent" if not rule_set else None,
                "summary": evaluation["summary"], "evaluated_at": now}
    conn.execute("INSERT INTO draw_rule_snapshots(draw_id,building_id,rules_json,created_at) VALUES(?,?,?,?)",
                 (draw_id, building_id, json.dumps(snapshot, sort_keys=True), now))
    conn.execute("UPDATE lottery_draws SET eligibility_rule_set_id=?,rule_snapshot_version=?,total_not_eligible=? WHERE id=? AND building_id=?",
                 (rule_set["id"] if rule_set else None, rule_set["version"] if rule_set else None,
                  evaluation["summary"]["total_ineligible"], draw_id, building_id))
    for result in evaluation["evaluations"]:
        conn.execute("""INSERT INTO eligibility_evaluations(draw_id,building_id,resident_id,status,eligible,priority_score,rules_evaluated,rules_passed,rules_failed,results_json,evaluated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                     (draw_id, building_id, result["resident_id"], result["status"], int(result["eligible"]),
                      result["priority_score"], result["rules_evaluated"], result["rules_passed"], result["rules_failed"],
                      json.dumps(result, sort_keys=True), now))
