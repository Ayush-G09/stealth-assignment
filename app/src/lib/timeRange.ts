// Strict ISO-8601 with an explicit zone. Rejects loose strings ("2026", "tomorrow") that Date.parse would accept.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

export const isIsoTimestamp = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s))

export interface TimeRange {
  from: string // inclusive ISO timestamp, or ''
  to: string // exclusive ISO timestamp, or ''
}

/**
 * Makes an untrusted range (e.g. from a hand-edited URL) safe to use: unparseable bounds are dropped, and a range
 * that ends at or before it starts is dropped entirely rather than silently matching nothing.
 */
export function sanitizeRange(from: string | null, to: string | null): TimeRange {
  const f = from && isIsoTimestamp(from) ? from : ''
  const t = to && isIsoTimestamp(to) ? to : ''
  if (f && t && Date.parse(f) >= Date.parse(t)) return { from: '', to: '' }
  return { from: f, to: t }
}

const stamp = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** "Oct 9, 5:30 PM – Oct 9, 6:30 PM", "From …", or "Until …" depending on which bounds are set. */
export function formatRangeLabel({ from, to }: TimeRange): string {
  if (from && to) return `${stamp.format(new Date(from))} – ${stamp.format(new Date(to))}`
  if (from) return `From ${stamp.format(new Date(from))}`
  if (to) return `Until ${stamp.format(new Date(to))}`
  return ''
}
