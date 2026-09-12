"""Shared administrator authorization for API routers."""
import secrets
from typing import Annotated

from fastapi import Header, HTTPException

from .database import get_connection, get_setting


def require_admin(authorization: Annotated[str | None, Header()] = None) -> str:
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    with get_connection() as conn:
        stored = get_setting(conn, "admin_token")
        email = get_setting(conn, "admin_email", "Admin")
    if not stored or not token or not secrets.compare_digest(token, stored):
        raise HTTPException(status_code=401, detail="Admin session is missing or expired. Please log in again.")
    return email
