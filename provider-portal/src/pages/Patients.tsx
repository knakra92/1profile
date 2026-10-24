import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, fmtDate, type PatientSummary } from '../api'
import { ConsentStrip } from '../components/ConsentStrip'
import { useReveal } from '../motion'
import { useSession } from '../session'

export function PatientsPage() {
  const { scopes, user } = useSession()
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice
  const [patients, setPatients] = useState<PatientSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = () =>
      api<PatientSummary[]>('/provider/patients')
        .then(setPatients)
        .catch((e) => setError(e.message))
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  const total = Object.keys(scopes).length

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Patients</h1>
          <p>
            {patients
              ? `${patients.length} ${patients.length === 1 ? 'person has' : 'people have'} shared their profile with ${user?.provider?.name}. `
              : ''}
            Each bar shows which of the {total || 11} sections they opened to you; hatched sections stay private.
          </p>
        </div>
        <Link to="/requests" className="btn primary">
          Request access
        </Link>
      </div>
      {notice && <div className="alert warn" style={{ marginBottom: 24 }}>{notice}</div>}
      {error && <div className="alert error">{error}</div>}
      {patients === null ? (
        <p className="muted">Loading patients…</p>
      ) : patients.length === 0 ? (
        <div className="empty-state">
          <h2>No one is sharing with you yet</h2>
          <p className="muted">
            Ask the patient for the code shown in their 1Profile app, then send a request for the sections you need.
          </p>
          <Link to="/requests" className="btn primary" style={{ marginTop: 20 }}>
            Request access
          </Link>
        </div>
      ) : (
        <Roster patients={patients} />
      )}
    </section>
  )
}

function Roster({ patients }: { patients: PatientSummary[] }) {
  const { scopes } = useSession()
  const ref = useReveal<HTMLDivElement>(0.05)
  return (
    <>
      <div className="roster-head" aria-hidden>
        <span>Patient</span>
        <span>Shared with you</span>
        <span>Access ends</span>
        <span />
      </div>
      <div ref={ref} className="roster reveal">
        {patients.map((p, i) => (
          <Link key={p.id} to={`/patients/${p.id}`} className="roster-row" style={{ '--i': i } as CSSProperties}>
            <div>
              <div className="roster-name">{p.full_name}</div>
            </div>
            <div>
              <ConsentStrip scopes={scopes} shared={p.scopes} />
              <div className="roster-meta">
                {p.scopes.length} of {Object.keys(scopes).length} sections
              </div>
            </div>
            <div className="nowrap">{fmtDate(p.expires_at)}</div>
            <span className="roster-open">Open</span>
          </Link>
        ))}
      </div>
    </>
  )
}
