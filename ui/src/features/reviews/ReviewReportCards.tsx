import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { downloadCsv } from '../../utils/csv'
import { fetchReviewAnalytics, logReviewCsvExport, type ReviewAnalyticsResponse } from '../../api/reviews'
import { ApiError } from '../../api/client'
import { SimpleBarChart } from '../../components/charts/SimpleBarChart'
import { SimplePieChart, SENTIMENT_PIE_COLORS } from '../../components/charts/SimplePieChart'
import {
  mapReportSliceToPreset,
  sortPriorityBreakdown,
  type ReportDrillSource,
  type ReviewListPreset,
} from './reviewReportNavigation'

type TimePreset = 'all' | 'today' | 'week' | 'month' | 'custom'

export function OperationsOverviewReviewReports({
  onDrillDown,
}: {
  onDrillDown: (preset: ReviewListPreset) => void
}) {
  const [analytics, setAnalytics] = useState<ReviewAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timePreset, setTimePreset] = useState<TimePreset>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const { computedStartDate, computedEndDate } = useMemo(() => {
    const formatYmd = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const now = new Date()
    const today = formatYmd(now)

    if (timePreset === 'today') {
      return { computedStartDate: today, computedEndDate: today }
    }
    if (timePreset === 'week') {
      const d = new Date(now)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      d.setDate(diff)
      const monday = formatYmd(d)
      return { computedStartDate: monday, computedEndDate: today }
    }
    if (timePreset === 'month') {
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      return { computedStartDate: firstDay, computedEndDate: today }
    }
    if (timePreset === 'custom') {
      return { computedStartDate: customStartDate, computedEndDate: customEndDate }
    }
    return { computedStartDate: '', computedEndDate: '' }
  }, [timePreset, customStartDate, customEndDate])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchReviewAnalytics({
      start_date: computedStartDate || undefined,
      end_date: computedEndDate || undefined,
    })
      .then((response) => {
        if (!cancelled) setAnalytics(response)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load review reports.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [computedStartDate, computedEndDate])

  return (
    <>
      <div className="quick-date-presets" role="radiogroup" aria-label="Report period filter">
        <span className="thread-pill-kicker" style={{ marginRight: '4px' }}>Reports Period:</span>
        {(
          [
            ['all', 'All Time'],
            ['today', 'Today'],
            ['week', 'This Week'],
            ['month', 'This Month'],
            ['custom', 'Custom Range'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`quick-date-pill ${timePreset === key ? 'active' : ''}`}
            onClick={() => setTimePreset(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {timePreset === 'custom' && (
        <div className="reviews-filters report-date-filters" style={{ marginBottom: '12px' }}>
          <label>
            From date
            <input
              type="date"
              value={customStartDate}
              onChange={(event) => setCustomStartDate(event.target.value)}
            />
          </label>
          <label>
            To date
            <input
              type="date"
              value={customEndDate}
              onChange={(event) => setCustomEndDate(event.target.value)}
            />
          </label>
        </div>
      )}

      <ReviewReportCards
        analytics={analytics}
        loading={loading}
        error={error}
        startDate={computedStartDate}
        endDate={computedEndDate}
        onDrillDown={onDrillDown}
      />
    </>
  )
}

export function ReviewReportCards({
  analytics,
  loading,
  error,
  startDate = '',
  endDate = '',
  onDrillDown,
}: {
  analytics: ReviewAnalyticsResponse | null
  loading: boolean
  error: string
  startDate?: string
  endDate?: string
  onDrillDown: (preset: ReviewListPreset) => void
}) {
  if (error) {
    return <p className="login-error form-level-error" role="alert">{error}</p>
  }

  function drill(source: ReportDrillSource, label: string) {
    onDrillDown(mapReportSliceToPreset(source, label))
  }

  const priorityData = sortPriorityBreakdown(analytics?.priority_breakdown ?? [])

  return (
    <>
    <section className="reviews-chart-grid dashboard-reports-row" aria-label="Review summary reports">
      <article className="panel review-chart-card">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">CLASSIFICATION</span>
            <h2>Category Distribution</h2>
          </div>
        </div>
        <div className="review-chart-card__body">
          {loading ? <div className="chart-empty">Loading…</div> : (
            <SimplePieChart
              data={analytics?.category_breakdown ?? []}
              emptyLabel="No category data"
              compact
              onSliceClick={(slice) => drill('category', slice.label)}
            />
          )}
        </div>
      </article>

      <article className="panel review-chart-card">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">SENTIMENT</span>
            <h2>Customer Ratings</h2>
          </div>
        </div>
        <div className="review-chart-card__body">
          {loading ? <div className="chart-empty">Loading…</div> : (
            <SimplePieChart
              data={analytics?.sentiment_breakdown ?? []}
              emptyLabel="No ratings yet"
              labelColors={SENTIMENT_PIE_COLORS}
              compact
              onSliceClick={(slice) => drill('sentiment', slice.label)}
            />
          )}
        </div>
      </article>

      <article className="panel review-chart-card">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">SEVERITY</span>
            <h2>Priority Breakdown</h2>
          </div>
        </div>
        <div className="review-chart-card__body review-chart-card__body--bars">
          {loading ? <div className="chart-empty">Loading…</div> : (
            <SimpleBarChart
              data={priorityData}
              emptyLabel="No priority data"
              compact
              onBarClick={(slice) => drill('priority', slice.label)}
            />
          )}
        </div>
      </article>
    </section>

    <CategoryReviewBreakdown
      analytics={analytics}
      loading={loading}
      startDate={startDate}
      endDate={endDate}
      onDrillDown={onDrillDown}
    />
    </>
  )
}

function CategoryReviewBreakdown({
  analytics,
  loading,
  startDate,
  endDate,
  onDrillDown,
}: {
  analytics: ReviewAnalyticsResponse | null
  loading: boolean
  startDate: string
  endDate: string
  onDrillDown: (preset: ReviewListPreset) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const categories = analytics?.category_detail ?? []
  const total = categories.reduce((sum, item) => sum + item.count, 0)

  function toggle(category: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function downloadBreakdown() {
    const rows = categories.flatMap((item) => [
      [item.category, item.count],
      ...item.subcategories.map((subcategory) => [`${item.category} - ${subcategory.label}`, subcategory.value]),
    ])
    downloadCsv('review-category-breakdown.csv', ['Category / Associated subcategory', 'Count'], [
      ...rows,
      ['Grand Total', total],
    ])
    void logReviewCsvExport({
      row_count: total,
      export_type: 'category_breakdown',
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    })
  }

  return (
    <section className="panel category-breakdown-panel">
      <div className="category-breakdown-heading">
        <div><span className="section-kicker">REVIEW DISTRIBUTION</span><h2>Category Breakdown</h2></div>
        <button type="button" className="secondary-button category-download-button" onClick={downloadBreakdown} disabled={loading || categories.length === 0}>
          <Icon name="arrow" size={14} /> Download
        </button>
      </div>
      {loading ? <div className="chart-empty">Loading category breakdown…</div> : categories.length === 0 ? (
        <div className="chart-empty">No category data yet.</div>
      ) : (
        <div className="category-breakdown-list">
          {categories.map((item) => {
            const isExpanded = expanded.has(item.category)
            const percent = total > 0 ? Math.round((item.count / total) * 100) : 0
            return <div className="category-breakdown-item" key={item.category}>
              <div className={`category-breakdown-row ${isExpanded ? 'expanded' : ''}`}>
                <button
                  type="button"
                  className="category-breakdown-open"
                  aria-expanded={isExpanded}
                  onClick={() => toggle(item.category)}
                  aria-label={`Expand ${item.category}`}
                >
                  <span className="category-chevron"><Icon name="chevron" size={15} /></span>
                </button>
                <button
                  type="button"
                  className="category-breakdown-main"
                  onClick={() => onDrillDown(mapReportSliceToPreset('category', item.category))}
                >
                  <div className="category-breakdown-info">
                    <b>{item.category}</b>
                    <div className="category-progress-track">
                      <div className="category-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <div className="category-breakdown-metrics">
                    <span className="category-breakdown-percent">{percent}%</span>
                    <span className="category-breakdown-count">{item.count}</span>
                  </div>
                </button>
              </div>
              {isExpanded && <div className="subcategory-breakdown-list">
                {item.subcategories.map((subcategory) => {
                  const subPercent = item.count > 0 ? Math.round((subcategory.value / item.count) * 100) : 0
                  return (
                    <button
                      type="button"
                      className="subcategory-breakdown-row subcategory-breakdown-row--link"
                      key={subcategory.label}
                      onClick={() => onDrillDown(mapReportSliceToPreset('category', item.category))}
                    >
                      <span className="subcategory-name">{subcategory.label}</span>
                      <div className="subcategory-meta">
                        <span className="subcategory-percent">{subPercent}%</span>
                        <b className="subcategory-value">{subcategory.value}</b>
                      </div>
                    </button>
                  )
                })}
              </div>}
            </div>
          })}
          <div className="category-breakdown-total">
            <span>Grand Total</span>
            <b>{total} reviews</b>
          </div>
        </div>
      )}
    </section>
  )
}
