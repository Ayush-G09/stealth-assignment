// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchAgents, fetchEvent, fetchEvents, type Filters } from './api'

const noFilters: Filters = { q: '', agents: [], status: '' }

/** One scripted outcome per fetch call; the last step repeats if the client calls more often than scripted. */
type Step = { json: unknown } | { status: number } | 'network' | 'malformed'
let calls: { url: string; signal?: AbortSignal | null }[] = []

function scriptFetch(...steps: Step[]) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const signal = init?.signal
      calls.push({ url, signal })
      // Like the real fetch: an already-aborted signal rejects immediately.
      if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
      const step = steps[Math.min(calls.length - 1, steps.length - 1)]
      if (step === 'network') return Promise.reject(new TypeError('Failed to fetch'))
      if (step === 'malformed') return Promise.resolve(new Response('<html>not json', { status: 200 }))
      if ('json' in step) return Promise.resolve(new Response(JSON.stringify(step.json), { status: 200 }))
      return Promise.resolve(new Response('error', { status: step.status }))
    }),
  )
}

/** A fetch that never settles by itself; it rejects with AbortError only when the signal aborts. */
function hangingFetch() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          calls.push({ url, signal: init?.signal })
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    ),
  )
}

const urlOf = (i = 0) => new URL(calls[i].url)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Start a request and keep its settled outcome observable without tripping unhandled-rejection warnings. */
const settle = <T>(promise: Promise<T>) => {
  const outcome: { value?: T; error?: unknown; done: boolean } = { done: false }
  promise.then(
    (value) => Object.assign(outcome, { value, done: true }),
    (error) => Object.assign(outcome, { error, done: true }),
  )
  return outcome
}

describe('request building', () => {
  it('asks for 100 events with no filters', async () => {
    scriptFetch({ json: { items: [], nextCursor: null, total: 0 } })
    await fetchEvents(noFilters, null, new AbortController().signal)
    expect(urlOf().pathname).toBe('/events')
    expect(Object.fromEntries(urlOf().searchParams)).toEqual({ limit: '100' })
  })

  it('sends q, status and cursor when set', async () => {
    scriptFetch({ json: { items: [], nextCursor: null, total: 0 } })
    await fetchEvents({ q: 'stripe', agents: [], status: 'error' }, 'abc123', new AbortController().signal)
    expect(Object.fromEntries(urlOf().searchParams)).toEqual({
      limit: '100',
      q: 'stripe',
      status: 'error',
      cursor: 'abc123',
    })
  })

  it('repeats the agent param once per selected agent, in order', async () => {
    scriptFetch({ json: { items: [], nextCursor: null, total: 0 } })
    await fetchEvents({ q: '', agents: ['b', 'a'], status: '' }, null, new AbortController().signal)
    expect(urlOf().searchParams.getAll('agent')).toEqual(['b', 'a'])
  })

  it('omits empty filters entirely', async () => {
    scriptFetch({ json: { items: [], nextCursor: null, total: 0 } })
    await fetchEvents(noFilters, null, new AbortController().signal)
    for (const key of ['q', 'agent', 'status', 'cursor']) expect(urlOf().searchParams.has(key)).toBe(false)
  })

  it('encodes special characters so they arrive intact', async () => {
    scriptFetch({ json: { items: [], nextCursor: null, total: 0 } })
    await fetchEvents({ q: 'a&b=c d#e', agents: ['x y&z'], status: '' }, 'cur/sor+1', new AbortController().signal)
    expect(urlOf().searchParams.get('q')).toBe('a&b=c d#e')
    expect(urlOf().searchParams.get('agent')).toBe('x y&z')
    expect(urlOf().searchParams.get('cursor')).toBe('cur/sor+1')
  })

  it('percent-encodes the event id in the path', async () => {
    scriptFetch({ json: { id: 'x' } })
    await fetchEvent('a/b ?#c', new AbortController().signal)
    expect(urlOf().pathname).toBe('/events/a%2Fb%20%3F%23c')
    expect(urlOf().search).toBe('')
  })

  it('fetches the agent list from /agents', async () => {
    scriptFetch({ json: ['a', 'b'] })
    await expect(fetchAgents(new AbortController().signal)).resolves.toEqual(['a', 'b'])
    expect(urlOf().pathname).toBe('/agents')
  })
})

describe('success', () => {
  it('returns the parsed body after a single request', async () => {
    const body = { items: [{ id: '1' }], nextCursor: 'n', total: 1 }
    scriptFetch({ json: body })
    await expect(fetchEvents(noFilters, null, new AbortController().signal)).resolves.toEqual(body)
    expect(calls).toHaveLength(1)
  })

  it('passes the AbortSignal through to fetch', async () => {
    scriptFetch({ json: [] })
    const controller = new AbortController()
    await fetchAgents(controller.signal)
    expect(calls[0].signal).toBe(controller.signal)
  })
})

describe('retry', () => {
  it('retries a 5xx and returns the data once the server recovers', async () => {
    scriptFetch({ status: 500 }, { status: 503 }, { json: ['ok'] })
    const out = settle(fetchAgents(new AbortController().signal))
    await vi.advanceTimersByTimeAsync(1200) // 400 + 800
    expect(out.value).toEqual(['ok'])
    expect(calls).toHaveLength(3)
  })

  it('waits 400ms before the first retry and 800ms before the second (exponential backoff)', async () => {
    scriptFetch({ status: 500 })
    settle(fetchAgents(new AbortController().signal))

    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(399)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(799)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(3)
  })

  it('gives up after 3 attempts total and reports the HTTP status', async () => {
    scriptFetch({ status: 500 })
    const out = settle(fetchAgents(new AbortController().signal))
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(3) // 1 try + 2 retries, never more
    expect(out.error).toBeInstanceOf(ApiError)
    expect((out.error as ApiError).status).toBe(500)
    expect((out.error as ApiError).message).toBe('Request failed (500)')
  })

  it('retries network failures, then reports the API as unreachable (no status)', async () => {
    scriptFetch('network')
    const out = settle(fetchAgents(new AbortController().signal))
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(3)
    expect(out.error).toBeInstanceOf(ApiError)
    expect((out.error as ApiError).status).toBeUndefined()
    expect((out.error as ApiError).message).toBe('Network error: could not reach the API')
  })

  it('recovers when a network failure is followed by a good response', async () => {
    scriptFetch('network', { json: ['back'] })
    const out = settle(fetchAgents(new AbortController().signal))
    await vi.advanceTimersByTimeAsync(400)
    expect(out.value).toEqual(['back'])
    expect(calls).toHaveLength(2)
  })

  it.each([400, 404])('does not retry a %i (the request itself is wrong)', async (status) => {
    scriptFetch({ status })
    const out = settle(fetchEvent('nope', new AbortController().signal))
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(1)
    expect((out.error as ApiError).status).toBe(status)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops retrying as soon as it sees a non-retryable status', async () => {
    scriptFetch({ status: 500 }, { status: 404 }, { json: 'never reached' })
    const out = settle(fetchEvent('x', new AbortController().signal))
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(2)
    expect((out.error as ApiError).status).toBe(404)
  })

  it('reports a successful but unparseable body as a bad response, not as an unreachable API', async () => {
    scriptFetch('malformed')
    const out = settle(fetchAgents(new AbortController().signal))
    await vi.advanceTimersByTimeAsync(5000)
    expect(out.done).toBe(true)
    expect(out.error).toBeInstanceOf(ApiError)
    expect((out.error as Error).message).toBe('The API returned an invalid response')
    expect(calls).toHaveLength(1) // the body will not get better by asking again
  })
})

describe('abort', () => {
  it('keeps an abort that happens while the body is being read as an AbortError (not an invalid response)', async () => {
    calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, signal: init?.signal })
        const res = new Response('{}', { status: 200 })
        vi.spyOn(res, 'json').mockRejectedValue(new DOMException('Aborted', 'AbortError'))
        return Promise.resolve(res)
      }),
    )
    const out = settle(fetchAgents(new AbortController().signal))
    await vi.advanceTimersByTimeAsync(5000)
    expect((out.error as Error).name).toBe('AbortError')
    expect(out.error).not.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(1) // not retried
  })

  it('rejects with AbortError (not an ApiError) when aborted mid-request, without retrying', async () => {
    hangingFetch()
    const controller = new AbortController()
    const out = settle(fetchAgents(controller.signal))
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await vi.advanceTimersByTimeAsync(5000)

    expect(out.done).toBe(true)
    expect((out.error as Error).name).toBe('AbortError')
    expect(out.error).not.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not even try again if the signal was aborted before the request started', async () => {
    scriptFetch({ json: [] })
    const controller = new AbortController()
    controller.abort()
    const out = settle(fetchAgents(controller.signal))
    await vi.advanceTimersByTimeAsync(5000)

    expect((out.error as Error).name).toBe('AbortError')
    expect(calls.length).toBeLessThanOrEqual(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the backoff wait immediately: no further request and no leftover timer', async () => {
    scriptFetch({ status: 500 })
    const controller = new AbortController()
    const out = settle(fetchAgents(controller.signal))
    await vi.advanceTimersByTimeAsync(0) // first attempt fails, now waiting 400ms
    expect(calls).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)

    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(out.done).toBe(true)
    expect((out.error as Error).name).toBe('AbortError')

    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels during the second (longer) backoff as well', async () => {
    scriptFetch({ status: 500 })
    const controller = new AbortController()
    const out = settle(fetchAgents(controller.signal))
    await vi.advanceTimersByTimeAsync(400) // second attempt fails, now waiting 800ms
    expect(calls).toHaveLength(2)

    controller.abort()
    await vi.advanceTimersByTimeAsync(5000)
    expect((out.error as Error).name).toBe('AbortError')
    expect(calls).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborting after the response arrived changes nothing', async () => {
    scriptFetch({ json: ['fine'] })
    const controller = new AbortController()
    const out = settle(fetchAgents(controller.signal))
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await vi.advanceTimersByTimeAsync(5000)
    expect(out.value).toEqual(['fine'])
  })

  it('aborting one request does not affect another with its own signal', async () => {
    hangingFetch()
    const a = new AbortController()
    const b = new AbortController()
    const outA = settle(fetchAgents(a.signal))
    const outB = settle(fetchAgents(b.signal))
    await vi.advanceTimersByTimeAsync(0)

    a.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect((outA.error as Error).name).toBe('AbortError')
    expect(outB.done).toBe(false) // still waiting, untouched
    expect(b.signal.aborted).toBe(false)
  })
})
