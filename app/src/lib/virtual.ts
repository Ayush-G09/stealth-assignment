export interface Range {
  start: number // first row to render (inclusive)
  end: number // last row to render (exclusive)
}

/**
 * Which rows to mount for a fixed-height list: everything intersecting the viewport,
 * plus `overscan` rows on each side so fast scrolling doesn't flash blank space.
 */
export function computeRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan: number,
): Range {
  if (count <= 0) return { start: 0, end: 0 }
  const top = Math.max(0, scrollTop)
  const first = Math.floor(top / rowHeight)
  // Before the viewport is measured (height 0) still mount a small window so the first paint isn't empty.
  const last = Math.ceil((top + Math.max(viewportHeight, rowHeight)) / rowHeight)
  return {
    start: Math.min(Math.max(0, first - overscan), count),
    end: Math.min(count, last + overscan),
  }
}

/**
 * New scrollTop that brings row `index` fully into view, or null if it already is.
 * `chromeHeight` is the sticky header covering the top of the scroller.
 */
export function scrollTopToReveal(
  index: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  chromeHeight: number,
): number | null {
  const rowTop = index * rowHeight
  const rowBottom = rowTop + rowHeight
  const visibleHeight = viewportHeight - chromeHeight
  if (rowTop < scrollTop) return rowTop
  if (rowBottom > scrollTop + visibleHeight) return rowBottom - visibleHeight
  return null
}
