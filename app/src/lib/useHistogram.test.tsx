// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { EMPTY_FILTERS, fetchHistogram, type Bucket, type Filters, type Histogram } from './api'
import { useHistogram } from './useHistogram'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchHistogram: vi.fn(),
}))

interface Call {
  filters: Filters
  bucket: Bucket
  signal: AbortSignal
  resolve: (h: Histogram) => void
  reject: (e: Error) => void
}
let calls: Call[] = []
let rejectOnAbort = true
const last = () => calls[calls.length - 1]

const T0 = Date.parse('2026-10-09T10:00:00Z')
const H = 60 * 60_000
const hist = (bucket: Bucket, counts: [number, number][]): Histogram => ({
  bucket,
  buckets: counts.map(([hour, count]) => ({ t: new Date(T0 + hour * H).toISOString(), count })),
})

const A: Filters = { ...EMPTY_FILTERS, q: 'a' }
const B: Filters = { ...EMPTY_FILTERS, q: 'b' }

beforeEach(() => {
  calls = []
  rejectOnAbort = true
  vi.mocked(fetchHistogram).mockImplementation(
    (filters, bucket, signal) =>
      new Promise<Histogram>((resolve, reject) => {
        calls.push({ filters, bucket, signal, resolve, reject })
        signal.addEventListener('abort', () => {
          if (rejectOnAbort) reject(new DOMException('Aborted', 'AbortError'))
        })
      }),
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const setup = (initial: Filters = A) => renderHook(({ f }) => useHistogram(f), { initialProps: { f: initial } })

describe('useHistogram', () => {
  it('starts loading, then exposes gap-filled points and a summary', async () => {
    const { result } = setup()
    expect(result.current.loading).toBe(true)
    expect(result.current.points).toEqual([])

    await act(async () =>
      last().resolve(
        hist('1h', [
          [0, 3],
          [3, 5],
        ]),
      ),
    )
    expect(result.current.loading).toBe(false)
    expect(result.current.points.map((p) => p.count)).toEqual([3, 0, 0, 5])
    expect(result.current.summary).toEqual({ total: 8, peak: { t: T0 + 3 * H, count: 5 } })
    expect(result.current.bucket).toBe('1h')
  })

  it('asks for hourly buckets in the overview', () => {
    setup()
    expect(last().bucket).toBe('1h')
  })

  it.each([
    ['2026-10-09T10:00:00Z', '2026-10-09T12:00:00Z', '1m'], // 2h
    ['2026-10-09T10:00:00Z', '2026-10-09T16:00:00Z', '5m'], // 6h
    ['2026-10-08T10:00:00Z', '2026-10-09T16:00:00Z', '1h'], // 30h
  ])('zooming into %s .. %s uses %s buckets', (from, to, bucket) => {
    setup({ ...A, from, to })
    expect(last().bucket).toBe(bucket)
    expect(last().filters).toMatchObject({ from, to })
  })

  it('shows an error and recovers on retry', async () => {
    const { result } = setup()
    await act(async () => last().reject(new Error('boom')))
    expect(result.current.error).toBe('boom')
    expect(result.current.loading).toBe(false)

    act(() => result.current.retry())
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)
    await act(async () => last().resolve(hist('1h', [[0, 1]])))
    expect(result.current.points).toHaveLength(1)
  })

  it('refetches when the filters change and aborts the old request', async () => {
    const { rerender } = setup(A)
    const first = last()
    rerender({ f: B })
    expect(first.signal.aborted).toBe(true)
    expect(last().filters).toEqual(B)
  })

  it('keeps the previous chart (marked refreshing) while new filters load', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().resolve(hist('1h', [[0, 4]])))

    rerender({ f: B })
    expect(result.current.refreshing).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.points.map((p) => p.count)).toEqual([4])

    await act(async () => last().resolve(hist('1h', [[0, 9]])))
    expect(result.current.refreshing).toBe(false)
    expect(result.current.points.map((p) => p.count)).toEqual([9])
  })

  it('replaces the stale chart with the error if the new filters fail', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().resolve(hist('1h', [[0, 4]])))
    rerender({ f: B })
    await act(async () => last().reject(new Error('nope')))
    expect(result.current.refreshing).toBe(false)
    expect(result.current.error).toBe('nope')
    expect(result.current.points).toEqual([])
  })

  it('ignores a late response for superseded filters even if the network already answered', async () => {
    const { result, rerender } = setup(A)
    const callA = last()
    rerender({ f: B })
    const callB = last()
    await act(async () => callB.resolve(hist('1h', [[0, 7]])))

    rejectOnAbort = false
    await act(async () => callA.resolve(hist('1h', [[0, 1]])))
    expect(result.current.points.map((p) => p.count)).toEqual([7])
  })

  it('shows the plain loading state when the previous filters had no chart to keep', async () => {
    const { result, rerender } = setup(A)
    await act(async () => last().reject(new Error('first failed')))
    rerender({ f: B })
    expect(result.current.loading).toBe(true)
    expect(result.current.refreshing).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('does not fetch while disabled, and fetches when enabled', async () => {
    const { result, rerender } = renderHook(({ on }) => useHistogram(A, on), { initialProps: { on: false } })
    expect(calls).toHaveLength(0)

    rerender({ on: true })
    expect(calls).toHaveLength(1)
    await act(async () => last().resolve(hist('1h', [[0, 2]])))
    expect(result.current.summary.total).toBe(2)
  })

  it('aborts the request when disabled mid-flight', async () => {
    const { rerender } = renderHook(({ on }) => useHistogram(A, on), { initialProps: { on: true } })
    const call = last()
    rerender({ on: false })
    expect(call.signal.aborted).toBe(true)
  })
})
