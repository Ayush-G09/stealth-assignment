import { lazy, Suspense, useCallback } from 'react'
import { DetailPanel } from './components/DetailPanel'
import { EventTable } from './components/EventTable'
import { ThemeToggle } from './components/ThemeToggle'
import { FilterBar } from './components/FilterBar'
import { EMPTY_FILTERS } from './lib/api'
import { readChartOpen } from './lib/chartPrefs'
import { useEvents } from './lib/useEvents'
import { useUrlState } from './lib/useUrlState'
import './index.css'

// The chart pulls in ECharts (large), so load it on demand and keep it out of the initial bundle.
const Histogram = lazy(() => import('./components/Histogram'))

export default function App() {
  const [url, update] = useUrlState()
  const filters = { q: url.q, agents: url.agents, status: url.status, from: url.from, to: url.to }
  const ev = useEvents(filters)
  const closePanel = useCallback(() => update({ eventId: null }), [update])
  const clear = () => update(EMPTY_FILTERS)

  return (
    <div className="app">
      <header>
        <div>
          <h1>Agent Activity Explorer</h1>
          <p className="muted subtitle">Browse, search and inspect tool calls made by your AI agents.</p>
        </div>
        <ThemeToggle />
      </header>
      <FilterBar filters={filters} total={ev.total} refreshing={ev.refreshing} onChange={update} />
      <Suspense
        fallback={
          <div className={'chart chart-placeholder' + (readChartOpen() ? '' : ' is-collapsed')} aria-hidden="true" />
        }
      >
        <Histogram filters={filters} onSelectRange={({ from, to }) => update({ from, to })} />
      </Suspense>
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
          filtered={!!(url.q || url.agents.length || url.status || url.from || url.to)}
        />
      </main>
      {url.eventId && <DetailPanel key={url.eventId} id={url.eventId} onClose={closePanel} />}
    </div>
  )
}
