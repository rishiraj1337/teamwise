import { useEffect, useMemo, useState } from 'react'
import type { ReviewRow, ReviewUpdatePayload, ReviewParsedMetadata } from '../../api/reviews'
import { fetchReviewsUnified } from '../../api/reviews'
import type { ReviewTaxonomy } from './reviewTaxonomy'
import { Icon } from '../../components/ui/Icon'
import { toast } from '../../components/ui/Toast'

type ReviewDetailCardProps = {
  review: ReviewRow
  taxonomy?: ReviewTaxonomy | null
  onClose?: () => void
  onSave?: (payload: ReviewUpdatePayload) => Promise<void> | void
}

/**
 * Client-side fallback extractor for metadata strictly from the customer's main message.
 * Never includes developer reply or internal triage notes.
 */
function extractFallbackMetadata(review: ReviewRow): ReviewParsedMetadata {
  const text = String(review.review_text || '')

  let amount: string | undefined = undefined
  const amountMatch = text.match(/(?:(?:rs\.?|inr|₹)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:rs|rupees|inr|bucks|\/-))/i)
  if (amountMatch) {
    const rawVal = amountMatch[1] || amountMatch[2]
    amount = `₹${rawVal}`
  }

  let txnId: string | undefined = undefined
  let rrn: string | undefined = undefined
  const txnMatch = text.match(/\b(?:txn\s*(?:id|no)?|transaction\s*(?:id|no|ref)?|utr|ref\s*(?:no)?|reference)[:\s#]*([a-zA-Z0-9_\-]{6,36})\b/i)
  if (txnMatch) {
    txnId = txnMatch[1]
  }
  const rrnMatch = text.match(/\b(?:rrn[:\s#]*)?(\d{12})\b/i)
  if (rrnMatch) {
    rrn = rrnMatch[1]
    if (!txnId) txnId = rrn
  }

  let paymentMode: string | undefined = undefined
  const modeMatch = text.match(/\b(UPI|BBPS|P2P|P2M|IMPS|NEFT|RTGS|Credit Card|Debit Card|Net Banking|Wallet|Fastag|AutoPay)\b/i)
  if (modeMatch) {
    paymentMode = modeMatch[1].toUpperCase()
  } else if (review.subcategory && review.subcategory !== 'N/A') {
    paymentMode = review.subcategory
  }

  const tags: string[] = []
  if (amount) tags.push(`Amount: ${amount}`)
  if (txnId) tags.push(`Txn: ${txnId}`)
  if (rrn && rrn !== txnId) tags.push(`RRN: ${rrn}`)
  if (paymentMode) tags.push(`Mode: ${paymentMode}`)
  if (/crash|freeze|bug|error|broken/i.test(text)) tags.push('Issue: App Crash/Bug')
  if (/deduct|debit|fail|failed|pending|stuck/i.test(text)) tags.push('Issue: Deduction/Failure')
  if (/refund|chargeback/i.test(text)) tags.push('Intent: Refund Request')

  return {
    amount: amount || 'N/A',
    txn_id: txnId || 'N/A',
    rrn: rrn || 'N/A',
    payment_mode: paymentMode || 'N/A',
    source_channel: review.channel === 'Email-SFTP' ? 'Email' : review.channel || 'Email',
    app_version: review.app_version_name && review.app_version_name !== 'N/A'
      ? `${review.app_version_name} (build ${review.app_version_code || 'N/A'})`
      : 'N/A',
    ingest_time: review.review_timestamp || review.created_at || null,
    extracted_tags: tags.length > 0 ? tags : ['General Customer Statement'],
  }
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

  // Customer metadata strictly from the main message (excluding developer reply)
  const customerMetadata = useMemo(() => {
    if (review.parsed_metadata && review.parsed_metadata.extracted_tags) {
      return review.parsed_metadata
    }
    return extractFallbackMetadata(review)
  }, [review])

  // Load referenced thread review if requested
  async function handleOpenThreadModal(targetId: string) {
    setReferencedReviewId(targetId)
    setThreadModalOpen(true)
    setLoadingThread(true)
    try {
      const result = await fetchReviewsUnified({ search: targetId, limit: 1 })
      const match = result.items.find((item) => item.unique_id === targetId) || result.items[0] || null
      setReferencedReview(match)
      toast.info(`Loaded linked conversation context: ${targetId}`)
    } catch {
      setReferencedReview(null)
      toast.error(`Could not load thread ${targetId}`)
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
      toast.success(`Saved changes for review ${review.unique_id}`)
      setTimeout(() => setSavedSuccess(false), 3500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save changes.'
      setSaveError(msg)
      toast.error(`Save failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  function handleCopyId() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(review.unique_id)
      toast.info(`Copied ID ${review.unique_id} to clipboard`)
    }
  }

  function handleCopyJson() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(customerMetadata, null, 2))
      toast.info('Copied customer metadata JSON to clipboard')
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
            <h2 className="review-detail-id" onClick={handleCopyId} title="Click to copy ID">
              {review.unique_id}
            </h2>
            <span className="review-channel-badge">{channelDisplay}</span>
            <span className={`review-rating-pill review-rating-pill--${starCount}`}>
              {starDisplay} ({starCount}/5)
            </span>
          </div>
          <p className="review-detail-subtitle">
            Ingested {formattedIngestedDate} • Assigned to <b>{department || 'General Support'}</b>
          </p>
        </div>

        <div className="review-detail-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handleCopyId}
            title="Copy Review ID"
          >
            Copy ID
          </button>
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
                <Icon name="arrow" size={14} />
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

      {/* 4. Parsed Metadata Card with Raw JSON Toggle (Customer Message Data Only - No Dev Response) */}
      <div className="review-metadata-panel">
        <div className="review-metadata-panel-head">
          <div className="metadata-tag-group">
            <span className="metadata-tag-title">Parsed Metadata (Dynamic • Customer Message Only)</span>
            <span className="metadata-tag-chips">Txn ID • Amount • Mode • Timestamp</span>
          </div>
          <div className="metadata-panel-actions">
            {showRawJson && (
              <button
                type="button"
                className="secondary-button"
                style={{ height: '30px', padding: '0 10px', fontSize: '12px' }}
                onClick={handleCopyJson}
              >
                Copy JSON
              </button>
            )}
            <button
              type="button"
              className="secondary-button raw-json-toggle"
              onClick={() => setShowRawJson(!showRawJson)}
            >
              {showRawJson ? 'Hide JSON' : 'Raw JSON'}
            </button>
          </div>
        </div>

        {showRawJson ? (
          <pre className="raw-json-container">
            {JSON.stringify(customerMetadata, null, 2)}
          </pre>
        ) : (
          <div className="metadata-extracted-container">
            <div className="metadata-key-metrics">
              <div className="meta-metric-cell">
                <span className="metric-label">AMOUNT</span>
                <span className="metric-value metric-value--highlight">
                  {customerMetadata.amount || 'N/A'}
                </span>
              </div>
              <div className="meta-metric-cell">
                <span className="metric-label">TXN ID / RRN</span>
                <span className="metric-value metric-value--mono">
                  {customerMetadata.txn_id !== 'N/A'
                    ? customerMetadata.txn_id
                    : customerMetadata.rrn || 'N/A'}
                </span>
              </div>
              <div className="meta-metric-cell">
                <span className="metric-label">PAYMENT MODE</span>
                <span className="metric-value">
                  {customerMetadata.payment_mode || review.subcategory || 'N/A'}
                </span>
              </div>
              <div className="meta-metric-cell">
                <span className="metric-label">CHANNEL</span>
                <span className="metric-value">{channelDisplay}</span>
              </div>
            </div>

            <div className="metadata-chips-strip">
              <span className="chips-label">Detected Context:</span>
              {(customerMetadata.extracted_tags || []).map((tag, idx) => (
                <span key={idx} className="metadata-dynamic-chip">
                  {tag}
                </span>
              ))}
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
            placeholder="Document remediation steps or ticket root cause..."
            onChange={(e) => setResolution(e.target.value)}
          />
        </label>

        <label className="review-form-field">
          <span>Developer / Support Reply</span>
          <textarea
            rows={3}
            value={developerReply}
            placeholder="Official support team response sent to customer..."
            onChange={(e) => setDeveloperReply(e.target.value)}
          />
        </label>
      </div>

      {/* 6. Footer Actions & Feedback */}
      <div className="review-detail-footer">
        <div className="review-detail-footer-status">
          {savedSuccess && (
            <span className="success-banner" role="status">
              ✓ Changes saved successfully to database
            </span>
          )}
          {saveError && (
            <span className="error-banner" role="alert">
              ✕ {saveError}
            </span>
          )}
        </div>

        <div className="review-detail-actions">
          {onClose && (
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="primary-button review-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving Changes…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* 7. Thread Dialog Modal */}
      {threadModalOpen && (
        <div
          className="thread-modal-backdrop"
          onClick={() => setThreadModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="thread-modal-title"
        >
          <div
            className="thread-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="thread-modal-header">
              <div className="thread-modal-title-group">
                <span className="thread-modal-kicker">Linked Context</span>
                <h3 id="thread-modal-title">Conversation Context for {referencedReviewId}</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setThreadModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="thread-modal-body">
              {loadingThread ? (
                <div className="thread-loading-state">
                  <span className="loading-spinner" />
                  <p>Loading previous conversation history…</p>
                </div>
              ) : referencedReview ? (
                <div className="thread-content-wrap">
                  <div className="thread-item-meta">
                    <span className="thread-item-channel">{referencedReview.channel}</span>
                    <span className="thread-item-date">
                      {new Date(referencedReview.review_timestamp).toLocaleString()}
                    </span>
                    <span className="thread-item-rating">
                      {'★'.repeat(referencedReview.star_ratings || 3)}
                    </span>
                  </div>

                  <div className="thread-message-block">
                    <b>Customer Statement:</b>
                    <p>{referencedReview.review_text || 'No statement'}</p>
                  </div>

                  {referencedReview.resolution && referencedReview.resolution !== 'N/A' && (
                    <div className="thread-message-block thread-message-block--resolution">
                      <b>Previous Resolution / Triage Notes:</b>
                      <p>{referencedReview.resolution}</p>
                    </div>
                  )}

                  {referencedReview.developer_reply_text &&
                    referencedReview.developer_reply_text !== 'N/A' && (
                      <div className="thread-message-block thread-message-block--reply">
                        <b>Previous Support Reply:</b>
                        <p>{referencedReview.developer_reply_text}</p>
                      </div>
                    )}
                </div>
              ) : (
                <div className="thread-empty-state">
                  <p>Review record {referencedReviewId} could not be located in database.</p>
                </div>
              )}
            </div>

            <div className="thread-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setThreadModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
