# 1Profile

One profile for everything you keep re-typing at check-in desks: identity, contact, addresses, insurance,
medical history and payment methods. Members keep it current in one iOS app. Hospitals, clinics, banks
and other providers **request** specific sections. The member approves each section (or denies) and can revoke
at any time, and every read is written to an audit trail the member can see.

```
mobile/            Expo (React Native) iOS app for members
provider-portal/   React + Vite web portal for provider staff
backend/           FastAPI + SQLAlchemy API, consent engine, AI agents (Gemma 4 via the Gemini API)
```

## Run it

```bash
# 1. API (port 8077)
cd backend
python3 -m venv .venv && .venv/bin/pip install fastapi "uvicorn[standard]" sqlalchemy pyjwt cryptography httpx
.venv/bin/python -m app.seed          # resets DB with demo data
.venv/bin/uvicorn app.main:app --port 8077 --reload

# 2. AI key for the agents (backend/.env is gitignored)
echo 'GEMINI_API_KEY=<your key>' > backend/.env

# 3. Provider portal → http://localhost:5177
cd provider-portal && npm install && npm run dev

# 4. iOS app in the simulator (opens Expo Go in the booted simulator)
cd mobile && npm install && npx expo start --ios
```

Demo accounts (password `demo1234`):

| Who | Login | |
|---|---|---|
| Member | `alex@demo.com` | share code **ALEX-2026** |
| Hospital staff | `dr.patel@stmarys.demo` | already has partial consent |
| Clinic front desk | `frontdesk@northside.demo` | has a **pending** request, approve it on the phone |
| Bank ops | `ops@firstharbor.demo` | no access yet, request addresses + payment |

Demo script: sign in as Northside in the portal, then approve the request on the phone with a couple of
sections switched off. The portal shows the patient within 5 seconds, with only those sections. Edit the home address on the
phone and refresh the portal; it's already updated. Revoke on the phone and the portal loses access.

Check the backend end to end: `python -m app.seed && python tests/smoke_consent_flow.py` (with the API running).

## How consent works

- **Scopes** (`backend/app/scopes.py`) are the unit of sharing: `identity`, `contact`, `addresses`,
  `insurance`, `medical.allergies`, `medical.medications`, …, `payment`.
- A provider creates an **AccessRequest** (scopes + purpose + duration) using the member's share code.
  Share codes rather than email or name lookup mean providers can't enumerate members.
- The member approves any **subset** of the requested scopes, which creates one **ConsentGrant** per scope
  with an expiry. Granting a scope that wasn't requested is rejected.
- `services.provider_view()` is the **only** path from provider code to profile data: it reads active
  grants, decrypts just those sections, redacts (`payment` never exposes the vault token), and writes an
  audit event. Unconsented members return 404, so a provider can't tell whether a member exists.
- Profile sections are encrypted at rest (Fernet). The audit log is append-only.

## AI agents

The model is Gemma 4 on the Gemini API: `gemma-4-26b-a4b-it` by default; set `LLM_MODEL=gemma-4-31b-it` for the
larger, slower model. The key is read from `GEMINI_API_KEY` (env or `backend/.env`). Calls are retried on
429/5xx; expect 10–60s per answer depending on API load.

- **Member assistant** (`agents/member_agent.py`): tool-calling agent whose tools are bound to the
  signed-in member's own appointments, bills, lab results, profile and access list. Also produces
  cross-sector **insights** (health follow-ups, bills, privacy hygiene such as stale access).
- **Provider agent** (`agents/provider_agent.py`): pre-visit brief and Q&A. Its context is built from
  `provider_view()`, so it only ever sees consented, redacted data. It is told which sections were
  withheld, and each use is audited ("St. Mary's generated an AI summary from your shared data").

When the key is missing or rejected, or the API is overloaded, AI endpoints return 503 with an actionable message.

## Production gaps (deliberately out of scope for the MVP)

- **Cards:** replace the demo card form with a processor SDK (Stripe/Adyen) so raw PANs never touch
  our servers (keeps us out of PCI-DSS scope). Providers should charge via a scoped payment intent, never a token.
- **Compliance:** HIPAA (BAAs, access controls, breach process), plus SOC 2. Key management via KMS,
  per-member data keys, Postgres instead of SQLite.
- **Provider identity:** organization verification/onboarding (NPI for US healthcare), staff roles,
  SSO, and per-staff audit attribution, which is already captured as `actor_id`.
- **Auth:** refresh tokens, MFA/passkeys, device binding, and push notifications for new requests instead of polling.
- **AI data handling:** member and consented provider data is sent to Google's API for each AI call. For real
  PHI this needs a BAA-covered endpoint (e.g. Vertex AI under a HIPAA BAA) or a self-hosted Gemma deployment;
  the client is isolated in `backend/app/agents/llm.py`.
- **Interop:** FHIR import/export for medical sections; QR share codes with short-lived rotating tokens.
