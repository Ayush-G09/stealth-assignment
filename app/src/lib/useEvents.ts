import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEvents, type EventItem, type Filters } from './api'

interface State {
  forKey: string // the filters this state belongs to
  items: EventItem[]
  total: number | null
  cursor: string | null
  loading: boolean // first page for the current filters
  loadingMore: boolean
  error: string | null
  moreError: string | null
  slow: boolean
}

const blank = (forKey: string): State => ({
  forKey, items: [], total: null, cursor: null,
  loading: true, loadingMore: false, error: null, moreError: null, slow: false,
})

const SLOW_MS = 3000

/**
 * Cursor-paginated events. State is tagged with the filters it was fetched for, so when the filters
 * change the old rows are ignored immediately (no reset-in-effect), and any in-flight request is aborted
 * so a stale response can never land.
 */
export function useEvents(filters: Filters) {
  const key = JSON.stringify(filters)
  const [state, setState] = useState<State>(() => blank(key))
  const current = state.forKey === key ? state : blank(key)
  const ctrl = useRef<AbortController | null>(null)
  const slowTimer = useRef<number>(0)

  const run = useCallback((k: string, cursor: string | null) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(
      () => setState((s) => (s.forKey === k ? { ...s, slow: true } : s)),
      SLOW_MS,
    )
    const first = cursor === null
    // Always start from state for this key (a previous key's rows must not leak in).
    const base = (s: State) => (s.forKey === k ? s : blank(k))

    fetchEvents(JSON.parse(k) as Filters, cursor, c.signal)
      .then((page) => {
        clearTimeout(slowTimer.current)
        setState((s) => {
          const b = base(s)
          return {
            ...b,
            items: first ? page.items : [...b.items, ...page.items],
            total: page.total,
            cursor: page.nextCursor,
            loading: false, loadingMore: false, slow: false,
          }
        })
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        clearTimeout(slowTimer.current)
        setState((s) => {
          const b = base(s)
          return first
            ? { ...b, loading: false, error: err.message, slow: false }
            : { ...b, loadingMore: false, moreError: err.message, slow: false }
        })
      })
  }, [])

  // New filters -> fetch the first page. No synchronous setState here: `current` is derived above.
  useEffect(() => {
    run(key, null)
    return () => { ctrl.current?.abort(); clearTimeout(slowTimer.current) }
  }, [key, run])

  const loadMore = useCallback(() => {
    if (!current.cursor || current.loading || current.loadingMore) return
    setState({ ...current, loadingMore: true, moreError: null, slow: false })
    run(key, current.cursor)
  }, [current, key, run])

  const retry = useCallback(() => {
    if (current.error) {
      setState(blank(key)) // back to the loading skeleton
      run(key, null)
    } else if (current.cursor) {
      setState({ ...current, loadingMore: true, moreError: null, slow: false })
      run(key, current.cursor)
    }
  }, [current, key, run])

  const { forKey: _forKey, ...exposed } = current
  void _forKey
  return { ...exposed, loadMore, retry }
}
