import type { ReactNode } from 'react'

/** Minimal markdown: headings, bullet/numbered lists, **bold**, *italic*, `code`. Enough for LLM briefs. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>
    return p
  })
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>)
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    flush()
    if (heading) {
      const level = heading[1].length
      const content = inline(heading[2])
      blocks.push(level <= 2 ? <h3 key={blocks.length}>{content}</h3> : <h4 key={blocks.length}>{content}</h4>)
    } else if (line.trim()) {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>)
    }
  }
  flush()
  return <div className="md">{blocks}</div>
}
