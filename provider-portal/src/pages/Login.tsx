import { useState, type CSSProperties, type FormEvent } from 'react'
import type { ScopeCatalog } from '../api'
import { ConsentStrip } from '../components/ConsentStrip'
import { Mark } from '../components/Layout'
import { useParallax, useSectionProgress } from '../motion'
import { useSession } from '../session'

const DEMO = [
  { email: 'dr.patel@stmarys.demo', who: "St. Mary's General Hospital" },
  { email: 'frontdesk@northside.demo', who: 'Northside Family Clinic' },
  { email: 'ops@firstharbor.demo', who: 'First Harbor Bank' },
]

// The scope catalog is only served after sign-in; the story below needs its shape, not its data.
const STORY_CATALOG: ScopeCatalog = Object.fromEntries(
  [
    ['identity', 'Basic identity', 'Personal'],
    ['contact', 'Contact details', 'Personal'],
    ['addresses', 'Addresses', 'Personal'],
    ['emergency_contacts', 'Emergency contacts', 'Personal'],
    ['insurance', 'Insurance', 'Health'],
    ['medical.allergies', 'Allergies', 'Health'],
    ['medical.medications', 'Medications', 'Health'],
    ['medical.conditions', 'Conditions', 'Health'],
    ['medical.history', 'Medical history', 'Health'],
    ['medical.immunizations', 'Immunizations', 'Health'],
    ['payment', 'Payment method', 'Financial'],
  ].map(([key, label, group]) => [key, { label, group, description: '', shape: 'object' as const }]),
)

const REQUESTED = ['identity', 'contact', 'addresses', 'insurance', 'medical.allergies', 'medical.medications']
const DECLINED_BY_PATIENT = ['addresses', 'medical.medications']

export function LoginPage() {
  return (
    <>
      <div className="si-top">
        <Mark />
        <span className="brand">1Profile</span>
        <span className="tag">for providers</span>
      </div>
      <Hero />
      <Story />
      <footer className="si-foot">
        <p>Every time you open a patient’s profile, it appears in their activity log.</p>
        <button className="btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          Back to sign in
        </button>
      </footer>
    </>
  )
}

function Sheet({ speed, style }: { speed: number; style: CSSProperties }) {
  const ref = useParallax<HTMLDivElement>(speed)
  return (
    <div ref={ref} className="sheet" style={style} aria-hidden>
      <b />
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  )
}

function Hero() {
  return (
    <section className="si-hero">
      {/* The intake forms patients fill in again and again, drifting at different depths. */}
      <div className="sheets">
        <Sheet speed={0.18} style={{ left: '44%', top: '64%', '--r': '-7deg', opacity: 0.55 } as CSSProperties} />
        <Sheet speed={0.32} style={{ left: '49%', top: '6%', '--r': '5deg', opacity: 0.45 } as CSSProperties} />
        <Sheet speed={0.1} style={{ left: '-4%', top: '80%', '--r': '3deg', opacity: 0.4 } as CSSProperties} />
        <Sheet speed={0.42} style={{ left: '27%', top: '-24%', '--r': '-4deg', opacity: 0.3 } as CSSProperties} />
      </div>
      <div className="si-copy">
        <h1>Patient details, shared by the patient.</h1>
        <p>
          Patients keep one profile up to date and approve each section you ask for. You see what they chose to
          share, current as of today.
        </p>
        <div className="si-scroll">
          <i /> How sharing works
        </div>
      </div>
      <SignInForm />
    </section>
  )
}

function SignInForm() {
  const { login } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="si-form" onSubmit={submit}>
      <h2>Sign in to your organization</h2>
      <label>
        Work email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <div className="alert error">{error}</div>}
      <button className="btn primary full" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="si-demo">
        <span className="muted">Demo staff accounts, password demo1234</span>
        {DEMO.map((d) => (
          <button
            type="button"
            key={d.email}
            className="link"
            onClick={() => {
              setEmail(d.email)
              setPassword('demo1234')
            }}
          >
            {d.who}
          </button>
        ))}
      </div>
    </form>
  )
}

const STEPS = [
  { title: 'You ask for specific sections', body: 'Enter the code from the patient’s app, pick the sections you need, and say why.' },
  { title: 'The patient decides on their phone', body: 'They see your organization and your reason, and can switch off anything they would rather not share.' },
  { title: 'You see what they approved', body: 'Only the approved sections open, for the time they allowed. If they move or change insurance, you see the update.' },
]

function Story() {
  const [ref, step] = useSectionProgress<HTMLElement>(STEPS.length)
  const declined = step >= 1 ? DECLINED_BY_PATIENT : []
  const shared = step >= 2 ? REQUESTED.filter((k) => !DECLINED_BY_PATIENT.includes(k)) : []

  return (
    <section ref={ref} className="story" aria-label="How sharing works">
      <div className="story-pin">
        <div>
          <h2>Three steps, and the patient takes the middle one.</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className={i <= step ? 'on' : ''}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="story-progress" aria-hidden>
            <i />
          </div>
        </div>
        <div className="device" aria-hidden>
          <div className="device-org">Northside Family Clinic</div>
          <div className="device-sub">New patient registration for an urgent care visit</div>
          <div className="device-rows">
            {REQUESTED.map((k) => (
              <div key={k} className={`device-row ${declined.includes(k) ? 'off' : ''}`}>
                {STORY_CATALOG[k].label}
                <span className="toggle" />
              </div>
            ))}
          </div>
          <div className="device-strip">
            <ConsentStrip scopes={STORY_CATALOG} shared={shared} declined={step >= 2 ? DECLINED_BY_PATIENT : []} />
          </div>
          <span className={`device-badge ${step >= 2 ? 'done' : ''}`}>
            {step === 0 ? 'Waiting for the patient' : step === 1 ? 'Patient is choosing' : 'Shared 4 of the 6 you asked for'}
          </span>
          <div className="device-note">
            {step >= 2 ? 'Addresses and medications stay private. You can ask again later.' : ' '}
          </div>
        </div>
      </div>
    </section>
  )
}
