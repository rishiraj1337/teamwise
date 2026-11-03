import { useEffect, useMemo, useState } from 'react'
import type { ReviewRow, ReviewUpdatePayload } from '../../api/reviews'
import type { ReviewTaxonomy } from './reviewTaxonomy'
import {
  normalizeCategoryForForm,
  normalizePriorityForForm,
  normalizeSubcategoryForForm,
  normalizeStatusForForm,
  orderPriorities,
  subcategoriesForCategory,
} from './reviewTaxonomy'
import { Icon } from '../../components/ui/Icon'

function formatDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseDateTimeLocal(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function reviewToForm(review: ReviewRow, taxonomy: ReviewTaxonomy): ReviewUpdatePayload {
  let category = normalizeCategoryForForm(review.category, taxonomy)
  if (!taxonomy.categories.some((item) => item.name === category)) {
    category = taxonomy.categories[0]?.name ?? category
  }
  const subcategory = normalizeSubcategoryForForm(category, review.subcategory, taxonomy)
  const subs = subcategoriesForCategory(category, taxonomy)
  return {
    category,
    subcategory: subs.includes(subcategory) ? subcategory : subs[0] ?? subcategory,
    priority: normalizePriorityForForm(review.priority, taxonomy),
    status: normalizeStatusForForm(review.status, taxonomy),
    department: review.department,
    resolution: review.resolution,
    response_timestamp: review.response_timestamp,
    developer_reply_text: review.developer_reply_text,
    developer_reply_time: review.developer_reply_time,
    review_link: review.review_link,
  }
}

type ReviewEditModalProps = {
  review: ReviewRow
  taxonomy: ReviewTaxonomy
  saving: boolean
  error: string
  onClose: () => void
  onSave: (payload: ReviewUpdatePayload) => void
}

export function ReviewEditModal({ review, taxonomy, saving, error, onClose, onSave }: ReviewEditModalProps) {
  const [form, setForm] = useState(() => reviewToForm(review, taxonomy))
  const [responseLocal, setResponseLocal] = useState(() => formatDateTimeLocal(review.response_timestamp))
  const [replyLocal, setReplyLocal] = useState(() => formatDateTimeLocal(review.developer_reply_time))

  useEffect(() => {
    setForm(reviewToForm(review, taxonomy))
    setResponseLocal(formatDateTimeLocal(review.response_timestamp))
    setReplyLocal(formatDateTimeLocal(review.developer_reply_time))
  }, [review, taxonomy])

  const subcategoryOptions = useMemo(
    () => subcategoriesForCategory(form.category, taxonomy),
    [form.category, taxonomy],
  )

  useEffect(() => {
    if (subcategoryOptions.length === 0) return
    if (!subcategoryOptions.includes(form.subcategory)) {
      setForm((current) => ({ ...current, subcategory: subcategoryOptions[0] }))
    }
  }, [form.subcategory, subcategoryOptions])

  function updateField<K extends keyof ReviewUpdatePayload>(key: K, value: ReviewUpdatePayload[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'category') {
        const subs = subcategoriesForCategory(String(value), taxonomy)
        next.subcategory = subs.includes(current.subcategory) ? current.subcategory : subs[0] ?? ''
      }
      return next
    })
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    onSave({
      ...form,
      response_timestamp: parseDateTimeLocal(responseLocal),
      developer_reply_time: parseDateTimeLocal(replyLocal),
    })
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <div className="review-edit-modal" role="dialog" aria-labelledby="review-edit-title">
        <div className="review-edit-modal-header">
          <div>
            <span className="section-kicker">UPDATE REVIEW</span>
            <h2 id="review-edit-title">Review {review.unique_id}</h2>
            <p className="review-edit-meta">
              {review.star_ratings}★ · {new Date(review.review_timestamp).toLocaleString()} · Updated{' '}
              {new Date(review.updated_at).toLocaleString()}
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" disabled={saving} onClick={onClose}>
            <Icon name="close" size={19} />
          </button>
        </div>

        <form className="review-edit-form" onSubmit={handleSubmit}>
          <div className="review-edit-readonly">
            <label>
              Review text
              <textarea readOnly rows={3} value={review.review_text} />
            </label>
          </div>

          <div className="review-edit-grid">
            <label>
              Category
              <select
                value={form.category}
                onChange={(event) => updateField('category', event.target.value)}
                required
              >
                {taxonomy.categories.map((item) => (
                  <option key={item.name} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              Subcategory
              <select
                value={form.subcategory}
                onChange={(event) => updateField('subcategory', event.target.value)}
                required
                disabled={subcategoryOptions.length === 0}
              >
                {subcategoryOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={(event) => updateField('priority', event.target.value)}
                required
              >
                {orderPriorities(taxonomy.priorities).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value)}
                required
              >
                {taxonomy.statuses.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Department
              <input value={form.department} onChange={(event) => updateField('department', event.target.value)} required />
            </label>
            <label className="review-edit-span-2">
              Resolution
              <input value={form.resolution} onChange={(event) => updateField('resolution', event.target.value)} required />
            </label>
            <label>
              Resolution timestamp
              <input
                type="datetime-local"
                value={responseLocal}
                onChange={(event) => setResponseLocal(event.target.value)}
              />
            </label>
            <label>
              Developer reply time
              <input type="datetime-local" value={replyLocal} onChange={(event) => setReplyLocal(event.target.value)} />
            </label>
            <label className="review-edit-span-2">
              Developer reply text
              <textarea
                rows={2}
                value={form.developer_reply_text}
                onChange={(event) => updateField('developer_reply_text', event.target.value)}
                required
              />
            </label>
          </div>

          {error && <p className="login-error form-level-error" role="alert">{error}</p>}

          <div className="review-edit-actions">
            <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving…' : 'Save update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatCellDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export function formatReviewFieldDate(iso: string | null | undefined) {
  return formatCellDate(iso)
}
