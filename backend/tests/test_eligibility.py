from __future__ import annotations

import tempfile
import unittest
from datetime import date
from pathlib import Path

from fastapi import HTTPException

from backend.app import database, main
from backend.app.auth import require_admin
from backend.app.eligibility import evaluate_resident, validate_rule
from backend.app.eligibility_api import (
    activate_rule_set, add_rule, create_rule_set, get_rule_set, preview_resident, update_rule,
)
from backend.app.schemas import CycleResidentChange, CycleRoomChange, DrawCycleCreate, EligibilityPolicyRule, EligibilityRuleSetCreate


class EligibilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_db = database.DB_PATH
        database.DB_PATH = Path(self.temp.name) / "fairroom-test.sqlite"
        database.init_db()
        with database.get_connection() as conn:
            self.a = conn.execute("SELECT id FROM buildings ORDER BY id LIMIT 1").fetchone()["id"]
            now = database.utc_now()
            self.b = conn.execute("""INSERT INTO buildings(building_name,society_name,redevelopment_project_name,full_address,city,district,state,pin_code,
                          number_of_wings,status,created_at,updated_at) VALUES('B','B Society','B Project','B Road','Mumbai','Mumbai','Maharashtra','400001',1,'Active',?,?)""",
                          (now, now)).lastrowid

    def tearDown(self):
        database.DB_PATH = self.previous_db
        self.temp.cleanup()

    def resident(self, building, name, household=3, income=None, verified=True):
        with database.get_connection() as conn:
            return conn.execute("""INSERT INTO residents(building_id,full_name,aadhaar_masked,aadhaar_hash,old_room_number,family_members,
                 contact_number,priority_category,building_wing,document_name,consent,verification_status,created_at,annual_income)
                 VALUES(?,?,?,?,?,?,?,'General','A',NULL,1,?,?,?)""",
                 (building, name, "XXXX-XXXX-1234", name, "OLD-" + name, household, "9456789012",
                  "Verified" if verified else "Pending Verification", database.utc_now(), income)).lastrowid

    def room(self, building, number):
        with database.get_connection() as conn:
            return conn.execute("""INSERT INTO rooms(building_id,room_number,wing,floor,size,status,suitable_for)
                                  VALUES(?,?,'A',1,'650 sq ft','Available','General')""", (building, number)).lastrowid

    def ruleset(self, building, name="Criteria", copy_from_id=None):
        return create_rule_set(building, EligibilityRuleSetCreate(name=name, copy_from_id=copy_from_id), admin="test")

    def rule(self, building, rule_set, name, field, operator, value=None, category="HARD_ELIGIBILITY", points=0):
        return add_rule(building, rule_set["id"], EligibilityPolicyRule(rule_name=name, category=category,
                        field_name=field, operator=operator, comparison_value=value, priority_points=points,
                        explanation=name + " policy."), admin="test")

    def cycle(self, building, residents, rooms, mode="Full Allocation", waiting=False):
        cycle = main.create_draw_cycle(building, DrawCycleCreate(draw_name="Test Draw", reason="Eligibility test",
                        lottery_mode=mode, waiting_list_enabled=waiting), admin="test")
        did = cycle["draw_id"]
        for rid in residents:
            main.cycle_resident(building, did, CycleResidentChange(resident_id=rid, include=True, reason="Test"), admin="test")
        for room_id in rooms:
            main.cycle_room(building, did, CycleRoomChange(room_id=room_id, include=True, reason="Test"), admin="test")
        main.confirm_cycle(building, did, admin="test")
        outcome = main.run_cycle(building, did, admin="test")
        self.assertNotEqual(outcome.get("status"), "Failed")
        return did

    def test_engine_rules_and_missing_values(self):
        base = {"id": 1, "verification_status": "Verified", "consent": 1, "family_members": 4,
                "annual_income": 50000, "date_of_birth": "2000-09-12", "residency_start_date": "2021-09-12"}
        self.assertTrue(evaluate_resident(base, None)["eligible"])
        self.assertFalse(evaluate_resident({**base, "verification_status": "Pending Verification"}, None)["eligible"])
        rules = [
            {"id": 1, "rule_name": "Income ceiling", "category": "HARD_ELIGIBILITY", "field_name": "annual_income",
             "operator": "less than or equal", "comparison_value": "50000", "priority_points": 0, "is_active": 1, "explanation": "Income limit."},
            {"id": 2, "rule_name": "Adult", "category": "HARD_ELIGIBILITY", "field_name": "age",
             "operator": "greater than or equal", "comparison_value": "26", "priority_points": 0, "is_active": 1, "explanation": "Minimum age."},
            {"id": 3, "rule_name": "Residence", "category": "HARD_ELIGIBILITY", "field_name": "residency_years",
             "operator": "between", "comparison_value": "5,10", "priority_points": 0, "is_active": 1, "explanation": "Residency years."},
            {"id": 4, "rule_name": "Household", "category": "PRIORITY", "field_name": "family_members",
             "operator": "greater than or equal", "comparison_value": "4", "priority_points": 10, "is_active": 1, "explanation": "Household points."},
            {"id": 5, "rule_name": "Income band", "category": "PRIORITY", "field_name": "annual_income",
             "operator": "less than", "comparison_value": "60000", "priority_points": 3, "is_active": 1, "explanation": "Income points."},
            {"id": 6, "rule_name": "Inactive", "category": "HARD_ELIGIBILITY", "field_name": "annual_income",
             "operator": "greater than", "comparison_value": "999999", "priority_points": 0, "is_active": 0, "explanation": "Inactive."},
        ]
        criteria = {"id": 1, "version": 1, "rules": rules}
        result = evaluate_resident(base, criteria, date(2026, 9, 12))
        self.assertTrue(result["eligible"])
        self.assertEqual(result["priority_score"], 13)
        self.assertEqual(result["rules_evaluated"], 5)
        self.assertFalse(evaluate_resident({**base, "annual_income": 50001}, criteria, date(2026, 9, 12))["eligible"])
        missing = evaluate_resident({**base, "annual_income": None}, criteria, date(2026, 9, 12))
        self.assertFalse(missing["eligible"])
        self.assertTrue(missing["results"][0]["missing_field"])
        self.assertFalse(evaluate_resident({**base, "date_of_birth": "2000-09-13"}, criteria, date(2026, 9, 12))["eligible"])
        for operator, value in [("equals", "x"), ("not equals", "y"), ("contains", "x"), ("exists", None), ("does not exist", None)]:
            validate_rule("resident_category", operator, value, "HARD_ELIGIBILITY", 0)
        for operator in ("is true", "is false"):
            validate_rule("consent", operator, None, "HARD_ELIGIBILITY", 0)
        with self.assertRaises(ValueError):
            validate_rule("annual_income", "contains", "5", "HARD_ELIGIBILITY", 0)
        with self.assertRaises(ValueError):
            validate_rule("annual_income", "between", "10,5", "HARD_ELIGIBILITY", 0)

    def test_versioned_full_draw_and_isolation(self):
        winner = self.resident(self.a, "Winner", household=4, income=40000)
        blocked = self.resident(self.a, "Blocked", household=1, income=90000)
        other = self.resident(self.b, "Other", household=1, income=90000)
        room_id = self.room(self.a, "A-101")
        v1 = self.ruleset(self.a)
        self.rule(self.a, v1, "Income ceiling", "annual_income", "less than or equal", "50000")
        self.rule(self.a, v1, "Large household", "family_members", "greater than or equal", "4", "PRIORITY", 10)
        activate_rule_set(self.a, v1["id"], admin="test")
        self.assertTrue(preview_resident(self.b, other, rule_set_id=None)["eligible"])
        self.assertFalse(preview_resident(self.a, blocked, rule_set_id=None)["eligible"])
        with self.assertRaises(HTTPException) as ctx:
            main.cycle_resident(self.a, main.create_draw_cycle(self.a, DrawCycleCreate(draw_name="Test Draw", reason="Test"), admin="test")["draw_id"],
                                CycleResidentChange(resident_id=blocked, include=True), admin="test")
        self.assertEqual(ctx.exception.status_code, 409)
        with database.get_connection() as conn:
            did = conn.execute("SELECT id FROM lottery_draws WHERE building_id=? AND status='Preparing'", (self.a,)).fetchone()["id"]
        main.cycle_resident(self.a, did, CycleResidentChange(resident_id=winner, include=True), admin="test")
        main.cycle_room(self.a, did, CycleRoomChange(room_id=room_id, include=True), admin="test")
        main.confirm_cycle(self.a, did, admin="test")
        main.run_cycle(self.a, did, admin="test")
        before = main.draw_details(self.a, did, admin="test")
        self.assertEqual(before["draw"]["rule_snapshot_version"], 1)
        self.assertEqual(before["draw"]["total_not_eligible"], 1)
        self.assertEqual(before["eligibility_snapshot"]["rule_set"]["rules"][0]["rule_name"], "Income ceiling")
        self.assertEqual(before["allocations"][0]["resident_id"], winner)
        v2 = self.ruleset(self.a, "Stricter", copy_from_id=v1["id"])
        rule = get_rule_set(self.a, v2["id"])["rules"][0]
        update_rule(self.a, v2["id"], rule["id"], EligibilityPolicyRule(rule_name="Income ceiling",
                    category="HARD_ELIGIBILITY", field_name="annual_income", operator="less than or equal",
                    comparison_value="30000"), admin="test")
        activate_rule_set(self.a, v2["id"], admin="test")
        self.assertEqual(main.draw_details(self.a, did, admin="test"), before)
        self.assertEqual(main.draw_history(self.a, admin="test")[0]["rule_snapshot_version"], 1)
        self.assertEqual(main.resident_history(self.a, blocked, admin="test")["eligibility_history"][0]["status"], "Ineligible")
        self.assertEqual(main.transparency_report(self.a)["eligibility"]["rule_version"], 1)
        self.assertTrue(any("Eligibility" in item["action"] for item in main.audit_logs(self.a, admin="test")))
        with self.assertRaises(HTTPException) as ctx:
            update_rule(self.a, v1["id"], rule["id"], EligibilityPolicyRule(rule_name="No", category="HARD_ELIGIBILITY",
                        field_name="annual_income", operator="exists"), admin="test")
        self.assertEqual(ctx.exception.status_code, 423)
        with self.assertRaises(HTTPException):
            preview_resident(self.b, winner, rule_set_id=None)
        with self.assertRaises(HTTPException):
            get_rule_set(self.b, v1["id"])

    def test_competitive_waiting_list(self):
        residents = [self.resident(self.a, f"Contestant{i}") for i in range(3)]
        room_id = self.room(self.a, "A-201")
        did = self.cycle(self.a, residents, [room_id], "Competitive Lottery", True)
        draw = main.draw_details(self.a, did, admin="test")
        self.assertEqual(draw["draw"]["total_allocated"], 1)
        self.assertEqual(draw["draw"]["total_waiting_list"], 2)
        self.assertEqual(draw["draw"]["total_not_selected"], 0)
        self.assertEqual(len([a for a in draw["allocations"] if a["allocation_status"] == "Waiting List"]), 2)
        self.assertIsNone(draw["draw"]["rule_snapshot_version"])

    def test_authentication_requires_token(self):
        with self.assertRaises(HTTPException) as ctx:
            require_admin(None)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_migration_is_idempotent_and_preserves_existing_records(self):
        rid = self.resident(self.a, "Existing", income=45000)
        room_id = self.room(self.a, "A-301")
        database.init_db()
        with database.get_connection() as conn:
            self.assertEqual(conn.execute("SELECT annual_income FROM residents WHERE id=?", (rid,)).fetchone()[0], 45000)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM rooms WHERE id=?", (room_id,)).fetchone()[0], 1)
            self.assertIn("eligibility_rule_set_id", database._columns(conn, "lottery_draws"))
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM eligibility_rule_sets").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
