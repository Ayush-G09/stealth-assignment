import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { BrushComponent, GridComponent, ToolboxComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import ReactEChartsCoreImport from 'echarts-for-react/lib/core'
import type { Filters } from '../lib/api'
import { BUCKET_LABEL, selectionToRange, type Point } from '../lib/histogram'
import { formatRangeLabel, fromLocalInput, toLocalInput, type TimeRange } from '../lib/timeRange'
import { readChartOpen, storeChartOpen } from '../lib/chartPrefs'
import { useChartColors, usePrefersReducedMotion } from '../lib/useChartColors'
import { useHistogram } from '../lib/useHistogram'

// echarts-for-react is CommonJS. Depending on the bundler, the default import is the component itself or the module
// object that wraps it, so unwrap it either way.
type ChartComponent = typeof ReactEChartsCoreImport
const ReactEChartsCore: ChartComponent =
  (ReactEChartsCoreImport as unknown as { default?: ChartComponent }).default ?? ReactEChartsCoreImport

// Only the pieces we use (tree-shaken), instead of the whole ECharts bundle.
echarts.use([BarChart, BrushComponent, GridComponent, ToolboxComponent, TooltipComponent, CanvasRenderer])

interface Props {
  filters: Filters
  onSelectRange: (range: TimeRange) => void
}

interface BrushEndEvent {
  areas?: { coordRange?: number[] }[]
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayOnly = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

export default function Histogram({ filters, onSelectRange }: Props) {
  const [open, setOpen] = useState(readChartOpen)
  const [formOpen, setFormOpen] = useState(false)
  const { points, bucket, loading, refreshing, error, summary, retry } = useHistogram(filters, open)
  const colors = useChartColors()
  const reduceMotion = usePrefersReducedMotion()
  const chart = useRef<InstanceType<ChartComponent>>(null)
  const hasRange = !!(filters.from || filters.to)

  // Keep the latest points/bucket reachable from ECharts event callbacks without re-binding them.
  const latest = useRef({ points, bucket, onSelectRange })
  useEffect(() => {
    latest.current = { points, bucket, onSelectRange }
  })

  const option = useMemo<EChartsCoreOption>(() => {
    const labels = points.map((p) => dateTime.format(p.t))
    return {
      animation: !reduceMotion,
      animationDuration: 250,
      grid: { left: 44, right: 12, top: 12, bottom: 26 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: colors.surface,
        borderColor: colors.border,
        textStyle: { color: colors.fg, fontSize: 12 },
        formatter: (params: { dataIndex: number; value?: number }[]) => {
          const p = params[0]
          if (!p || labels[p.dataIndex] === undefined) return '' // data changed under a stationary pointer
          return `${labels[p.dataIndex]}<br/><b>${plural(p.value ?? 0, 'event')}</b> per ${BUCKET_LABEL[bucket]}`
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: {
          color: colors.muted,
          fontSize: 11,
          hideOverlap: true,
          // Show the date where it changes (and on the first label), just the time elsewhere.
          formatter: (_: string, i: number) => {
            const t = points[i]?.t
            if (t === undefined) return ''
            const newDay = i === 0 || dayOnly.format(t) !== dayOnly.format(points[i - 1].t)
            return newDay ? `${dayOnly.format(t)}\n${timeOnly.format(t)}` : timeOnly.format(t)
          },
        },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: colors.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.6 } },
      },
      series: [
        {
          type: 'bar',
          data: points.map((p) => p.count),
          barCategoryGap: '18%',
          itemStyle: { color: colors.accent, borderRadius: [2, 2, 0, 0] },
          emphasis: { itemStyle: { opacity: 0.8 } },
        },
      ],
      toolbox: { show: false }, // brush is armed programmatically; no toolbar buttons
      brush: {
        xAxisIndex: 0,
        brushType: 'lineX',
        brushMode: 'single',
        transformable: false,
        throttleType: 'debounce',
        throttleDelay: 0,
        brushStyle: { borderWidth: 1, borderColor: colors.accent, color: `${colors.accent}33` },
      },
    }
  }, [points, bucket, colors, reduceMotion])

  // Dragging across the plot should immediately start a selection (no toolbar button to press first).
  const armBrush = useCallback(() => {
    chart.current?.getEchartsInstance().dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: { brushType: 'lineX', brushMode: 'single' },
    })
  }, [])

  const clearBrush = useCallback(() => {
    chart.current?.getEchartsInstance().dispatchAction({ type: 'brush', areas: [] })
  }, [])

  useEffect(() => {
    armBrush()
    // The data under a stationary mouse just changed (e.g. after zooming), so a visible tooltip would be stale.
    chart.current?.getEchartsInstance().dispatchAction({ type: 'hideTip' })
  }, [armBrush, option])

  // The brush layer swallows simple clicks, so turn a click on a bar into "zoom to that bar" ourselves.
  const bindBarClick = useCallback(() => {
    const instance = chart.current?.getEchartsInstance()
    if (!instance) return
    const zr = instance.getZr()
    zr.off('click')
    zr.on('click', (e: { offsetX: number; offsetY: number }) => {
      const at = [e.offsetX, e.offsetY]
      if (!instance.containPixel('grid', at)) return
      const index = instance.convertFromPixel({ xAxisIndex: 0 }, e.offsetX) as number // category index
      const { points: pts, bucket: b, onSelectRange: select } = latest.current
      const selected = selectionToRange(pts, index, index, b)
      if (selected) select(selected)
    })
  }, [])

  const onReady = useCallback(() => {
    armBrush()
    bindBarClick()
  }, [armBrush, bindBarClick])

  const onEvents = useMemo(
    () => ({
      brushEnd: (e: BrushEndEvent) => {
        const range = e.areas?.[0]?.coordRange
        if (!range || range.length < 2) return
        const { points: pts, bucket: b, onSelectRange: select } = latest.current
        const selected = selectionToRange(pts, range[0], range[1], b)
        clearBrush()
        if (selected) select(selected)
      },
    }),
    [clearBrush],
  )

  const hasEvents = summary.total > 0
  const text = describe(points, summary.total, summary.peak, bucket)

  const toggleOpen = () => {
    setOpen(!open)
    storeChartOpen(!open)
  }

  return (
    <section className={'chart' + (open ? '' : ' is-collapsed')} aria-label="Events over time">
      <div className="chart-head">
        <h2>Events over time</h2>
        {open && (
          <span className="muted chart-note" aria-hidden="true">
            {refreshing
              ? 'Updating…'
              : hasEvents
                ? `${plural(summary.total, 'event')}, per ${BUCKET_LABEL[bucket]}`
                : ''}
          </span>
        )}
        <span className="chart-actions">
          {open && <span className="muted chart-hint">Drag across the bars to zoom</span>}
          {open && (
            <button
              className="chart-btn"
              aria-expanded={formOpen}
              aria-controls="chart-range"
              onClick={() => setFormOpen(!formOpen)}
            >
              Set time range
            </button>
          )}
          {open && hasRange && (
            <button className="chart-btn chart-reset" onClick={() => onSelectRange({ from: '', to: '' })}>
              Reset zoom
            </button>
          )}
          <button className="chart-btn" aria-expanded={open} aria-controls="chart-panel" onClick={toggleOpen}>
            {open ? 'Hide chart' : 'Show chart'}
          </button>
        </span>
      </div>

      {open && (
        <div id="chart-panel">
          <div className={'chart-body' + (refreshing ? ' is-refreshing' : '')} aria-busy={loading || refreshing}>
            {loading && <ChartSkeleton />}
            {error && (
              <div className="chart-state" role="alert">
                <span>Couldn't load the chart: {error}</span> <button onClick={retry}>Try again</button>
              </div>
            )}
            {!loading && !error && !hasEvents && (
              <div className="chart-state muted">
                No events {hasRange ? `between ${formatRangeLabel(filters)}` : 'match the current filters'}.
              </div>
            )}
            {!loading && !error && hasEvents && (
              <div role="img" aria-label={text} className="chart-canvas">
                <ReactEChartsCore
                  ref={chart}
                  echarts={echarts}
                  option={option}
                  onEvents={onEvents}
                  onChartReady={onReady}
                  style={{ height: '100%', width: '100%' }}
                  opts={{ renderer: 'canvas' }}
                  lazyUpdate
                />
              </div>
            )}
          </div>

          <p className="sr-only" aria-live="polite">
            {error ? '' : loading ? 'Loading chart' : text}
          </p>

          {formOpen && (
            <div id="chart-range">
              <RangeForm key={`${filters.from}|${filters.to}`} filters={filters} onSelectRange={onSelectRange} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function describe(points: Point[], total: number, peak: Point | null, bucket: keyof typeof BUCKET_LABEL): string {
  if (!points.length || total === 0) return 'No events to chart.'
  const first = dateTime.format(points[0].t)
  const last = dateTime.format(points[points.length - 1].t)
  const busiest = peak
    ? ` Busiest ${BUCKET_LABEL[bucket]}: ${dateTime.format(peak.t)}, ${plural(peak.count, 'event')}.`
    : ''
  return `Events over time, ${plural(total, 'event')} from ${first} to ${last}, per ${BUCKET_LABEL[bucket]}.${busiest}`
}

function ChartSkeleton() {
  const heights = [40, 62, 48, 80, 55, 70, 35, 58, 66, 44, 72, 52, 60, 38, 68, 50]
  return (
    <div className="chart-skeleton" aria-hidden="true">
      {heights.map((h, i) => (
        <span key={i} style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

/** Keyboard- and screen-reader-friendly way to set the same range the drag selection sets. */
function RangeForm({ filters, onSelectRange }: Props) {
  const [from, setFrom] = useState(toLocalInput(filters.from))
  const [to, setTo] = useState(toLocalInput(filters.to))
  const [problem, setProblem] = useState('')

  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    const f = fromLocalInput(from)
    const t = fromLocalInput(to)
    if (f && t && Date.parse(f) >= Date.parse(t)) {
      setProblem('The end must be after the start.')
      return
    }
    setProblem('')
    onSelectRange({ from: f, to: t })
  }

  return (
    <form className="range-form" onSubmit={apply}>
      <label>
        From <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        To <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <button type="submit">Apply</button>
      {problem && (
        <span role="alert" className="range-problem">
          {problem}
        </span>
      )}
    </form>
  )
}
