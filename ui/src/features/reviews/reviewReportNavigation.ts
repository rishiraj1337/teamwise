import type { ReviewQuery } from '../../api/reviews'

export type ReviewListPreset = Partial<
  Pick<ReviewQuery, 'category' | 'priority' | 'status' | 'min_rating' | 'max_rating' | 'channel'>
> & {
  status_group?: 'open' | 'resolved'
}

export type ReportDrillSource = 'category' | 'sentiment' | 'priority' | 'ticket'

export function mapReportSliceToPreset(source: ReportDrillSource, label: string): ReviewListPreset {
  const trimmed = label.trim()
  switch (source) {
    case 'category':
      return { category: trimmed }
    case 'priority':
      return { priority: trimmed }
    case 'sentiment':
      if (trimmed.toLowerCase() === 'positive') {
        return { min_rating: 4, max_rating: 5 }
      }
      if (trimmed.toLowerCase() === 'negative') {
        return { min_rating: 1, max_rating: 3 }
      }
      return {}
    case 'ticket':
      if (trimmed.toLowerCase() === 'open') {
        return { status_group: 'open' }
      }
      if (trimmed.toLowerCase() === 'resolved') {
        return { status_group: 'resolved' }
      }
      return {}
    default:
      return {}
  }
}

export const PRIORITY_BAR_ORDER = ['Urgent', 'High', 'Medium', 'Low'] as const

export function sortPriorityBreakdown<T extends { label: string; value: number }>(rows: T[]): T[] {
  const order = new Map(PRIORITY_BAR_ORDER.map((name, index) => [name.toLowerCase(), index]))
  return [...rows].sort((a, b) => {
    const ai = order.get(a.label.toLowerCase()) ?? 99
    const bi = order.get(b.label.toLowerCase()) ?? 99
    if (ai !== bi) return ai - bi
    return b.value - a.value
  })
}
