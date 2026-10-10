import { useEffect, useRef } from 'react'
import type { EventItem } from '../lib/api'

interface Props {
  items: EventItem[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  moreError: string | null
  slow: boolean
  hasMore: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onLoadMore: () => void
  onRetry: () => void
  onClearFilters: () => void
  filtered: boolean
}

const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' })

export function EventTable(p: Props) {
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el || !p.hasMore || p.moreError) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && p.onLoadMore(), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [p.hasMore, p.moreError, p.onLoadMore, p.items.length])

  if (p.loading) {
    return (
      <div role="status" aria-live="polite">
        <div className="skeleton">{Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton-row" />)}</div>
        <p className="muted center">
          {p.slow ? 'This is taking longer than usual. The server may be slow, still trying…' : 'Loading events…'}
        </p>
      </div>
    )
  }
  if (p.error) {
    return (
      <div role="alert" className="state">
        <p>Couldn't load events: {p.error}</p>
        <button onClick={p.onRetry}>Try again</button>
      </div>
    )
  }
  if (p.items.length === 0) {
    return (
      <div className="state">
        <p>No events match your {p.filtered ? 'filters' : 'query'}.</p>
        {p.filtered && <button onClick={p.onClearFilters}>Clear filters</button>}
      </div>
    )
  }

  return (
    <>
      <table>
        <thead>
          <tr><th>Time</th><th>Agent</th><th>Tool</th><th>Status</th><th className="num">Latency</th></tr>
        </thead>
        <tbody>
          {p.items.map((e) => (
            <tr
              key={e.id} tabIndex={0} aria-selected={e.id === p.selectedId}
              className={e.id === p.selectedId ? 'selected' : ''}
              onClick={() => p.onSelect(e.id)}
              onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); p.onSelect(e.id) } }}
            >
              <td>{fmt.format(new Date(e.timestamp))}</td>
              <td>{e.agent}</td>
              <td><code>{e.tool}</code></td>
              <td><span className={`badge ${e.status}`}>{e.status}</span></td>
              <td className="num">{e.latencyMs} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={sentinel} className="more" role="status" aria-live="polite">
        {p.loadingMore && <span>{p.slow ? 'Still loading, slow connection…' : 'Loading more…'}</span>}
        {p.moreError && (
          <span>Couldn't load more ({p.moreError}) <button onClick={p.onRetry}>Retry</button></span>
        )}
        {p.hasMore && !p.loadingMore && !p.moreError && <button onClick={p.onLoadMore}>Load more</button>}
        {!p.hasMore && !p.loadingMore && <span className="muted">End of results</span>}
      </div>
    </>
  )
}
