# 1Profile

**One profile for your personal details, shared only with the people you approve, one section at a time.**

## Inspiration

Every new clinic, hospital, bank or service provider hands you the same form: name, date of birth, address,
insurance, allergies, medications, emergency contacts. When you move, you update your address in dozens of
places, and your card details end up stored by hundreds of companies. Those details belong to you, so you
should keep them up to date in one place and decide who gets to see them.

## What it does

**For people (iOS app)**
- Keep your identity, contact details, addresses, insurance, medical history and payment cards in one profile.
- Approve or deny every request from a provider, **section by section**. You see who is asking and why, and you
  can switch off anything you'd rather not share.
- See exactly who can see what, revoke access at any time, and review an activity log of every view.
- Update something once, such as a new address, and every provider you've shared it with sees the change straight away.
- View your appointments, bills and lab results, and ask an AI assistant to explain results, check what you owe
  or suggest next steps across health, money and privacy.

**For providers (web portal)**
- Ask a patient for the code shown in their app, then request only the sections you need.
- See only what the patient approved. Withheld sections stay visibly sealed, and allergies stay pinned to the top of the page.
- Add appointments, bills and lab results, and use an AI assistant that writes a pre-visit brief and answers
  questions from **only** the data the patient consented to share.

## How we built it

- **Backend:** Python, FastAPI, SQLAlchemy and SQLite. Profile sections are encrypted at rest and the audit log
  can only be added to, never edited. All provider access goes through a single consent check that limits it to
  the sections the patient granted.
- **Mobile app:** React Native with Expo, running in the iOS Simulator.
- **Provider portal:** React, TypeScript and Vite, with custom scroll-triggered animation and parallax built
  without animation libraries.
- **AI agents:** Gemma 4 (`gemma-4-26b-a4b-it`) through the Gemini API. The personal assistant calls tools that
  can only reach the signed-in person's own records. The provider agent is only ever given consented, redacted
  data, so it cannot reveal anything the patient withheld.

## Challenges

- Designing consent around individual sections, so that partial approvals, expiry dates and revocation all behave correctly.
- Keeping the AI away from data it shouldn't see by never giving it that data, rather than relying on instructions in the prompt.
- Timezones: the model read UTC times as local times, so the backend now formats every time in the viewer's
  timezone before the model sees it.

## What's next

- Collect cards through a payment processor such as Stripe, so card numbers never reach our servers. The
  current demo stores only the brand, the last four digits and a token.
- Move to a HIPAA-eligible AI endpoint, Postgres with managed encryption keys, and identity verification for providers.
- Add push notifications for new requests, rotating QR share codes, and import and export in FHIR, the standard format for exchanging health records.

## Try it

Demo accounts use the password `demo1234`. Sign in to the app as `alex@demo.com`, and to the portal as
`frontdesk@northside.demo` to approve a pending request live on the phone. Setup steps are in `README.md`.
