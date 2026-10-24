import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  ApiError,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  type ChatMessage,
  type LabValue,
  type PatientSummary,
  type PatientView,
  type Records,
} from '../api'
import { ConsentStrip } from '../components/ConsentStrip'
import { Mark, useModelReady } from '../components/Layout'
import { Markdown } from '../components/Markdown'
import { ScopeData } from '../components/ScopeData'
import { prefersReducedMotion, useParallax, useReveal, useScrollProgress, useScrollSpy } from '../motion'
import { scopeLabel, useSession } from '../session'

type Allergy = { substance?: string; reaction?: string; severity?: string }

const REVOKED = 'This patient revoked access, or it expired. Send a new request if you still need their details.'
const sectionId = (scope: string) => `sec-${scope.replace('.', '-')}`

export function PatientPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { scopes, user } = useSession()
  const [view, setView] = useState<PatientView | null>(null)
  const [records, setRecords] = useState<Records | null>(null)
  const [expires, setExpires] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pageRef = useScrollProgress<HTMLElement>(240)

  const onError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) navigate('/patients', { state: { notice: REVOKED } })
      else setError((e as Error).message)
    },
    [navigate],
  )

  const loadRecords = useCallback(
    () => api<Records>(`/provider/patients/${id}/records`).then(setRecords).catch(onError),
    [id, onError],
  )

  useEffect(() => {
    api<PatientView>(`/provider/patients/${id}`).then(setView).catch(onError)
    api<PatientSummary[]>('/provider/patients')
      .then((ps) => setExpires(ps.find((p) => String(p.id) === id)?.expires_at ?? null))
      .catch(() => {})
    loadRecords()
  }, [id, onError, loadRecords])

  const order = Object.keys(scopes)
  const active = useScrollSpy(view ? order.map(sectionId) : [])
  const activeScope = order.find((k) => sectionId(k) === active) ?? null

  // The section stays mounted across loading states so the scroll hooks attach to it once.
  if (error || !view)
    return (
      <section ref={pageRef}>
        {error ? <div className="alert error">{error}</div> : <p className="muted">Opening record…</p>}
      </section>
    )

  const name = view.member.full_name
  const first = name.split(' ')[0]
  const sharedCount = order.filter((k) => k in view.shared).length
  const allergies = (view.shared['medical.allergies'] as Allergy[] | undefined) ?? null

  const jump = (scope: string) =>
    document.getElementById(sectionId(scope))?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })

  return (
    <section ref={pageRef}>
      <div className="ph-hero">
        <Link to="/patients" className="ph-back">
          All patients
        </Link>
        <h1 className="ph-name">{name}</h1>
        <p className="ph-sub">
          {first} shares {sharedCount} of {order.length} sections with {user?.provider?.name}
          {expires ? `, until ${fmtDate(expires)}` : ''}. Hatched sections are the ones {first} kept private.
        </p>
      </div>

      <div className="ph-bar">
        <div className="ph-bar-top">
          <span className="ph-compact">{name}</span>
          <span className="ph-reading">{activeScope ? <>Reading <b>{scopeLabel(scopes, activeScope)}</b></> : 'Select a segment to jump to a section'}</span>
        </div>
        <ConsentStrip
          size="lg"
          scopes={scopes}
          shared={Object.keys(view.shared)}
          active={activeScope}
          onPick={jump}
          label={`${first} shares ${sharedCount} of ${order.length} sections`}
        />
        <AllergyLine allergies={allergies} />
      </div>

      <div className="ph-body">
        <div>
          <div className="ledger">
            {order.map((k) => (
              <LedgerRow key={k} scope={k} first={first} data={view.shared[k]} shared={k in view.shared} current={k === activeScope} />
            ))}
          </div>
          <RecordsPanel id={id!} org={user?.provider?.name ?? 'your organization'} records={records} reload={loadRecords} onError={onError} />
          <p className="audit-note">
            <Mark /> Opening this page was added to {first}’s activity log, as is each AI summary or question.
          </p>
        </div>
        <aside className="ph-rail">
          <AiPanel id={id!} first={first} onError={onError} />
        </aside>
      </div>
    </section>
  )
}

function AllergyLine({ allergies }: { allergies: Allergy[] | null }) {
  if (allergies === null)
    return <div className="allergy unknown">Allergies were not shared. Confirm them with the patient before treatment.</div>
  if (allergies.length === 0) return <div className="allergy unknown">No allergies on file.</div>
  return (
    <div className="allergy" role="alert">
      <span className="allergy-title">Allergies</span>
      {allergies.map((a, i) => (
        <span key={i} className="allergy-item">
          <b>{a.substance}</b>
          {a.reaction && `, ${a.reaction.toLowerCase()}`}
          {a.severity && <em>{a.severity}</em>}
        </span>
      ))}
    </div>
  )
}

function LedgerRow({ scope, first, data, shared, current }: { scope: string; first: string; data: unknown; shared: boolean; current: boolean }) {
  const { scopes } = useSession()
  const rowRef = useReveal<HTMLDivElement>(0.2)
  const hatchRef = useParallax<HTMLDivElement>(0.25)
  const info = scopes[scope]
  return (
    <div ref={rowRef} id={sectionId(scope)} className={`lrow ${shared ? '' : 'sealed'} ${current ? 'current' : ''}`}>
      <div className="lrow-label">
        <h3>{info.label}</h3>
        <p>{shared ? info.group : 'Not shared'}</p>
      </div>
      {shared ? (
        <div className="lrow-data">
          <ScopeData data={data} />
        </div>
      ) : (
        <div ref={hatchRef} className="lrow-data">
          {first} kept {info.label.toLowerCase()} private. <Link to="/requests">Ask again</Link> if you need it for this visit.
        </div>
      )}
    </div>
  )
}

// ---------------- records ----------------
type Tab = 'appointments' | 'bills' | 'results'
const TAB_NAMES: Record<Tab, [string, string]> = {
  appointments: ['Appointments', 'appointment'],
  bills: ['Bills', 'bill'],
  results: ['Lab results', 'lab result'],
}

function RecordsPanel({
  id,
  org,
  records,
  reload,
  onError,
}: {
  id: string
  org: string
  records: Records | null
  reload: () => void
  onError: (e: unknown) => void
}) {
  const [tab, setTab] = useState<Tab>('appointments')
  const [adding, setAdding] = useState(false)
  const done = () => {
    setAdding(false)
    reload()
  }
  return (
    <div className="records">
      <div className="records-head">
        <h2>Records from {org}</h2>
        <button className="btn small" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Cancel' : `Add ${TAB_NAMES[tab][1]}`}
        </button>
      </div>
      <div className="tabs" role="tablist">
        {(Object.keys(TAB_NAMES) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => {
              setTab(t)
              setAdding(false)
            }}
          >
            {TAB_NAMES[t][0]}
            {records && <span className="count">{records[t].length}</span>}
          </button>
        ))}
      </div>
      {adding && (
        <div className="add-form">
          {tab === 'appointments' && <AddAppointment id={id} onDone={done} onError={onError} />}
          {tab === 'bills' && <AddBill id={id} onDone={done} onError={onError} />}
          {tab === 'results' && <AddResult id={id} onDone={done} onError={onError} />}
        </div>
      )}
      {!records ? (
        <p className="muted">Loading records…</p>
      ) : tab === 'appointments' ? (
        records.appointments.length === 0 ? (
          <p className="muted">No appointments yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Department</th>
                  <th>Clinician</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...records.appointments]
                  .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
                  .map((a) => (
                    <tr key={a.id}>
                      <td className="nowrap">{fmtDateTime(a.starts_at)}</td>
                      <td>{a.department ?? 'Not set'}</td>
                      <td>{a.clinician ?? 'Not set'}</td>
                      <td>
                        {a.reason ?? 'Not set'}
                        {a.location && <div className="muted small">{a.location}</div>}
                      </td>
                      <td>
                        <span className={`pill ${a.status}`}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'bills' ? (
        records.bills.length === 0 ? (
          <p className="muted">No bills yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="right">Total</th>
                  <th className="right">Insurance</th>
                  <th className="right">Patient owes</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.bills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.description}</td>
                    <td className="right">{fmtMoney(b.amount_cents)}</td>
                    <td className="right">{fmtMoney(b.insurance_covered_cents)}</td>
                    <td className="right strong">{fmtMoney(Math.max(b.amount_cents - b.insurance_covered_cents, 0))}</td>
                    <td className="nowrap">{fmtDate(b.due_date)}</td>
                    <td>
                      <span className={`pill ${b.status}`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : records.results.length === 0 ? (
        <p className="muted">No lab results yet.</p>
      ) : (
        <div>
          {records.results.map((r) => (
            <div key={r.id} className="lab">
              <div className="lab-head">
                <span className="strong">{r.test_name}</span>
                <span className="muted small">Collected {fmtDate(r.collected_at)}</span>
              </div>
              <table className="table compact">
                <tbody>
                  {r.results.map((v, i) => (
                    <tr key={i} className={v.flag !== 'normal' ? `flag-${v.flag}` : ''}>
                      <td>{v.name}</td>
                      <td className="right strong">
                        {v.value} <span className="muted small">{v.unit}</span>
                      </td>
                      <td className="muted small">{v.ref_range}</td>
                      <td className="right">
                        {v.flag !== 'normal' ? (
                          <span className={`flag ${v.flag}`}>{v.flag === 'high' ? 'High' : 'Low'}</span>
                        ) : (
                          <span className="muted small">Normal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.notes && <div className="muted small">{r.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type AddProps = { id: string; onDone: () => void; onError: (e: unknown) => void }

function useSubmit(onDone: () => void, onError: (e: unknown) => void) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      onDone()
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) onError(e)
      else setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, err, run }
}

/** <input type="date"> value → ISO at local noon (avoids the date shifting across timezones). */
const dateToIso = (d: string) => new Date(`${d}T12:00:00`).toISOString()

function AddAppointment({ id, onDone, onError }: AddProps) {
  const [f, setF] = useState({ starts_at: '', department: '', clinician: '', reason: '', location: '' })
  const { busy, err, run } = useSubmit(onDone, onError)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() =>
      api(`/provider/patients/${id}/appointments`, {
        body: {
          starts_at: new Date(f.starts_at).toISOString(),
          department: f.department || null,
          clinician: f.clinician || null,
          reason: f.reason || null,
          location: f.location || null,
        },
      }),
    )
  }
  return (
    <form onSubmit={submit} className="grid-form">
      <label>
        Date & time
        <input type="datetime-local" value={f.starts_at} onChange={set('starts_at')} required />
      </label>
      <label>
        Department
        <input value={f.department} onChange={set('department')} placeholder="Cardiology" />
      </label>
      <label>
        Clinician
        <input value={f.clinician} onChange={set('clinician')} placeholder="Dr. …" />
      </label>
      <label>
        Location
        <input value={f.location} onChange={set('location')} placeholder="Building A, Floor 2" />
      </label>
      <label className="span-2">
        Reason
        <input value={f.reason} onChange={set('reason')} />
      </label>
      {err && <div className="alert error span-2">{err}</div>}
      <div className="span-2 actions">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Schedule appointment'}
        </button>
      </div>
    </form>
  )
}

function AddBill({ id, onDone, onError }: AddProps) {
  const [f, setF] = useState({ description: '', amount: '', covered: '', due: '' })
  const { busy, err, run } = useSubmit(onDone, onError)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const cents = (s: string) => Math.round(parseFloat(s || '0') * 100)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() =>
      api(`/provider/patients/${id}/bills`, {
        body: {
          description: f.description,
          amount_cents: cents(f.amount),
          insurance_covered_cents: cents(f.covered),
          due_date: f.due ? dateToIso(f.due) : null,
        },
      }),
    )
  }
  const owes = Math.max(cents(f.amount) - cents(f.covered), 0)
  return (
    <form onSubmit={submit} className="grid-form">
      <label className="span-2">
        Description
        <input value={f.description} onChange={set('description')} placeholder="Office visit — Primary care" required />
      </label>
      <label>
        Total amount ($)
        <input type="number" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} required />
      </label>
      <label>
        Insurance covered ($)
        <input type="number" min="0" step="0.01" value={f.covered} onChange={set('covered')} />
      </label>
      <label>
        Due date
        <input type="date" value={f.due} onChange={set('due')} />
      </label>
      <div className="owes">
        Patient owes <strong>{fmtMoney(owes)}</strong>
      </div>
      {err && <div className="alert error span-2">{err}</div>}
      <div className="span-2 actions">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Issue bill'}
        </button>
      </div>
    </form>
  )
}

const emptyRow = (): LabValue => ({ name: '', value: '', unit: '', ref_range: '', flag: 'normal' })

function AddResult({ id, onDone, onError }: AddProps) {
  const [test, setTest] = useState('')
  const [collected, setCollected] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<LabValue[]>([emptyRow()])
  const { busy, err, run } = useSubmit(onDone, onError)
  const setRow = (i: number, k: keyof LabValue, v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const results = rows
      .filter((r) => r.name.trim())
      .map((r) => {
        const n = Number(r.value)
        return { ...r, value: r.value !== '' && !Number.isNaN(n) ? n : r.value, unit: r.unit || null, ref_range: r.ref_range || null }
      })
    run(() =>
      api(`/provider/patients/${id}/results`, {
        body: { test_name: test, collected_at: dateToIso(collected), results, notes: notes || null },
      }),
    )
  }
  return (
    <form onSubmit={submit}>
      <div className="grid-form">
        <label>
          Test name
          <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="Basic metabolic panel" required />
        </label>
        <label>
          Collected on
          <input type="date" value={collected} onChange={(e) => setCollected(e.target.value)} required />
        </label>
      </div>
      <table className="table compact lab-edit">
        <thead>
          <tr>
            <th>Analyte</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Reference</th>
            <th>Flag</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} placeholder="Glucose" required={i === 0} />
              </td>
              <td>
                <input value={String(r.value)} onChange={(e) => setRow(i, 'value', e.target.value)} required={!!r.name} />
              </td>
              <td>
                <input value={r.unit ?? ''} onChange={(e) => setRow(i, 'unit', e.target.value)} placeholder="mg/dL" />
              </td>
              <td>
                <input value={r.ref_range ?? ''} onChange={(e) => setRow(i, 'ref_range', e.target.value)} placeholder="70–99" />
              </td>
              <td>
                <select value={r.flag} onChange={(e) => setRow(i, 'flag', e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </td>
              <td>
                {rows.length > 1 && (
                  <button type="button" className="link" onClick={() => setRows(rows.filter((_, j) => j !== i))} title="Remove row">
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="link small" onClick={() => setRows([...rows, emptyRow()])}>
        Add another analyte
      </button>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {err && <div className="alert error">{err}</div>}
      <div className="actions">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Publish result'}
        </button>
      </div>
    </form>
  )
}

// ---------------- AI ----------------
const SUGGESTIONS = ['Any medication interactions to watch for?', 'Summarize recent lab results', 'What should I confirm at check-in?']

function AiPanel({ id, first, onError }: { id: string; first: string; onError: (e: unknown) => void }) {
  const modelReady = useModelReady()
  const [brief, setBrief] = useState<string | null>(null)
  const [briefBusy, setBriefBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, chatBusy, brief])

  const handle = (e: unknown) => {
    if (e instanceof ApiError && e.status === 404) onError(e)
    else setAiError((e as Error).message)
  }

  const genBrief = async () => {
    setBriefBusy(true)
    setAiError(null)
    try {
      setBrief((await api<{ brief: string }>(`/provider/patients/${id}/brief`, { method: 'POST' })).brief)
    } catch (e) {
      handle(e)
    } finally {
      setBriefBusy(false)
    }
  }

  const ask = async (q: string) => {
    if (!q.trim() || chatBusy) return
    const next: ChatMessage[] = [...messages, { role: 'user', content: q.trim() }]
    setMessages(next)
    setInput('')
    setChatBusy(true)
    setAiError(null)
    try {
      const res = await api<{ reply: string }>(`/provider/patients/${id}/chat`, { body: { messages: next } })
      setMessages([...next, { role: 'assistant', content: res.reply }])
    } catch (err) {
      setMessages(messages)
      setInput(q)
      handle(err)
    } finally {
      setChatBusy(false)
    }
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    ask(input)
  }

  return (
    <div className="panel ai">
      <div className="ai-head">
        <h2>
          Assistant
          <span className={`ai-status ${modelReady ? 'ok' : ''}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--graphite)' }}>
            <i /> {modelReady ? 'Gemma 4' : 'Off'}
          </span>
        </h2>
        <p>Answers use only what {first} shared with you and your own records.</p>
      </div>
      <div className="ai-scroll" ref={scrollRef}>
        {brief && (
          <div className="brief">
            <Markdown text={brief} />
          </div>
        )}
        {briefBusy && (
          <span className="thinking" aria-label="Writing brief">
            <i />
            <i />
            <i />
          </span>
        )}
        {messages.length === 0 && !brief && !briefBusy && (
          <div className="suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} disabled={chatBusy}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
          </div>
        ))}
        {chatBusy && (
          <div className="bubble assistant">
            <span className="thinking" aria-label="Thinking">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {aiError && <div className="alert warn">{aiError}</div>}
      </div>
      <div className="ai-foot">
        <button className="btn full" onClick={genBrief} disabled={briefBusy}>
          {briefBusy ? 'Writing pre-visit brief…' : brief ? 'Rewrite pre-visit brief' : 'Write pre-visit brief'}
        </button>
        <form className="chat-input" onSubmit={send}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask about ${first}…`} disabled={chatBusy} aria-label="Question for the assistant" />
          <button className="btn primary" disabled={chatBusy || !input.trim()}>
            Ask
          </button>
        </form>
      </div>
    </div>
  )
}
