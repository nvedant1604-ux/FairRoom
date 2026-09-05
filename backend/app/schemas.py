from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class AdminLogin(BaseModel):
    email: str
    password: str


class ResidentCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    aadhaar_number: str = Field(max_length=32)
    old_room_number: str = Field(min_length=2, max_length=30)
    family_members: int = Field(ge=1, le=30)
    contact_number: str = Field(max_length=20)
    priority_category: str
    building_wing: str = Field(min_length=1, max_length=20)
    document_name: str | None = None
    consent: bool

    @field_validator("aadhaar_number")
    @classmethod
    def validate_aadhaar_number(cls, value: str) -> str:
        normalized = re.sub(r"[^A-Za-z0-9]", "", value or "")
        if len(normalized) < 4:
            raise ValueError("Aadhaar or ID number must contain at least 4 letters or digits.")
        return value

    @field_validator("contact_number")
    @classmethod
    def validate_contact_number(cls, value: str) -> str:
        digits = re.sub(r"\D", "", value or "")
        if len(digits) != 10:
            raise ValueError("Contact number must contain exactly 10 digits.")
        return value


class ResidentOut(BaseModel):
    id: int
    full_name: str
    aadhaar_masked: str
    old_room_number: str
    family_members: int
    contact_number: str
    priority_category: str
    building_wing: str
    document_name: str | None
    consent: int
    verification_status: str
    created_at: str


class RoomCreate(BaseModel):
    room_number: str = Field(min_length=2, max_length=30)
    wing: str = Field(min_length=1, max_length=20)
    floor: int = Field(ge=0, le=200)
    size: str = Field(min_length=2, max_length=40)
    status: str = "Available"
    suitable_for: str = "General"


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    resident_query: str | None = None
    building_id: int | None = None


class BuildingCreate(BaseModel):
    building_name: str = Field(min_length=1, max_length=150)
    society_name: str = Field(min_length=1, max_length=150)
    redevelopment_project_name: str = Field(min_length=1, max_length=200)
    full_address: str = Field(min_length=1, max_length=500)
    city: str = Field(min_length=1, max_length=100)
    district: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    pin_code: str
    number_of_wings: int = Field(default=0, ge=0)
    description: str = Field(default="", max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    map_zoom: int = Field(default=17, ge=3, le=20)
    location_status: Literal["Not Set", "Located", "Manual", "Failed"] = "Not Set"
    google_place_id: str | None = Field(default=None, max_length=255)

    @field_validator("building_name", "society_name", "redevelopment_project_name", "full_address", "city", "district", "state")
    @classmethod
    def trim_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required.")
        return value

    @field_validator("pin_code")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        digits = re.sub(r"\D", "", value or "")
        if len(digits) != 6:
            raise ValueError("PIN code must contain exactly 6 digits.")
        return digits

    @model_validator(mode="after")
    def validate_location(self) -> "BuildingCreate":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must both be provided or both be left empty.")
        if self.latitude is None:
            self.location_status = "Not Set"
            self.google_place_id = None
        elif self.location_status == "Not Set":
            self.location_status = "Manual"
        return self


class BuildingUpdate(BuildingCreate):
    pass


class DrawCycleCreate(BaseModel):
    draw_name: str = Field(min_length=2, max_length=150)
    phase_name: str | None = Field(default=None, max_length=150)
    reason: str = Field(min_length=2, max_length=500)
    planned_draw_date: str | None = None
    notes: str | None = Field(default=None, max_length=1000)
    lottery_mode: str = "Full Allocation"
    waiting_list_enabled: bool = False

    @field_validator("lottery_mode")
    @classmethod
    def valid_lottery_mode(cls, value: str) -> str:
        if value not in ("Full Allocation", "Competitive Lottery"):
            raise ValueError("Lottery mode must be Full Allocation or Competitive Lottery.")
        return value


class EligibilityRuleCreate(BaseModel):
    rule_name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=500)
    rule_type: str
    rule_category: str = "Mandatory Eligibility"
    operator: str
    value: str | None = Field(default=None, max_length=100)
    priority: int = Field(default=100, ge=0, le=10000)
    priority_points: int = Field(default=0, ge=0, le=10000)
    is_required: bool = True
    is_active: bool = True


class CycleResidentChange(BaseModel):
    resident_id: int
    include: bool = True
    reason: str | None = Field(default=None, max_length=500)
    override_confirmed: bool = False


class CycleRoomChange(BaseModel):
    room_id: int
    include: bool = True
    reason: str | None = Field(default=None, max_length=500)


class CycleCancel(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
    confirmed: bool
