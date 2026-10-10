// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { EventItem, EventsPage, Filters } from './api'
import { fetchEvents } from './api'
import { useEvents } from './useEvents'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchEvents: vi.fn(),
}))

// Every fetchEvents call is parked here so a test decides when (and how) each one settles.
interface Call {
  filters: Filters
  cursor: string | null
  signal: AbortSignal
  resolve: (page: EventsPage) => void
  reject: (err: Error) => void
}
let calls: Call[] = []
let rejectOnAbort = true

const A: Filters = { q: 'a', agents: [], status: '' }
const B: Filters = { q: 'b', agents: [], status: '' }
const C: Filters = { q: 'c', agents: [], status: '' }

const ev = (id: string): EventItem => ({
  id,
  timestamp: '2026-10-09T00:00:00.000Z',
  agent: 'x',
  tool: 't',
  status: 'ok',
  latencyMs: 1,
  argsPreview: '{}',
})
const page = (ids: string[], next: string | null = null, total = 100): EventsPage => ({
  items: ids.map(ev),
  nextCursor: next,
  total,
})
const ids = (items: EventItem[]) => items.map((i) => i.id)
const last = () => calls[calls.length - 1]

beforeEach(() => {
  calls = []
  rejectOnAbort = true
  vi.mocked(fetchEvents).mockImplementation(
    (filters, cursor, signal) =>
      new Promise<EventsPage>((resolve, reject) => {
        calls.push({ filters, cursor, signal, resolve, reject })
        signal.addEventListener('abort', () => {
          if (rejectOnAbort) reject(new DOMException('Aborted', 'AbortError'))
        })
      }),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const setup = (initial: Filters = A) => renderHook(({ f }) => useEvents(f), { initialProps: { f: initial } })

describe('useEvents: first load', () => {
  it('starts in the loading state and fills in when the page arrives', async () => {
    const { result } = setup()
    expect(result.current.loading).toBe(true)
    expect(result.current.items).toEqual([])

    await act(async () => last().resolve(page(['1', '2'], 'c1', 50)))
    expect(result.current.loading).toBe(false)
    expect(ids(result.current.items)).toEqual(['1', '2'])
    expect(result.current.total).toBe(50)
    expect(result.current.cursor).toBe('c1')
  })

  it('shows an error, then recovers on retry', async () => {
    const { result } = setup()
    await act(async () => last().reject(new Error('boom')))
    expect(result.current.error).toBe('boom')
    expect(result.current.loading).toBe(false)

    act(() => result.current.retry())
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
    await act(async () => last().resolve(page(['1'])))
    expect(ids(result.current.items)).toEqual(['1'])
  })

  it('flags a slow request after 3 seconds and clears the flag when it lands', async () => {
    vi.useFakeTimers()
    const { result } = setup()
    expect(result.current.slow).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(3100)
    })
    expect(result.current.slow).toBe(true)
    await act(async () => last().resolve(page(['1'])))
    expect(result.current.slow).toBe(false)
  })
})

describe('useEvents: changing filters', () => {
  it('aborts the in-flight request for the old filters', async () => {
    const { rerender } = setup(A)
    const first = last()
    rerender({ f: B })
    expect(first.signal.aborted).toBe(true)
    expect(last().filters).toEqual(B)
  })

  it('never lets a stale response overwrite newer results', async () => {
    const { result, rerender } = setup(A)
    const callA = last()
    rerender({ f: B })
    const callB = last()
    rerender({ f: C })
    const callC = last()

    await act(async () => callC.resolve(page(['c1'])))
    // B and A settle late; their promises still resolve (the network answered before the abort took effect).
    rejectOnAbort = false
    await act(async () => {
      callB.resolve(page(['b1']))
      callA.resolve(page(['a1']))
    })

    expect(ids(result.current.items)).toEqual(['c1'])
    expect(result.current.loading).toBe(false)
  })

  it('keeps showing the previous rows (marked refreshing) while the new filters load', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().resolve(page(['a1', 'a2'], 'ca', 2)))

    rerender({ f: B })
    expect(result.current.refreshing).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(ids(result.current.items)).toEqual(['a1', 'a2'])
    expect(result.current.cursor).toBeNull() // can't page a stale result set

    await act(async () => last().resolve(page(['b1'], null, 1)))
    expect(result.current.refreshing).toBe(false)
    expect(ids(result.current.items)).toEqual(['b1'])
  })

  it('only changes dataKey when the new results actually land (so the table resets scroll then, not before)', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().resolve(page(['a1'])))
    const keyA = result.current.dataKey

    rerender({ f: B })
    expect(result.current.dataKey).toBe(keyA)
    await act(async () => last().resolve(page(['b1'])))
    expect(result.current.dataKey).not.toBe(keyA)
  })

  it('replaces the stale rows with the error when the new filters fail (never show results that do not match)', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().resolve(page(['a1'])))

    rerender({ f: B })
    await act(async () => last().reject(new Error('nope')))
    expect(result.current.refreshing).toBe(false)
    expect(result.current.items).toEqual([])
    expect(result.current.error).toBe('nope')
  })

  it('shows the plain loading state (not stale rows) when the previous filters had nothing to show', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().reject(new Error('first failed')))
    rerender({ f: B })
    expect(result.current.loading).toBe(true)
    expect(result.current.refreshing).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('reports slow while refreshing too', async () => {
    vi.useFakeTimers()
    const { result, rerender } = setup(A)
    await act(async () => last().resolve(page(['a1'])))
    rerender({ f: B })
    expect(result.current.slow).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(3100)
    })
    expect(result.current.refreshing).toBe(true)
    expect(result.current.slow).toBe(true)
  })
})

describe('useEvents: paging', () => {
  it('appends the next page using the cursor', async () => {
    const { result } = setup()
    await act(async () => last().resolve(page(['1', '2'], 'c1')))

    act(() => result.current.loadMore())
    expect(result.current.loadingMore).toBe(true)
    expect(last().cursor).toBe('c1')
    await act(async () => last().resolve(page(['3'], null)))
    expect(ids(result.current.items)).toEqual(['1', '2', '3'])
    expect(result.current.cursor).toBeNull()
  })

  it('ignores loadMore while a page is already loading (no duplicate requests)', async () => {
    const { result } = setup()
    await act(async () => last().resolve(page(['1'], 'c1')))
    act(() => {
      result.current.loadMore()
      result.current.loadMore()
    })
    expect(calls.filter((c) => c.cursor === 'c1')).toHaveLength(1)
  })

  it('does nothing on loadMore when there is no next page', async () => {
    const { result } = setup()
    await act(async () => last().resolve(page(['1'], null)))
    const before = calls.length
    act(() => result.current.loadMore())
    expect(calls).toHaveLength(before)
  })

  it('keeps the rows on a failed page and recovers on retry', async () => {
    const { result } = setup()
    await act(async () => last().resolve(page(['1', '2'], 'c1')))

    act(() => result.current.loadMore())
    await act(async () => last().reject(new Error('page failed')))
    expect(result.current.moreError).toBe('page failed')
    expect(ids(result.current.items)).toEqual(['1', '2'])

    act(() => result.current.retry())
    expect(result.current.moreError).toBeNull()
    expect(last().cursor).toBe('c1') // retries the same page, not the first
    await act(async () => last().resolve(page(['3'])))
    expect(ids(result.current.items)).toEqual(['1', '2', '3'])
  })

  it('cannot page while refreshing', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().resolve(page(['a1'], 'ca')))
    rerender({ f: B })
    const before = calls.length
    act(() => result.current.loadMore())
    expect(calls).toHaveLength(before)
  })

  it('does not reuse the old cursor after the filters change', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().resolve(page(['a1'], 'ca')))
    rerender({ f: B })
    await act(async () => last().resolve(page(['b1'], 'cb')))
    act(() => result.current.loadMore())
    await waitFor(() => expect(last().cursor).toBe('cb'))
    expect(last().filters).toEqual(B)
  })
})
