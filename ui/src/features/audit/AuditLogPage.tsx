import { Fragment, useEffect, useState } from 'react'
import {
  AUDIT_ACTION_PRESETS,
  AUDIT_PAGE_SIZE_OPTIONS,
  fetchAuditLogs,
  type AuditLogRow,
} from '../../api/audit'
import { ApiError } from '../../api/client'
import { EmptyState } from '../../components/ui/EmptyState'

function formatMetadata(raw: string | null) {
  if (!raw) return '—'
  try {
    const parsed = JSON.parse(raw) as unknown
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

export function AuditLogPage() {
  const [items, setItems] = useState<AuditLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(AUDIT_PAGE_SIZE_OPTIONS[0])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [actionFilter, setActionFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    setPage(0)
  }, [pageSize, actionFilter, resourceFilter, searchFilter, startDate, endDate])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchAuditLogs({
      limit: pageSize,
      offset: page * pageSize,
      action: actionFilter.trim() || undefined,
      resource: resourceFilter.trim() || undefined,
      search: searchFilter.trim() || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    })
      .then((response) => {
        if (cancelled) return
        setItems(response.items)
        setTotal(response.total)
      })
      .catch((fetchError) => {
        if (cancelled) return
        setError(fetchError instanceof ApiError ? fetchError.message : 'Could not load audit log.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, pageSize, actionFilter, resourceFilter, searchFilter, startDate, endDate])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : page * pageSize + 1
  const rangeEnd = total === 0 ? 0 : Math.min(total, (page + 1) * pageSize)

  return (
    <div className="reviews-page audit-log-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow"><span className="online-indicator" />COMPLIANCE & ACTIVITY</div>
          <h1>Audit log</h1>
          <p>Teamwise sign-ins and enterprise review actions (exports, updates, settings), with the user who performed each event.</p>
        </div>
      </div>

      <section className="panel reviews-table-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">EVENT HISTORY</span>
            <h2>Recorded events {total ? `(${total})` : ''}</h2>
          </div>
          <div className="reviews-filters audit-log-filters">
            <label>
              Search
              <input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Email, action, resource, summary…"
              />
            </label>
            <label>
              Action type
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                {AUDIT_ACTION_PRESETS.map((preset) => (
                  <option key={preset || 'all'} value={preset}>
                    {preset || 'All actions'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Resource
              <input value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)} placeholder="e.g. reviews, user" />
            </label>
            <label>
              From date
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              To date
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
        </div>

        {error && <p className="login-error form-level-error" role="alert">{error}</p>}

        {loading ? (
          <EmptyState message="Loading audit log…" />
        ) : items.length === 0 ? (
          <EmptyState message="No audit events match your filters." />
        ) : (
          <>
            <div className="reviews-table-wrap">
              <table className="reviews-table audit-log-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Source</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Resource</th>
                    <th>Summary</th>
                    <th>IP</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <Fragment key={`${row.source ?? 'tw'}-${row.id}`}>
                      <tr>
                        <td>{new Date(row.created_at).toLocaleString()}</td>
                        <td>{row.source === 'enterprise' ? 'Enterprise' : 'Teamwise'}</td>
                        <td><code>{row.action}</code></td>
                        <td>
                          {row.actor_email ?? '—'}
                          {row.actor_emp_id ? ` (${row.actor_emp_id})` : ''}
                        </td>
                        <td>
                          {row.resource_type}
                          {row.resource_id ? ` · ${row.resource_id}` : ''}
                        </td>
                        <td className="review-text-cell">{row.summary}</td>
                        <td>{row.ip_address ?? '—'}</td>
                        <td>
                          {row.metadata_json ? (
                            <button
                              type="button"
                              className="secondary-button audit-detail-button"
                              onClick={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                            >
                              {expandedId === row.id ? 'Hide' : 'Details'}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {expandedId === row.id && row.metadata_json && (
                        <tr key={`${row.id}-meta`} className="audit-meta-row">
                          <td colSpan={8}>
                            <pre className="audit-meta-pre">{formatMetadata(row.metadata_json)}</pre>
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
                  {AUDIT_PAGE_SIZE_OPTIONS.map((size) => (
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
    </div>
  )
}
