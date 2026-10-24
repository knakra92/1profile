import type { CSSProperties } from 'react'
import type { ScopeCatalog } from '../api'

/**
 * One segment per profile section, in catalog order, gapped by group (Personal / Health / Financial).
 * Filled = shared with you, hatched = withheld by the patient. The same mark is used everywhere a
 * consent state is shown, so staff learn to read it at a glance.
 */
export function ConsentStrip({
  scopes,
  shared,
  size = 'sm',
  active,
  declined,
  onPick,
  label,
}: {
  scopes: ScopeCatalog
  shared: Iterable<string>
  size?: 'sm' | 'lg'
  active?: string | null
  /** Requested but declined (requests page) — drawn struck through instead of hatched. */
  declined?: Iterable<string>
  onPick?: (scope: string) => void
  label?: string
}) {
  const on = new Set(shared)
  const off = new Set(declined ?? [])
  const keys = Object.keys(scopes)
  const groups: { group: string; keys: string[] }[] = []
  for (const k of keys) {
    const g = scopes[k].group
    if (groups.at(-1)?.group !== g) groups.push({ group: g, keys: [] })
    groups.at(-1)!.keys.push(k)
  }
  const summary = label ?? `Shared ${keys.filter((k) => on.has(k)).length} of ${keys.length} sections`

  return (
    <div className={`strip strip-${size}`} role="img" aria-label={summary}>
      {groups.map(({ group, keys: gk }) => (
        <div key={group} className="strip-group" style={{ flexGrow: gk.length } as CSSProperties}>
          {gk.map((k, i) => {
            const state = on.has(k) ? 'shared' : off.has(k) ? 'declined' : 'withheld'
            const cls = `seg seg-${state}${active === k ? ' seg-active' : ''}`
            const title = `${scopes[k].label}: ${state === 'shared' ? 'shared with you' : state === 'declined' ? 'declined' : 'withheld'}`
            return onPick ? (
              <button key={k} type="button" className={cls} title={title} aria-label={title} onClick={() => onPick(k)} style={{ '--i': i } as CSSProperties} />
            ) : (
              <span key={k} className={cls} title={title} style={{ '--i': i } as CSSProperties} />
            )
          })}
        </div>
      ))}
    </div>
  )
}
