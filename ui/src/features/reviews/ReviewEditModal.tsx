import type { ReviewRow, ReviewUpdatePayload } from '../../api/reviews'
import type { ReviewTaxonomy } from './reviewTaxonomy'
import { ReviewDetailCard } from './ReviewDetailCard'

type ReviewEditModalProps = {
  review: ReviewRow
  taxonomy: ReviewTaxonomy
  saving: boolean
  error: string
  onClose: () => void
  onSave: (payload: ReviewUpdatePayload) => void
}

export function ReviewEditModal({ review, taxonomy, saving, onClose, onSave }: ReviewEditModalProps) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <div style={{ maxWidth: '820px', width: '100%', margin: '20px auto' }}>
        <ReviewDetailCard
          review={review}
          taxonomy={taxonomy}
          onClose={onClose}
          onSave={onSave}
        />
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
