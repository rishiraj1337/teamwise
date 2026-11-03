import { useState } from 'react'
import type { ChartSlice } from '../../api/reviews'

const DEFAULT_COLORS = ['#6e55ce', '#4f8df5', '#4a9d6f', '#e8a43c', '#e07a9b', '#3aa6b5', '#8a899b']

export const SENTIMENT_PIE_COLORS: Record<string, string> = {
  Positive: '#2E9E6F',
  Negative: '#D64550',
}

export const TICKET_PIE_COLORS: Record<string, string> = {
  Open: '#E8943A',
  Resolved: '#2D9D6A',
}

function resolveSliceColor(label: string, index: number, labelColors?: Record<string, string>): string {
  if (labelColors) {
    const match = Object.entries(labelColors).find(
      ([key]) => key.toLowerCase() === label.toLowerCase(),
    )
    if (match) return match[1]
  }
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]
}

type TooltipState = {
  label: string
  value: number
}

type SimplePieChartProps = {
  data: ChartSlice[]
  emptyLabel?: string
  labelColors?: Record<string, string>
  compact?: boolean
  onSliceClick?: (slice: ChartSlice) => void
}

export function SimplePieChart({
  data,
  emptyLabel = 'No data yet',
  labelColors,
  compact = false,
  onSliceClick,
}: SimplePieChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const total = data.reduce((sum, slice) => sum + slice.value, 0)
  if (total === 0) {
    return <div className="chart-empty">{emptyLabel}</div>
  }

  let cursor = 0
  const segments = data.map((slice, index) => {
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
    return { path, color, slice }
  })

  const interactive = compact || Boolean(onSliceClick)

  function showTip(slice: ChartSlice) {
    setTooltip({ label: slice.label, value: slice.value })
  }

  function hideTip() {
    setTooltip(null)
  }

  function handleActivate(slice: ChartSlice) {
    onSliceClick?.(slice)
  }

  return (
    <div className={compact ? 'report-mini-chart' : 'chart-with-legend'}>
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
              aria-label={`${segment.slice.label}: ${segment.slice.value}`}
            />
          ))}
          <circle cx="50" cy="50" r="22" fill="#fff" />
        </svg>
        {compact && tooltip && (
          <div className="chart-hover-tooltip" role="tooltip">
            <span>{tooltip.label}</span>
            <b>{tooltip.value}</b>
          </div>
        )}
      </div>
      {compact ? (
        <ul
          className={`chart-swatch-column${data.length > 3 ? ' chart-swatch-column--grid' : ''}`}
          aria-label="Chart legend"
        >
          {data.map((slice, index) => (
            <li key={slice.label}>
              <button
                type="button"
                className="chart-swatch-button"
                style={{ background: resolveSliceColor(slice.label, index, labelColors) }}
                aria-label={`${slice.label}: ${slice.value}`}
                onMouseEnter={() => showTip(slice)}
                onMouseLeave={hideTip}
                onFocus={() => showTip(slice)}
                onBlur={hideTip}
                onClick={() => handleActivate(slice)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="chart-legend">
          {data.map((slice, index) => (
            <li key={slice.label}>
              <span
                className="legend-swatch"
                style={{ background: resolveSliceColor(slice.label, index, labelColors) }}
              />
              <span>{slice.label}</span>
              <b>{slice.value}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
