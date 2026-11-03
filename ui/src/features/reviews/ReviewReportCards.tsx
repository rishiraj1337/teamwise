import { useEffect, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { downloadCsv } from '../../utils/csv'
import { fetchReviewAnalytics, logReviewCsvExport, type ReviewAnalyticsResponse } from '../../api/reviews'
import { ApiError } from '../../api/client'
import { SimpleBarChart } from '../../components/charts/SimpleBarChart'
import { SimplePieChart, SENTIMENT_PIE_COLORS, TICKET_PIE_COLORS } from '../../components/charts/SimplePieChart'
import {
  mapReportSliceToPreset,
  sortPriorityBreakdown,
  type ReportDrillSource,
  type ReviewListPreset,
} from './reviewReportNavigation'

function TicketChart({
  data,
  loading,
  onSliceClick,
}: {
  data: ReviewAnalyticsResponse['ticket_breakdown']
  loading: boolean
  onSliceClick?: (label: string) => void
}) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0)
  if (loading) return <div className="chart-empty">Loading…</div>
  if (total === 0) {
    return (
      <div className="chart-empty chart-empty-tickets">
        <b>Open: 0 · Resolved: 0</b>
        <span>No ticket data yet.</span>
      </div>
    )
  }
  return (
    <SimplePieChart
      data={data}
      compact
      labelColors={TICKET_PIE_COLORS}
      onSliceClick={(slice) => onSliceClick?.(slice.label)}
    />
  )
}

export function OperationsOverviewReviewReports({
  onDrillDown,
}: {
  onDrillDown: (preset: ReviewListPreset) => void
}) {
  const [analytics, setAnalytics] = useState<ReviewAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchReviewAnalytics({ start_date: startDate || undefined, end_date: endDate || undefined })
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
  }, [startDate, endDate])

  return (
    <>
      <div className="reviews-filters report-date-filters">
        <label>From date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label>To date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
      </div>
      <ReviewReportCards
        analytics={analytics}
        loading={loading}
        error={error}
        startDate={startDate}
        endDate={endDate}
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
        <div className="panel-heading"><div><h2>Category-wise</h2></div></div>
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
        <div className="panel-heading"><div><h2>Ratings</h2></div></div>
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
        <div className="panel-heading"><div><h2>Tickets (Open Project)</h2></div></div>
        <div className="review-chart-card__body">
          <TicketChart
            data={analytics?.ticket_breakdown ?? []}
            loading={loading}
            onSliceClick={(label) => drill('ticket', label)}
          />
        </div>
      </article>
      <article className="panel review-chart-card">
        <div className="panel-heading"><div><h2>Priority</h2></div></div>
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
        <div><span className="section-kicker">REVIEW DISTRIBUTION</span><h2>Category breakdown</h2></div>
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
                  <b>{item.category}</b>
                  <span className="category-breakdown-count">{item.count}</span>
                </button>
              </div>
              {isExpanded && <div className="subcategory-breakdown-list">
                {item.subcategories.map((subcategory) => (
                  <button
                    type="button"
                    className="subcategory-breakdown-row subcategory-breakdown-row--link"
                    key={subcategory.label}
                    onClick={() => onDrillDown(mapReportSliceToPreset('category', item.category))}
                  >
                    <span>{subcategory.label}</span><b>{subcategory.value}</b>
                  </button>
                ))}
              </div>}
            </div>
          })}
          <div className="category-breakdown-total"><span>Grand Total</span><b>{total}</b></div>
        </div>
      )}
    </section>
  )
}
