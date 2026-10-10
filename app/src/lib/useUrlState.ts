import { useCallback, useEffect, useRef, useState } from 'react'
import type { Filters, Status } from './api'

export interface UrlState extends Filters {
  eventId: string | null
}

const STATUSES: Status[] = ['ok', 'blocked', 'error']

export function parse(search: string): UrlState {
  const p = new URLSearchParams(search)
  const status = p.get('status') as Status | null
  return {
    q: p.get('q') ?? '',
    agents: p.getAll('agent'),
    status: status && STATUSES.includes(status) ? status : '',
    eventId: p.get('event'),
  }
}

export function serialize(s: UrlState): string {
  const p = new URLSearchParams()
  if (s.q) p.set('q', s.q)
  s.agents.forEach((a) => p.append('agent', a))
  if (s.status) p.set('status', s.status)
  if (s.eventId) p.set('event', s.eventId)
  const str = p.toString()
  return str ? `?${str}` : location.pathname
}

/**
 * Filters + open event live in the URL. `push` adds a history entry (back/forward
 * works); `replace` is for high-frequency edits like typing in the search box.
 */
export function useUrlState() {
  const [state, setState] = useState<UrlState>(() => parse(location.search))
  // Mirrors `state` so `update` can build the next URL synchronously; written only where state changes.
  const ref = useRef(state)

  useEffect(() => {
    const onPop = () => {
      const s = parse(location.search)
      ref.current = s
      setState(s)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])


  const update = useCallback((patch: Partial<UrlState>, mode: 'push' | 'replace' = 'push') => {
    const next = { ...ref.current, ...patch }
    ref.current = next
    history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', serialize(next))
    setState(next)
  }, [])

  return [state, update] as const
}
