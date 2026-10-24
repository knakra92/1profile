"""Clinical/ops assistant for provider staff. Its context is built ONLY from consented, redacted data
(services.provider_view) plus records this provider itself created, so the model can't leak what it never saw."""

import json
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Appointment, Bill, LabResult, User
from ..scopes import SCOPES
from ..services import provider_view
from .llm import complete
from .timefmt import local_date, local_dt, today

SYSTEM = """You are an assistant for staff at {provider} ({kind}). Today is {today}.
You are given the parts of a patient/customer profile that they have explicitly consented to share
with {provider}, plus records {provider} holds about them. Sections they did NOT share are listed as
withheld: never guess at their contents, and say so if a question depends on them.
Be concise and factual. Flag safety-relevant items (allergies, interacting medications, abnormal
results) first. Do not make diagnoses."""


def _context(db: Session, member: User, staff: User, action: str, z: ZoneInfo) -> str:
    shared = provider_view(db, member, staff, action=action)
    withheld = [SCOPES[s]["label"] for s in SCOPES if s not in shared]
    pid = staff.provider_id
    appts = db.scalars(
        select(Appointment).where(Appointment.member_id == member.id, Appointment.provider_id == pid)
    ).all()
    bills = db.scalars(select(Bill).where(Bill.member_id == member.id, Bill.provider_id == pid)).all()
    labs = db.scalars(select(LabResult).where(LabResult.member_id == member.id, LabResult.provider_id == pid)).all()
    return json.dumps(
        {
            "shared_profile": {SCOPES[s]["label"]: v for s, v in shared.items()},
            "withheld_sections": withheld,
            "our_records": {
                "appointments": [
                    {"when": local_dt(a.starts_at, z), "dept": a.department, "reason": a.reason, "status": a.status}
                    for a in appts
                ],
                "bills": [
                    {
                        "desc": b.description,
                        "patient_owes": f"${max(b.amount_cents - b.insurance_covered_cents, 0) / 100:,.2f}",
                        "status": b.status,
                    }
                    for b in bills
                ],
                "lab_results": [
                    {"test": r.test_name, "collected": local_date(r.collected_at, z), "results": r.results}
                    for r in labs
                ],
            },
        },
        indent=1,
        default=str,
    )


def _system(staff: User, z: ZoneInfo) -> dict:
    p = staff.provider
    return {
        "role": "system",
        "content": SYSTEM.format(provider=p.name, kind=p.kind, today=today(z)),
    }


BRIEF_PROMPT = """Patient data:
{ctx}

Write a pre-visit brief for {name} in markdown with these sections:
**Safety alerts** (allergies, high-risk meds/conditions, abnormal labs — or "None shared"),
**Summary** (2-3 sentences), **Active medications & conditions**, **Recent activity with us**,
**Missing / withheld info** (what they did not share that might matter for this visit)."""


def brief(db: Session, member: User, staff: User, z: ZoneInfo) -> str:
    ctx = _context(db, member, staff, action="ai.brief_generated", z=z)
    return complete([_system(staff, z), {"role": "user", "content": BRIEF_PROMPT.format(ctx=ctx, name=member.full_name)}])


def chat(db: Session, member: User, staff: User, history: list[dict], z: ZoneInfo) -> str:
    ctx = _context(db, member, staff, action="ai.question_asked", z=z)
    grounding = {"role": "system", "content": f"Data for {member.full_name}:\n{ctx}"}
    return complete([_system(staff, z), grounding, *history])
