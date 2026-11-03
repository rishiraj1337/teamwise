import {
  enterpriseCreateReviewCategory,
  enterpriseCreateReviewSubcategory,
  enterpriseFetchReviewConfig,
  enterpriseUpdateReviewCategory,
  enterpriseUpdateReviewSubcategory,
  type ReviewConfigResponse,
} from './enterprise'

export type ReviewPriorityRow = {
  id: number
  name: string
  is_active: boolean
}

export type ReviewSubcategoryRow = {
  id: number
  category_id?: number
  name: string
  is_active: boolean
}

export type ReviewCategoryRow = {
  id: number
  name: string
  is_active: boolean
  subcategories: ReviewSubcategoryRow[]
}

export type { ReviewConfigResponse }

export function fetchReviewConfig() {
  return enterpriseFetchReviewConfig()
}

export function createReviewCategory(name: string) {
  return enterpriseCreateReviewCategory(name) as Promise<ReviewCategoryRow>
}

export function updateReviewCategory(categoryId: number, payload: { name?: string; is_active?: boolean }) {
  return enterpriseUpdateReviewCategory(categoryId, payload) as Promise<ReviewCategoryRow>
}

export function createReviewSubcategory(categoryId: number, name: string) {
  return enterpriseCreateReviewSubcategory(categoryId, name) as Promise<ReviewSubcategoryRow>
}

export function updateReviewSubcategory(
  subcategoryId: number,
  payload: { name?: string; is_active?: boolean },
) {
  return enterpriseUpdateReviewSubcategory(subcategoryId, payload) as Promise<ReviewSubcategoryRow>
}
