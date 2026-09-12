from __future__ import annotations

import hashlib
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.getenv("AI_LOTTERY_DB", BASE_DIR / "lottery.db"))

PRIORITY_CATEGORIES = [
    "Senior Citizen",
    "Disabled",
    "Widow",
    "Medical Emergency",
    "Large Family",
    "General",
]

ROOM_STATUSES = ["Available", "Allocated", "Reserved"]

DEMO_SOCIETY = {
    "name": "Sai Darshan CHS",
    "address": "Dadar, Mumbai, Maharashtra",
    "redevelopment_project_name": "Sai Darshan Redevelopment Phase 1",
}

DEMO_RESIDENTS = [
    ("Ramesh Patil", "700000000001", "OLD-A-101", 3, "9876543210", "Senior Citizen", "A", "ramesh-patil-id.pdf"),
    ("Sunita Shinde", "700000000002", "OLD-A-102", 2, "9876543211", "Widow", "A", "sunita-shinde-id.pdf"),
    ("Amit More", "700000000003", "OLD-B-101", 4, "9876543212", "Disabled", "B", "amit-more-id.pdf"),
    ("Priya Kadam", "700000000004", "OLD-B-102", 4, "9876543213", "General", "B", "priya-kadam-id.pdf"),
    ("Nilesh Sawant", "700000000005", "OLD-A-201", 5, "9876543214", "General", "A", "nilesh-sawant-id.pdf"),
]

DEMO_ROOM_NUMBERS = [
    "A-101",
    "A-102",
    "A-103",
    "A-104",
    "A-201",
    "A-202",
    "A-203",
    "A-204",
    "B-101",
    "B-102",
    "B-103",
    "B-104",
    "B-201",
    "B-202",
    "B-203",
    "B-204",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_identifier(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", value or "").upper()


def hash_identifier(value: str) -> str:
    return hashlib.sha256(normalize_identifier(value).encode("utf-8")).hexdigest()


def mask_identifier(value: str) -> str:
    normalized = normalize_identifier(value)
    last_four = normalized[-4:] if len(normalized) >= 4 else normalized
    return f"XXXX-XXXX-{last_four}" if last_four else "XXXX-XXXX"


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS society (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                redevelopment_project_name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS residents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                aadhaar_masked TEXT NOT NULL,
                aadhaar_hash TEXT NOT NULL UNIQUE,
                old_room_number TEXT NOT NULL UNIQUE,
                family_members INTEGER NOT NULL,
                contact_number TEXT NOT NULL,
                priority_category TEXT NOT NULL,
                building_wing TEXT NOT NULL,
                document_name TEXT,
                consent INTEGER NOT NULL DEFAULT 0,
                verification_status TEXT NOT NULL DEFAULT 'Pending Verification',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_number TEXT NOT NULL UNIQUE,
                wing TEXT NOT NULL,
                floor INTEGER NOT NULL,
                size TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Available',
                suitable_for TEXT NOT NULL DEFAULT 'General'
            );

            CREATE TABLE IF NOT EXISTS allocations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                resident_id INTEGER NOT NULL UNIQUE,
                room_id INTEGER NOT NULL UNIQUE,
                priority_category TEXT NOT NULL,
                allocation_reason TEXT NOT NULL,
                lottery_seed TEXT NOT NULL,
                fairness_score REAL NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (resident_id) REFERENCES residents(id),
                FOREIGN KEY (room_id) REFERENCES rooms(id)
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                performed_by TEXT NOT NULL,
                details TEXT NOT NULL,
                reason TEXT,
                timestamp TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
    migrate_multibuilding()
    migrate_google_maps()
    migrate_history()
    migrate_eligibility_rules()


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def migrate_multibuilding() -> None:
    """Idempotently assign the legacy single-project database to one default building."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS buildings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                building_name TEXT NOT NULL,
                society_name TEXT NOT NULL,
                redevelopment_project_name TEXT NOT NULL,
                full_address TEXT NOT NULL,
                city TEXT NOT NULL,
                district TEXT NOT NULL,
                state TEXT NOT NULL,
                pin_code TEXT NOT NULL,
                number_of_wings INTEGER NOT NULL DEFAULT 0,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Setup',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                archived_at TEXT,
                UNIQUE(building_name, society_name)
            );
            CREATE TABLE IF NOT EXISTS building_settings (
                building_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY(building_id, key),
                FOREIGN KEY(building_id) REFERENCES buildings(id)
            );
            """
        )
        default = conn.execute(
            "SELECT id FROM buildings WHERE building_name=? AND society_name=?",
            ("Sai Darshan Building", "Sai Darshan CHS"),
        ).fetchone()
        if default is None:
            now = utc_now()
            cursor = conn.execute(
                """INSERT INTO buildings (building_name,society_name,redevelopment_project_name,full_address,city,district,state,pin_code,number_of_wings,description,status,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("Sai Darshan Building", "Sai Darshan CHS", "Sai Darshan Redevelopment Phase 1", "Dadar, Mumbai, Maharashtra", "Mumbai", "Mumbai City", "Maharashtra", "400014", 2, "Migrated default building", "Active", now, now),
            )
            default_id = cursor.lastrowid
        else:
            default_id = default["id"]

        if "building_id" not in _columns(conn, "residents"):
            conn.executescript("ALTER TABLE residents RENAME TO residents_legacy;")
            conn.execute("""CREATE TABLE residents (id INTEGER PRIMARY KEY AUTOINCREMENT, building_id INTEGER NOT NULL, full_name TEXT NOT NULL, aadhaar_masked TEXT NOT NULL, aadhaar_hash TEXT NOT NULL UNIQUE, old_room_number TEXT NOT NULL, family_members INTEGER NOT NULL, contact_number TEXT NOT NULL, priority_category TEXT NOT NULL, building_wing TEXT NOT NULL, document_name TEXT, consent INTEGER NOT NULL DEFAULT 0, verification_status TEXT NOT NULL DEFAULT 'Pending Verification', created_at TEXT NOT NULL, FOREIGN KEY(building_id) REFERENCES buildings(id), UNIQUE(building_id, old_room_number))""")
            conn.execute("""INSERT INTO residents SELECT id, ?, full_name,aadhaar_masked,aadhaar_hash,old_room_number,family_members,contact_number,priority_category,building_wing,document_name,consent,verification_status,created_at FROM residents_legacy""", (default_id,))
            conn.execute("DROP TABLE residents_legacy")
        if "building_id" not in _columns(conn, "rooms"):
            conn.execute("ALTER TABLE rooms RENAME TO rooms_legacy")
            conn.execute("""CREATE TABLE rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, building_id INTEGER NOT NULL, room_number TEXT NOT NULL, wing TEXT NOT NULL, floor INTEGER NOT NULL, size TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Available', suitable_for TEXT NOT NULL DEFAULT 'General', FOREIGN KEY(building_id) REFERENCES buildings(id), UNIQUE(building_id, room_number))""")
            conn.execute("INSERT INTO rooms SELECT id, ?, room_number,wing,floor,size,status,suitable_for FROM rooms_legacy", (default_id,))
            conn.execute("DROP TABLE rooms_legacy")
        if "building_id" not in _columns(conn, "allocations"):
            conn.execute("ALTER TABLE allocations RENAME TO allocations_legacy")
            conn.execute("""CREATE TABLE allocations (id INTEGER PRIMARY KEY AUTOINCREMENT, building_id INTEGER NOT NULL, resident_id INTEGER NOT NULL UNIQUE, room_id INTEGER NOT NULL UNIQUE, priority_category TEXT NOT NULL, allocation_reason TEXT NOT NULL, lottery_seed TEXT NOT NULL, fairness_score REAL NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(building_id) REFERENCES buildings(id), FOREIGN KEY(resident_id) REFERENCES residents(id), FOREIGN KEY(room_id) REFERENCES rooms(id))""")
            conn.execute("INSERT INTO allocations SELECT id, ?, resident_id,room_id,priority_category,allocation_reason,lottery_seed,fairness_score,created_at FROM allocations_legacy", (default_id,))
            conn.execute("DROP TABLE allocations_legacy")
        if "building_id" not in _columns(conn, "audit_logs"):
            conn.execute("ALTER TABLE audit_logs ADD COLUMN building_id INTEGER REFERENCES buildings(id)")
            conn.execute("UPDATE audit_logs SET building_id=? WHERE building_id IS NULL", (default_id,))
        conn.executescript("CREATE INDEX IF NOT EXISTS idx_residents_building ON residents(building_id); CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id); CREATE INDEX IF NOT EXISTS idx_allocations_building ON allocations(building_id); CREATE INDEX IF NOT EXISTS idx_audit_building ON audit_logs(building_id);")
        for key in ("lottery_locked", "lottery_seed", "lottery_started_at", "lottery_completed_at", "fairness_score"):
            row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            if row:
                conn.execute("INSERT OR IGNORE INTO building_settings(building_id,key,value) VALUES(?,?,?)", (default_id, key, row["value"]))
        conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('multibuilding_migrated','true')")
        conn.commit()
    finally:
        conn.close()


def migrate_google_maps() -> None:
    """Add optional building map metadata without rewriting existing records."""
    with get_connection() as conn:
        columns = _columns(conn, "buildings")
        additions = {
            "latitude": "REAL",
            "longitude": "REAL",
            "map_zoom": "INTEGER DEFAULT 17",
            "location_status": "TEXT DEFAULT 'Not Set'",
            "location_updated_at": "TEXT",
            "google_place_id": "TEXT",
        }
        for name, definition in additions.items():
            if name not in columns:
                conn.execute(f"ALTER TABLE buildings ADD COLUMN {name} {definition}")
        conn.execute("UPDATE buildings SET map_zoom=17 WHERE map_zoom IS NULL")
        conn.execute(
            """UPDATE buildings
               SET location_status=CASE
                 WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 'Manual'
                 ELSE 'Not Set'
               END
               WHERE location_status IS NULL OR location_status NOT IN ('Not Set','Located','Manual','Failed')"""
        )


HISTORY_RULES = "Verified residents with consent only; building-scoped rooms; priority ordering; deterministic seeded shuffle; one resident per room; no manual override."


def migrate_history() -> None:
    """Create immutable history tables and snapshot any legacy completed building draw once."""
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS lottery_draws (
              id INTEGER PRIMARY KEY AUTOINCREMENT, building_id INTEGER NOT NULL, draw_number INTEGER NOT NULL,
              draw_reference TEXT NOT NULL UNIQUE, draw_name TEXT NOT NULL, status TEXT NOT NULL,
              lottery_seed TEXT, algorithm_version TEXT NOT NULL DEFAULT '1.0', fairness_score REAL NOT NULL DEFAULT 0,
              total_residents INTEGER NOT NULL DEFAULT 0, total_verified_residents INTEGER NOT NULL DEFAULT 0,
              total_rooms INTEGER NOT NULL DEFAULT 0, total_available_rooms INTEGER NOT NULL DEFAULT 0,
              total_allocated INTEGER NOT NULL DEFAULT 0, total_unallocated INTEGER NOT NULL DEFAULT 0,
              started_at TEXT, completed_at TEXT, performed_by_admin TEXT,
              building_name_snapshot TEXT NOT NULL, society_name_snapshot TEXT NOT NULL,
              project_name_snapshot TEXT NOT NULL, address_snapshot TEXT NOT NULL, rules_snapshot TEXT NOT NULL,
              failure_reason TEXT, created_at TEXT NOT NULL, archived_at TEXT,
              FOREIGN KEY(building_id) REFERENCES buildings(id), UNIQUE(building_id, draw_number)
            );
            CREATE TABLE IF NOT EXISTS draw_allocations (
              id INTEGER PRIMARY KEY AUTOINCREMENT, draw_id INTEGER NOT NULL, building_id INTEGER NOT NULL,
              resident_id INTEGER, room_id INTEGER, resident_name_snapshot TEXT NOT NULL,
              aadhaar_masked_snapshot TEXT NOT NULL, old_room_snapshot TEXT NOT NULL,
              family_members_snapshot INTEGER NOT NULL, priority_category_snapshot TEXT NOT NULL,
              verification_status_snapshot TEXT NOT NULL, allocated_room_snapshot TEXT,
              room_wing_snapshot TEXT, room_floor_snapshot INTEGER, room_size_snapshot TEXT,
              allocation_status TEXT NOT NULL, allocation_reason TEXT, ai_explanation TEXT,
              fairness_score REAL NOT NULL, allocated_at TEXT, created_at TEXT NOT NULL,
              FOREIGN KEY(draw_id) REFERENCES lottery_draws(id), FOREIGN KEY(building_id) REFERENCES buildings(id),
              UNIQUE(draw_id, resident_id)
            );
            CREATE TABLE IF NOT EXISTS resident_history_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT, building_id INTEGER NOT NULL, resident_id INTEGER NOT NULL,
              draw_id INTEGER, event_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
              previous_value TEXT, new_value TEXT, performed_by TEXT NOT NULL, created_at TEXT NOT NULL,
              FOREIGN KEY(building_id) REFERENCES buildings(id), FOREIGN KEY(draw_id) REFERENCES lottery_draws(id)
            );
            CREATE INDEX IF NOT EXISTS idx_draws_building ON lottery_draws(building_id, draw_number);
            CREATE INDEX IF NOT EXISTS idx_draw_allocations_draw ON draw_allocations(draw_id, building_id);
            CREATE INDEX IF NOT EXISTS idx_resident_history_building ON resident_history_events(building_id, resident_id, created_at);
            """
        )
        if "draw_id" not in _columns(conn, "allocations"):
            conn.execute("ALTER TABLE allocations ADD COLUMN draw_id INTEGER REFERENCES lottery_draws(id)")
        cycle_columns = {
            "phase_name": "TEXT", "creation_reason": "TEXT", "planned_draw_date": "TEXT",
            "notes": "TEXT", "cancellation_reason": "TEXT", "eligibility_confirmed_at": "TEXT",
            "lottery_mode": "TEXT NOT NULL DEFAULT 'Full Allocation'",
            "waiting_list_enabled": "INTEGER NOT NULL DEFAULT 0",
            "total_eligible": "INTEGER NOT NULL DEFAULT 0",
            "total_not_selected": "INTEGER NOT NULL DEFAULT 0",
            "total_waiting_list": "INTEGER NOT NULL DEFAULT 0"
        }
        for name, kind in cycle_columns.items():
            if name not in _columns(conn, "lottery_draws"):
                conn.execute(f"ALTER TABLE lottery_draws ADD COLUMN {name} {kind}")
        for name in ("draw_id", "resident_id", "room_id"):
            if name not in _columns(conn, "audit_logs"):
                conn.execute(f"ALTER TABLE audit_logs ADD COLUMN {name} INTEGER")
        if "waiting_list_position" not in _columns(conn, "draw_allocations"):
            conn.execute("ALTER TABLE draw_allocations ADD COLUMN waiting_list_position INTEGER")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS draw_cycle_residents (
              id INTEGER PRIMARY KEY AUTOINCREMENT, draw_id INTEGER NOT NULL, building_id INTEGER NOT NULL,
              resident_id INTEGER NOT NULL, eligibility_status TEXT NOT NULL, inclusion_reason TEXT,
              exclusion_reason TEXT, priority_snapshot TEXT NOT NULL, old_room_snapshot TEXT NOT NULL,
              verification_status_snapshot TEXT NOT NULL, added_by_admin TEXT NOT NULL, added_at TEXT NOT NULL,
              override_reason TEXT, UNIQUE(draw_id,resident_id), FOREIGN KEY(draw_id) REFERENCES lottery_draws(id)
            );
            CREATE TABLE IF NOT EXISTS draw_cycle_rooms (
              id INTEGER PRIMARY KEY AUTOINCREMENT, draw_id INTEGER NOT NULL, building_id INTEGER NOT NULL,
              room_id INTEGER NOT NULL, eligibility_status TEXT NOT NULL, inclusion_reason TEXT,
              exclusion_reason TEXT, room_number_snapshot TEXT NOT NULL, wing_snapshot TEXT NOT NULL,
              floor_snapshot INTEGER NOT NULL, size_snapshot TEXT NOT NULL, added_by_admin TEXT NOT NULL,
              added_at TEXT NOT NULL, UNIQUE(draw_id,room_id), FOREIGN KEY(draw_id) REFERENCES lottery_draws(id)
            );
            CREATE INDEX IF NOT EXISTS idx_cycle_residents_draw ON draw_cycle_residents(draw_id,building_id);
            CREATE INDEX IF NOT EXISTS idx_cycle_rooms_draw ON draw_cycle_rooms(draw_id,building_id);
            CREATE TABLE IF NOT EXISTS draw_waiting_list (
              id INTEGER PRIMARY KEY AUTOINCREMENT, building_id INTEGER NOT NULL, draw_id INTEGER NOT NULL,
              resident_id INTEGER NOT NULL, position INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Waiting List',
              created_at TEXT NOT NULL, FOREIGN KEY(draw_id) REFERENCES lottery_draws(id),
              UNIQUE(draw_id, resident_id), UNIQUE(draw_id, position)
            );
            CREATE INDEX IF NOT EXISTS idx_waiting_list_draw ON draw_waiting_list(draw_id, building_id, position);
            """
        )
        for building in conn.execute("SELECT * FROM buildings").fetchall():
            bid = building["id"]
            count = conn.execute("SELECT COUNT(*) count FROM allocations WHERE building_id=?", (bid,)).fetchone()["count"]
            exists = conn.execute("SELECT id FROM lottery_draws WHERE building_id=? AND draw_number=1", (bid,)).fetchone()
            if not count or exists:
                continue
            seed = get_setting(conn, "lottery_seed", "legacy", bid) or "legacy"
            completed = get_setting(conn, "lottery_completed_at", utc_now(), bid) or utc_now()
            score = float(get_setting(conn, "fairness_score", "0", bid) or 0)
            verified = conn.execute("SELECT COUNT(*) count FROM residents WHERE building_id=? AND verification_status='Verified'", (bid,)).fetchone()["count"]
            rooms = conn.execute("SELECT COUNT(*) count FROM rooms WHERE building_id=?", (bid,)).fetchone()["count"]
            available = conn.execute("SELECT COUNT(*) count FROM rooms WHERE building_id=? AND status='Available'", (bid,)).fetchone()["count"]
            ref = f"B{bid}-{completed[:4]}-DRAW-001"
            cur = conn.execute("""INSERT INTO lottery_draws(building_id,draw_number,draw_reference,draw_name,status,lottery_seed,algorithm_version,fairness_score,total_residents,total_verified_residents,total_rooms,total_available_rooms,total_allocated,total_unallocated,started_at,completed_at,performed_by_admin,building_name_snapshot,society_name_snapshot,project_name_snapshot,address_snapshot,rules_snapshot,created_at) VALUES(?,1,?,'Migrated Draw 1','Completed',?,'1.0',?,?,?,?,?,?,0,?,?,?, ?,?,?,?, ?,?)""", (bid,ref,seed,score,conn.execute("SELECT COUNT(*) count FROM residents WHERE building_id=?",(bid,)).fetchone()["count"],verified,rooms,available,count,completed,completed,"Migration",building["building_name"],building["society_name"],building["redevelopment_project_name"],building["full_address"],HISTORY_RULES,utc_now()))
            draw_id = cur.lastrowid
            _snapshot_allocations(conn, bid, draw_id)
            conn.execute("UPDATE allocations SET draw_id=? WHERE building_id=? AND draw_id IS NULL", (draw_id,bid))


def migrate_eligibility_rules() -> None:
    """Add building-scoped eligibility configuration and immutable draw snapshots safely."""
    with get_connection() as conn:
        for name, definition in {"date_of_birth": "TEXT", "residency_start_date": "TEXT", "resident_category": "TEXT", "annual_income": "REAL"}.items():
            if name not in _columns(conn, "residents"):
                conn.execute(f"ALTER TABLE residents ADD COLUMN {name} {definition}")
        for name, definition in {"total_not_eligible": "INTEGER NOT NULL DEFAULT 0", "rule_snapshot_version": "INTEGER", "eligibility_rule_set_id": "INTEGER"}.items():
            if name not in _columns(conn, "lottery_draws"):
                conn.execute(f"ALTER TABLE lottery_draws ADD COLUMN {name} {definition}")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS eligibility_rules (
              id INTEGER PRIMARY KEY AUTOINCREMENT, building_id INTEGER NOT NULL,
              rule_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', rule_type TEXT NOT NULL,
              rule_category TEXT NOT NULL DEFAULT 'Mandatory Eligibility', operator TEXT NOT NULL,
              value TEXT, priority INTEGER NOT NULL DEFAULT 100, priority_points INTEGER NOT NULL DEFAULT 0,
              is_required INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1,
              created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              FOREIGN KEY(building_id) REFERENCES buildings(id), UNIQUE(building_id, rule_name)
            );
            CREATE TABLE IF NOT EXISTS eligibility_evaluations (
              id INTEGER PRIMARY KEY AUTOINCREMENT, draw_id INTEGER, building_id INTEGER NOT NULL, resident_id INTEGER NOT NULL,
              status TEXT NOT NULL, eligible INTEGER NOT NULL, priority_score INTEGER NOT NULL DEFAULT 0,
              rules_evaluated INTEGER NOT NULL DEFAULT 0, rules_passed INTEGER NOT NULL DEFAULT 0, rules_failed INTEGER NOT NULL DEFAULT 0,
              results_json TEXT NOT NULL, evaluated_at TEXT NOT NULL,
              FOREIGN KEY(draw_id) REFERENCES lottery_draws(id), UNIQUE(draw_id, resident_id)
            );
            CREATE TABLE IF NOT EXISTS draw_rule_snapshots (
              id INTEGER PRIMARY KEY AUTOINCREMENT, draw_id INTEGER NOT NULL UNIQUE, building_id INTEGER NOT NULL,
              rules_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(draw_id) REFERENCES lottery_draws(id)
            );
            CREATE INDEX IF NOT EXISTS idx_rules_building ON eligibility_rules(building_id, is_active, priority);
            CREATE INDEX IF NOT EXISTS idx_evaluations_draw ON eligibility_evaluations(draw_id, building_id, resident_id);
            CREATE TABLE IF NOT EXISTS eligibility_rule_sets (
              id INTEGER PRIMARY KEY AUTOINCREMENT, building_id INTEGER NOT NULL REFERENCES buildings(id),
              version INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL CHECK(status IN ('Draft','Active','Inactive')),
              created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              UNIQUE(building_id, version)
            );
            CREATE TABLE IF NOT EXISTS eligibility_rule_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT, rule_set_id INTEGER NOT NULL REFERENCES eligibility_rule_sets(id),
              rule_name TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('HARD_ELIGIBILITY','PRIORITY')),
              field_name TEXT NOT NULL, operator TEXT NOT NULL, comparison_value TEXT,
              priority_points INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
              explanation TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 100,
              created_at TEXT NOT NULL, UNIQUE(rule_set_id, rule_name)
            );
            CREATE INDEX IF NOT EXISTS idx_rule_sets_building ON eligibility_rule_sets(building_id, status, version);
            """
        )


def add_resident_history(conn: sqlite3.Connection, building_id: int, resident_id: int, event_type: str, title: str, description: str, performed_by: str, draw_id: int | None = None, previous_value: str | None = None, new_value: str | None = None) -> None:
    conn.execute("INSERT INTO resident_history_events(building_id,resident_id,draw_id,event_type,title,description,previous_value,new_value,performed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (building_id,resident_id,draw_id,event_type,title,description,previous_value,new_value,performed_by,utc_now()))


def _snapshot_allocations(conn: sqlite3.Connection, building_id: int, draw_id: int, performed_by: str = "Migration", cycle_only: bool = False) -> None:
    allocation_filter = " AND a.draw_id=?" if cycle_only else ""
    params = (building_id, draw_id) if cycle_only else (building_id,)
    rows = conn.execute("""SELECT a.*,r.full_name,r.aadhaar_masked,r.old_room_number,r.family_members,r.priority_category resident_priority,r.verification_status,rm.room_number,rm.wing,rm.floor,rm.size FROM allocations a JOIN residents r ON r.id=a.resident_id JOIN rooms rm ON rm.id=a.room_id WHERE a.building_id=?""" + allocation_filter, params).fetchall()
    mode = conn.execute("SELECT lottery_mode FROM lottery_draws WHERE id=?", (draw_id,)).fetchone()
    winner_status = "Winner" if mode and mode["lottery_mode"] == "Competitive Lottery" else "Allocated"
    for row in rows:
        conn.execute("""INSERT OR IGNORE INTO draw_allocations(draw_id,building_id,resident_id,room_id,resident_name_snapshot,aadhaar_masked_snapshot,old_room_snapshot,family_members_snapshot,priority_category_snapshot,verification_status_snapshot,allocated_room_snapshot,room_wing_snapshot,room_floor_snapshot,room_size_snapshot,allocation_status,allocation_reason,ai_explanation,fairness_score,allocated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?)""", (draw_id,building_id,row["resident_id"],row["room_id"],row["full_name"],row["aadhaar_masked"],row["old_room_number"],row["family_members"],row["resident_priority"],row["verification_status"],row["room_number"],row["wing"],row["floor"],row["size"],winner_status,row["allocation_reason"],row["allocation_reason"],row["fairness_score"],row["created_at"],utc_now()))
        add_resident_history(conn,building_id,row["resident_id"],"Included In Draw","Included In Draw",f"Included in historical draw {draw_id}.",performed_by,draw_id)
        add_resident_history(conn,building_id,row["resident_id"],"Room Allocated","Room Allocated",f"Allocated Room {row['room_number']}.",performed_by,draw_id,new_value=row["room_number"])
    if cycle_only:
        unallocated = conn.execute("""SELECT r.* FROM draw_cycle_residents cr JOIN residents r ON r.id=cr.resident_id WHERE cr.draw_id=? AND cr.building_id=? AND cr.eligibility_status='Included' AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.resident_id=r.id AND a.draw_id=?)""", (draw_id,building_id,draw_id)).fetchall()
    else:
        unallocated = conn.execute("""SELECT r.* FROM residents r WHERE r.building_id=? AND r.verification_status='Verified' AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.resident_id=r.id AND a.building_id=?)""", (building_id,building_id)).fetchall()
    for row in unallocated:
        conn.execute("""INSERT OR IGNORE INTO draw_allocations(draw_id,building_id,resident_id,room_id,resident_name_snapshot,aadhaar_masked_snapshot,old_room_snapshot,family_members_snapshot,priority_category_snapshot,verification_status_snapshot,allocated_room_snapshot,room_wing_snapshot,room_floor_snapshot,room_size_snapshot,allocation_status,allocation_reason,ai_explanation,fairness_score,allocated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Unallocated',?,?,0,NULL,?)""", (draw_id,building_id,row["id"],None,row["full_name"],row["aadhaar_masked"],row["old_room_number"],row["family_members"],row["priority_category"],row["verification_status"],None,None,None,None,"No available room was allocated.","Resident remained unallocated in this draw.",utc_now()))
        add_resident_history(conn,building_id,row["id"],"Unallocated","Unallocated","No room was allocated in this draw.",performed_by,draw_id)


def get_setting(conn: sqlite3.Connection, key: str, default: str | None = None, building_id: int | None = None) -> str | None:
    if building_id is not None:
        row = conn.execute("SELECT value FROM building_settings WHERE building_id=? AND key=?", (building_id, key)).fetchone()
        return row["value"] if row else default
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn: sqlite3.Connection, key: str, value: str, building_id: int | None = None) -> None:
    if building_id is not None:
        conn.execute("INSERT INTO building_settings(building_id,key,value) VALUES(?,?,?) ON CONFLICT(building_id,key) DO UPDATE SET value=excluded.value", (building_id, key, value))
        return
    conn.execute(
        """
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )


def is_lottery_locked(conn: sqlite3.Connection, building_id: int | None = None) -> bool:
    return get_setting(conn, "lottery_locked", "false", building_id) == "true"


def add_audit(
    conn: sqlite3.Connection,
    action: str,
    performed_by: str,
    details: str,
    reason: str | None = None,
    building_id: int | None = None,
    draw_id: int | None = None,
    resident_id: int | None = None,
    room_id: int | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO audit_logs (action, performed_by, details, reason, timestamp, building_id, draw_id, resident_id, room_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (action, performed_by, details, reason, utc_now(), building_id, draw_id, resident_id, room_id),
    )


def _seed_society(conn: sqlite3.Connection, society: dict[str, str]) -> None:
    conn.execute(
        """
        INSERT INTO society (name, address, redevelopment_project_name)
        VALUES (?, ?, ?)
        """,
        (
            society["name"],
            society["address"],
            society["redevelopment_project_name"],
        ),
    )


def _seed_resident(
    conn: sqlite3.Connection,
    resident: tuple[str, str, str, int, str, str, str, str],
    verification_status: str,
    building_id: int,
) -> None:
    aadhaar = resident[1]
    conn.execute(
        """
        INSERT INTO residents (
            building_id, full_name, aadhaar_masked, aadhaar_hash, old_room_number, family_members,
            contact_number, priority_category, building_wing, document_name, consent,
            verification_status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (
            building_id, resident[0],
            mask_identifier(aadhaar),
            hash_identifier(aadhaar),
            resident[2],
            resident[3],
            resident[4],
            resident[5],
            resident[6],
            resident[7],
            verification_status,
            utc_now(),
        ),
    )


def _seed_room(conn: sqlite3.Connection, room_number: str, building_id: int) -> None:
    wing, flat = room_number.split("-", 1)
    floor = int(flat[0])
    suitable_for = "Lower floor, senior citizen and wheelchair-friendly" if floor == 1 else "General"
    size = "640 sq ft" if floor == 1 else "660 sq ft"
    conn.execute(
        """
        INSERT INTO rooms (building_id, room_number, wing, floor, size, status, suitable_for)
        VALUES (?, ?, ?, ?, ?, 'Available', ?)
        """,
        (building_id, room_number, wing, floor, size, suitable_for),
    )


def reset_demo_data(performed_by: str = "Admin", building_id: int | None = None) -> dict[str, Any]:
    with get_connection() as conn:
        if building_id is None:
            building_id = conn.execute("SELECT id FROM buildings WHERE archived_at IS NULL ORDER BY id LIMIT 1").fetchone()["id"]
        building = conn.execute("SELECT * FROM buildings WHERE id=? AND archived_at IS NULL", (building_id,)).fetchone()
        if not building:
            raise ValueError("Building not found.")
        has_history = conn.execute("SELECT EXISTS(SELECT 1 FROM lottery_draws WHERE building_id=? AND status='Completed') value", (building_id,)).fetchone()["value"]
        conn.execute("DELETE FROM allocations WHERE building_id=?", (building_id,))
        # A normal reset never erases residents referenced by permanent history.
        if not has_history:
            conn.execute("DELETE FROM resident_history_events WHERE building_id=?", (building_id,))
            conn.execute("DELETE FROM residents WHERE building_id=?", (building_id,))
        conn.execute("DELETE FROM rooms WHERE building_id=?", (building_id,))
        if not has_history:
            conn.execute("DELETE FROM audit_logs WHERE building_id=?", (building_id,))
        conn.execute("DELETE FROM building_settings WHERE building_id=?", (building_id,))
        set_setting(conn, "lottery_locked", "false", building_id)
        for room_number in DEMO_ROOM_NUMBERS:
            _seed_room(conn, room_number, building_id)
        if not has_history:
            for resident in DEMO_RESIDENTS:
                _seed_resident(conn, resident, "Pending Verification", building_id)

        add_audit(
            conn,
            "Demo Data Reset",
            performed_by,
            "DEMO ONLY reset cleared previous demo data and re-seeded society, residents, and rooms.",
            building_id=building_id,
        )

        return {
            "message": "Demo data reset successfully. The lottery is now unlocked.",
            "society": DEMO_SOCIETY,
            "residents_seeded": 0 if has_history else len(DEMO_RESIDENTS),
            "rooms_seeded": len(DEMO_ROOM_NUMBERS),
            "lottery_locked": False,
            "building_id": building_id,
        }


def insert_sample_data() -> None:
    with get_connection() as conn:
        building_id = conn.execute("SELECT id FROM buildings WHERE archived_at IS NULL ORDER BY id LIMIT 1").fetchone()["id"]
        society_count = conn.execute("SELECT COUNT(*) AS count FROM society").fetchone()["count"]
        if society_count == 0:
            _seed_society(
                conn,
                {
                    "name": "Shree Ganesh Redevelopment Society",
                    "address": "Mumbai, Maharashtra",
                    "redevelopment_project_name": "Wing A and B Redevelopment Allocation",
                },
            )

        resident_count = conn.execute("SELECT COUNT(*) AS count FROM residents WHERE building_id=?", (building_id,)).fetchone()["count"]
        if resident_count == 0:
            residents = [
                ("Ramesh Patil", "123456789012", "OLD-A-101", 4, "9876543210", "Senior Citizen", "A", "ramesh-id.pdf", 1, "Verified"),
                ("Sunita Joshi", "223456789012", "OLD-A-102", 3, "9867543210", "Widow", "A", "sunita-id.pdf", 1, "Verified"),
                ("Amit Shah", "323456789012", "OLD-A-201", 6, "9767543210", "Large Family", "A", "amit-id.pdf", 1, "Verified"),
                ("Fatima Khan", "423456789012", "OLD-B-101", 2, "9667543210", "Disabled", "B", "fatima-id.pdf", 1, "Verified"),
                ("Meena Desai", "523456789012", "OLD-B-202", 5, "9567543210", "Medical Emergency", "B", "meena-id.pdf", 1, "Verified"),
                ("Vikram Nair", "623456789012", "OLD-C-301", 4, "9467543210", "General", "C", "vikram-id.pdf", 1, "Verified"),
                ("Priya More", "723456789012", "OLD-C-302", 2, "9367543210", "General", "C", "priya-id.pdf", 1, "Pending Verification"),
            ]
            for resident in residents:
                _seed_resident(conn, resident[:8], resident[9], building_id)

        room_count = conn.execute("SELECT COUNT(*) AS count FROM rooms WHERE building_id=?", (building_id,)).fetchone()["count"]
        if room_count == 0:
            rooms = [
                ("A-101", "A", 1, "620 sq ft", "Available", "Wheelchair-friendly, lower floor, senior citizen suitable"),
                ("A-102", "A", 1, "610 sq ft", "Available", "Lower floor, senior citizen suitable"),
                ("A-201", "A", 2, "650 sq ft", "Available", "Senior citizen suitable"),
                ("A-202", "A", 2, "690 sq ft", "Available", "Large family suitable"),
                ("A-301", "A", 3, "620 sq ft", "Available", "General"),
                ("B-101", "B", 1, "640 sq ft", "Available", "Wheelchair-friendly, lower floor"),
                ("B-201", "B", 2, "700 sq ft", "Available", "Large family suitable"),
                ("B-301", "B", 3, "620 sq ft", "Reserved", "General"),
            ]
            for room in rooms:
                conn.execute(
                    """
                    INSERT INTO rooms (building_id, room_number, wing, floor, size, status, suitable_for)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (building_id, *room),
                )

        audit_count = conn.execute("SELECT COUNT(*) AS count FROM audit_logs").fetchone()["count"]
        if audit_count == 0:
            add_audit(conn, "Sample data loaded", "System", "Initial residents and rooms were loaded for MVP demonstration.", building_id=building_id)
