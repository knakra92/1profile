"""Reset the database and load demo data.  Run: python -m app.seed"""

from datetime import timedelta

from .crypto import hash_password
from .db import Base, SessionLocal, engine
from .models import AccessRequest, Appointment, Bill, LabResult, Provider, User, utcnow
from .services import approve_request, audit, write_section

DEMO_PASSWORD = "demo1234"


def run():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    now = utcnow()

    stmarys = Provider(name="St. Mary's General Hospital", kind="hospital", city="Seattle, WA", verified=True)
    northside = Provider(name="Northside Family Clinic", kind="clinic", city="Seattle, WA", verified=True)
    harbor = Provider(name="First Harbor Bank", kind="bank", city="Seattle, WA", verified=True)
    db.add_all([stmarys, northside, harbor])
    db.flush()

    def staff(email, name, provider):
        u = User(email=email, password_hash=hash_password(DEMO_PASSWORD), full_name=name, role="provider",
                 provider_id=provider.id)
        db.add(u)
        return u

    dr_patel = staff("dr.patel@stmarys.demo", "Dr. Anika Patel", stmarys)
    front_desk = staff("frontdesk@northside.demo", "Jordan Lee", northside)
    staff("ops@firstharbor.demo", "Sam Ortiz", harbor)

    alex = User(email="alex@demo.com", password_hash=hash_password(DEMO_PASSWORD), full_name="Alex Morgan",
                role="member", share_code="ALEX-2026")
    db.add(alex)
    db.flush()
    audit(db, member_id=alex.id, actor_id=alex.id, action="account.created")

    profile = {
        "identity": {"legal_name": "Alex Jordan Morgan", "date_of_birth": "1990-04-12", "sex": "Female",
                     "preferred_language": "English", "pronouns": "she/her"},
        "contact": {"phone": "+1 (206) 555-0142", "email": "alex@demo.com"},
        "addresses": [
            {"label": "Home", "line1": "1420 Pine St", "line2": "Apt 5B", "city": "Seattle", "state": "WA",
             "postal_code": "98101", "country": "US", "primary": True},
            {"label": "Work", "line1": "400 Union Ave", "city": "Seattle", "state": "WA", "postal_code": "98104",
             "country": "US"},
        ],
        "emergency_contacts": [
            {"name": "Chris Morgan", "relationship": "Brother", "phone": "+1 (206) 555-0199"},
        ],
        "insurance": [
            {"carrier": "Evergreen Health Plan", "plan": "PPO Gold", "member_id": "EHP-88412093",
             "group_number": "GRP-5521", "primary": True},
        ],
        "medical.allergies": [
            {"substance": "Penicillin", "reaction": "Hives, swelling", "severity": "severe"},
            {"substance": "Peanuts", "reaction": "Anaphylaxis", "severity": "severe"},
        ],
        "medical.medications": [
            {"name": "Levothyroxine", "dose": "75 mcg", "frequency": "Once daily"},
            {"name": "Vitamin D3", "dose": "2000 IU", "frequency": "Once daily"},
        ],
        "medical.conditions": [
            {"name": "Hypothyroidism", "since": "2019", "status": "managed"},
            {"name": "Seasonal allergies", "since": "2005", "status": "active"},
        ],
        "medical.history": {
            "surgeries": ["Appendectomy (2012)"],
            "hospitalizations": [],
            "family_history": ["Type 2 diabetes (father)", "Hypertension (mother)"],
            "smoking": "Never", "alcohol": "Occasional",
        },
        "medical.immunizations": [
            {"vaccine": "Influenza", "date": "2025-10-03"},
            {"vaccine": "Tdap", "date": "2019-06-21"},
            {"vaccine": "COVID-19 (2025-26)", "date": "2025-09-28"},
        ],
        "payment": [
            {"label": "Personal Visa", "brand": "Visa", "last4": "4242", "exp_month": 8, "exp_year": 2029,
             "vault_token": "tok_demo_visa_4242"},
        ],
    }
    for scope, data in profile.items():
        write_section(db, alex.id, scope, data)

    # St. Mary's: an approved relationship with a narrower set of scopes than requested.
    req1 = AccessRequest(
        member_id=alex.id, provider_id=stmarys.id, requested_by_id=dr_patel.id,
        scopes=["identity", "contact", "insurance", "medical.allergies", "medical.medications",
                "medical.conditions", "medical.history", "payment"],
        purpose="Annual physical and thyroid follow-up", duration_days=90, created_at=now - timedelta(days=12),
    )
    db.add(req1)
    db.flush()
    audit(db, member_id=alex.id, actor_id=dr_patel.id, provider_id=stmarys.id, action="request.created",
          scopes=req1.scopes, detail=req1.purpose)
    approve_request(db, req1, ["identity", "contact", "insurance", "medical.allergies", "medical.medications",
                               "medical.conditions", "medical.history"])

    # Northside: pending, waiting on Alex in the app.
    req2 = AccessRequest(
        member_id=alex.id, provider_id=northside.id, requested_by_id=front_desk.id,
        scopes=["identity", "contact", "addresses", "insurance", "medical.allergies", "medical.medications",
                "emergency_contacts"],
        purpose="New patient registration for urgent care visit", duration_days=30,
    )
    db.add(req2)
    db.flush()
    audit(db, member_id=alex.id, actor_id=front_desk.id, provider_id=northside.id, action="request.created",
          scopes=req2.scopes, detail=req2.purpose)

    db.add_all([
        Appointment(member_id=alex.id, provider_id=stmarys.id, starts_at=(now + timedelta(days=6)).replace(
            hour=16, minute=30, second=0, microsecond=0), department="Endocrinology", clinician="Dr. Anika Patel",
            reason="Thyroid follow-up and lab review", location="Building B, Floor 3"),
        Appointment(member_id=alex.id, provider_id=stmarys.id, starts_at=(now + timedelta(days=34)).replace(
            hour=17, minute=0, second=0, microsecond=0), department="Primary Care", clinician="Dr. Marcus Chen",
            reason="Annual physical", location="Building A, Floor 1"),
        Appointment(member_id=alex.id, provider_id=stmarys.id, starts_at=now - timedelta(days=10),
                    department="Lab", reason="Blood draw", location="Building B, Lab", status="completed"),
    ])
    db.add_all([
        Bill(member_id=alex.id, provider_id=stmarys.id, description="Lab panel — TSH, CMP, Lipid panel",
             amount_cents=48600, insurance_covered_cents=38880, issued_at=now - timedelta(days=8),
             due_date=now + timedelta(days=12)),
        Bill(member_id=alex.id, provider_id=stmarys.id, description="Office visit — Endocrinology (Jul)",
             amount_cents=21000, insurance_covered_cents=17500, issued_at=now - timedelta(days=95),
             due_date=now - timedelta(days=65), status="paid", paid_at=now - timedelta(days=70)),
    ])
    db.add_all([
        LabResult(member_id=alex.id, provider_id=stmarys.id, test_name="Thyroid panel",
                  collected_at=now - timedelta(days=10), notes="Fasting sample.",
                  results=[
                      {"name": "TSH", "value": 5.8, "unit": "mIU/L", "ref_range": "0.4–4.0", "flag": "high"},
                      {"name": "Free T4", "value": 0.9, "unit": "ng/dL", "ref_range": "0.8–1.8", "flag": "normal"},
                  ]),
        LabResult(member_id=alex.id, provider_id=stmarys.id, test_name="Lipid panel",
                  collected_at=now - timedelta(days=10),
                  results=[
                      {"name": "Total cholesterol", "value": 212, "unit": "mg/dL", "ref_range": "<200", "flag": "high"},
                      {"name": "LDL", "value": 134, "unit": "mg/dL", "ref_range": "<100", "flag": "high"},
                      {"name": "HDL", "value": 58, "unit": "mg/dL", "ref_range": ">40", "flag": "normal"},
                      {"name": "Triglycerides", "value": 101, "unit": "mg/dL", "ref_range": "<150", "flag": "normal"},
                  ]),
        LabResult(member_id=alex.id, provider_id=stmarys.id, test_name="Comprehensive metabolic panel",
                  collected_at=now - timedelta(days=10),
                  results=[
                      {"name": "Glucose (fasting)", "value": 94, "unit": "mg/dL", "ref_range": "70–99", "flag": "normal"},
                      {"name": "Creatinine", "value": 0.82, "unit": "mg/dL", "ref_range": "0.59–1.04", "flag": "normal"},
                      {"name": "Vitamin D, 25-OH", "value": 24, "unit": "ng/mL", "ref_range": "30–100", "flag": "low"},
                  ]),
    ])
    db.commit()
    db.close()
    print("Seeded. Password for every demo account:", DEMO_PASSWORD)
    print("  member:   alex@demo.com  (share code ALEX-2026)")
    print("  provider: dr.patel@stmarys.demo | frontdesk@northside.demo | ops@firstharbor.demo")


if __name__ == "__main__":
    run()
