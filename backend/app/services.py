"""Consent enforcement and audit. Every provider read of member data must go through here."""

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .crypto import decrypt_json, encrypt_json
from .models import AccessRequest, AuditEvent, ConsentGrant, ProfileSection, User, utcnow
from .scopes import SCOPES, empty_value, redact_for_provider


def audit(
    db: Session,
    *,
    member_id: int,
    action: str,
    actor_id: int | None = None,
    provider_id: int | None = None,
    scopes: list[str] | None = None,
    detail: str | None = None,
) -> None:
    db.add(
        AuditEvent(
            member_id=member_id,
            actor_id=actor_id,
            provider_id=provider_id,
            action=action,
            scopes=scopes or [],
            detail=detail,
        )
    )


# --- profile ---
def read_profile(db: Session, member_id: int, scopes: list[str] | None = None) -> dict:
    wanted = scopes if scopes is not None else list(SCOPES)
    rows = db.scalars(
        select(ProfileSection).where(ProfileSection.member_id == member_id, ProfileSection.scope.in_(wanted))
    ).all()
    stored = {r.scope: decrypt_json(r.ciphertext) for r in rows}
    return {s: stored.get(s, empty_value(s)) for s in wanted}


def write_section(db: Session, member_id: int, scope: str, data) -> None:
    if scope not in SCOPES:
        raise HTTPException(404, f"Unknown scope {scope}")
    expected = list if SCOPES[scope]["shape"] == "list" else dict
    if not isinstance(data, expected):
        raise HTTPException(422, f"{scope} must be a JSON {expected.__name__}")
    row = db.scalar(select(ProfileSection).where(ProfileSection.member_id == member_id, ProfileSection.scope == scope))
    if row is None:
        db.add(ProfileSection(member_id=member_id, scope=scope, ciphertext=encrypt_json(data)))
    else:
        row.ciphertext = encrypt_json(data)
        row.updated_at = utcnow()


# --- consent ---
def validate_scopes(scopes: list[str]) -> list[str]:
    unknown = [s for s in scopes if s not in SCOPES]
    if unknown:
        raise HTTPException(422, f"Unknown scopes: {', '.join(unknown)}")
    return list(dict.fromkeys(scopes))  # dedupe, keep order


def active_grants(db: Session, member_id: int, provider_id: int | None = None) -> list[ConsentGrant]:
    q = select(ConsentGrant).where(
        ConsentGrant.member_id == member_id,
        ConsentGrant.revoked_at.is_(None),
        ConsentGrant.expires_at > utcnow(),
    )
    if provider_id is not None:
        q = q.where(ConsentGrant.provider_id == provider_id)
    return list(db.scalars(q.order_by(ConsentGrant.granted_at.desc())).all())


def granted_scopes(db: Session, member_id: int, provider_id: int) -> list[str]:
    return sorted({g.scope for g in active_grants(db, member_id, provider_id)})


def approve_request(db: Session, req: AccessRequest, scopes: list[str]) -> list[ConsentGrant]:
    if req.status != "pending":
        raise HTTPException(409, f"Request already {req.status}")
    scopes = validate_scopes(scopes)
    not_requested = set(scopes) - set(req.scopes)
    if not_requested:
        raise HTTPException(422, f"Cannot grant scopes that were not requested: {', '.join(sorted(not_requested))}")

    expires_at = utcnow() + timedelta(days=req.duration_days)
    existing = {g.scope: g for g in active_grants(db, req.member_id, req.provider_id)}
    grants = []
    for scope in scopes:
        if scope in existing:
            # Re-consent extends the existing grant rather than stacking duplicates.
            g = existing[scope]
            g.expires_at = max(g.expires_at, expires_at)
            g.request_id = req.id
        else:
            g = ConsentGrant(
                member_id=req.member_id,
                provider_id=req.provider_id,
                scope=scope,
                request_id=req.id,
                expires_at=expires_at,
            )
            db.add(g)
        grants.append(g)

    req.approved_scopes = scopes
    req.status = "approved" if set(scopes) == set(req.scopes) else "partial"
    req.responded_at = utcnow()
    audit(
        db,
        member_id=req.member_id,
        actor_id=req.member_id,
        provider_id=req.provider_id,
        action="request.approved" if req.status == "approved" else "request.partially_approved",
        scopes=scopes,
        detail=f"Valid for {req.duration_days} days",
    )
    return grants


def deny_request(db: Session, req: AccessRequest) -> None:
    if req.status != "pending":
        raise HTTPException(409, f"Request already {req.status}")
    req.status = "denied"
    req.responded_at = utcnow()
    audit(
        db,
        member_id=req.member_id,
        actor_id=req.member_id,
        provider_id=req.provider_id,
        action="request.denied",
        scopes=req.scopes,
    )


def provider_view(db: Session, member: User, staff: User, *, action: str = "profile.viewed") -> dict:
    """The only path by which provider staff read profile data: granted scopes only, redacted, audited."""
    scopes = granted_scopes(db, member.id, staff.provider_id)
    if not scopes:
        raise HTTPException(403, "No active consent from this member")
    profile = read_profile(db, member.id, scopes)
    audit(
        db,
        member_id=member.id,
        actor_id=staff.id,
        provider_id=staff.provider_id,
        action=action,
        scopes=scopes,
    )
    return {s: redact_for_provider(s, v) for s, v in profile.items()}
