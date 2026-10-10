import { useEffect, useState } from 'react'
import { fetchAgents, type Filters, type Status } from '../lib/api'

interface Props {
  filters: Filters
  total: number | null
  onChange: (patch: Partial<Filters>, mode?: 'push' | 'replace') => void
}

export function FilterBar({ filters, total, onChange }: Props) {
  const [agents, setAgents] = useState<string[]>([])
  const [agentsFailed, setAgentsFailed] = useState(false)
  const [text, setText] = useState(filters.q)

  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    fetchAgents(c.signal)
      .then((list) => { setAgents(list); setAgentsFailed(false) })
      .catch((e: Error) => { if (e.name !== 'AbortError') setAgentsFailed(true) })
    return () => c.abort()
  }, [attempt])

  // Keep the input in sync when the URL changes underneath it (back/forward, chips, clear).
  // Adjusting state during render is the supported way to derive state from a changed prop.
  const [seenQ, setSeenQ] = useState(filters.q)
  if (filters.q !== seenQ) {
    setSeenQ(filters.q)
    setText(filters.q)
  }

  // debounce typing -> URL (replace so each keystroke doesn't spam history)
  useEffect(() => {
    if (text === filters.q) return
    const t = setTimeout(() => onChange({ q: text }, 'replace'), 300)
    return () => clearTimeout(t)
  }, [text, filters.q, onChange])

  const toggleAgent = (a: string) =>
    onChange({ agents: filters.agents.includes(a) ? filters.agents.filter((x) => x !== a) : [...filters.agents, a] })

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(filters.q ? [{ key: 'q', label: `Search: "${filters.q}"`, remove: () => onChange({ q: '' }) }] : []),
    ...(filters.status ? [{ key: 'status', label: `Status: ${filters.status}`, remove: () => onChange({ status: '' }) }] : []),
    ...filters.agents.map((a) => ({ key: `agent:${a}`, label: `Agent: ${a}`, remove: () => toggleAgent(a) })),
  ]

  return (
    <div className="filter-wrap" role="search">
    <div className="filters">
      <input
        type="search" aria-label="Search events" placeholder="Search agent, tool, args…"
        value={text} onChange={(e) => setText(e.target.value)}
      />
      <select
        aria-label="Status" value={filters.status}
        onChange={(e) => onChange({ status: e.target.value as Status | '' })}
      >
        <option value="">All statuses</option>
        <option value="ok">ok</option>
        <option value="blocked">blocked</option>
        <option value="error">error</option>
      </select>
      <details className="agent-menu">
        <summary>Agents{filters.agents.length ? ` (${filters.agents.length})` : ''}</summary>
        <div className="agent-list">
          {agentsFailed && <button onClick={() => setAttempt((n) => n + 1)}>Couldn't load agents, retry</button>}
          {agents.map((a) => (
            <label key={a}>
              <input type="checkbox" checked={filters.agents.includes(a)} onChange={() => toggleAgent(a)} /> {a}
            </label>
          ))}
        </div>
      </details>
      <span className="count" aria-live="polite">{total !== null ? `${total.toLocaleString()} events` : ''}</span>
    </div>
    {chips.length > 0 && (
      <ul className="chips" aria-label="Active filters">
        {chips.map((c) => (
          <li key={c.key}>
            <button className="chip" onClick={c.remove} aria-label={`Remove filter: ${c.label}`}>
              {c.label} <span aria-hidden="true">✕</span>
            </button>
          </li>
        ))}
        <li><button className="chip-clear" onClick={() => onChange({ q: '', agents: [], status: '' })}>Clear all</button></li>
      </ul>
    )}
    </div>
  )
}
