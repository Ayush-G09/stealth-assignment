import { describe, expect, it } from 'vitest'
import { BUCKET_MS, chooseBucket, fillBuckets, rangeSpanMs, selectionToRange, summarize, type Point } from './histogram'

const H = 60 * 60_000
const iso = (ms: number) => new Date(ms).toISOString()
const T0 = Date.parse('2026-10-09T10:00:00Z')
const none = { from: '', to: '' }

describe('rangeSpanMs', () => {
  it('is the length of a complete range', () => {
    expect(rangeSpanMs({ from: '2026-10-09T10:00:00Z', to: '2026-10-09T12:30:00Z' })).toBe(2.5 * H)
  })

  it('is null for open-ended or unset ranges, and for non-positive ones', () => {
    expect(rangeSpanMs(none)).toBeNull()
    expect(rangeSpanMs({ from: '2026-10-09T10:00:00Z', to: '' })).toBeNull()
    expect(rangeSpanMs({ from: '', to: '2026-10-09T10:00:00Z' })).toBeNull()
    expect(rangeSpanMs({ from: '2026-10-09T10:00:00Z', to: '2026-10-09T10:00:00Z' })).toBeNull()
  })
})

describe('chooseBucket', () => {
  it('uses hours for the overview (no range)', () => {
    expect(chooseBucket(null)).toBe('1h')
  })

  it.each([
    [60_000, '1m'],
    [3 * H, '1m'], // boundary: 180 one-minute bars
    [3 * H + 1, '5m'],
    [15 * H, '5m'], // boundary: 180 five-minute bars
    [15 * H + 1, '1h'],
    [48 * H, '1h'],
  ])('span %i ms -> %s', (span, bucket) => {
    expect(chooseBucket(span)).toBe(bucket)
  })

  it('never produces more than ~180 bars for any range it can zoom to', () => {
    for (const span of [60_000, 10 * 60_000, H, 3 * H, 6 * H, 15 * H]) {
      expect(span / BUCKET_MS[chooseBucket(span)]).toBeLessThanOrEqual(180)
    }
  })
})

describe('fillBuckets', () => {
  const api = (t: number, count: number) => ({ t: iso(t), count })

  it('returns nothing when there is no data and no range', () => {
    expect(fillBuckets([], '1h', none)).toEqual([])
  })

  it('fills gaps between returned buckets with zeros (the API omits empty ones)', () => {
    const out = fillBuckets([api(T0, 5), api(T0 + 3 * H, 2)], '1h', none)
    expect(out).toEqual([
      { t: T0, count: 5 },
      { t: T0 + H, count: 0 },
      { t: T0 + 2 * H, count: 0 },
      { t: T0 + 3 * H, count: 2 },
    ])
  })

  it('covers exactly the requested range, including empty edges', () => {
    const out = fillBuckets([api(T0 + H, 7)], '1h', { from: iso(T0), to: iso(T0 + 3 * H) })
    expect(out.map((p) => p.count)).toEqual([0, 7, 0])
    expect(out[0].t).toBe(T0)
    expect(out[out.length - 1].t).toBe(T0 + 2 * H) // `to` is exclusive
  })

  it('snaps an unaligned range outwards to bucket boundaries', () => {
    const out = fillBuckets([], '5m', { from: iso(T0 + 3 * 60_000), to: iso(T0 + 11 * 60_000) })
    expect(out.map((p) => p.t)).toEqual([T0, T0 + 5 * 60_000, T0 + 10 * 60_000])
  })

  it('builds an all-zero axis for a range with no events', () => {
    const out = fillBuckets([], '1m', { from: iso(T0), to: iso(T0 + 4 * 60_000) })
    expect(out).toHaveLength(4)
    expect(out.every((p) => p.count === 0)).toBe(true)
  })

  it('handles an open-ended range by using the data for the other end', () => {
    const out = fillBuckets([api(T0 + 2 * H, 1)], '1h', { from: iso(T0), to: '' })
    expect(out.map((p) => p.t)).toEqual([T0, T0 + H, T0 + 2 * H])
  })

  it('sorts input that arrives out of order', () => {
    const out = fillBuckets([api(T0 + H, 1), api(T0, 2)], '1h', none)
    expect(out).toEqual([
      { t: T0, count: 2 },
      { t: T0 + H, count: 1 },
    ])
  })

  it('preserves the total event count', () => {
    const data = [api(T0, 3), api(T0 + 5 * H, 4), api(T0 + 9 * H, 5)]
    expect(summarize(fillBuckets(data, '1h', none)).total).toBe(12)
  })

  it('does not build a giant array for a huge range (falls back to the sparse data)', () => {
    const out = fillBuckets([api(T0, 1)], '1m', { from: '2000-01-01T00:00:00Z', to: '2030-01-01T00:00:00Z' })
    expect(out).toEqual([{ t: T0, count: 1 }])
  })
})

describe('selectionToRange', () => {
  const points: Point[] = [0, 1, 2, 3, 4].map((i) => ({ t: T0 + i * H, count: i }))

  it('covers from the start of the first bar to the end of the last', () => {
    expect(selectionToRange(points, 1, 3, '1h')).toEqual({ from: iso(T0 + H), to: iso(T0 + 4 * H) })
  })

  it('a single bar selects exactly one bucket', () => {
    expect(selectionToRange(points, 2, 2, '1h')).toEqual({ from: iso(T0 + 2 * H), to: iso(T0 + 3 * H) })
  })

  it('accepts a selection dragged right-to-left', () => {
    expect(selectionToRange(points, 3, 1, '1h')).toEqual(selectionToRange(points, 1, 3, '1h'))
  })

  it('rounds fractional indices and clamps to the axis', () => {
    expect(selectionToRange(points, -2.4, 99, '1h')).toEqual({ from: iso(T0), to: iso(T0 + 5 * H) })
    expect(selectionToRange(points, 0.6, 1.4, '1h')).toEqual({ from: iso(T0 + H), to: iso(T0 + 2 * H) })
  })

  it('uses the bucket size for the exclusive end', () => {
    const fine = [{ t: T0, count: 1 }]
    expect(selectionToRange(fine, 0, 0, '5m')).toEqual({ from: iso(T0), to: iso(T0 + 5 * 60_000) })
  })

  it('returns null when there is nothing to select', () => {
    expect(selectionToRange([], 0, 1, '1h')).toBeNull()
    expect(selectionToRange(points, NaN, 1, '1h')).toBeNull()
  })

  it('produces a range the URL layer accepts (strict ISO, from before to)', async () => {
    const { sanitizeRange } = await import('./timeRange')
    const r = selectionToRange(points, 0, 4, '1h')!
    expect(sanitizeRange(r.from, r.to)).toEqual(r)
  })
})

describe('summarize', () => {
  it('totals the counts and finds the busiest bucket', () => {
    const s = summarize([
      { t: 1, count: 2 },
      { t: 2, count: 9 },
      { t: 3, count: 4 },
    ])
    expect(s).toEqual({ total: 15, peak: { t: 2, count: 9 } })
  })

  it('has no peak when everything is zero or empty', () => {
    expect(summarize([])).toEqual({ total: 0, peak: null })
    expect(summarize([{ t: 1, count: 0 }])).toEqual({ total: 0, peak: null })
  })

  it('takes the earliest bucket when several tie for the peak', () => {
    expect(
      summarize([
        { t: 1, count: 5 },
        { t: 2, count: 5 },
      ]).peak?.t,
    ).toBe(1)
  })
})
