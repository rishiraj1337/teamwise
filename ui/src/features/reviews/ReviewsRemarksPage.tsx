import { Fragment, useEffect, useState } from 'react'
import {
  fetchReviewsUnified,
  REVIEW_CHANNELS,
  REVIEW_PAGE_SIZE_OPTIONS,
  updateReviewUnified,
  fetchReviewTaxonomy,
  type ReviewRow,
  type ReviewUpdatePayload,
} from '../../api/reviews'
import {
  downloadReviewExportBlob,
  enterpriseDownloadReviewExport,
} from '../../api/enterprise'
import { orderPriorities, type ReviewTaxonomy } from './reviewTaxonomy'
import { ApiError } from '../../api/client'
import { fetchReviewAnalytics } from '../../api/reviews'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { formatReviewFieldDate, ReviewEditModal } from './ReviewEditModal'
import type { ReviewListPreset } from './reviewReportNavigation'

export function ReviewsRemarksPage({
  initialPreset = null,
  onPresetApplied,
}: {
  initialPreset?: ReviewListPreset | null
  onPresetApplied?: () => void
}) {
  const [filterOptions, setFilterOptions] = useState<{
    categories: string[]
    priorities: string[]
    statuses: string[]
    channels: string[]
  }>({ categories: [], priorities: [], statuses: [], channels: [] })
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(REVIEW_PAGE_SIZE_OPTIONS[0])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [priority, setPriority] = useState('All')
  const [status, setStatus] = useState('All')
  const [rating, setRating] = useState('All')
  const [channel, setChannel] = useState<string>('All')
  const [statusGroup, setStatusGroup] = useState<'open' | 'resolved' | undefined>(undefined)
  const [ratingMin, setRatingMin] = useState<number | undefined>(undefined)
  const [ratingMax, setRatingMax] = useState<number | undefined>(undefined)
  const [tableLoading, setTableLoading] = useState(true)
  const [tableError, setTableError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportStartDate, setExportStartDate] = useState('')
  const [exportEndDate, setExportEndDate] = useState('')
  const [exportError, setExportError] = useState('')
  const [editingReview, setEditingReview] = useState<ReviewRow | null>(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [taxonomy, setTaxonomy] = useState<ReviewTaxonomy | null>(null)
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetchReviewTaxonomy()
      .then((response) => {
        if (!cancelled) setTaxonomy(response)
      })
      .catch(() => {
        /* modal disabled until taxonomy loads */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchReviewAnalytics()
      .then((response) => {
        if (!cancelled) {
          setFilterOptions(response.filter_options)
        }
      })
      .catch(() => {
        /* filters still work with All */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!initialPreset) return
    if (initialPreset.category) setCategory(initialPreset.category)
    if (initialPreset.priority) setPriority(initialPreset.priority)
    if (initialPreset.status) setStatus(initialPreset.status)
    if (initialPreset.channel) setChannel(initialPreset.channel)
    if (initialPreset.status_group) {
      setStatusGroup(initialPreset.status_group)
      setStatus('All')
    } else {
      setStatusGroup(undefined)
    }
    if (initialPreset.min_rating != null || initialPreset.max_rating != null) {
      setRatingMin(initialPreset.min_rating)
      setRatingMax(initialPreset.max_rating)
      setRating('All')
    } else {
      setRatingMin(undefined)
      setRatingMax(undefined)
    }
    setPage(0)
    onPresetApplied?.()
  }, [initialPreset, onPresetApplied])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(0)
  }, [search, category, priority, status, rating, channel, pageSize, statusGroup, ratingMin, ratingMax])

  useEffect(() => {
    let cancelled = false
    setTableLoading(true)
    setTableError('')
    const minRating = rating === 'All' ? ratingMin : Number(rating)
    const maxRating = rating === 'All' ? ratingMax : Number(rating)

    fetchReviewsUnified({
      limit: pageSize,
      offset: page * pageSize,
      search,
      category,
      priority,
      status: statusGroup ? 'All' : status,
      status_group: statusGroup,
      min_rating: minRating,
      max_rating: maxRating,
      channel,
    })
      .then((listResponse) => {
        if (cancelled) return
        setReviews(listResponse.items)
        setTotal(listResponse.total)
      })
      .catch((error) => {
        if (cancelled) return
        setTableError(error instanceof ApiError ? error.message : 'Could not load reviews.')
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [search, category, priority, status, rating, channel, page, pageSize, statusGroup, ratingMin, ratingMax])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : page * pageSize + 1
  const rangeEnd = total === 0 ? 0 : Math.min(total, (page + 1) * pageSize)

  const categoryOptions = ['All', ...filterOptions.categories]
  const channelOptions = [
    'All',
    ...Array.from(
      new Set([...REVIEW_CHANNELS.slice(1), ...filterOptions.channels].filter(Boolean)),
    ),
  ]
  const priorityOptions = ['All', ...orderPriorities(filterOptions.priorities)]
  const statusOptions = ['All', ...filterOptions.statuses]

  async function handleExport() {
    setExportError('')
    setExporting(true)
    const minRating = rating === 'All' ? undefined : Number(rating)
    const maxRating = rating === 'All' ? undefined : Number(rating)
    try {
      const blob = await enterpriseDownloadReviewExport({
        search: search || undefined,
        category,
        priority,
        status,
        min_rating: minRating,
        max_rating: maxRating,
        channel,
        start_date: exportStartDate || undefined,
        end_date: exportEndDate || undefined,
      })
      if (blob.size === 0) {
        setExportError('No reviews to export for the current filters.')
        return
      }
      const stamp = new Date().toISOString().slice(0, 10)
      downloadReviewExportBlob(blob, `reviews-export-${stamp}.csv`)
    } catch (error) {
      setExportError(error instanceof ApiError ? error.message : 'Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  async function handleSaveReview(payload: ReviewUpdatePayload) {
    if (!editingReview) return
    setSaveError('')
    setSaving(true)
    try {
      const updated = await updateReviewUnified(editingReview.unique_id, payload)
      setReviews((current) =>
        current.map((row) => (row.unique_id === updated.unique_id ? updated : row)),
      )
      setEditingReview(null)
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Update failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="reviews-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow"><span className="online-indicator" />UNIFIED REVIEWS</div>
          <h1>Reviews and Remarks</h1>
          <p>All channels in one table (Play Store, Email-SFTP, Chatbot) from timePayReview.</p>
        </div>
      </div>

      <section className="panel reviews-table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">REVIEW TABLE</span>
            <h2>Collected reviews {total ? `(${total})` : ''}</h2>
          </div>
          <button
            type="button"
            className="secondary-button reviews-export-button"
            disabled={exporting || tableLoading}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>

        {exportError && <p className="login-error form-level-error" role="alert">{exportError}</p>}

        <div className="reviews-filters">
          <label className="reviews-filter-search">
            <Icon name="search" size={16} />
            <input
              aria-label="Search reviews"
              placeholder="Search text, ID, category, department…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <label>
            Channel
            <select value={channel} onChange={(event) => setChannel(event.target.value)}>
              {channelOptions.map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'All channels' : option}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              {priorityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => { setStatus(event.target.value); setStatusGroup(undefined) }}>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Rating
            <select value={rating} onChange={(event) => { setRating(event.target.value); setRatingMin(undefined); setRatingMax(undefined) }}>
              {['All', '1', '2', '3', '4', '5'].map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'All ratings' : `${option} star`}</option>
              ))}
            </select>
          </label>
          <label>
            Export from
            <input type="date" value={exportStartDate} onChange={(event) => setExportStartDate(event.target.value)} />
          </label>
          <label>
            Export to
            <input type="date" value={exportEndDate} onChange={(event) => setExportEndDate(event.target.value)} />
          </label>
        </div>

        {tableError && <p className="login-error form-level-error" role="alert">{tableError}</p>}

        {tableLoading ? <EmptyState message="Loading reviews…" /> : reviews.length === 0 ? (
          <EmptyState message="No reviews match your filters. Run the Play Store scraper or adjust filters." />
        ) : (
          <>
            <div className="reviews-table-wrap">
              <table className="reviews-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Channel</th>
                    <th>Date</th>
                    <th>Rating</th>
                    <th>Category</th>
                    <th>Subcategory</th>
                    <th>Priority</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Update</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <Fragment key={review.unique_id}>
                    <tr className={expandedReviews.has(review.unique_id) ? 'review-row-expanded' : ''}>
                      <td>{review.unique_id}</td>
                      <td>{review.channel || '—'}</td>
                      <td>{new Date(review.created_at).toLocaleDateString()}</td>
                      <td><span className={`review-rating review-rating-${Math.min(5, Math.max(1, review.star_ratings))}`}>{review.star_ratings}★</span></td>
                      <td>{review.category}</td>
                      <td className="review-text-cell">{review.subcategory}</td>
                      <td><span className={`review-priority priority-${review.priority.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{review.priority}</span></td>
                      <td>{review.department}</td>
                      <td>{review.status}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={!taxonomy}
                          onClick={() => {
                            setSaveError('')
                            setEditingReview(review)
                          }}
                        >
                          Update
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`review-details-toggle ${expandedReviews.has(review.unique_id) ? 'expanded' : ''}`}
                          aria-expanded={expandedReviews.has(review.unique_id)}
                          aria-label={`${expandedReviews.has(review.unique_id) ? 'Hide' : 'Show'} details for ${review.unique_id}`}
                          onClick={() => setExpandedReviews((current) => {
                            const next = new Set(current)
                            if (next.has(review.unique_id)) next.delete(review.unique_id)
                            else next.add(review.unique_id)
                            return next
                          })}
                        >
                          <Icon name="chevron" size={16} />
                        </button>
                      </td>
                    </tr>
                    {expandedReviews.has(review.unique_id) && (
                      <tr key={`${review.unique_id}-details`} className="review-details-row">
                        <td colSpan={11}>
                          <div className="review-details-grid">
                            <div><span>Review</span><p>{review.review_text || '—'}</p></div>
                            <div><span>Resolution</span><p>{review.resolution || '—'}</p></div>
                            <div><span>Resolution time</span><p>{formatReviewFieldDate(review.response_timestamp)}</p></div>
                            <div><span>Developer reply</span><p>{review.developer_reply_text || '—'}</p></div>
                            <div><span>Developer reply time</span><p>{formatReviewFieldDate(review.developer_reply_time)}</p></div>
                            <div><span>Updated</span><p>{formatReviewFieldDate(review.updated_at)}</p></div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="reviews-pagination">
              <label className="reviews-page-size">
                Rows per page
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  aria-label="Rows per page"
                >
                  {REVIEW_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <span className="reviews-page-range">
                Showing {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className="reviews-page-buttons">
                <button type="button" className="secondary-button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </button>
                <span>Page {page + 1} of {pageCount}</span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={(page + 1) * pageSize >= total}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {editingReview && taxonomy && (
        <ReviewEditModal
          review={editingReview}
          taxonomy={taxonomy}
          saving={saving}
          error={saveError}
          onClose={() => {
            if (!saving) setEditingReview(null)
          }}
          onSave={(payload) => void handleSaveReview(payload)}
        />
      )}
    </div>
  )
}
