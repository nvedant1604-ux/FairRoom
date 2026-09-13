from __future__ import annotations

import asyncio
import json
from urllib.parse import urlsplit

from backend.app import database, main
from backend.app.auth import hash_password
from backend.app.schemas import CycleResidentChange, CycleRoomChange, DrawCycleCreate


class Response:
    def __init__(self, status_code, body, headers):
        self.status_code = status_code
        self.body = body
        self.headers = headers

    def json(self):
        return json.loads(self.body)


class AsgiClient:
    """Tiny standard-library ASGI client for the project's installed dependencies."""
    def __init__(self, app):
        self.app = app

    def request(self, method, url, json_body=None, headers=None):
        parsed = urlsplit(url)
        body = json.dumps(json_body).encode() if json_body is not None else b""
        raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
        if json_body is not None:
            raw_headers.append((b"content-type", b"application/json"))

        async def run():
            messages = []
            sent = False

            async def receive():
                nonlocal sent
                if not sent:
                    sent = True
                    return {"type": "http.request", "body": body, "more_body": False}
                await asyncio.sleep(3600)

            async def send(message):
                messages.append(message)

            scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                     "method": method, "scheme": "http", "path": parsed.path,
                     "raw_path": parsed.path.encode(), "query_string": parsed.query.encode(),
                     "root_path": "", "headers": raw_headers, "client": ("test", 1234),
                     "server": ("test", 80), "state": {}}
            await self.app(scope, receive, send)
            status = next(item["status"] for item in messages if item["type"] == "http.response.start")
            response_headers = {key.decode(): value.decode() for item in messages if item["type"] == "http.response.start"
                                for key, value in item["headers"]}
            content = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
            return Response(status, content, response_headers)

        return asyncio.run(run())

    def get(self, url, headers=None):
        return self.request("GET", url, headers=headers)

    def post(self, url, json=None, headers=None):
        return self.request("POST", url, json_body=json, headers=headers)

    def put(self, url, json=None, headers=None):
        return self.request("PUT", url, json_body=json, headers=headers)


def test_resident_role_ownership_and_lottery(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "portal.sqlite")
    monkeypatch.setenv("AI_LOTTERY_ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("AI_LOTTERY_ADMIN_PASSWORD", "admin123")
    database.init_db()
    with database.get_connection() as conn:
        a = conn.execute("SELECT id FROM buildings ORDER BY id LIMIT 1").fetchone()[0]
        now = database.utc_now()
        b = conn.execute("""INSERT INTO buildings(building_name,society_name,redevelopment_project_name,
            full_address,city,district,state,pin_code,number_of_wings,status,created_at,updated_at)
            VALUES('Other','Other Society','Project','Road','Mumbai','Mumbai','Maharashtra','400001',1,'Active',?,?)""",
            (now, now)).lastrowid
        residents = []
        for number, building in enumerate((a, a, a, b), 1):
            rid = conn.execute("""INSERT INTO residents(building_id,full_name,aadhaar_masked,aadhaar_hash,
                old_room_number,family_members,contact_number,priority_category,building_wing,consent,
                verification_status,created_at) VALUES(?,?,?,?,?,3,'9456789012','General','A',1,'Verified',?)""",
                (building, f"Resident {number}", f"XXXX-XXXX-{number:04d}", f"hash-{number}", f"OLD-{number}", now)).lastrowid
            residents.append(rid)
            conn.execute("INSERT INTO resident_credentials(resident_id,password_hash,updated_at) VALUES(?,?,?)",
                         (rid, hash_password(f"resident-password-{number}"), now))
        room = conn.execute("""INSERT INTO rooms(building_id,room_number,wing,floor,size,status,suitable_for)
            VALUES(?,'A-101','A',1,'650 sq ft','Available','General')""", (a,)).lastrowid

    cycle = main.create_draw_cycle(a, DrawCycleCreate(draw_name="Portal draw", reason="Test",
        lottery_mode="Competitive Lottery", waiting_list_enabled=True), admin="test")
    draw_id = cycle["draw_id"]
    for rid in residents[:3]:
        main.cycle_resident(a, draw_id, CycleResidentChange(resident_id=rid, include=True), admin="test")
    main.cycle_room(a, draw_id, CycleRoomChange(room_id=room, include=True), admin="test")
    main.confirm_cycle(a, draw_id, admin="test")
    main.run_cycle(a, draw_id, admin="test")

    client = AsgiClient(main.app)
    admin_response = client.post("/api/admin/login", json={"email": "admin@example.com", "password": "admin123"})
    assert admin_response.status_code == 200
    admin = {"Authorization": f"Bearer {admin_response.json()['token']}"}
    assert client.get("/api/admin/session", headers=admin).json()["role"] == "admin"
    assert client.get("/api/resident/profile", headers=admin).status_code == 403
    assert client.post("/api/resident/login", json={"resident_id": residents[0], "password": "bad"}).status_code == 401
    login = client.post("/api/resident/login", json={"resident_id": residents[0], "password": "resident-password-1"})
    assert login.status_code == 200
    assert login.json()["role"] == "resident"
    resident = {"Authorization": f"Bearer {login.json()['token']}"}
    assert client.get("/api/resident/session", headers=resident).json()["resident_id"] == residents[0]
    profile = client.get("/api/resident/profile", headers=resident).json()
    assert profile["id"] == residents[0] and profile["building_id"] == a
    assert "password_hash" not in profile and "annual_income" not in profile
    eligibility = client.get("/api/resident/eligibility", headers=resident).json()
    assert eligibility["status"] == "Eligible"
    assert eligibility["explanation"]
    lottery = client.get("/api/resident/lottery", headers=resident).json()
    assert lottery["latest"]["draw_number"] == 1
    assert lottery["latest"]["result"] in {"Winner", "Waiting List"}
    assert client.get("/api/resident/allocation", headers=resident).status_code == 200
    assert client.get("/api/resident/history", headers=resident).status_code == 200
    for route in ("/api/residents", f"/api/buildings/{a}/residents/{residents[1]}/history",
                  f"/api/buildings/{b}/residents", f"/api/buildings/{a}/eligibility/rule-sets",
                  "/api/admin/session", f"/api/resident/search?query=OLD-2&building_id={a}"):
        assert client.get(route, headers=resident).status_code == 403, route
    assert client.get("/api/residents").status_code == 401
    cross_origin = client.get("/api/residents", headers={"Origin": "http://127.0.0.1:5173"})
    assert cross_origin.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"
    assert client.post("/api/lottery/start", headers=resident).status_code == 403
    assert client.post(f"/api/buildings/{a}/eligibility/rule-sets", json={"name": "Blocked"}, headers=resident).status_code == 403
    assert client.get("/api/resident/profile", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert client.post("/api/resident/logout", headers=resident).status_code == 200
    assert client.get("/api/resident/profile", headers=resident).status_code == 401

    other = client.post("/api/resident/login", json={"resident_id": residents[3], "password": "resident-password-4"})
    other_header = {"Authorization": f"Bearer {other.json()['token']}"}
    assert client.get("/api/resident/profile", headers=other_header).json()["building_id"] == b
    assert client.get("/api/resident/lottery", headers=other_header).json()["draws"] == []
    with database.get_connection() as conn:
        conn.execute("UPDATE resident_sessions SET expires_at='2000-01-01T00:00:00+00:00' WHERE resident_id=?", (residents[3],))
    assert client.get("/api/resident/profile", headers=other_header).status_code == 401

    for _ in range(5):
        assert client.post("/api/resident/login", json={"resident_id": residents[1], "password": "wrong"}).status_code == 401
    assert client.post("/api/resident/login", json={"resident_id": residents[1], "password": "resident-password-2"}).status_code == 401
    reset = client.put(f"/api/buildings/{a}/residents/{residents[1]}/portal-password",
                       json={"password": "updated-resident-password"}, headers=admin)
    assert reset.status_code == 200
    assert client.post("/api/resident/login", json={"resident_id": residents[1], "password": "updated-resident-password"}).status_code == 200
    database.init_db()
    with database.get_connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM residents WHERE id=?", (residents[0],)).fetchone()[0] == 1
        newcomer = conn.execute("""INSERT INTO residents(building_id,full_name,aadhaar_masked,aadhaar_hash,
            old_room_number,family_members,contact_number,priority_category,building_wing,consent,
            verification_status,created_at) VALUES(?, 'Another contestant','XXXX-XXXX-9999','hash-new',
            'OLD-NEW',3,'9456789012','General','A',1,'Verified',?)""", (b, database.utc_now())).lastrowid
        conn.execute("INSERT INTO resident_credentials(resident_id,password_hash,updated_at) VALUES(?,?,?)",
                     (newcomer, hash_password("new-contestant-password"), database.utc_now()))
        other_room = conn.execute("""INSERT INTO rooms(building_id,room_number,wing,floor,size,status,suitable_for)
            VALUES(?,'B-101','A',1,'650 sq ft','Available','General')""", (b,)).lastrowid
    next_cycle = main.create_draw_cycle(b, DrawCycleCreate(draw_name="No waiting list", reason="Test",
        lottery_mode="Competitive Lottery", waiting_list_enabled=False), admin="test")
    next_draw_id = next_cycle["draw_id"]
    for rid in (residents[3], newcomer):
        main.cycle_resident(b, next_draw_id, CycleResidentChange(resident_id=rid, include=True), admin="test")
    main.cycle_room(b, next_draw_id, CycleRoomChange(room_id=other_room, include=True), admin="test")
    main.confirm_cycle(b, next_draw_id, admin="test")
    main.run_cycle(b, next_draw_id, admin="test")
    with database.get_connection() as conn:
        loser = conn.execute("SELECT resident_id FROM draw_allocations WHERE draw_id=? AND allocation_status='Not Selected'",
                             (next_draw_id,)).fetchone()[0]
    loser_password = "resident-password-4" if loser == residents[3] else "new-contestant-password"
    loser_login = client.post("/api/resident/login", json={"resident_id": loser, "password": loser_password})
    loser_header = {"Authorization": f"Bearer {loser_login.json()['token']}"}
    assert client.get("/api/resident/lottery", headers=loser_header).json()["latest"]["result"] == "Not Selected"
