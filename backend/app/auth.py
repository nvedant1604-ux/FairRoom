"""Shared administrator authorization for API routers."""
import secrets
import hashlib
import os
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Header, HTTPException

from .database import get_connection, get_setting

SESSION_HOURS = 12


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return secrets.compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def resolve_role(authorization: str | None) -> tuple[str, int | None]:
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not token:
        raise HTTPException(status_code=401, detail="Session is missing or expired. Please log in again.")
    with get_connection() as conn:
        admin = get_setting(conn, "admin_token")
        if admin and secrets.compare_digest(token, admin):
            return "admin", None
        row = conn.execute("""SELECT s.resident_id FROM resident_sessions s
            JOIN residents r ON r.id=s.resident_id
            WHERE s.token_hash=? AND s.expires_at>?""",
            (token_hash(token), datetime.now(timezone.utc).isoformat(timespec="seconds"))).fetchone()
    if row:
        return "resident", row["resident_id"]
    raise HTTPException(status_code=401, detail="Session is missing or expired. Please log in again.")


def require_resident(authorization: Annotated[str | None, Header()] = None) -> int:
    role, resident_id = resolve_role(authorization)
    if role != "resident" or resident_id is None:
        raise HTTPException(status_code=403, detail="Resident access required.")
    return resident_id


def require_admin(authorization: Annotated[str | None, Header()] = None) -> str:
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    with get_connection() as conn:
        stored = get_setting(conn, "admin_token")
        email = get_setting(conn, "admin_email", "Admin")
    if not stored or not token or not secrets.compare_digest(token, stored):
        if token:
            try:
                role, _ = resolve_role(authorization)
                if role == "resident":
                    raise HTTPException(status_code=403, detail="Admin access required.")
            except HTTPException as exc:
                if exc.status_code == 403:
                    raise
        raise HTTPException(status_code=401, detail="Admin session is missing or expired. Please log in again.")
    return email
