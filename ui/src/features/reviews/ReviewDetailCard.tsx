import { useEffect, useMemo, useState } from 'react'
import type { ReviewRow, ReviewUpdatePayload } from '../../api/reviews'
import { fetchReviewsUnified } from '../../api/reviews'
import type { ReviewTaxonomy } from './reviewTaxonomy'
import { Icon } from '../../components/ui/Icon'

type ReviewDetailCardProps = {
  review: ReviewRow
  taxonomy?: ReviewTaxonomy | null
  onClose?: () => void
  onSave?: (payload: ReviewUpdatePayload) => Promise<void> | void
}

export function ReviewDetailCard({
  review,
  taxonomy,
  onClose,
  onSave,
}: ReviewDetailCardProps) {
  const [showRawJson, setShowRawJson] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Form states for inline editing
  const [status, setStatus] = useState(review.status || 'New')
  const [priority, setPriority] = useState(review.priority || 'Medium')
  const [department, setDepartment] = useState(review.department || 'Customer Support')
  const [resolution, setResolution] = useState(review.resolution || '')
  const [developerReply, setDeveloperReply] = useState(review.developer_reply_text || '')

  // Thread cross-reference state
  const [referencedReviewId, setReferencedReviewId] = useState<string | null>(null)
  const [referencedReview, setReferencedReview] = useState<ReviewRow | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [threadModalOpen, setThreadModalOpen] = useState(false)

  useEffect(() => {
    setStatus(review.status || 'New')
    setPriority(review.priority || 'Medium')
    setDepartment(review.department || 'Customer Support')
    setResolution(review.resolution || '')
    setDeveloperReply(review.developer_reply_text || '')
    setSavedSuccess(false)
    setSaveError('')
  }, [review])

  // Extract thread cross-reference like Ref: TPR0059 or TPR0059
  const detectedThreadId = useMemo(() => {
    const combined = `${review.review_text} ${review.resolution} ${review.review_link}`
    const matches = combined.match(/TPR\d{4}/g)
    if (!matches) return null
    const found = matches.find((id) => id !== review.unique_id)
    return found || null
  }, [review.review_text, review.resolution, review.review_link])

  // Load referenced thread review if requested
  async function handleOpenThreadModal(targetId: string) {
    setReferencedReviewId(targetId)
    setThreadModalOpen(true)
    setLoadingThread(true)
    try {
      const result = await fetchReviewsUnified({ search: targetId, limit: 1 })
      const match = result.items.find((item) => item.unique_id === targetId) || result.items[0] || null
      setReferencedReview(match)
    } catch {
      setReferencedReview(null)
    } finally {
      setLoadingThread(false)
    }
  }

  async function handleSave() {
    if (!onSave) return
    setSaving(true)
    setSaveError('')
    setSavedSuccess(false)
    try {
      await onSave({
        category: review.category,
        subcategory: review.subcategory,
        priority,
        status,
        department,
        resolution,
        developer_reply_text: developerReply,
        developer_reply_time: review.developer_reply_time,
        response_timestamp: review.response_timestamp,
        review_link: review.review_link,
      })
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const channelDisplay = review.channel === 'Email-SFTP' ? 'Email' : review.channel || 'Email'

  const formattedIngestedDate = useMemo(() => {
    const d = new Date(review.created_at || review.review_timestamp)
    if (Number.isNaN(d.getTime())) return 'Recently ingested'
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }, [review.created_at, review.review_timestamp])

  const starCount = Math.max(1, Math.min(5, review.star_ratings || 3))
  const starDisplay = '★'.repeat(starCount)

  const priorityOptions =
    taxonomy?.priorities && taxonomy.priorities.length > 0
      ? taxonomy.priorities
      : ['Low', 'Medium', 'High', 'Urgent']
  const statusOptions =
    taxonomy?.statuses && taxonomy.statuses.length > 0
      ? taxonomy.statuses
      : ['New', 'In Progress', 'Resolved', 'Closed', 'N/A']

  return (
    <div className="review-detail-card" role="region" aria-label={`Details for ${review.unique_id}`}>
      {/* 1. Header Row */}
      <div className="review-detail-header">
        <div className="review-detail-header-left">
          <div className="review-detail-title-group">
            <h2 className="review-detail-id">{review.unique_id}</h2>
            <span className="review-channel-badge">{channelDisplay}</span>
            <span className={`review-rating-pill review-rating-pill--${starCount}`}>
              {starDisplay} ({starCount}/5)
            </span>
          </div>
          <p className="review-detail-subtitle">
            Ingested {formattedIngestedDate} • Assigned to {department || 'General Support'}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            className="secondary-button review-detail-close-btn"
            onClick={onClose}
            aria-label="Close review details"
          >
            Close
          </button>
        )}
      </div>

      {/* 2. Customer Feedback / Review Content */}
      <div className="review-detail-section">
        <h3 className="review-section-title">Customer Feedback / Review Content</h3>
        <div className="review-content-box">
          <p>{review.review_text || 'No review statement provided.'}</p>
          {detectedThreadId && (
            <div className="review-thread-pill-row">
              <span className="thread-pill-kicker">Linked Thread:</span>
              <button
                type="button"
                className="thread-reference-badge"
                onClick={() => handleOpenThreadModal(detectedThreadId)}
                title={`Open previous conversation context for ${detectedThreadId}`}
              >
                <Icon name="arrow" size={12} />
                <span>Thread Ref: {detectedThreadId}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. 4-Column Summary Cards */}
      <div className="review-meta-4col">
        <div className="review-meta-card">
          <span className="meta-card-label">CATEGORY</span>
          <span className="meta-card-value">{review.category || 'N/A'}</span>
        </div>
        <div className="review-meta-card">
          <span className="meta-card-label">SUBCATEGORY</span>
          <span className="meta-card-value">{review.subcategory || 'N/A'}</span>
        </div>
        <div className="review-meta-card">
          <span className="meta-card-label">APP VERSION</span>
          <span className="meta-card-value">
            {review.app_version_name && review.app_version_name !== 'N/A'
              ? `${review.app_version_name} (build ${review.app_version_code || 'N/A'})`
              : 'N/A (build N/A)'}
          </span>
        </div>
        <div className="review-meta-card">
          <span className="meta-card-label">REFERENCE / LINK</span>
          <span className="meta-card-value meta-card-value--link">
            {detectedThreadId ? (
              <button
                type="button"
                className="thread-inline-link"
                onClick={() => handleOpenThreadModal(detectedThreadId)}
              >
                thread: {detectedThreadId} (View previous)
              </button>
            ) : review.review_link && review.review_link.startsWith('http') ? (
              <a href={review.review_link} target="_blank" rel="noopener noreferrer">
                {review.review_link.slice(0, 36)}…
              </a>
            ) : (
              review.review_link || 'N/A'
            )}
          </span>
        </div>
      </div>

      {/* 4. Parsed Metadata Card with Raw JSON Toggle */}
      <div className="review-metadata-panel">
        <div className="review-metadata-panel-head">
          <div className="metadata-tag-group">
            <span className="metadata-tag-title">Parsed Metadata (Dynamic • Non-PII)</span>
            <span className="metadata-tag-chips">Txn ID • Time • IDs • From/To • Ctx</span>
          </div>
          <button
            type="button"
            className="secondary-button raw-json-toggle"
            onClick={() => setShowRawJson(!showRawJson)}
          >
            {showRawJson ? 'Hide JSON' : 'Raw JSON'}
          </button>
        </div>

        {showRawJson ? (
          <pre className="raw-json-container">
            {JSON.stringify(
              {
                unique_id: review.unique_id,
                channel: channelDisplay,
                star_ratings: review.star_ratings,
                category: review.category,
                subcategory: review.subcategory,
                priority: review.priority,
                status: review.status,
                department: review.department,
                review_timestamp: review.review_timestamp,
                created_at: review.created_at,
                updated_at: review.updated_at,
                review_link: review.review_link,
                resolution_date: review.resolution_date,
                app_version_code: review.app_version_code,
                app_version_name: review.app_version_name,
                has_thread: Boolean(detectedThreadId),
                thread_reference: detectedThreadId,
              },
              null,
              2
            )}
          </pre>
        ) : (
          <div className="metadata-nonpii-grid">
            <div className="metadata-pill">
              <b>Source Channel:</b> <span>{channelDisplay}</span>
            </div>
            <div className="metadata-pill">
              <b>Ingest Time:</b> <span>{new Date(review.review_timestamp).toLocaleString()}</span>
            </div>
            <div className="metadata-pill">
              <b>Reference Identifier:</b> <span>{review.unique_id}</span>
            </div>
            <div className="metadata-pill">
              <b>Resolution Target:</b> <span>{review.resolution_date || 'Standard SLA'}</span>
            </div>
            <div className="metadata-pill">
              <b>Developer Reply State:</b> <span>{review.developer_reply_text ? 'Responded' : 'Pending response'}</span>
            </div>
          </div>
        )}
      </div>

      {/* 5. Triage Form Controls */}
      <div className="review-form-grid">
        <div className="review-form-row3">
          <label className="review-form-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="review-form-field">
            <span>Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {priorityOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="review-form-field">
            <span>Department</span>
            <input
              type="text"
              value={department}
              placeholder="e.g. Billing, Technical, Operations"
              onChange={(e) => setDepartment(e.target.value)}
            />
          </label>
        </div>

        <label className="review-form-field">
          <span>Resolution / Triage Notes & Thread Cross-References</span>
          <textarea
            rows={3}
            value={resolution}
            placeholder="Document triage findings, SLA details, and cross-references..."
            onChange={(e) => setResolution(e.target.value)}
          />
        </label>

        <label className="review-form-field">
          <span>Developer / Support Reply</span>
          <textarea
            rows={2}
            value={developerReply}
            placeholder="Official support response to the customer statement..."
            onChange={(e) => setDeveloperReply(e.target.value)}
          />
        </label>
      </div>

      {/* 6. Action Footer */}
      <div className="review-detail-footer">
        {saveError && <p className="login-error form-level-error">{saveError}</p>}
        {savedSuccess && <p className="success-banner">Review updated successfully in database!</p>}

        <div className="review-detail-actions">
          {onClose && (
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
              Close
            </button>
          )}
          {onSave && (
            <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving Changes…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* 7. Thread Cross-Reference Popup Modal */}
      {threadModalOpen && (
        <div
          className="thread-popup-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setThreadModalOpen(false)
          }}
        >
          <div className="thread-popup-card">
            <div className="thread-popup-head">
              <div>
                <span className="section-kicker">PREVIOUS CONVERSATION THREAD</span>
                <h3>Thread Reference: {referencedReviewId}</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setThreadModalOpen(false)}
                aria-label="Close thread popup"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="thread-popup-body">
              {loadingThread ? (
                <div className="chart-empty">Loading previous conversation context…</div>
              ) : referencedReview ? (
                <div className="thread-content-flow">
                  <div className="thread-parent-header">
                    <span className="thread-badge">{referencedReview.channel === 'Email-SFTP' ? 'Email' : referencedReview.channel}</span>
                    <b>{referencedReview.unique_id}</b>
                    <span>• {new Date(referencedReview.created_at || referencedReview.review_timestamp).toLocaleString()}</span>
                    <span className="thread-priority-tag">{referencedReview.priority}</span>
                  </div>

                  <div className="thread-parent-body">
                    <h4>Customer Statement:</h4>
                    <p className="thread-parent-text">{referencedReview.review_text}</p>
                  </div>

                  <div className="thread-parent-meta">
                    <div><b>Category:</b> {referencedReview.category} / {referencedReview.subcategory}</div>
                    <div><b>Status:</b> {referencedReview.status}</div>
                    <div><b>Assigned Department:</b> {referencedReview.department || 'Unassigned'}</div>
                    {referencedReview.resolution && referencedReview.resolution !== 'N/A' && (
                      <div className="thread-parent-notes">
                        <b>Previous Triage Notes:</b>
                        <p>{referencedReview.resolution}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="thread-not-found">
                  <p>Parent thread <b>{referencedReviewId}</b> is referenced in the customer email history.</p>
                  <small>No direct prior DB record was found for this identifier.</small>
                </div>
              )}
            </div>

            <div className="thread-popup-actions">
              <button type="button" className="secondary-button" onClick={() => setThreadModalOpen(false)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
