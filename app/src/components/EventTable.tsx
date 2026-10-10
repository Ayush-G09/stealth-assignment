import type { EventItem } from '../lib/api'
import { VirtualTable } from './VirtualTable'

interface Props {
  items: EventItem[]
  total: number | null
  query: string
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

// Bar widths vary per row/column so the skeleton reads as "text" without any randomness.
const BAR_WIDTHS = [
  [72, 64, 58, 52, 44, 86],
  [68, 56, 66, 52, 38, 74],
  [74, 70, 50, 52, 46, 90],
  [66, 60, 62, 52, 40, 78],
]

/** Same frame, header and column grid as the real table, so the layout doesn't jump when data arrives. */
function TableSkeleton({ slow }: { slow: boolean }) {
  return (
    <div className="vt-wrap">
      <div className="vt vt-skeleton" aria-hidden="true">
        <div className="vt-head">
          <div>Time</div><div>Agent</div><div>Tool</div><div>Status</div>
          <div className="num">Latency</div><div className="args">Arguments</div>
        </div>
        {Array.from({ length: 14 }, (_, row) => (
          <div key={row} className="vt-row sk-row">
            {BAR_WIDTHS[row % BAR_WIDTHS.length].map((w, col) => (
              <div key={col} className={col === 4 ? 'num' : col === 5 ? 'args' : undefined}>
                <span className={'sk-bar' + (col === 3 ? ' sk-pill' : '')} style={col === 3 ? undefined : { width: `${w}%` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="vt-foot" role="status" aria-live="polite">
        <span className="muted">
          {slow ? 'This is taking longer than usual. The server may be slow, still trying…' : 'Loading events…'}
        </span>
      </div>
    </div>
  )
}

export function EventTable(p: Props) {
  if (p.loading) return <TableSkeleton slow={p.slow} />
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
    <VirtualTable
      items={p.items}
      query={p.query}
      total={p.total}
      hasMore={p.hasMore}
      loadingMore={p.loadingMore}
      moreError={p.moreError}
      slow={p.slow}
      selectedId={p.selectedId}
      onSelect={p.onSelect}
      onLoadMore={p.onLoadMore}
      onRetry={p.onRetry}
    />
  )
}
