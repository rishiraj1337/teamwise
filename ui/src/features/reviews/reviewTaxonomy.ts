export type ReviewCategoryOption = {
  name: string
  subcategories: string[]
}

export type ReviewTaxonomy = {
  priorities: string[]
  categories: ReviewCategoryOption[]
  statuses: string[]
}

export function orderPriorities(priorities: string[]): string[] {
  const priorityOrder = ['Urgent', 'High', 'Medium', 'Low']
  const known = new Set(priorityOrder.map((priority) => priority.toLowerCase()))
  const ordered = priorityOrder.flatMap((priority) => {
    const match = priorities.find((item) => item.toLowerCase() === priority.toLowerCase())
    return match ? [match] : []
  })
  const remaining = priorities.filter((priority) => !known.has(priority.toLowerCase()))
  return [...ordered, ...remaining]
}

/** Map legacy DB values to canonical category for dropdowns. */
export function normalizeCategoryForForm(category: string, taxonomy: ReviewTaxonomy): string {
  const trimmed = category.trim()
  if (taxonomy.categories.some((item) => item.name === trimmed)) {
    return trimmed
  }
  if (trimmed.toLowerCase() === 'playstore feedback') {
    return 'Playstore review'
  }
  return trimmed
}

export function normalizePriorityForForm(priority: string, taxonomy: ReviewTaxonomy): string {
  const lowered = priority.trim().toLowerCase()
  if (lowered === 'moderate') {
    return 'Medium'
  }
  if (lowered === 'n/a' || lowered === '') {
    return taxonomy.priorities[0] ?? 'Low'
  }
  const match = taxonomy.priorities.find((item) => item.toLowerCase() === lowered)
  return match ?? taxonomy.priorities[0] ?? priority
}

export function normalizeSubcategoryForForm(
  category: string,
  subcategory: string,
  taxonomy: ReviewTaxonomy,
): string {
  const cat = normalizeCategoryForForm(category, taxonomy)
  const option = taxonomy.categories.find((item) => item.name === cat)
  if (!option) {
    return subcategory
  }
  if (option.subcategories.includes(subcategory)) {
    return subcategory
  }
  if (cat === 'Playstore review') {
    const lowered = subcategory.trim().toLowerCase()
    if (lowered === 'positive') return 'Positive'
    if (lowered === 'negative') return 'Negative'
  }
  return subcategory
}

export function normalizeStatusForForm(status: string, taxonomy: ReviewTaxonomy): string {
  const lowered = status.trim().toLowerCase()
  const aliases: Record<string, string> = {
    open: 'New',
    pending: 'New',
    new: 'New',
    'in progress': 'In Progress',
    in_progress: 'In Progress',
    inprogress: 'In Progress',
    resolved: 'Resolved',
    done: 'Resolved',
    complete: 'Resolved',
    closed: 'Closed',
    'n/a': 'N/A',
  }
  const canonical = aliases[lowered] ?? status.trim()
  const match = taxonomy.statuses.find((item) => item.toLowerCase() === canonical.toLowerCase())
  return match ?? taxonomy.statuses[0] ?? canonical
}

export function subcategoriesForCategory(category: string, taxonomy: ReviewTaxonomy): string[] {
  const cat = normalizeCategoryForForm(category, taxonomy)
  return taxonomy.categories.find((item) => item.name === cat)?.subcategories ?? []
}
