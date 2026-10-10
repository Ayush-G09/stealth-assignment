import { useCallback } from 'react'
import { EventTable } from './components/EventTable'
import { FilterBar } from './components/FilterBar'
import { useEvents } from './lib/useEvents'
import { useUrlState } from './lib/useUrlState'
import './index.css'

export default function App() {
  const [url, update] = useUrlState()
  const filters = { q: url.q, agents: url.agents, status: url.status }
  const ev = useEvents(filters)
  const onChange = useCallback(update, [update])
  const clear = () => update({ q: '', agents: [], status: '' })

  return (
    <div className="app">
      <header><h1>Agent Activity Explorer</h1></header>
      <FilterBar filters={filters} total={ev.total} onChange={onChange} />
      <main>
        <EventTable
          {...ev}
          hasMore={!!ev.cursor}
          selectedId={url.eventId}
          onSelect={(id) => update({ eventId: id })}
          onLoadMore={ev.loadMore}
          onRetry={ev.retry}
          onClearFilters={clear}
          filtered={!!(url.q || url.agents.length || url.status)}
        />
      </main>
    </div>
  )
}
