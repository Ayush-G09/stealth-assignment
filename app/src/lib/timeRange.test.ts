// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { formatRangeLabel, fromLocalInput, isIsoTimestamp, sanitizeRange, toLocalInput } from './timeRange'

describe('isIsoTimestamp', () => {
  it.each([
    '2026-10-09T10:00:00Z',
    '2026-10-09T10:00:00.123Z',
    '2026-10-09T10:00Z',
    '2026-10-09T10:00:00+05:30',
    '2026-10-09T10:00:00-08:00',
  ])('accepts %s', (s) => {
    expect(isIsoTimestamp(s)).toBe(true)
  })

  it.each([
    '',
    '2026',
    '2026-10-09',
    'tomorrow',
    '2026-10-09 10:00:00',
    '2026-10-09T10:00:00', // no zone: ambiguous
    '2026-13-45T10:00:00Z', // not a real date
    '2026-10-09T10:00:00 05:30', // a "+" that was decoded to a space
    'null',
  ])('rejects %j', (s) => {
    expect(isIsoTimestamp(s)).toBe(false)
  })
})

describe('sanitizeRange', () => {
  const a = '2026-10-09T10:00:00Z'
  const b = '2026-10-09T11:00:00Z'

  it('keeps a valid range', () => {
    expect(sanitizeRange(a, b)).toEqual({ from: a, to: b })
  })

  it('keeps an open-ended range', () => {
    expect(sanitizeRange(a, null)).toEqual({ from: a, to: '' })
    expect(sanitizeRange(null, b)).toEqual({ from: '', to: b })
  })

  it('drops an unparseable bound but keeps the other', () => {
    expect(sanitizeRange('garbage', b)).toEqual({ from: '', to: b })
    expect(sanitizeRange(a, 'garbage')).toEqual({ from: a, to: '' })
  })

  it('treats null and empty as unset', () => {
    expect(sanitizeRange(null, null)).toEqual({ from: '', to: '' })
    expect(sanitizeRange('', '')).toEqual({ from: '', to: '' })
  })

  it('drops the whole range when it ends at or before it starts (it could only ever match nothing)', () => {
    expect(sanitizeRange(b, a)).toEqual({ from: '', to: '' })
    expect(sanitizeRange(a, a)).toEqual({ from: '', to: '' })
  })

  it('compares instants, not strings, across different offsets', () => {
    // 10:00+05:30 is 04:30Z, so this is a valid range even though the strings sort the "wrong" way round.
    expect(sanitizeRange('2026-10-09T10:00:00+05:30', '2026-10-09T10:00:00Z')).toEqual({
      from: '2026-10-09T10:00:00+05:30',
      to: '2026-10-09T10:00:00Z',
    })
  })
})

describe('formatRangeLabel', () => {
  it('describes both bounds', () => {
    const label = formatRangeLabel({ from: '2026-10-09T10:00:00Z', to: '2026-10-09T11:00:00Z' })
    expect(label).toContain('–')
    expect(label).not.toMatch(/^From|^Until/)
  })

  it('says From / Until for open-ended ranges', () => {
    expect(formatRangeLabel({ from: '2026-10-09T10:00:00Z', to: '' })).toMatch(/^From /)
    expect(formatRangeLabel({ from: '', to: '2026-10-09T10:00:00Z' })).toMatch(/^Until /)
  })

  it('is empty when there is no range', () => {
    expect(formatRangeLabel({ from: '', to: '' })).toBe('')
  })
})

describe('datetime-local helpers', () => {
  it('round-trips an instant to the minute, in whatever timezone the tests run in', () => {
    const iso = '2026-10-09T10:30:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
  })

  it('formats as the YYYY-MM-DDTHH:mm shape a datetime-local input needs', () => {
    expect(toLocalInput('2026-10-09T10:30:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('treats the input value as local time', () => {
    const d = new Date(2026, 9, 9, 15, 45) // local 15:45
    expect(fromLocalInput('2026-10-09T15:45')).toBe(d.toISOString())
  })

  it('returns an empty string for empty or invalid values', () => {
    expect(toLocalInput('')).toBe('')
    expect(toLocalInput('garbage')).toBe('')
    expect(fromLocalInput('')).toBe('')
    expect(fromLocalInput('not a date')).toBe('')
  })
})
