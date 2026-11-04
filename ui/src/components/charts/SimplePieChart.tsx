import { useMemo, useState } from 'react'
import type { ChartSlice } from '../../api/reviews'

const DEFAULT_COLORS = ['#6e55ce', '#4f8df5', '#4a9d6f', '#e8a43c', '#e07a9b', '#3aa6b5', '#8a899b', '#9b59b6']

export const SENTIMENT_PIE_COLORS: Record<string, string> = {
  Positive: '#2E9E6F',
  Negative: '#D64550',
  Neutral: '#E8A43C',
}

export const TICKET_PIE_COLORS: Record<string, string> = {
  Open: '#E8943A',
  Resolved: '#2D9D6A',
  Closed: '#6E55CE',
}

function resolveSliceColor(label: string, index: number, labelColors?: Record<string, string>): string {
  if (labelColors) {
    const match = Object.entries(labelColors).find(
      ([key]) => key.toLowerCase() === label.toLowerCase(),
    )
    if (match) return match[1]
  }
  if (label.toLowerCase() === 'others') {
    return '#8a899b'
  }
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]
}

type TooltipState = {
  label: string
  value: number
  percent: number
}

type SimplePieChartProps = {
  data: ChartSlice[]
  emptyLabel?: string
  labelColors?: Record<string, string>
  compact?: boolean
  groupByTop4?: boolean
  onSliceClick?: (slice: ChartSlice) => void
}

export function SimplePieChart({
  data,
  emptyLabel = 'No data yet',
  labelColors,
  compact = false,
  groupByTop4 = true,
  onSliceClick,
}: SimplePieChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Transform data into Top 4 + Others if needed
  const displayData = useMemo(() => {
    if (!groupByTop4 || data.length <= 5) return data
    const sorted = [...data].sort((a, b) => b.value - a.value)
    const top4 = sorted.slice(0, 4)
    const othersValue = sorted.slice(4).reduce((sum, s) => sum + s.value, 0)
    if (othersValue > 0) {
      top4.push({ label: 'Others', value: othersValue })
    }
    return top4
  }, [data, groupByTop4])

  const total = useMemo(() => displayData.reduce((sum, slice) => sum + slice.value, 0), [displayData])

  if (total === 0) {
    return <div className="chart-empty">{emptyLabel}</div>
  }

  let cursor = 0
  const segments = displayData.map((slice, index) => {
    const start = (cursor / total) * 360
    cursor += slice.value
    const end = (cursor / total) * 360
    const largeArc = end - start > 180 ? 1 : 0
    const startRadians = ((start - 90) * Math.PI) / 180
    const endRadians = ((end - 90) * Math.PI) / 180
    const x1 = 50 + 40 * Math.cos(startRadians)
    const y1 = 50 + 40 * Math.sin(startRadians)
    const x2 = 50 + 40 * Math.cos(endRadians)
    const y2 = 50 + 40 * Math.sin(endRadians)
    const path = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`
    const color = resolveSliceColor(slice.label, index, labelColors)
    const percent = Math.round((slice.value / total) * 100)
    return { path, color, slice, percent }
  })

  const interactive = Boolean(onSliceClick)

  function showTip(slice: ChartSlice) {
    const percent = Math.round((slice.value / total) * 100)
    setTooltip({ label: slice.label, value: slice.value, percent })
  }

  function hideTip() {
    setTooltip(null)
  }

  function handleActivate(slice: ChartSlice) {
    onSliceClick?.(slice)
  }

  return (
    <div className={`chart-with-legend ${compact ? 'chart-with-legend--compact' : ''}`}>
      <div className="pie-chart-wrap">
        <svg viewBox="0 0 100 100" className="pie-chart" role="img" aria-label="Pie chart">
          {segments.map((segment) => (
            <path
              key={segment.slice.label}
              d={segment.path}
              fill={segment.color}
              className={interactive ? 'pie-segment-interactive' : undefined}
              onMouseEnter={() => showTip(segment.slice)}
              onMouseLeave={hideTip}
              onFocus={() => showTip(segment.slice)}
              onBlur={hideTip}
              onClick={() => handleActivate(segment.slice)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleActivate(segment.slice)
                }
              }}
              tabIndex={interactive ? 0 : undefined}
              role={onSliceClick ? 'button' : undefined}
              aria-label={`${segment.slice.label}: ${segment.slice.value} (${segment.percent}%)`}
            />
          ))}
          <circle cx="50" cy="50" r="22" fill="#fff" />
        </svg>
        {tooltip && (
          <div className="chart-hover-tooltip" role="tooltip">
            <span>{tooltip.label}</span>
            <b>{tooltip.value} ({tooltip.percent}%)</b>
          </div>
        )}
      </div>

      <ul className="chart-legend-labeled" aria-label="Chart legend">
        {displayData.map((slice, index) => {
          const color = resolveSliceColor(slice.label, index, labelColors)
          const pct = Math.round((slice.value / total) * 100)
          return (
            <li
              key={slice.label}
              className={`chart-legend-item ${interactive ? 'chart-legend-item--clickable' : ''}`}
              onClick={() => handleActivate(slice)}
              title={`${slice.label}: ${slice.value} (${pct}%)`}
            >
              <span className="legend-swatch-dot" style={{ backgroundColor: color }} />
              <span className="legend-label-text">{slice.label}</span>
              <span className="legend-value-badge">{slice.value}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
