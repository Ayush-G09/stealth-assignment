export type Status = 'ok' | 'blocked' | 'error'

export interface EventItem {
  id: string
  timestamp: string
  agent: string
  tool: string
  status: Status
  latencyMs: number
  argsPreview: string
}

export interface EventDetail extends EventItem {
  args: unknown
  result: unknown
  policyMatches: string[]
}

export interface EventsPage {
  items: EventItem[]
  nextCursor: string | null
  total: number
}

export interface Filters {
  q: string
  agents: string[]
  status: Status | ''
}

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

/**
 * Parse a successful response. A body that is not valid JSON is a bad response from a reachable API, so it must
 * not be reported (or retried) as a network failure. An abort while the body streams in is still an abort.
 */
async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('The API returned an invalid response')
  }
}

/** GET JSON; retries 5xx / network failures with backoff, never retries aborts or 4xx. */
async function getJson<T>(path: string, signal?: AbortSignal, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(BASE + path, { signal })
      if (res.ok) return await readJson<T>(res)
      if (res.status < 500 || attempt >= retries) {
        throw new ApiError(`Request failed (${res.status})`, res.status)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      if (err instanceof ApiError) throw err
      if (attempt >= retries) throw new ApiError('Network error: could not reach the API')
    }
    await sleep(400 * 2 ** attempt, signal)
  }
}

export function fetchEvents(filters: Filters, cursor: string | null, signal: AbortSignal) {
  const p = new URLSearchParams({ limit: '100' })
  if (filters.q) p.set('q', filters.q)
  filters.agents.forEach((a) => p.append('agent', a))
  if (filters.status) p.set('status', filters.status)
  if (cursor) p.set('cursor', cursor)
  return getJson<EventsPage>(`/events?${p}`, signal)
}

export const fetchEvent = (id: string, signal: AbortSignal) =>
  getJson<EventDetail>(`/events/${encodeURIComponent(id)}`, signal)

export const fetchAgents = (signal: AbortSignal) => getJson<string[]>('/agents', signal)
