from __future__ import annotations

import csv
import io
import json
import sqlite3
from typing import Any

from .database import get_setting, row_to_dict, rows_to_dicts
from .fairness import fairness_score


def allocation_rows(conn: sqlite3.Connection, building_id: int) -> list[dict[str, Any]]:
    return rows_to_dicts(
        conn.execute(
            """
            SELECT
                allocations.id,
                allocations.building_id,
                allocations.resident_id,
                allocations.room_id,
                residents.full_name,
                residents.aadhaar_masked,
                residents.old_room_number,
                residents.priority_category,
                rooms.room_number AS new_room_number,
                rooms.wing,
                rooms.floor,
                rooms.size,
                allocations.allocation_reason,
                allocations.lottery_seed,
                allocations.fairness_score,
                allocations.created_at
            FROM allocations
            JOIN residents ON residents.id = allocations.resident_id
            JOIN rooms ON rooms.id = allocations.room_id
            WHERE allocations.building_id = ? AND residents.building_id = ? AND rooms.building_id = ?
            ORDER BY allocations.id
            """
            , (building_id, building_id, building_id)
        ).fetchall()
    )


def report_payload(conn: sqlite3.Connection, building_id: int) -> dict[str, Any]:
    building = row_to_dict(conn.execute("SELECT * FROM buildings WHERE id=?", (building_id,)).fetchone())
    society = {"id": building_id, "name": building["society_name"], "address": building["full_address"], "redevelopment_project_name": building["redevelopment_project_name"]} if building else None
    residents = conn.execute("SELECT COUNT(*) AS count FROM residents WHERE building_id=?", (building_id,)).fetchone()["count"]
    rooms = conn.execute("SELECT COUNT(*) AS count FROM rooms WHERE building_id=?", (building_id,)).fetchone()["count"]
    allocated = conn.execute("SELECT COUNT(*) AS count FROM allocations WHERE building_id=?", (building_id,)).fetchone()["count"]
    audit_logs = rows_to_dicts(
        conn.execute(
            "SELECT action, performed_by, details, reason, timestamp FROM audit_logs WHERE building_id=? ORDER BY id DESC LIMIT 20", (building_id,)
        ).fetchall()
    )
    latest = conn.execute("""SELECT ld.*,drs.rules_json FROM lottery_draws ld
        LEFT JOIN draw_rule_snapshots drs ON drs.draw_id=ld.id WHERE ld.building_id=? AND ld.status='Completed'
        ORDER BY ld.draw_number DESC LIMIT 1""", (building_id,)).fetchone()
    seed = latest["lottery_seed"] if latest and latest["lottery_seed"] else get_setting(conn, "lottery_seed", "Not generated yet", building_id)
    completed_at = latest["completed_at"] if latest and latest["completed_at"] else get_setting(conn, "lottery_completed_at", building_id=building_id)
    score = float(latest["fairness_score"] if latest and latest["fairness_score"] is not None else
                  get_setting(conn, "fairness_score", str(fairness_score(conn, building_id)), building_id) or 0)
    allocations = allocation_rows(conn, building_id)
    snapshot = json.loads(latest["rules_json"]) if latest and latest["rules_json"] else None
    if snapshot:
        rule_set = snapshot["rule_set"]
        reasons: dict[str, int] = {}
        for row in conn.execute("SELECT results_json FROM eligibility_evaluations WHERE draw_id=? AND building_id=?", (latest["id"], building_id)):
            result = json.loads(row["results_json"])
            for item in result["results"]:
                if item["category"] == "HARD_ELIGIBILITY" and not item["passed"]:
                    reasons[item["rule_name"]] = reasons.get(item["rule_name"], 0) + 1
        eligibility = {"rule_set_name": rule_set["name"] if rule_set else None,
                       "rule_version": rule_set["version"] if rule_set else None,
                       "rules": [{"name": rule["rule_name"], "category": rule["category"], "field": rule["field_name"],
                                  "operator": rule["operator"], "value": rule["comparison_value"],
                                  "points": rule["priority_points"]} for rule in (rule_set or {}).get("rules", []) if rule["is_active"]],
                       "eligible_count": snapshot["summary"]["total_eligible"],
                       "ineligible_count": snapshot["summary"]["total_ineligible"],
                       "ineligibility_reasons": reasons,
                       "methodology": "Priority points are explanatory only; the existing seeded lottery selects winners."}
    else:
        eligibility = {"rule_set_name": None, "rule_version": None, "rules": [], "eligible_count": None,
                       "ineligible_count": None, "ineligibility_reasons": {},
                       "methodology": "No historical eligibility snapshot is available for this building."}
    return {
        "society": society,
        "building": building,
        "building_id": building_id,
        "totals": {
            "total_residents": residents,
            "total_rooms": rooms,
            "total_allocated": allocated,
            "remaining_rooms": max(0, rooms - allocated),
            "fairness_score": score,
        },
        "lottery_rules": [
            "Only verified residents with consent are included.",
            "Resident and room lists are locked before seed generation.",
            "Priority categories are processed before general category with deterministic shuffling inside each group.",
            "Senior citizens, disabled residents, medical emergency cases, and large families are matched to suitable rooms where possible.",
            "Each resident receives at most one room and each room is allocated at most once.",
            "The stored lottery seed allows the draw to be audited later.",
        ],
        "lottery_seed": seed,
        "lottery_completed_at": completed_at,
        "lottery_mode": latest["lottery_mode"] if latest else None,
        "draw_outcomes": {"winners": latest["total_allocated"], "not_selected": latest["total_not_selected"],
                          "waiting_list": latest["total_waiting_list"]} if latest else None,
        "eligibility": eligibility,
        "allocations": allocations,
        "ai_explanation_summary": (
            "The AI fairness module validates eligibility, checks duplicates and suspicious entries, "
            "matches priority residents with suitable rooms, generates allocation explanations, and writes audit evidence. "
            "It does not secretly select winners; final allocation is produced by the locked seeded lottery algorithm."
        ),
        "audit_log_summary": audit_logs,
    }


def allocations_csv(conn: sqlite3.Connection, building_id: int) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Building ID", "Building Name", "Society Name", "Project Name", "Full Address", "Resident Name",
            "Masked Aadhaar",
            "Old Room",
            "New Room",
            "Priority Category",
            "Fairness Score",
            "Lottery Seed",
            "Timestamp",
            "AI Explanation",
        ]
    )
    building = conn.execute("SELECT * FROM buildings WHERE id=?", (building_id,)).fetchone()
    for row in allocation_rows(conn, building_id):
        writer.writerow(
            [
                building_id, building["building_name"], building["society_name"], building["redevelopment_project_name"], building["full_address"], row["full_name"],
                row["aadhaar_masked"],
                row["old_room_number"],
                row["new_room_number"],
                row["priority_category"],
                row["fairness_score"],
                row["lottery_seed"],
                row["created_at"],
                row["allocation_reason"],
            ]
        )
    return output.getvalue()


def simple_pdf(title: str, lines: list[str]) -> bytes:
    safe_lines = []
    for line in [title, "", *lines]:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        safe_lines.append(escaped[:105])

    y = 780
    content_lines = ["BT", "/F1 11 Tf", "50 800 Td"]
    for index, line in enumerate(safe_lines[:42]):
        font = "/F1 16 Tf" if index == 0 else "/F1 10 Tf"
        content_lines.append(font)
        content_lines.append(f"0 {0 if index == 0 else -18} Td")
        content_lines.append(f"({line}) Tj")
        y -= 18
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("cp1252", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref_position = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_position}\n%%EOF".encode("ascii")
    )
    return bytes(pdf)
