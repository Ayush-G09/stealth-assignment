import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEvents, type EventItem, type Filters } from './api'

interface State {
  forKey: string // the filters these results were fetched for
  items: EventItem[]
  total: number | null
  cursor: string | null
  loading: boolean // first page for these filters, nothing to show yet
  loadingMore: boolean
  error: string | null
  moreError: string | null
  slowKey: string | null // the filters whose in-flight request has been running for SLOW_MS
}

const blank = (forKey: string): State => ({
  forKey,
  items: [],
  total: null,
  cursor: null,
  loading: true,
  loadingMore: false,
  error: null,
  moreError: null,
  slowKey: null,
})

const SLOW_MS = 3000

/**
 * Cursor-paginated events with stale-while-revalidate.
 *
 * State is tagged with the filters it was fetched for. When the filters change:
 *  - if there are results on screen they stay (`refreshing: true`, no paging) until the new first page lands,
 *    so the list doesn't flash to a skeleton on every keystroke;
 *  - if there is nothing to show (first load, or the previous filters errored) the normal loading state is used;
 *  - if the new filters fail, the stale rows are replaced by the error, because results that don't match the
 *    active filters would be misleading.
 * Any in-flight request is aborted when the filters change, and a late response is ignored even if the network
 * answered before the abort took effect.
 */
export function useEvents(filters: Filters) {
  const key = JSON.stringify(filters)
  const [state, setState] = useState<State>(() => blank(key))
  const ctrl = useRef<AbortController | null>(null)
  const slowTimer = useRef<number>(0)
  const pageInFlight = useRef<string | null>(null) // cursor currently being fetched, to dedupe loadMore

  const run = useCallback((k: string, cursor: string | null) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(() => setState((s) => ({ ...s, slowKey: k })), SLOW_MS)
    pageInFlight.current = cursor
    const first = cursor === null
    // Results for this key start from a clean slate if the stored ones belong to other filters.
    const base = (s: State) => (s.forKey === k ? s : blank(k))

    fetchEvents(JSON.parse(k) as Filters, cursor, c.signal)
      .then((page) => {
        if (c.signal.aborted) return
        clearTimeout(slowTimer.current)
        pageInFlight.current = null
        setState((s) => {
          const b = base(s)
          return {
            ...b,
            items: first ? page.items : [...b.items, ...page.items],
            total: page.total,
            cursor: page.nextCursor,
            loading: false,
            loadingMore: false,
            error: null,
            moreError: null,
            slowKey: null,
          }
        })
      })
      .catch((err: Error) => {
        if (c.signal.aborted || err.name === 'AbortError') return
        clearTimeout(slowTimer.current)
        pageInFlight.current = null
        setState((s) => {
          const b = base(s)
          return first
            ? { ...b, loading: false, error: err.message, slowKey: null }
            : { ...b, loadingMore: false, moreError: err.message, slowKey: null }
        })
      })
  }, [])

  // New filters -> fetch the first page. No synchronous setState here: the view below is derived from `key`.
  useEffect(() => {
    run(key, null)
    return () => {
      ctrl.current?.abort()
      clearTimeout(slowTimer.current)
    }
  }, [key, run])

  const loadMore = useCallback(() => {
    // `cursor` is only ever set on results for the current filters, so this also blocks paging while refreshing.
    if (state.forKey !== key || !state.cursor || state.loading || state.loadingMore) return
    if (pageInFlight.current === state.cursor) return // already requested this page (state not updated yet)
    pageInFlight.current = state.cursor
    setState({ ...state, loadingMore: true, moreError: null, slowKey: null })
    run(key, state.cursor)
  }, [state, key, run])

  const retry = useCallback(() => {
    if (state.forKey !== key) return
    if (state.error) {
      setState(blank(key)) // back to the loading skeleton
      run(key, null)
    } else if (state.cursor && state.moreError) {
      setState({ ...state, loadingMore: true, moreError: null, slowKey: null })
      run(key, state.cursor)
    }
  }, [state, key, run])

  // What the UI sees, derived from the stored results and the current filters.
  const current = state.forKey === key
  const hasStale = !current && state.items.length > 0 && !state.error
  const view: State = current
    ? state
    : hasStale
      ? { ...state, cursor: null, loading: false, loadingMore: false, moreError: null } // stale rows, no paging
      : blank(key)

  return {
    items: view.items,
    total: view.total,
    cursor: view.cursor,
    loading: view.loading,
    loadingMore: view.loadingMore,
    error: view.error,
    moreError: view.moreError,
    refreshing: hasStale,
    slow: state.slowKey === key,
    dataKey: view.forKey, // changes only when new results land; use it to reset scroll position
    loadMore,
    retry,
  }
}
