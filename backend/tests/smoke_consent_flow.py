"""End-to-end consent flow check against a freshly seeded running API. Run: python -m app.seed && python tests/smoke_consent_flow.py"""
import httpx, sys
import os
B = os.getenv("API_URL", "http://localhost:8077")
def login(e):
    r = httpx.post(f"{B}/auth/login", json={"email": e, "password": "demo1234"}); r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond: sys.exit(1)

alex, patel, front, bank = (login(e) for e in ["alex@demo.com","dr.patel@stmarys.demo","frontdesk@northside.demo","ops@firstharbor.demo"])

# Provider with grants sees only granted scopes; payment withheld
pts = httpx.get(f"{B}/provider/patients", headers=patel).json()
ok(len(pts)==1 and pts[0]["full_name"]=="Alex Morgan", "St Mary's sees Alex as patient")
mid = pts[0]["id"]
view = httpx.get(f"{B}/provider/patients/{mid}", headers=patel).json()
ok("payment" not in view["shared"] and "medical.allergies" in view["shared"] and "addresses" in view["withheld"], "St Mary's view limited to grants")

# Provider without consent gets 404
ok(httpx.get(f"{B}/provider/patients/{mid}", headers=front).status_code==404, "Northside blocked before consent")
ok(httpx.get(f"{B}/provider/patients/{mid}", headers=bank).status_code==404, "Bank blocked")

# Member sees pending request, partially approves (no addresses / emergency contacts)
pend = httpx.get(f"{B}/me/requests?status=pending", headers=alex).json()
ok(len(pend)==1 and pend[0]["provider"]["name"]=="Northside Family Clinic", "Alex sees pending Northside request")
rid = pend[0]["id"]
r = httpx.post(f"{B}/me/requests/{rid}/approve", headers=alex, json={"scopes":["identity","insurance","medical.allergies"]})
ok(r.json()["status"]=="partial", "partial approval")
ok(httpx.post(f"{B}/me/requests/{rid}/approve", headers=alex, json={"scopes":["identity"]}).status_code==409, "cannot re-respond")
v2 = httpx.get(f"{B}/provider/patients/{mid}", headers=front).json()
ok(sorted(v2["shared"])==["identity","insurance","medical.allergies"], "Northside sees exactly approved scopes")

# Cannot grant unrequested scope
r = httpx.post(f"{B}/provider/requests", headers=bank, json={"share_code":"alex-2026","scopes":["addresses","payment"],"purpose":"Update mailing address on accounts","duration_days":365})
ok(r.status_code==200, "bank requests via share code")
r2 = httpx.post(f"{B}/me/requests/{r.json()['id']}/approve", headers=alex, json={"scopes":["medical.conditions"]})
ok(r2.status_code==422, "cannot grant scope that wasn't requested")
httpx.post(f"{B}/me/requests/{r.json()['id']}/approve", headers=alex, json={"scopes":["addresses","payment"]})
bv = httpx.get(f"{B}/provider/patients/{mid}", headers=bank).json()
ok("vault_token" not in str(bv) and bv["shared"]["payment"][0]["last4"]=="4242", "bank sees card last4 but never vault token")

# Profile update propagates (the move scenario)
prof = httpx.get(f"{B}/me/profile", headers=alex).json()
addrs = prof["addresses"]; addrs[0]["line1"] = "88 New Harbor Rd"
httpx.put(f"{B}/me/profile/addresses", headers=alex, json={"data": addrs}).raise_for_status()
bv = httpx.get(f"{B}/provider/patients/{mid}", headers=bank).json()
ok(bv["shared"]["addresses"][0]["line1"]=="88 New Harbor Rd", "address change visible to bank immediately")

# Revoke
grants = httpx.get(f"{B}/me/grants", headers=alex).json()
nid = next(g["provider"]["id"] for g in grants if g["provider"]["name"].startswith("Northside"))
ok(httpx.delete(f"{B}/me/providers/{nid}/grants", headers=alex).json()["revoked"]==3, "revoke all Northside grants")
ok(httpx.get(f"{B}/provider/patients/{mid}", headers=front).status_code==404, "Northside blocked after revoke")

# Records + audit + role separation
ok(httpx.get(f"{B}/me/profile", headers=patel).status_code==403, "provider can't hit member endpoints")
ok(httpx.get(f"{B}/provider/patients", headers=alex).status_code==403, "member can't hit provider endpoints")
bills = httpx.get(f"{B}/me/bills", headers=alex).json()
ok(any(b["status"]=="due" for b in bills), "bills listed")
audit = httpx.get(f"{B}/me/audit", headers=alex).json()
acts = [a["action"] for a in audit]
ok("profile.viewed" in acts and "grant.revoked_all" in acts and "request.partially_approved" in acts, f"audit trail ({len(audit)} events)")
print("  latest:", audit[0]["created_at"], audit[0]["action"], audit[0]["actor_name"])

# AI assistant answers from the member's own data (requires GEMINI_API_KEY)
r = httpx.post(f"{B}/me/assistant/chat", headers=alex, json={"messages":[{"role":"user","content":"What do I owe right now?"}]}, timeout=300)
ok(r.status_code==200 and "list_bills" in r.json()["tools_used"], f"assistant used bills tool: {r.json().get('reply', r.text)[:80]!r}")
