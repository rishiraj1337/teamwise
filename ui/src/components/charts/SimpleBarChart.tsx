import type { ChartSlice } from '../../api/reviews'

const BAR_COLOR = '#6e55ce'

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
      {data.map((slice) => (
        <button
          type="button"
          className="bar-chart-row bar-chart-row--interactive"
          key={slice.label}
          onClick={() => onBarClick?.(slice)}
          aria-label={`${slice.label}: ${slice.value}`}
        >
          <span className="bar-label">{slice.label}</span>
          <div className="bar-track">
            <i style={{ width: `${(slice.value / max) * 100}%`, background: BAR_COLOR }} />
          </div>
          <span className="bar-value">{slice.value}</span>
        </button>
      ))}
    </div>
  )
}
