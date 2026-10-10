import type { EventItem } from '../lib/api'
import { VirtualTable } from './VirtualTable'

interface Props {
  items: EventItem[]
  total: number | null
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

export function EventTable(p: Props) {
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
    <VirtualTable
      items={p.items}
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
