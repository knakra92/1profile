import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, fmtDate, fmtDateTime, type AccessRequest } from '../api'
import { ConsentStrip } from '../components/ConsentStrip'
import { useReveal } from '../motion'
import { useSession } from '../session'

const STATUS_TEXT: Record<AccessRequest['status'], string> = {
  pending: 'Waiting for patient',
  approved: 'Approved',
  partial: 'Partly approved',
  denied: 'Declined',
}

export function RequestsPage() {
  const { scopes, user } = useSession()
  const [code, setCode] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [purpose, setPurpose] = useState('')
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [requests, setRequests] = useState<AccessRequest[] | null>(null)

  const groups = useMemo(() => {
    const g: Record<string, string[]> = {}
    for (const [key, info] of Object.entries(scopes)) (g[info.group] ??= []).push(key)
    return g
  }, [scopes])

  const load = () => api<AccessRequest[]>('/provider/requests').then(setRequests).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const toggle = (s: string) => setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  // Keep catalog order so the preview reads like the patient's screen.
  const ordered = Object.keys(scopes).filter((k) => selected.includes(k))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSent(null)
    if (selected.length === 0) return setError('Choose at least one section to request.')
    setBusy(true)
    try {
      const req = await api<AccessRequest>('/provider/requests', {
        body: { share_code: code, scopes: ordered, purpose, duration_days: days },
      })
      setSent(`Request sent. ${req.member.full_name} will see it in their 1Profile app.`)
      setCode('')
      setSelected([])
      setPurpose('')
      load()
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'No 1Profile matches that code. Ask the patient to read the code from their app again.'
          : (err as Error).message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Request access</h1>
          <p>Ask only for what this visit needs. The patient can switch off any section before approving, and can end access at any time.</p>
        </div>
      </div>

      <div className="req-layout">
        <form className="req-form" onSubmit={submit}>
          <div className="form-row">
            <label>
              Patient’s 1Profile code
              <input
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ALEX-2026"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </label>
            <label>
              Access for (days)
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} required />
            </label>
          </div>
          <label>
            Reason, shown to the patient
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="New patient registration for an urgent care visit"
              minLength={3}
              required
            />
          </label>

          <div className="scope-groups">
            {Object.entries(groups).map(([group, keys]) => {
              const all = keys.every((k) => selected.includes(k))
              return (
                <fieldset key={group} className="scope-group">
                  <legend>
                    {group}
                    <button
                      type="button"
                      className="link small"
                      onClick={() => setSelected((cur) => (all ? cur.filter((k) => !keys.includes(k)) : [...new Set([...cur, ...keys])]))}
                    >
                      {all ? 'Clear' : 'Select all'}
                    </button>
                  </legend>
                  <div className="scope-options">
                    {keys.map((k) => (
                      <label key={k} className={`scope-option ${selected.includes(k) ? 'on' : ''}`}>
                        <input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} />
                        <span>
                          {scopes[k].label}
                          <span className="desc">{scopes[k].description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )
            })}
          </div>

          {error && <div className="alert error">{error}</div>}
          {sent && <div className="alert ok">{sent}</div>}
          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Sending request…' : selected.length ? `Send request for ${selected.length} section${selected.length > 1 ? 's' : ''}` : 'Send request'}
            </button>
          </div>
        </form>

        <aside className="preview" aria-label="Preview of the patient's screen">
          <p className="preview-cap">What the patient will see</p>
          <div className="phone">
            <div className="phone-org">{user?.provider?.name}</div>
            <div className="phone-when">Just now</div>
            <div className="phone-purpose">
              <span className="muted small">Why they’re asking</span>
              {purpose || <span className="muted">Your reason appears here</span>}
            </div>
            <ConsentStrip scopes={scopes} shared={ordered} label={`Requesting ${ordered.length} sections`} />
            <div className="phone-list">
              {ordered.length === 0 ? (
                <span className="muted">Pick sections on the left.</span>
              ) : (
                ordered.map((k) => (
                  <div key={k}>
                    {scopes[k].label}
                    <span className="toggle" />
                  </div>
                ))
              )}
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Access lasts {days} day{days === 1 ? '' : 's'} and can be revoked any time.
            </p>
            <div className="phone-cta">
              <span>Deny</span>
              <span>{ordered.length ? `Share ${ordered.length}` : 'Share'}</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="history">
        <h2>Requests you have sent</h2>
        <p className="muted small">This list updates on its own as patients respond.</p>
        <div className="strip-key" style={{ marginBottom: 28 }}>
          <span>
            <i /> Shared
          </span>
          <span>
            <i className="k-declined" /> Declined
          </span>
          <span>
            <i className="k-withheld" /> Not requested
          </span>
        </div>
        {requests === null ? (
          <p className="muted">Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className="muted">No requests yet. Your first one will appear here.</p>
        ) : (
          <div className="timeline">
            {requests.map((r) => (
              <TimelineItem key={r.id} r={r} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function TimelineItem({ r }: { r: AccessRequest }) {
  const { scopes } = useSession()
  const ref = useReveal<HTMLDivElement>(0.3)
  const declined = r.status === 'pending' ? [] : r.scopes.filter((s) => !r.approved_scopes.includes(s))
  // Pending requests show what was asked for; answered ones show what came back.
  const shown = r.status === 'pending' ? r.scopes : r.approved_scopes
  return (
    <div ref={ref} className={`tl-item st-${r.status}`}>
      <div className="tl-top">
        <span className="tl-name">{r.member.full_name}</span>
        <span className={`pill ${r.status}`}>{STATUS_TEXT[r.status]}</span>
      </div>
      <p className="tl-purpose">{r.purpose}</p>
      <p className="tl-meta">
        Sent {fmtDateTime(r.created_at)} for {r.duration_days} days
        {r.responded_at ? `. Answered ${fmtDate(r.responded_at)}` : ''}
      </p>
      <ConsentStrip
        scopes={scopes}
        shared={shown}
        declined={declined}
        label={
          r.status === 'pending'
            ? `Asked for ${r.scopes.length} sections`
            : `${r.approved_scopes.length} of ${r.scopes.length} requested sections shared`
        }
      />
    </div>
  )
}
