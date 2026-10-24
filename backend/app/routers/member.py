"""Endpoints for members (the person who owns the profile)."""

from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents import member_agent
from ..agents.timefmt import client_zone
from ..auth import current_member
from ..db import get_db
from ..models import AccessRequest, Appointment, AuditEvent, Bill, ConsentGrant, LabResult, User, utcnow
from ..schemas import (
    AccessRequestOut,
    ApproveIn,
    AppointmentOut,
    AuditOut,
    BillOut,
    ChatIn,
    ChatOut,
    GrantOut,
    LabResultOut,
    SectionIn,
)
from ..scopes import SCOPES
from ..services import active_grants, approve_request, audit, deny_request, read_profile, write_section

router = APIRouter(prefix="/me", tags=["member"])


@router.get("/scopes")
def scopes():
    return SCOPES


@router.get("/profile")
def get_profile(member: User = Depends(current_member), db: Session = Depends(get_db)):
    return read_profile(db, member.id)


@router.put("/profile/{scope}")
def put_section(scope: str, body: SectionIn, member: User = Depends(current_member), db: Session = Depends(get_db)):
    write_section(db, member.id, scope, body.data)
    audit(db, member_id=member.id, actor_id=member.id, action="profile.updated", scopes=[scope])
    db.commit()
    return {"scope": scope, "data": body.data}


# --- consent ---
def _own_request(db: Session, member: User, request_id: int) -> AccessRequest:
    req = db.get(AccessRequest, request_id)
    if req is None or req.member_id != member.id:
        raise HTTPException(404, "Request not found")
    return req


@router.get("/requests", response_model=list[AccessRequestOut])
def list_requests(status: str | None = None, member: User = Depends(current_member), db: Session = Depends(get_db)):
    q = select(AccessRequest).where(AccessRequest.member_id == member.id)
    if status:
        q = q.where(AccessRequest.status == status)
    return db.scalars(q.order_by(AccessRequest.created_at.desc())).all()


@router.post("/requests/{request_id}/approve", response_model=AccessRequestOut)
def approve(request_id: int, body: ApproveIn, member: User = Depends(current_member), db: Session = Depends(get_db)):
    req = _own_request(db, member, request_id)
    approve_request(db, req, body.scopes)
    db.commit()
    return req


@router.post("/requests/{request_id}/deny", response_model=AccessRequestOut)
def deny(request_id: int, member: User = Depends(current_member), db: Session = Depends(get_db)):
    req = _own_request(db, member, request_id)
    deny_request(db, req)
    db.commit()
    return req


@router.get("/grants", response_model=list[GrantOut])
def grants(member: User = Depends(current_member), db: Session = Depends(get_db)):
    return active_grants(db, member.id)


@router.delete("/grants/{grant_id}")
def revoke_grant(grant_id: int, member: User = Depends(current_member), db: Session = Depends(get_db)):
    g = db.get(ConsentGrant, grant_id)
    if g is None or g.member_id != member.id:
        raise HTTPException(404, "Grant not found")
    if g.revoked_at is None:
        g.revoked_at = utcnow()
        audit(
            db, member_id=member.id, actor_id=member.id, provider_id=g.provider_id, action="grant.revoked", scopes=[g.scope]
        )
        db.commit()
    return {"ok": True}


@router.delete("/providers/{provider_id}/grants")
def revoke_provider(provider_id: int, member: User = Depends(current_member), db: Session = Depends(get_db)):
    grants = active_grants(db, member.id, provider_id)
    for g in grants:
        g.revoked_at = utcnow()
    if grants:
        audit(
            db,
            member_id=member.id,
            actor_id=member.id,
            provider_id=provider_id,
            action="grant.revoked_all",
            scopes=[g.scope for g in grants],
        )
        db.commit()
    return {"revoked": len(grants)}


@router.get("/audit", response_model=list[AuditOut])
def audit_log(limit: int = 100, member: User = Depends(current_member), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.member_id == member.id)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(min(limit, 500))
    ).all()
    out = []
    for e in rows:
        item = AuditOut.model_validate(e)
        item.actor_name = "You" if e.actor_id == member.id else (e.actor.full_name if e.actor else None)
        out.append(item)
    return out


# --- records ---
@router.get("/appointments", response_model=list[AppointmentOut])
def appointments(member: User = Depends(current_member), db: Session = Depends(get_db)):
    return db.scalars(select(Appointment).where(Appointment.member_id == member.id).order_by(Appointment.starts_at)).all()


@router.get("/bills", response_model=list[BillOut])
def bills(member: User = Depends(current_member), db: Session = Depends(get_db)):
    return db.scalars(select(Bill).where(Bill.member_id == member.id).order_by(Bill.status, Bill.due_date)).all()


@router.post("/bills/{bill_id}/pay", response_model=BillOut)
def pay_bill(bill_id: int, member: User = Depends(current_member), db: Session = Depends(get_db)):
    """Stub: in production this charges the vaulted card token via the payment processor."""
    bill = db.get(Bill, bill_id)
    if bill is None or bill.member_id != member.id:
        raise HTTPException(404, "Bill not found")
    if bill.status != "paid":
        bill.status = "paid"
        bill.paid_at = utcnow()
        audit(
            db,
            member_id=member.id,
            actor_id=member.id,
            provider_id=bill.provider_id,
            action="bill.paid",
            detail=f"{bill.description} — ${(bill.amount_cents - bill.insurance_covered_cents) / 100:,.2f}",
        )
        db.commit()
    return bill


@router.get("/results", response_model=list[LabResultOut])
def results(member: User = Depends(current_member), db: Session = Depends(get_db)):
    return db.scalars(
        select(LabResult).where(LabResult.member_id == member.id).order_by(LabResult.collected_at.desc())
    ).all()


# --- assistant ---
@router.post("/assistant/chat", response_model=ChatOut)
def assistant_chat(
    body: ChatIn,
    member: User = Depends(current_member),
    db: Session = Depends(get_db),
    z: ZoneInfo = Depends(client_zone),
):
    reply, used = member_agent.chat(db, member, [m.model_dump() for m in body.messages[-20:]], z)
    return ChatOut(reply=reply, tools_used=used)


@router.get("/assistant/insights")
def assistant_insights(
    member: User = Depends(current_member), db: Session = Depends(get_db), z: ZoneInfo = Depends(client_zone)
):
    return {"insights": member_agent.insights(db, member, z)}
