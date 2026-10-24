/** Generic, readable rendering of a shared profile section (object → key/value, list → ruled items). */

const humanize = (k: string) => {
  const s = k.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <span className="muted">Not given</span>
  if (typeof v === 'boolean') return <>{v ? 'Yes' : 'No'}</>
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="muted">None</span>
    if (v.every((x) => typeof x !== 'object' || x === null)) return <>{v.join(', ')}</>
    return (
      <div className="items nested">
        {v.map((item, i) => (
          <div className="item" key={i}>
            <KeyValues obj={item as Record<string, unknown>} />
          </div>
        ))}
      </div>
    )
  }
  if (typeof v === 'object') return <KeyValues obj={v as Record<string, unknown>} />
  return <>{String(v)}</>
}

function KeyValues({ obj }: { obj: Record<string, unknown> }) {
  return (
    <dl className="kv">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{humanize(k)}</dt>
          <dd>
            <Value v={v} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ScopeData({ data }: { data: unknown }) {
  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="muted">Nothing on file.</p>
    return (
      <div className="items">
        {data.map((item, i) => (
          <div className="item" key={i}>
            {typeof item === 'object' && item !== null ? <KeyValues obj={item as Record<string, unknown>} /> : String(item)}
          </div>
        ))}
      </div>
    )
  }
  if (data && typeof data === 'object') {
    if (Object.keys(data).length === 0) return <p className="muted">Nothing on file.</p>
    return <KeyValues obj={data as Record<string, unknown>} />
  }
  return <p className="muted">Nothing on file.</p>
}
