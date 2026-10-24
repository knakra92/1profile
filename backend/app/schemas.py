from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

# Datetimes are stored as naive UTC; make that explicit on the wire.
UTCDateTime = Annotated[
    datetime,
    PlainSerializer(lambda d: d.isoformat(timespec="seconds") + ("Z" if d.tzinfo is None else ""), return_type=str),
]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth ---
class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)


class ProviderOut(ORM):
    id: int
    name: str
    kind: str
    city: str | None
    verified: bool


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str
    share_code: str | None
    provider: ProviderOut | None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- profile ---
class SectionIn(BaseModel):
    data: Any


# --- consent ---
class AccessRequestCreate(BaseModel):
    share_code: str
    scopes: list[str] = Field(min_length=1)
    purpose: str = Field(min_length=3)
    duration_days: int = Field(default=30, ge=1, le=365)


class MemberBrief(ORM):
    id: int
    full_name: str
    share_code: str | None


class AccessRequestOut(ORM):
    id: int
    provider: ProviderOut
    member: MemberBrief
    scopes: list[str]
    approved_scopes: list[str]
    purpose: str
    duration_days: int
    status: str
    created_at: UTCDateTime
    responded_at: UTCDateTime | None


class ApproveIn(BaseModel):
    scopes: list[str] = Field(min_length=1)


class GrantOut(ORM):
    id: int
    provider: ProviderOut
    scope: str
    request_id: int | None
    granted_at: UTCDateTime
    expires_at: UTCDateTime


class AuditOut(ORM):
    id: int
    provider: ProviderOut | None
    actor_name: str | None = None
    action: str
    scopes: list[str]
    detail: str | None
    created_at: UTCDateTime


# --- records ---
class AppointmentIn(BaseModel):
    starts_at: datetime
    department: str | None = None
    clinician: str | None = None
    reason: str | None = None
    location: str | None = None


class AppointmentOut(ORM):
    id: int
    provider: ProviderOut
    starts_at: UTCDateTime
    department: str | None
    clinician: str | None
    reason: str | None
    location: str | None
    status: str


class BillIn(BaseModel):
    description: str
    amount_cents: int = Field(gt=0)
    insurance_covered_cents: int = Field(default=0, ge=0)
    due_date: datetime | None = None


class BillOut(ORM):
    id: int
    provider: ProviderOut
    description: str
    amount_cents: int
    insurance_covered_cents: int
    issued_at: UTCDateTime
    due_date: UTCDateTime | None
    status: str
    paid_at: UTCDateTime | None


class LabValue(BaseModel):
    name: str
    value: float | str
    unit: str | None = None
    ref_range: str | None = None
    flag: str = "normal"


class LabResultIn(BaseModel):
    test_name: str
    collected_at: datetime
    results: list[LabValue]
    notes: str | None = None


class LabResultOut(ORM):
    id: int
    provider: ProviderOut
    test_name: str
    collected_at: UTCDateTime
    results: list[dict]
    notes: str | None


# --- assistant ---
class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


class ChatOut(BaseModel):
    reply: str
    tools_used: list[str] = []
