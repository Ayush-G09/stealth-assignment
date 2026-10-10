import type { Bucket, HistogramBucket } from './api'
import type { TimeRange } from './timeRange'

export const BUCKET_MS: Record<Bucket, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
}

export const BUCKET_LABEL: Record<Bucket, string> = { '1m': 'minute', '5m': '5 minutes', '1h': 'hour' }

const HOUR = 60 * 60_000
const MAX_POINTS = 2000 // never build a giant dense array (e.g. a corrupt range); fall back to sparse data

export interface Point {
  t: number // bucket start, epoch ms
  count: number
}

/** Span of an explicit range in ms, or null when the range is open-ended / unset. */
export function rangeSpanMs({ from, to }: TimeRange): number | null {
  if (!from || !to) return null
  const span = Date.parse(to) - Date.parse(from)
  return span > 0 ? span : null
}

/**
 * Pick a bucket so a chart has a readable number of bars (at most ~180): the overview uses hours, and zooming into a
 * few hours / a few minutes switches to 5-minute / 1-minute buckets.
 */
export function chooseBucket(spanMs: number | null): Bucket {
  if (spanMs === null || spanMs > 15 * HOUR) return '1h'
  if (spanMs <= 3 * HOUR) return '1m'
  return '5m'
}

/**
 * The API omits empty buckets. A bar chart needs a continuous axis, so fill the gaps with zeros. With an explicit range
 * the axis covers exactly that range (snapped outwards to bucket boundaries); otherwise it covers the data returned.
 */
export function fillBuckets(buckets: HistogramBucket[], bucket: Bucket, range: TimeRange): Point[] {
  const step = BUCKET_MS[bucket]
  const counts = new Map<number, number>()
  for (const b of buckets) counts.set(Date.parse(b.t), (counts.get(Date.parse(b.t)) ?? 0) + b.count)
  const times = [...counts.keys()].sort((a, b) => a - b)

  const lowest = times[0]
  const highest = times[times.length - 1]
  const from = range.from ? Math.floor(Date.parse(range.from) / step) * step : lowest
  const to = range.to
    ? Math.ceil(Date.parse(range.to) / step) * step
    : highest === undefined
      ? undefined
      : highest + step

  let start = from
  let end = to
  if (start === undefined && end === undefined) return []
  if (start === undefined) start = (end as number) - step
  if (end === undefined) end = start + step
  if (!(end > start)) return []

  if ((end - start) / step > MAX_POINTS) return times.map((t) => ({ t, count: counts.get(t) as number }))

  const points: Point[] = []
  for (let t = start; t < end; t += step) points.push({ t, count: counts.get(t) ?? 0 })
  return points
}

/**
 * Convert a selection of bars (inclusive indices, in any order) into the time range it covers:
 * from = start of the first bar, to = end (exclusive) of the last bar.
 */
export function selectionToRange(points: Point[], a: number, b: number, bucket: Bucket): TimeRange | null {
  if (!points.length || Number.isNaN(a) || Number.isNaN(b)) return null
  const last = points.length - 1
  const lo = Math.min(Math.max(Math.round(Math.min(a, b)), 0), last)
  const hi = Math.min(Math.max(Math.round(Math.max(a, b)), 0), last)
  return {
    from: new Date(points[lo].t).toISOString(),
    to: new Date(points[hi].t + BUCKET_MS[bucket]).toISOString(),
  }
}

export interface Summary {
  total: number
  peak: Point | null
}

export function summarize(points: Point[]): Summary {
  let total = 0
  let peak: Point | null = null
  for (const p of points) {
    total += p.count
    if (p.count > 0 && (!peak || p.count > peak.count)) peak = p
  }
  return { total, peak }
}
