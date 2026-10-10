// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EMPTY_FILTERS, fetchHistogram, type Filters, type Histogram as HistogramData } from '../lib/api'
import Histogram from './Histogram'

// jsdom cannot draw a canvas, so replace ECharts with a stub that records the props the component hands it. That lets
// the tests drive the chart's events (e.g. a drag selection) and assert on what the component does with them.
const chart = vi.hoisted(() => ({
  props: null as null | {
    option: { series: { data: number[] }[] }
    onEvents: { brushEnd: (e: { areas?: { coordRange?: number[] }[] }) => void }
  },
  instance: { dispatchAction: vi.fn(), getZr: () => ({ off: vi.fn(), on: vi.fn() }) },
}))

vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/charts', () => ({ BarChart: {} }))
vi.mock('echarts/components', () => ({
  BrushComponent: {},
  GridComponent: {},
  ToolboxComponent: {},
  TooltipComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts-for-react/lib/core', async () => {
  const React = await import('react')
  const Stub = React.forwardRef(function Stub(props: Record<string, unknown>, ref) {
    React.useEffect(() => {
      chart.props = props as never // record the latest props for the tests to inspect
    })
    React.useImperativeHandle(ref, () => ({ getEchartsInstance: () => chart.instance }))
    return React.createElement('div', { 'data-testid': 'echart' })
  })
  return { default: Stub }
})
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  fetchHistogram: vi.fn(),
}))

const T0 = Date.parse('2026-10-09T10:00:00Z')
const H = 60 * 60_000
const data = (counts: number[]): HistogramData => ({
  bucket: '1h',
  buckets: counts.map((count, i) => ({ t: new Date(T0 + i * H).toISOString(), count })),
})

let resolveFetch: (h: HistogramData) => void
let rejectFetch: (e: Error) => void

beforeEach(() => {
  localStorage.clear()
  chart.props = null
  chart.instance.dispatchAction.mockClear()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  vi.mocked(fetchHistogram).mockImplementation(
    () =>
      new Promise<HistogramData>((resolve, reject) => {
        resolveFetch = resolve
        rejectFetch = reject
      }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const renderChart = (filters: Filters = EMPTY_FILTERS) => {
  const onSelectRange = vi.fn()
  const view = render(<Histogram filters={filters} onSelectRange={onSelectRange} />)
  return { onSelectRange, ...view }
}

describe('Histogram states', () => {
  it('shows a loading skeleton, then the chart with a text summary for screen readers', async () => {
    renderChart()
    expect(document.querySelector('.chart-skeleton')).toBeTruthy()
    expect(screen.queryByTestId('echart')).toBeNull()

    await act(async () => resolveFetch(data([3, 0, 9])))
    expect(document.querySelector('.chart-skeleton')).toBeNull()
    expect(screen.getByTestId('echart')).toBeTruthy()
    const img = screen.getByRole('img')
    expect(img.getAttribute('aria-label')).toMatch(/12 events/)
    expect(img.getAttribute('aria-label')).toMatch(/Busiest hour/)
    expect(screen.getByText(/12 events, per hour/)).toBeTruthy()
  })

  it('feeds the bars the gap-filled counts', async () => {
    renderChart()
    await act(async () => resolveFetch({ bucket: '1h', buckets: [data([5]).buckets[0], data([0, 0, 7]).buckets[2]] }))
    expect(chart.props?.option.series[0].data).toEqual([5, 0, 7])
  })

  it('says so when there is nothing to chart', async () => {
    renderChart()
    await act(async () => resolveFetch({ bucket: '1h', buckets: [] }))
    expect(screen.getByText(/No events match the current filters/)).toBeTruthy()
    expect(screen.queryByTestId('echart')).toBeNull()
  })

  it('mentions the range when the empty result is inside a zoomed range', async () => {
    renderChart({ ...EMPTY_FILTERS, from: '2026-10-09T10:00:00Z', to: '2026-10-09T11:00:00Z' })
    await act(async () => resolveFetch({ bucket: '1m', buckets: [] }))
    expect(screen.getByText(/No events between/)).toBeTruthy()
  })

  it('shows an error with a retry that loads the chart again', async () => {
    renderChart()
    await act(async () => rejectFetch(new Error('boom')))
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load the chart: boom")

    fireEvent.click(screen.getByText('Try again'))
    expect(document.querySelector('.chart-skeleton')).toBeTruthy()
    await act(async () => resolveFetch(data([1])))
    expect(screen.getByTestId('echart')).toBeTruthy()
  })

  it('keeps the old chart dimmed while new filters load', async () => {
    const { rerender, onSelectRange } = renderChart()
    await act(async () => resolveFetch(data([4, 6])))

    rerender(<Histogram filters={{ ...EMPTY_FILTERS, q: 'x' }} onSelectRange={onSelectRange} />)
    expect(document.querySelector('.chart-body.is-refreshing')).toBeTruthy()
    expect(screen.getByText('Updating…')).toBeTruthy()
    expect(screen.getByTestId('echart')).toBeTruthy() // not replaced by a skeleton
  })
})

describe('Histogram selection', () => {
  it('turns a drag across bars into the time range they cover', async () => {
    const { onSelectRange } = renderChart()
    await act(async () => resolveFetch(data([1, 2, 3, 4, 5, 6])))

    act(() => chart.props?.onEvents.brushEnd({ areas: [{ coordRange: [1, 3] }] }))
    expect(onSelectRange).toHaveBeenCalledWith({
      from: new Date(T0 + 1 * H).toISOString(),
      to: new Date(T0 + 4 * H).toISOString(), // end of the 4th bar (exclusive)
    })
    // the drag rectangle is cleared once the range is applied
    expect(chart.instance.dispatchAction).toHaveBeenCalledWith({ type: 'brush', areas: [] })
  })

  it('accepts a drag from right to left', async () => {
    const { onSelectRange } = renderChart()
    await act(async () => resolveFetch(data([1, 2, 3, 4])))
    act(() => chart.props?.onEvents.brushEnd({ areas: [{ coordRange: [3, 1] }] }))
    expect(onSelectRange).toHaveBeenCalledWith({
      from: new Date(T0 + 1 * H).toISOString(),
      to: new Date(T0 + 4 * H).toISOString(),
    })
  })

  it('ignores an empty brush (a plain click with no drag)', async () => {
    const { onSelectRange } = renderChart()
    await act(async () => resolveFetch(data([1, 2])))
    act(() => chart.props?.onEvents.brushEnd({ areas: [] }))
    act(() => chart.props?.onEvents.brushEnd({}))
    expect(onSelectRange).not.toHaveBeenCalled()
  })

  it('offers "Reset zoom" only while a range is applied, and clears it', async () => {
    const view = renderChart()
    await act(async () => resolveFetch(data([1])))
    expect(screen.queryByText('Reset zoom')).toBeNull()

    view.rerender(
      <Histogram
        filters={{ ...EMPTY_FILTERS, from: '2026-10-09T10:00:00Z', to: '2026-10-09T11:00:00Z' }}
        onSelectRange={view.onSelectRange}
      />,
    )
    await act(async () => resolveFetch(data([1])))
    fireEvent.click(screen.getByText('Reset zoom'))
    expect(view.onSelectRange).toHaveBeenCalledWith({ from: '', to: '' })
  })
})

describe('Histogram range form (the keyboard-accessible alternative to dragging)', () => {
  const openForm = async (filters: Filters = EMPTY_FILTERS) => {
    const view = renderChart(filters)
    await act(async () => resolveFetch(data([1])))
    expect(document.querySelector('.range-form')).toBeNull() // closed until asked for
    fireEvent.click(screen.getByText('Set time range'))
    const inputs = document.querySelectorAll<HTMLInputElement>('.range-form input')
    return { ...view, from: inputs[0], to: inputs[1], form: document.querySelector('.range-form') as HTMLFormElement }
  }

  it('applies a local date-time range as UTC timestamps', async () => {
    const { onSelectRange, from, to, form } = await openForm()
    fireEvent.change(from, { target: { value: '2026-10-08T18:00' } })
    fireEvent.change(to, { target: { value: '2026-10-08T20:30' } })
    fireEvent.submit(form)
    expect(onSelectRange).toHaveBeenCalledWith({
      from: new Date(2026, 9, 8, 18, 0).toISOString(),
      to: new Date(2026, 9, 8, 20, 30).toISOString(),
    })
  })

  it('refuses an end that is not after the start, and says why', async () => {
    const { onSelectRange, from, to, form } = await openForm()
    fireEvent.change(from, { target: { value: '2026-10-08T20:00' } })
    fireEvent.change(to, { target: { value: '2026-10-08T18:00' } })
    fireEvent.submit(form)
    expect(onSelectRange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('The end must be after the start.')
  })

  it('pre-fills from the current range', async () => {
    const { from, to } = await openForm({
      ...EMPTY_FILTERS,
      from: new Date(2026, 9, 8, 18, 0).toISOString(),
      to: new Date(2026, 9, 8, 20, 30).toISOString(),
    })
    expect(from.value).toBe('2026-10-08T18:00')
    expect(to.value).toBe('2026-10-08T20:30')
  })

  it('clears the range when both fields are emptied and applied', async () => {
    const { onSelectRange, form } = await openForm({
      ...EMPTY_FILTERS,
      from: '2026-10-09T10:00:00Z',
      to: '2026-10-09T11:00:00Z',
    })
    const inputs = document.querySelectorAll<HTMLInputElement>('.range-form input')
    fireEvent.change(inputs[0], { target: { value: '' } })
    fireEvent.change(inputs[1], { target: { value: '' } })
    fireEvent.submit(form)
    expect(onSelectRange).toHaveBeenCalledWith({ from: '', to: '' })
  })
})

describe('Histogram hide / show', () => {
  it('hides the chart on request and stops using space and bandwidth', async () => {
    renderChart()
    await act(async () => resolveFetch(data([1, 2])))
    expect(screen.getByTestId('echart')).toBeTruthy()

    fireEvent.click(screen.getByText('Hide chart'))
    expect(screen.queryByTestId('echart')).toBeNull()
    expect(screen.queryByText('Set time range')).toBeNull()
    expect(screen.getByText('Show chart').getAttribute('aria-expanded')).toBe('false')
  })

  it('remembers the choice across visits', async () => {
    const first = renderChart()
    await act(async () => resolveFetch(data([1])))
    fireEvent.click(screen.getByText('Hide chart'))
    first.unmount()

    vi.mocked(fetchHistogram).mockClear()
    renderChart() // a "new visit"
    expect(screen.getByText('Show chart')).toBeTruthy()
    expect(screen.queryByTestId('echart')).toBeNull()
    expect(fetchHistogram).not.toHaveBeenCalled() // no request while hidden
  })

  it('loads the data when shown again', async () => {
    localStorage.setItem('aae:chart', 'closed')
    renderChart()
    expect(fetchHistogram).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Show chart'))
    expect(fetchHistogram).toHaveBeenCalledTimes(1)
    await act(async () => resolveFetch(data([3])))
    expect(screen.getByTestId('echart')).toBeTruthy()
  })

  it('still works if storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderChart()
    await act(async () => resolveFetch(data([1])))
    expect(screen.getByTestId('echart')).toBeTruthy() // defaults to open
    expect(() => fireEvent.click(screen.getByText('Hide chart'))).not.toThrow()
    vi.restoreAllMocks()
  })
})
