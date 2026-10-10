import { useCallback, useEffect, useState } from 'react'
import { fetchHistogram, type Bucket, type Filters } from './api'
import { chooseBucket, fillBuckets, rangeSpanMs, summarize, type Point, type Summary } from './histogram'

interface State {
  forKey: string // the filters these points belong to
  points: Point[]
  bucket: Bucket
  loaded: boolean // the request for `forKey` finished successfully
  error: string | null
}

const blank = (forKey: string): State => ({ forKey, points: [], bucket: '1h', loaded: false, error: null })

/**
 * Event counts over time for the current filters (including the time range, so zooming in re-buckets finer).
 * Like the event list it keeps the previous chart on screen while a new one loads, aborts superseded requests and
 * ignores late responses. Pass `enabled = false` (chart hidden) to stop fetching.
 */
export function useHistogram(filters: Filters, enabled = true) {
  const key = JSON.stringify(filters)
  const [state, setState] = useState<State>(() => blank(key))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return // a hidden chart makes no requests
    const f = JSON.parse(key) as Filters
    const bucket = chooseBucket(rangeSpanMs(f))
    const c = new AbortController()
    fetchHistogram(f, bucket, c.signal)
      .then((h) => {
        if (c.signal.aborted) return
        setState({ forKey: key, points: fillBuckets(h.buckets, bucket, f), bucket, loaded: true, error: null })
      })
      .catch((err: Error) => {
        if (c.signal.aborted || err.name === 'AbortError') return
        setState((s) => ({ ...(s.forKey === key ? s : blank(key)), forKey: key, loaded: false, error: err.message }))
      })
    return () => c.abort()
  }, [key, attempt, enabled])

  const retry = useCallback(() => {
    setState(blank(key))
    setAttempt((n) => n + 1)
  }, [key])

  const current = state.forKey === key
  const refreshing = !current && state.loaded // previous chart stays up while the new one loads
  const view = current || refreshing ? state : blank(key)
  const summary: Summary = summarize(view.points)

  return {
    points: view.points,
    bucket: view.bucket,
    loading: !view.loaded && !view.error,
    refreshing,
    error: current ? state.error : null,
    summary,
    retry,
  }
}
