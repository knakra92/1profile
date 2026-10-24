"""Personal assistant for a member. Tools are bound to that member's own data and nothing else."""

import json
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AccessRequest, Appointment, Bill, LabResult, User, utcnow
from ..scopes import SCOPES
from ..services import active_grants, read_profile
from .llm import Tool, complete, run_agent
from .timefmt import local_date, local_dt, today

SYSTEM = """You are the 1Profile assistant for {name}. Today is {today}.
You help them understand and manage their own information: appointments, bills, lab results,
their profile, and which organizations have access to it.
Rules:
- Use the tools to look things up; never invent appointments, amounts or results.
- Money is given in cents in tool output; present it as dollars.
- When explaining lab results, be clear and calm, point out values flagged high or low, and
  recommend discussing them with their clinician. You are not a doctor and do not diagnose.
- Keep answers short and concrete. Use bullet points for lists."""


def _money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def build_tools(db: Session, member: User, z: ZoneInfo) -> dict[str, Tool]:
    mid = member.id

    def get_profile(sections: list[str] | None = None):
        wanted = [s for s in (sections or SCOPES) if s in SCOPES]
        profile = read_profile(db, mid, wanted)
        if "payment" in profile:
            profile["payment"] = [{k: c.get(k) for k in ("brand", "last4", "label")} for c in profile["payment"]]
        return profile

    def list_appointments(upcoming_only: bool = True):
        q = select(Appointment).where(Appointment.member_id == mid)
        if upcoming_only:
            q = q.where(Appointment.starts_at >= utcnow(), Appointment.status == "scheduled")
        rows = db.scalars(q.order_by(Appointment.starts_at)).all()
        return [
            {
                "when": local_dt(a.starts_at, z),
                "provider": a.provider.name,
                "department": a.department,
                "clinician": a.clinician,
                "reason": a.reason,
                "location": a.location,
                "status": a.status,
            }
            for a in rows
        ]

    def list_bills(status: str = "all"):
        q = select(Bill).where(Bill.member_id == mid)
        if status in ("due", "paid"):
            q = q.where(Bill.status == status)
        rows = db.scalars(q.order_by(Bill.due_date)).all()
        return [
            {
                "id": b.id,
                "provider": b.provider.name,
                "description": b.description,
                "total_cents": b.amount_cents,
                "insurance_covered_cents": b.insurance_covered_cents,
                "you_owe_cents": max(b.amount_cents - b.insurance_covered_cents, 0) if b.status == "due" else 0,
                "due_date": local_date(b.due_date, z) if b.due_date else None,
                "status": b.status,
            }
            for b in rows
        ]

    def list_lab_results(test_name: str | None = None):
        q = select(LabResult).where(LabResult.member_id == mid)
        if test_name:
            q = q.where(LabResult.test_name.ilike(f"%{test_name}%"))
        rows = db.scalars(q.order_by(LabResult.collected_at.desc())).all()
        return [
            {
                "test": r.test_name,
                "provider": r.provider.name,
                "collected": local_date(r.collected_at, z),
                "results": r.results,
                "notes": r.notes,
            }
            for r in rows
        ]

    def list_data_access():
        grants = active_grants(db, mid)
        by_provider: dict[str, list] = {}
        for g in grants:
            by_provider.setdefault(g.provider.name, []).append(
                {"scope": SCOPES[g.scope]["label"], "expires": local_date(g.expires_at, z)}
            )
        pending = db.scalars(
            select(AccessRequest).where(AccessRequest.member_id == mid, AccessRequest.status == "pending")
        ).all()
        return {
            "active_access": by_provider,
            "pending_requests": [
                {"provider": r.provider.name, "wants": [SCOPES[s]["label"] for s in r.scopes], "purpose": r.purpose}
                for r in pending
            ],
        }

    obj = lambda props, req=(): {"type": "object", "properties": props, "required": list(req)}  # noqa: E731
    return {
        "get_profile": (
            {
                "name": "get_profile",
                "description": "Read the member's profile sections. Valid sections: " + ", ".join(SCOPES),
                "parameters": obj({"sections": {"type": "array", "items": {"type": "string"}}}),
            },
            get_profile,
        ),
        "list_appointments": (
            {
                "name": "list_appointments",
                "description": "List the member's appointments.",
                "parameters": obj({"upcoming_only": {"type": "boolean", "description": "Only future scheduled ones"}}),
            },
            list_appointments,
        ),
        "list_bills": (
            {
                "name": "list_bills",
                "description": "List the member's medical and service bills.",
                "parameters": obj({"status": {"type": "string", "enum": ["due", "paid", "all"]}}),
            },
            list_bills,
        ),
        "list_lab_results": (
            {
                "name": "list_lab_results",
                "description": "List lab test results, newest first. Optionally filter by test name.",
                "parameters": obj({"test_name": {"type": "string"}}),
            },
            list_lab_results,
        ),
        "list_data_access": (
            {
                "name": "list_data_access",
                "description": "Which organizations currently have access to which parts of the profile, and pending requests.",
                "parameters": obj({}),
            },
            list_data_access,
        ),
    }


def chat(db: Session, member: User, history: list[dict], z: ZoneInfo) -> tuple[str, list[str]]:
    system = {"role": "system", "content": SYSTEM.format(name=member.full_name, today=today(z))}
    return run_agent([system, *history], build_tools(db, member, z))


INSIGHTS_PROMPT = """Here is everything in {name}'s 1Profile as JSON. Today is {today}.

{data}

Produce 3 to 6 practical, personalized recommendations across sectors such as health, finances,
privacy and admin (e.g. upcoming appointments to prepare for, bills to pay or dispute, lab values to
follow up on, missing profile info like emergency contacts, old or broad data access to revoke).
Never diagnose. Respond with JSON only, in this exact shape:
{{"insights": [{{"sector": "health|finance|privacy|admin", "title": "...", "detail": "...", "priority": "high|medium|low"}}]}}"""


def insights(db: Session, member: User, z: ZoneInfo) -> list[dict]:
    tools = build_tools(db, member, z)
    data = {
        "profile": tools["get_profile"][1](),
        "upcoming_appointments": tools["list_appointments"][1](True),
        "bills": tools["list_bills"][1]("all"),
        "lab_results": tools["list_lab_results"][1](),
        "data_access": tools["list_data_access"][1](),
    }
    prompt = INSIGHTS_PROMPT.format(
        name=member.full_name, today=today(z), data=json.dumps(data, indent=1, default=str)
    )
    raw = complete([{"role": "user", "content": prompt}], json_mode=True)
    try:
        items = json.loads(raw).get("insights", [])
    except (json.JSONDecodeError, AttributeError):
        return []
    return [i for i in items if isinstance(i, dict) and i.get("title")]
