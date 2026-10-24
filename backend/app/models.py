from datetime import UTC, datetime

from sqlalchemy import JSON, ForeignKey, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    # Stored as naive UTC; serialized with a Z suffix (see schemas.UTCDateTime).
    return datetime.now(UTC).replace(tzinfo=None)


def to_naive_utc(d: datetime | None) -> datetime | None:
    if d is None or d.tzinfo is None:
        return d
    return d.astimezone(UTC).replace(tzinfo=None)


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(40))  # hospital, clinic, pharmacy, bank, insurer, other
    city: Mapped[str | None] = mapped_column(String(120))
    verified: Mapped[bool] = mapped_column(default=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))  # "member" | "provider"
    # Members only: the code they show at check-in so a provider can find them.
    share_code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    # Provider staff only.
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    provider: Mapped[Provider | None] = relationship()


class ProfileSection(Base):
    """One encrypted blob per (member, scope). Scopes are the unit of consent."""

    __tablename__ = "profile_sections"
    __table_args__ = (UniqueConstraint("member_id", "scope"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    scope: Mapped[str] = mapped_column(String(60))
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"), index=True)
    requested_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    scopes: Mapped[list] = mapped_column(JSON)
    purpose: Mapped[str] = mapped_column(Text)
    duration_days: Mapped[int] = mapped_column(default=30)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|approved|partial|denied
    approved_scopes: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    responded_at: Mapped[datetime | None]

    provider: Mapped[Provider] = relationship()
    member: Mapped[User] = relationship(foreign_keys=[member_id])
    requested_by: Mapped[User] = relationship(foreign_keys=[requested_by_id])


class ConsentGrant(Base):
    __tablename__ = "consent_grants"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"), index=True)
    scope: Mapped[str] = mapped_column(String(60))
    request_id: Mapped[int | None] = mapped_column(ForeignKey("access_requests.id"))
    granted_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]

    provider: Mapped[Provider] = relationship()
    member: Mapped[User] = relationship()

    @property
    def active(self) -> bool:
        return self.revoked_at is None and self.expires_at > utcnow()


class AuditEvent(Base):
    """Append-only record of everything that touches a member's data. Never updated or deleted."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60))
    scopes: Mapped[list] = mapped_column(JSON, default=list)
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)

    provider: Mapped[Provider | None] = relationship()
    actor: Mapped[User | None] = relationship(foreign_keys=[actor_id])


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"))
    starts_at: Mapped[datetime]
    department: Mapped[str | None] = mapped_column(String(120))
    clinician: Mapped[str | None] = mapped_column(String(120))
    reason: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled|completed|cancelled

    provider: Mapped[Provider] = relationship()


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"))
    description: Mapped[str] = mapped_column(Text)
    amount_cents: Mapped[int]
    insurance_covered_cents: Mapped[int] = mapped_column(default=0)
    issued_at: Mapped[datetime] = mapped_column(default=utcnow)
    due_date: Mapped[datetime | None]
    status: Mapped[str] = mapped_column(String(20), default="due")  # due|paid
    paid_at: Mapped[datetime | None]

    provider: Mapped[Provider] = relationship()


class LabResult(Base):
    __tablename__ = "lab_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"))
    test_name: Mapped[str] = mapped_column(String(200))
    collected_at: Mapped[datetime]
    # [{name, value, unit, ref_range, flag}] where flag is "normal" | "high" | "low"
    results: Mapped[list] = mapped_column(JSON)
    notes: Mapped[str | None] = mapped_column(Text)

    provider: Mapped[Provider] = relationship()
