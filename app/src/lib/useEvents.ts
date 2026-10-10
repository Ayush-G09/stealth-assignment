import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEvents, type EventItem, type Filters } from './api'

interface State {
  items: EventItem[]
  total: number | null
  cursor: string | null
  loading: boolean // first page for current filters
  loadingMore: boolean
  error: string | null
  moreError: string | null
  slow: boolean
}

const initial: State = {
  items: [], total: null, cursor: null,
  loading: true, loadingMore: false, error: null, moreError: null, slow: false,
}

const SLOW_MS = 3000

/** Cursor-paginated events. Any filter change aborts in-flight requests so stale responses never land. */
export function useEvents(filters: Filters) {
  const [state, setState] = useState<State>(initial)
  const ctrl = useRef<AbortController | null>(null)
  const slowTimer = useRef<number>(0)
  const key = JSON.stringify(filters)

  const run = useCallback((f: Filters, cursor: string | null) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(() => setState((s) => ({ ...s, slow: true })), SLOW_MS)
    const first = cursor === null
    setState((s) => first
      ? { ...initial, loading: true }
      : { ...s, loadingMore: true, moreError: null, slow: false })

    fetchEvents(f, cursor, c.signal)
      .then((page) => {
        clearTimeout(slowTimer.current)
        setState((s) => ({
          ...s,
          items: first ? page.items : [...s.items, ...page.items],
          total: page.total,
          cursor: page.nextCursor,
          loading: false, loadingMore: false, slow: false,
        }))
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        clearTimeout(slowTimer.current)
        setState((s) => first
          ? { ...s, loading: false, error: err.message, slow: false }
          : { ...s, loadingMore: false, moreError: err.message, slow: false })
      })
  }, [])

  useEffect(() => {
    run(JSON.parse(key) as Filters, null)
    return () => { ctrl.current?.abort(); clearTimeout(slowTimer.current) }
  }, [key, run])

  const loadMore = useCallback(() => {
    if (state.cursor && !state.loading && !state.loadingMore) run(JSON.parse(key) as Filters, state.cursor)
  }, [state.cursor, state.loading, state.loadingMore, key, run])

  const retry = useCallback(() => {
    run(JSON.parse(key) as Filters, state.error ? null : state.cursor)
  }, [key, run, state.error, state.cursor])

  return { ...state, loadMore, retry }
}
