import { useEffect, useState } from 'react'
import {
  enterpriseFetchChatbotCategories,
  enterpriseFetchChatbotTicket,
  enterpriseFetchChatbotTickets,
  type ChatbotTicket,
} from '../../api/enterprise'
import { ensurePlatformSession } from '../../api/platformClient'
import { ApiError } from '../../api/client'
import { EmptyState } from '../../components/ui/EmptyState'

export function ChatbotTicketsPage() {
  const [tickets, setTickets] = useState<ChatbotTicket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [categories, setCategories] = useState<{ name: string }[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticketDetail, setTicketDetail] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ensurePlatformSession()
      .then(() =>
        Promise.all([
          enterpriseFetchChatbotTickets({
            page,
            limit: 20,
            categoryName: categoryFilter || undefined,
            search: search.trim() || undefined,
          }),
          enterpriseFetchChatbotCategories(),
        ]),
      )
      .then(([list, cats]) => {
        if (cancelled) return
        setTickets(list.items)
        setTotal(list.total)
        setCategories(cats.map((c) => ({ name: c.name })))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load chatbot tickets.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, categoryFilter, search])

  useEffect(() => {
    if (!selectedId) {
      setTicketDetail(null)
      return
    }
    let cancelled = false
    enterpriseFetchChatbotTicket(selectedId)
      .then((detail) => {
        if (!cancelled) setTicketDetail(detail)
      })
      .catch(() => {
        if (!cancelled) setTicketDetail(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="reviews-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow"><span className="online-indicator" />CHATBOT</div>
          <h1>Chatbot tickets</h1>
          <p>Sessions polled from TimePay chatbot into the unified review platform.</p>
        </div>
      </div>

      {error && <p className="login-error form-level-error" role="alert">{error}</p>}

      <section className="panel reviews-table-panel">
        <div className="panel-heading">
          <div className="reviews-filters">
            <label>
              Category
              <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}>
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </label>
            <label>
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => setPage(1)}
                placeholder="Complaint ID, mobile, RRN…"
              />
            </label>
          </div>
        </div>

        {loading ? (
          <EmptyState message="Loading tickets…" />
        ) : tickets.length === 0 ? (
          <EmptyState message="No chatbot tickets match your filters." />
        ) : (
          <>
            <div className="reviews-table-wrap">
              <table className="reviews-table">
                <thead>
                  <tr>
                    <th>Complaint</th>
                    <th>Category</th>
                    <th>Ticket type</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Review ID</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedId === row.id ? 'row-selected' : ''}
                      onClick={() => setSelectedId(row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{row.complaint_id}</td>
                      <td>{row.category_name}</td>
                      <td>{row.ticket_category}</td>
                      <td>{row.status === 0 ? 'Open' : row.status === 1 ? 'Closed' : 'In progress'}</td>
                      <td>{row.amount}</td>
                      <td>{row.review_unique_id ?? '—'}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="reviews-pagination">
              <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button type="button" className="secondary-button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </>
        )}
      </section>

      {ticketDetail && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Ticket detail</h2>
          </div>
          <pre className="audit-meta-pre">{JSON.stringify(ticketDetail, null, 2)}</pre>
        </section>
      )}
    </div>
  )
}
