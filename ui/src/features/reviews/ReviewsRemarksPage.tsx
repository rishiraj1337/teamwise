import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
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
import { ReviewDetailCard } from './ReviewDetailCard'
import { ReviewEditModal } from './ReviewEditModal'
import type { ReviewListPreset } from './reviewReportNavigation'
import {
  areNotificationsEnabled,
  requestNotificationPermission,
  sendDesktopNotification,
  setNotificationsEnabled,
} from '../../utils/desktopNotification'

type TimePreset = 'all' | 'today' | 'week' | 'month' | 'custom'

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

  // Quick Time Filters
  const [timePreset, setTimePreset] = useState<TimePreset>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const [tableLoading, setTableLoading] = useState(true)
  const [tableError, setTableError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [editingReview, setEditingReview] = useState<ReviewRow | null>(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [taxonomy, setTaxonomy] = useState<ReviewTaxonomy | null>(null)
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set())

  // Real-time notification toggle
  const [notificationsActive, setNotificationsActive] = useState(() => areNotificationsEnabled())

  // Ref to track latest review ID for desktop notification triggers
  const latestSeenIdRef = useRef<string | null>(null)

  // Compute start_date and end_date from timePreset
  const { computedStartDate, computedEndDate } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    if (timePreset === 'today') {
      return { computedStartDate: today, computedEndDate: today }
    }
    if (timePreset === 'week') {
      const d = new Date()
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d.setDate(diff)).toISOString().slice(0, 10)
      return { computedStartDate: monday, computedEndDate: today }
    }
    if (timePreset === 'month') {
      const d = new Date()
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
      return { computedStartDate: firstDay, computedEndDate: today }
    }
    if (timePreset === 'custom') {
      return { computedStartDate: customStartDate, computedEndDate: customEndDate }
    }
    return { computedStartDate: '', computedEndDate: '' }
  }, [timePreset, customStartDate, customEndDate])

  useEffect(() => {
    let cancelled = false
    fetchReviewTaxonomy()
      .then((response) => {
        if (!cancelled) setTaxonomy(response)
      })
      .catch(() => {})
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
      .catch(() => {})
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
  }, [
    search,
    category,
    priority,
    status,
    rating,
    channel,
    pageSize,
    statusGroup,
    ratingMin,
    ratingMax,
    computedStartDate,
    computedEndDate,
  ])

  // Initial & Filter fetch
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
      start_date: computedStartDate || undefined,
      end_date: computedEndDate || undefined,
    })
      .then((listResponse) => {
        if (cancelled) return
        setReviews(listResponse.items)
        setTotal(listResponse.total)
        if (listResponse.items.length > 0 && !latestSeenIdRef.current) {
          latestSeenIdRef.current = listResponse.items[0].unique_id
        }
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
  }, [
    search,
    category,
    priority,
    status,
    rating,
    channel,
    page,
    pageSize,
    statusGroup,
    ratingMin,
    ratingMax,
    computedStartDate,
    computedEndDate,
  ])

  // Real-time Database Polling (every 6s)
  useEffect(() => {
    let isMounted = true

    const intervalTimer = window.setInterval(async () => {
      if (document.hidden) return

      const minRating = rating === 'All' ? ratingMin : Number(rating)
      const maxRating = rating === 'All' ? ratingMax : Number(rating)

      try {
        const listResponse = await fetchReviewsUnified({
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
          start_date: computedStartDate || undefined,
          end_date: computedEndDate || undefined,
        })

        if (!isMounted) return

        if (listResponse.items.length > 0) {
          const newest = listResponse.items[0]
          if (latestSeenIdRef.current && latestSeenIdRef.current !== newest.unique_id) {
            // New review arrived! Trigger platform desktop notification
            sendDesktopNotification(`New Review Ingested: ${newest.unique_id}`, {
              body: `${newest.channel} • ${newest.category} (${newest.star_ratings}★)\n${newest.review_text.slice(0, 100)}`,
              tag: newest.unique_id,
            })
          }
          latestSeenIdRef.current = newest.unique_id
        }

        setReviews(listResponse.items)
        setTotal(listResponse.total)
      } catch {
        // Silent background sync
      }
    }, 6000)

    return () => {
      isMounted = false
      window.clearInterval(intervalTimer)
    }
  }, [
    search,
    category,
    priority,
    status,
    rating,
    channel,
    page,
    pageSize,
    statusGroup,
    ratingMin,
    ratingMax,
    computedStartDate,
    computedEndDate,
  ])

  async function handleToggleNotifications() {
    if (notificationsActive) {
      setNotificationsEnabled(false)
      setNotificationsActive(false)
    } else {
      const granted = await requestNotificationPermission()
      setNotificationsActive(granted)
      if (granted) {
        sendDesktopNotification('Teamwise Review Notifications Enabled', {
          body: 'You will receive real-time desktop alerts as reviews arrive.',
        })
      }
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : page * pageSize + 1
  const rangeEnd = total === 0 ? 0 : Math.min(total, (page + 1) * pageSize)

  const categoryOptions = ['All', ...filterOptions.categories]
  const channelOptions = [
    'All',
    ...Array.from(
      new Set(
        [...REVIEW_CHANNELS.slice(1), ...filterOptions.channels]
          .map((c) => (c === 'Email-SFTP' ? 'Email' : c))
          .filter(Boolean),
      ),
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
        start_date: computedStartDate || undefined,
        end_date: computedEndDate || undefined,
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

  async function handleSaveReview(uniqueId: string, payload: ReviewUpdatePayload) {
    setSaveError('')
    setSaving(true)
    try {
      const updated = await updateReviewUnified(uniqueId, payload)
      setReviews((current) =>
        current.map((row) => (row.unique_id === updated.unique_id ? updated : row)),
      )
      setEditingReview(null)
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Update failed. Try again.')
      throw error
    } finally {
      setSaving(false)
    }
  }

  function toggleExpandRow(uniqueId: string) {
    setExpandedReviews((current) => {
      const next = new Set(current)
      if (next.has(uniqueId)) next.delete(uniqueId)
      else next.add(uniqueId)
      return next
    })
  }

  return (
    <div className="reviews-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow">
            <span className="online-indicator" />UNIFIED REVIEWS
          </div>
          <h1>Reviews and Remarks</h1>
          <p>All channels in one table (Play Store, Email, Chatbot) from timePayReview.</p>
        </div>
      </div>

      <section className="panel reviews-table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">REVIEW TABLE</span>
            <h2>Collected reviews {total ? `(${total})` : ''}</h2>
          </div>

          <div className="table-header-tools">
            <span className="live-sync-indicator" title="Connected to database with real-time sync">
              <span className="live-sync-dot" />
              Live Sync
            </span>

            <button
              type="button"
              className={`notification-toggle-btn ${notificationsActive ? 'active' : ''}`}
              onClick={handleToggleNotifications}
              title={notificationsActive ? 'Desktop notifications enabled' : 'Click to enable desktop notifications'}
            >
              <Icon name="bell" size={14} />
              <span>{notificationsActive ? 'Alerts ON' : 'Alerts OFF'}</span>
            </button>

            <button
              type="button"
              className="secondary-button reviews-export-button"
              disabled={exporting || tableLoading}
              onClick={() => void handleExport()}
            >
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>

        {exportError && <p className="login-error form-level-error" role="alert">{exportError}</p>}

        {/* Quick Date Range Filter Presets */}
        <div className="quick-date-presets" role="radiogroup" aria-label="Time period filter">
          <span className="thread-pill-kicker" style={{ marginRight: '4px' }}>Period:</span>
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

        {/* Search & Channel/Category Filters */}
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
                <option key={option} value={option}>
                  {option === 'All' ? 'All channels' : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setStatusGroup(undefined)
              }}
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Rating
            <select
              value={rating}
              onChange={(event) => {
                setRating(event.target.value)
                setRatingMin(undefined)
                setRatingMax(undefined)
              }}
            >
              {['All', '1', '2', '3', '4', '5'].map((option) => (
                <option key={option} value={option}>
                  {option === 'All' ? 'All ratings' : `${option} star`}
                </option>
              ))}
            </select>
          </label>

          {timePreset === 'custom' && (
            <>
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
            </>
          )}
        </div>

        {tableError && <p className="login-error form-level-error" role="alert">{tableError}</p>}

        {tableLoading ? (
          <EmptyState message="Loading reviews from database…" />
        ) : reviews.length === 0 ? (
          <EmptyState message="No reviews match your filters. Ingest an email or run reviews sync to view items." />
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
                  {reviews.map((review) => {
                    const channelName = review.channel === 'Email-SFTP' ? 'Email' : review.channel || 'Email'
                    const isExpanded = expandedReviews.has(review.unique_id)

                    return (
                      <Fragment key={review.unique_id}>
                        <tr className={isExpanded ? 'review-row-expanded' : ''}>
                          <td><b>{review.unique_id}</b></td>
                          <td>
                            <span className="review-channel-badge" style={{ fontSize: '8px', padding: '2px 6px' }}>
                              {channelName}
                            </span>
                          </td>
                          <td>{new Date(review.review_timestamp || review.created_at).toLocaleDateString()}</td>
                          <td>
                            <span className={`review-rating review-rating-${Math.min(5, Math.max(1, review.star_ratings))}`}>
                              {review.star_ratings}★
                            </span>
                          </td>
                          <td>{review.category}</td>
                          <td className="review-text-cell">{review.subcategory}</td>
                          <td>
                            <span className={`review-priority priority-${review.priority.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                              {review.priority}
                            </span>
                          </td>
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
                              Edit
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`review-details-toggle ${isExpanded ? 'expanded' : ''}`}
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${review.unique_id}`}
                              onClick={() => toggleExpandRow(review.unique_id)}
                              title={isExpanded ? 'Collapse contextual details' : 'Expand deep contextual triage view'}
                            >
                              <Icon name="chevron" size={16} />
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${review.unique_id}-details`} className="review-details-row">
                            <td colSpan={11} style={{ padding: '8px 12px 16px' }}>
                              <ReviewDetailCard
                                review={review}
                                taxonomy={taxonomy}
                                onClose={() => toggleExpandRow(review.unique_id)}
                                onSave={(p) => handleSaveReview(review.unique_id, p)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
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
                {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className="reviews-page-buttons">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={page + 1 >= pageCount}
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
          onClose={() => setEditingReview(null)}
          onSave={(payload) => handleSaveReview(editingReview.unique_id, payload)}
        />
      )}
    </div>
  )
}
