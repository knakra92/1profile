"""Endpoints for provider staff (hospitals, clinics, banks, ...). All member data reads go through services.provider_view."""

from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents import provider_agent
from ..agents.timefmt import client_zone
from ..auth import current_provider_staff
from ..db import get_db
from ..models import AccessRequest, Appointment, Bill, ConsentGrant, LabResult, User, to_naive_utc, utcnow
from ..schemas import (
    AccessRequestCreate,
    AccessRequestOut,
    AppointmentIn,
    AppointmentOut,
    BillIn,
    BillOut,
    ChatIn,
    ChatOut,
    LabResultIn,
    LabResultOut,
)
from ..scopes import SCOPES
from ..services import audit, granted_scopes, provider_view, validate_scopes

router = APIRouter(prefix="/provider", tags=["provider"])


@router.get("/scopes")
def scopes():
    return SCOPES


@router.post("/requests", response_model=AccessRequestOut)
def create_request(
    body: AccessRequestCreate, staff: User = Depends(current_provider_staff), db: Session = Depends(get_db)
):
    code = body.share_code.strip().upper()
    member = db.scalar(select(User).where(User.share_code == code, User.role == "member"))
    if member is None:
        raise HTTPException(404, "No 1Profile found for that code")
    req = AccessRequest(
        member_id=member.id,
        provider_id=staff.provider_id,
        requested_by_id=staff.id,
        scopes=validate_scopes(body.scopes),
        purpose=body.purpose.strip(),
        duration_days=body.duration_days,
    )
    db.add(req)
    db.flush()
    audit(
        db,
        member_id=member.id,
        actor_id=staff.id,
        provider_id=staff.provider_id,
        action="request.created",
        scopes=req.scopes,
        detail=req.purpose,
    )
    db.commit()
    return req


@router.get("/requests", response_model=list[AccessRequestOut])
def list_requests(staff: User = Depends(current_provider_staff), db: Session = Depends(get_db)):
    return db.scalars(
        select(AccessRequest)
        .where(AccessRequest.provider_id == staff.provider_id)
        .order_by(AccessRequest.created_at.desc())
    ).all()


@router.get("/patients")
def patients(staff: User = Depends(current_provider_staff), db: Session = Depends(get_db)):
    """Members who currently have at least one active grant with this provider."""
    grants = db.scalars(
        select(ConsentGrant).where(
            ConsentGrant.provider_id == staff.provider_id,
            ConsentGrant.revoked_at.is_(None),
            ConsentGrant.expires_at > utcnow(),
        )
    ).all()
    by_member: dict[int, dict] = {}
    for g in grants:
        entry = by_member.setdefault(
            g.member_id,
            {"id": g.member_id, "full_name": g.member.full_name, "scopes": [], "expires_at": g.expires_at},
        )
        entry["scopes"].append(g.scope)
        entry["expires_at"] = min(entry["expires_at"], g.expires_at)
    for e in by_member.values():
        e["expires_at"] = e["expires_at"].isoformat(timespec="seconds") + "Z"
        e["scopes"].sort()
    return sorted(by_member.values(), key=lambda e: e["full_name"])


def _consented_member(db: Session, staff: User, member_id: int) -> User:
    member = db.get(User, member_id)
    # Same 404 whether the member doesn't exist or hasn't consented: don't leak membership.
    if member is None or member.role != "member" or not granted_scopes(db, member_id, staff.provider_id):
        raise HTTPException(404, "No active consent for this member")
    return member


@router.get("/patients/{member_id}")
def patient_profile(member_id: int, staff: User = Depends(current_provider_staff), db: Session = Depends(get_db)):
    member = _consented_member(db, staff, member_id)
    shared = provider_view(db, member, staff)
    db.commit()  # persist the audit event
    return {
        "member": {"id": member.id, "full_name": member.full_name},
        "shared": shared,
        "withheld": [s for s in SCOPES if s not in shared],
    }


@router.get("/patients/{member_id}/records")
def patient_records(member_id: int, staff: User = Depends(current_provider_staff), db: Session = Depends(get_db)):
    member = _consented_member(db, staff, member_id)
    pid = staff.provider_id
    filt = lambda m: select(m).where(m.member_id == member.id, m.provider_id == pid)  # noqa: E731
    return {
        "appointments": [AppointmentOut.model_validate(a) for a in db.scalars(filt(Appointment)).all()],
        "bills": [BillOut.model_validate(b) for b in db.scalars(filt(Bill)).all()],
        "results": [LabResultOut.model_validate(r) for r in db.scalars(filt(LabResult)).all()],
    }


def _record_created(db: Session, staff: User, member: User, kind: str, detail: str):
    audit(
        db,
        member_id=member.id,
        actor_id=staff.id,
        provider_id=staff.provider_id,
        action=f"{kind}.created",
        detail=detail,
    )


@router.post("/patients/{member_id}/appointments", response_model=AppointmentOut)
def add_appointment(
    member_id: int, body: AppointmentIn, staff: User = Depends(current_provider_staff), db: Session = Depends(get_db)
):
    member = _consented_member(db, staff, member_id)
    starts = to_naive_utc(body.starts_at)
    appt = Appointment(member_id=member.id, provider_id=staff.provider_id, **(body.model_dump() | {"starts_at": starts}))
    db.add(appt)
    _record_created(db, staff, member, "appointment", f"{body.department or 'Visit'} on {starts:%Y-%m-%d %H:%M} UTC")
    db.commit()
    return appt


@router.post("/patients/{member_id}/bills", response_model=BillOut)
def add_bill(member_id: int, body: BillIn, staff: User = Depends(current_provider_staff), db: Session = Depends(get_db)):
    member = _consented_member(db, staff, member_id)
    data = body.model_dump() | {"due_date": to_naive_utc(body.due_date)}
    bill = Bill(member_id=member.id, provider_id=staff.provider_id, **data)
    db.add(bill)
    _record_created(db, staff, member, "bill", f"{body.description} — ${body.amount_cents / 100:,.2f}")
    db.commit()
    return bill


@router.post("/patients/{member_id}/results", response_model=LabResultOut)
def add_result(
    member_id: int, body: LabResultIn, staff: User = Depends(current_provider_staff), db: Session = Depends(get_db)
):
    member = _consented_member(db, staff, member_id)
    data = body.model_dump() | {"collected_at": to_naive_utc(body.collected_at)}
    result = LabResult(member_id=member.id, provider_id=staff.provider_id, **data)
    db.add(result)
    _record_created(db, staff, member, "lab_result", body.test_name)
    db.commit()
    return result


# --- AI ---
@router.post("/patients/{member_id}/brief")
def patient_brief(
    member_id: int,
    staff: User = Depends(current_provider_staff),
    db: Session = Depends(get_db),
    z: ZoneInfo = Depends(client_zone),
):
    member = _consented_member(db, staff, member_id)
    text = provider_agent.brief(db, member, staff, z)
    db.commit()
    return {"brief": text}


@router.post("/patients/{member_id}/chat", response_model=ChatOut)
def patient_chat(
    member_id: int,
    body: ChatIn,
    staff: User = Depends(current_provider_staff),
    db: Session = Depends(get_db),
    z: ZoneInfo = Depends(client_zone),
):
    member = _consented_member(db, staff, member_id)
    reply = provider_agent.chat(db, member, staff, [m.model_dump() for m in body.messages[-20:]], z)
    db.commit()
    return ChatOut(reply=reply)
