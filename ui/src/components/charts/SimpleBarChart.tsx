import type { ChartSlice } from '../../api/reviews'

const DEFAULT_BAR_COLOR = '#6366f1'

const PRIORITY_BAR_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#10b981',
}

type SimpleBarChartProps = {
  data: ChartSlice[]
  emptyLabel?: string
  compact?: boolean
  onBarClick?: (slice: ChartSlice) => void
}

export function SimpleBarChart({
  data,
  emptyLabel = 'No data yet',
  compact = false,
  onBarClick,
}: SimpleBarChartProps) {
  const max = data.reduce((peak, slice) => Math.max(peak, slice.value), 0)
  if (max === 0) {
    return <div className="chart-empty">{emptyLabel}</div>
  }

  return (
    <div className={`bar-chart${compact ? ' bar-chart--compact' : ''}`} role="img" aria-label="Bar chart">
      {data.map((slice) => {
        const color = PRIORITY_BAR_COLORS[slice.label.toLowerCase()] ?? DEFAULT_BAR_COLOR
        const percent = max > 0 ? Math.max(4, Math.round((slice.value / max) * 100)) : 0
        return (
          <button
            type="button"
            className="bar-chart-row bar-chart-row--interactive"
            key={slice.label}
            onClick={() => onBarClick?.(slice)}
            aria-label={`${slice.label}: ${slice.value}`}
          >
            <span className="bar-label">{slice.label}</span>
            <div className="bar-track">
              <i style={{ width: `${percent}%`, background: color }} />
            </div>
            <span className="bar-value">{slice.value}</span>
          </button>
        )
      })}
    </div>
  )
}
