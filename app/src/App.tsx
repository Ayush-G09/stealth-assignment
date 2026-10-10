import { useCallback } from 'react'
import { DetailPanel } from './components/DetailPanel'
import { EventTable } from './components/EventTable'
import { ThemeToggle } from './components/ThemeToggle'
import { FilterBar } from './components/FilterBar'
import { useEvents } from './lib/useEvents'
import { useUrlState } from './lib/useUrlState'
import './index.css'

export default function App() {
  const [url, update] = useUrlState()
  const filters = { q: url.q, agents: url.agents, status: url.status }
  const ev = useEvents(filters)
  const onChange = useCallback(update, [update])
  const closePanel = useCallback(() => update({ eventId: null }), [update])
  const clear = () => update({ q: '', agents: [], status: '' })

  return (
    <div className="app">
      <header>
        <div>
          <h1>Agent Activity Explorer</h1>
          <p className="muted subtitle">Browse, search and inspect tool calls made by your AI agents.</p>
        </div>
        <ThemeToggle />
      </header>
      <FilterBar filters={filters} total={ev.total} onChange={onChange} />
      <main>
        <EventTable
          {...ev}
          hasMore={!!ev.cursor}
          query={url.q}
          selectedId={url.eventId}
          onSelect={(id) => update({ eventId: id })}
          onLoadMore={ev.loadMore}
          onRetry={ev.retry}
          onClearFilters={clear}
          filtered={!!(url.q || url.agents.length || url.status)}
        />
      </main>
      {url.eventId && <DetailPanel key={url.eventId} id={url.eventId} onClose={closePanel} />}
    </div>
  )
}
