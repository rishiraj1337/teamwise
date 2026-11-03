import { useEffect, useMemo, useState } from 'react'
import {
  createReviewCategory,
  createReviewSubcategory,
  fetchReviewConfig,
  updateReviewCategory,
  updateReviewSubcategory,
  type ReviewCategoryRow,
  type ReviewConfigResponse,
} from '../../api/reviewConfig'
import { ApiError } from '../../api/client'
import { EmptyState } from '../../components/ui/EmptyState'

export function ManageConfigurationsPage() {
  const [config, setConfig] = useState<ReviewConfigResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSubcategoryName, setNewSubcategoryName] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    setError('')
    const response = await fetchReviewConfig()
    setConfig(response)
    if (selectedCategoryId == null && response.categories.length > 0) {
      setSelectedCategoryId(response.categories[0].id)
    }
  }

  useEffect(() => {
    reload()
      .catch((fetchError) => {
        setError(fetchError instanceof ApiError ? fetchError.message : 'Could not load configuration.')
      })
      .finally(() => setLoading(false))
  }, [])

  const selectedCategory = useMemo(
    () => config?.categories.find((item) => item.id === selectedCategoryId) ?? null,
    [config, selectedCategoryId],
  )

  async function handleAddCategory(event: React.FormEvent) {
    event.preventDefault()
    if (!newCategoryName.trim()) return
    setBusy(true)
    setError('')
    try {
      await createReviewCategory(newCategoryName.trim())
      setNewCategoryName('')
      await reload()
    } catch (fetchError) {
      setError(fetchError instanceof ApiError ? fetchError.message : 'Could not create category.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddSubcategory(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedCategoryId || !newSubcategoryName.trim()) return
    setBusy(true)
    setError('')
    try {
      await createReviewSubcategory(selectedCategoryId, newSubcategoryName.trim())
      setNewSubcategoryName('')
      await reload()
    } catch (fetchError) {
      setError(fetchError instanceof ApiError ? fetchError.message : 'Could not create subcategory.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleCategoryActive(category: ReviewCategoryRow) {
    setBusy(true)
    setError('')
    try {
      await updateReviewCategory(category.id, { is_active: !category.is_active })
      await reload()
    } catch (fetchError) {
      setError(fetchError instanceof ApiError ? fetchError.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleSubcategoryActive(subcategoryId: number, isActive: boolean) {
    setBusy(true)
    setError('')
    try {
      await updateReviewSubcategory(subcategoryId, { is_active: !isActive })
      await reload()
    } catch (fetchError) {
      setError(fetchError instanceof ApiError ? fetchError.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="reviews-page config-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow"><span className="online-indicator" />CLASSIFICATION</div>
          <h1>Manage categories</h1>
          <p>Review categories and subcategories stored in timePayReview (used by ingest and classification).</p>
        </div>
      </div>

      <section className="panel reviews-table-panel">
        {error && <p className="login-error form-level-error" role="alert">{error}</p>}
        {loading || !config ? (
          <EmptyState message="Loading configuration…" />
        ) : (
          <div className="config-layout">
            <div className="config-column">
              <h2>Categories</h2>
              <form className="config-inline-form" onSubmit={(event) => void handleAddCategory(event)}>
                <input
                  placeholder="New category name"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  disabled={busy}
                />
                <button type="submit" className="secondary-button" disabled={busy}>Add</button>
              </form>
              <ul className="config-list config-select-list">
                {config.categories.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      className={selectedCategoryId === category.id ? 'config-selected' : ''}
                      onClick={() => setSelectedCategoryId(category.id)}
                    >
                      {category.name}
                      {!category.is_active && <span className="config-inactive">Inactive</span>}
                    </button>
                    <button
                      type="button"
                      className="secondary-button config-toggle"
                      disabled={busy}
                      onClick={() => void toggleCategoryActive(category)}
                    >
                      {category.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="config-column">
              <h2>Subcategories</h2>
              {selectedCategory ? (
                <>
                  <p className="config-note">Under <b>{selectedCategory.name}</b></p>
                  <form className="config-inline-form" onSubmit={(event) => void handleAddSubcategory(event)}>
                    <input
                      placeholder="New subcategory name"
                      value={newSubcategoryName}
                      onChange={(event) => setNewSubcategoryName(event.target.value)}
                      disabled={busy}
                    />
                    <button type="submit" className="secondary-button" disabled={busy}>Add</button>
                  </form>
                  <ul className="config-list">
                    {selectedCategory.subcategories.map((sub) => (
                      <li key={sub.id}>
                        <span>{sub.name}</span>
                        {!sub.is_active && <span className="config-inactive">Inactive</span>}
                        <button
                          type="button"
                          className="secondary-button config-toggle"
                          disabled={busy}
                          onClick={() => void toggleSubcategoryActive(sub.id, sub.is_active)}
                        >
                          {sub.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState message="Select a category." />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
