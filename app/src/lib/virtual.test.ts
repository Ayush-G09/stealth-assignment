import { describe, expect, it } from 'vitest'
import { computeRange, scrollTopToReveal } from './virtual'

const H = 40
const OVERSCAN = 5

describe('computeRange', () => {
  it('returns an empty range for an empty list', () => {
    expect(computeRange(0, 600, H, 0, OVERSCAN)).toEqual({ start: 0, end: 0 })
  })

  it('renders the viewport plus overscan at the top', () => {
    // 600px / 40px = 15 rows visible, + 5 overscan below, nothing above row 0
    expect(computeRange(0, 600, H, 1000, OVERSCAN)).toEqual({ start: 0, end: 20 })
  })

  it('moves the window with scrollTop and keeps overscan on both sides', () => {
    // scrollTop 4000 -> first visible row 100
    expect(computeRange(4000, 600, H, 1000, OVERSCAN)).toEqual({ start: 95, end: 120 })
  })

  it('clamps to the list length at the end', () => {
    // max scrollTop = 1000 * 40 - 600 = 39400 -> first visible row 985
    expect(computeRange(39_400, 600, H, 1000, OVERSCAN)).toEqual({ start: 980, end: 1000 })
  })

  it('never produces a start past the end if the list shrinks under the scroll position', () => {
    const r = computeRange(40_000, 600, H, 10, OVERSCAN)
    expect(r.start).toBeLessThanOrEqual(r.end)
    expect(r.end).toBe(10)
  })

  it('treats negative scrollTop (overscroll bounce) as 0', () => {
    expect(computeRange(-50, 600, H, 1000, OVERSCAN)).toEqual(computeRange(0, 600, H, 1000, OVERSCAN))
  })

  it('still mounts a few rows before the viewport has been measured', () => {
    const r = computeRange(0, 0, H, 1000, OVERSCAN)
    expect(r.end).toBeGreaterThan(0)
  })

  it('mounts a bounded number of rows regardless of list size', () => {
    const r = computeRange(2_000_000, 600, H, 10_000_000, OVERSCAN)
    expect(r.end - r.start).toBeLessThan(40)
  })
})

describe('scrollTopToReveal', () => {
  const HEAD = 36
  const VIEW = 636 // 600px of rows below a 36px sticky header

  it('returns null when the row is already fully visible', () => {
    expect(scrollTopToReveal(5, 0, VIEW, H, HEAD)).toBeNull()
  })

  it('scrolls up so a row above the viewport sits at the top', () => {
    expect(scrollTopToReveal(2, 800, VIEW, H, HEAD)).toBe(80)
  })

  it('scrolls down so a row below the viewport sits at the bottom', () => {
    // row 50 bottom = 2040; visible body height = 600 -> scrollTop 1440
    expect(scrollTopToReveal(50, 0, VIEW, H, HEAD)).toBe(1440)
  })

  it('does not scroll for a row exactly at the bottom edge', () => {
    // last fully visible row at scrollTop 0 is index 14 (bottom = 600)
    expect(scrollTopToReveal(14, 0, VIEW, H, HEAD)).toBeNull()
    expect(scrollTopToReveal(15, 0, VIEW, H, HEAD)).toBe(40)
  })
})
