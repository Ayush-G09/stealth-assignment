import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EventItem } from '../lib/api'
import { Highlight } from './Highlight'
import { computeRange, scrollTopToReveal, type Range } from '../lib/virtual'

// Fixed heights are what make the windowing math O(1); they must match the CSS (--row-h / --head-h).
const ROW_H = 40
const HEAD_H = 36
const OVERSCAN = 8
const LOAD_AHEAD = 30 // start fetching the next page this many rows before the end

const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' })

interface Props {
  items: EventItem[]
  query: string
  total: number | null
  hasMore: boolean
  loadingMore: boolean
  moreError: string | null
  slow: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onLoadMore: () => void
  onRetry: () => void
}

interface RowProps {
  event: EventItem
  index: number
  active: boolean
  selected: boolean
  query: string
}

const STATUS_ICON = { ok: '✓', blocked: '⊘', error: '✕' } as const

// Slow calls stand out; the API's timeout outliers are 30,000 ms.
const latencyClass = (ms: number) => (ms >= 10_000 ? 'lat-very' : ms >= 1_000 ? 'lat-slow' : '')

// Memoised so a scroll that shifts the window only mounts the new rows instead of re-rendering all of them.
const Row = memo(function Row({ event, index, active, selected, query }: RowProps) {
  return (
    <div
      role="row"
      id={`ev-${event.id}`}
      data-index={index}
      aria-rowindex={index + 2} // +1 for the header row, +1 because aria-rowindex is 1-based
      aria-selected={selected}
      className={'vt-row' + (selected ? ' selected' : '') + (active ? ' active' : '')}
    >
      <div role="gridcell" className="time" title={event.timestamp}>{fmt.format(new Date(event.timestamp))}</div>
      <div role="gridcell"><Highlight text={event.agent} query={query} /></div>
      <div role="gridcell"><code><Highlight text={event.tool} query={query} /></code></div>
      <div role="gridcell">
        <span className={`badge ${event.status}`}>
          <span aria-hidden="true">{STATUS_ICON[event.status]}</span> {event.status}
        </span>
      </div>
      <div role="gridcell" className={`num ${latencyClass(event.latencyMs)}`}>{event.latencyMs.toLocaleString()} ms</div>
      <div role="gridcell" className="args" title={event.argsPreview}>
        <code><Highlight text={event.argsPreview} query={query} /></code>
      </div>
    </div>
  )
})

export function VirtualTable(p: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const viewH = useRef(0)
  const [range, setRange] = useState<Range>({ start: 0, end: 0 })
  const [active, setActive] = useState(0)
  const count = p.items.length

  const updateRange = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const next = computeRange(el.scrollTop, viewH.current, ROW_H, count, OVERSCAN)
    // Skip the state update (and re-render) while the window hasn't moved.
    setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [count])

  // Measure the viewport, and re-measure when it resizes.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => { viewH.current = el.clientHeight; updateRange() }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateRange])

  // New items arrived (next page): recompute the window.
  useLayoutEffect(updateRange, [updateRange])

  // Infinite loading: driven by scroll position, not by a DOM sentinel.
  const { hasMore, loadingMore, moreError, onLoadMore } = p
  useEffect(() => {
    if (hasMore && !loadingMore && !moreError && range.end >= count - LOAD_AHEAD) onLoadMore()
  }, [range.end, count, hasMore, loadingMore, moreError, onLoadMore])

  const moveTo = (index: number) => {
    const el = scroller.current
    if (!el || count === 0) return
    const i = Math.max(0, Math.min(count - 1, index))
    setActive(i)
    const top = scrollTopToReveal(i, el.scrollTop, el.clientHeight, ROW_H, HEAD_H)
    if (top !== null) {
      el.scrollTop = top
      updateRange() // don't wait for the scroll event
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const page = Math.max(1, Math.floor((viewH.current - HEAD_H) / ROW_H) - 1)
    switch (e.key) {
      case 'ArrowDown': moveTo(active + 1); break
      case 'ArrowUp': moveTo(active - 1); break
      case 'PageDown': moveTo(active + page); break
      case 'PageUp': moveTo(active - page); break
      case 'Home': moveTo(0); break
      case 'End': moveTo(count - 1); break
      case 'Enter':
      case ' ':
        if (p.items[active]) p.onSelect(p.items[active].id)
        break
      default: return
    }
    e.preventDefault()
  }

  // One delegated handler instead of a closure per row.
  const onClick = (e: React.MouseEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-index]')
    if (!row) return
    const index = Number(row.dataset.index)
    setActive(index)
    p.onSelect(p.items[index].id)
  }

  const activeEvent = p.items[Math.min(active, count - 1)]
  const rows = p.items.slice(range.start, range.end)

  return (
    <div className="vt-wrap">
    <div
      ref={scroller}
      className="vt"
      role="grid"
      aria-label="Agent events"
      aria-rowcount={(p.total ?? count) + 1}
      aria-activedescendant={activeEvent ? `ev-${activeEvent.id}` : undefined}
      tabIndex={0}
      onScroll={updateRange}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      <div className="vt-head" role="row" aria-rowindex={1}>
        <div role="columnheader">Time</div>
        <div role="columnheader">Agent</div>
        <div role="columnheader">Tool</div>
        <div role="columnheader">Status</div>
        <div role="columnheader" className="num">Latency</div>
        <div role="columnheader" className="args">Arguments</div>
      </div>
      <div className="vt-body" style={{ height: count * ROW_H }}>
        <div className="vt-window" style={{ transform: `translateY(${range.start * ROW_H}px)` }}>
          {rows.map((event, i) => {
            const index = range.start + i
            return (
              <Row
                key={event.id}
                event={event}
                index={index}
                active={index === active}
                selected={event.id === p.selectedId}
                query={p.query}
              />
            )
          })}
        </div>
      </div>
    </div>
      <div className="vt-foot" role="status" aria-live="polite">
        {p.loadingMore && <span>{p.slow ? 'Still loading, slow connection…' : 'Loading more…'}</span>}
        {p.moreError && (
          <span>Couldn't load more ({p.moreError}) <button onClick={p.onRetry}>Retry</button></span>
        )}
        {p.hasMore && !p.loadingMore && !p.moreError && (
          <span className="muted">Showing {count.toLocaleString()}{p.total ? ` of ${p.total.toLocaleString()}` : ''} events</span>
        )}
        {!p.hasMore && !p.loadingMore && <span className="muted">End of results ({count.toLocaleString()} events)</span>}
      </div>
    </div>
  )
}
