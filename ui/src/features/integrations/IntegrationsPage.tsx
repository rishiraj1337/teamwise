import { useCallback, useEffect, useState } from 'react'
import {
  fetchChatbotIngestionStatus,
  fetchEmailIngestionStatus,
  fetchFilteredEmails,
  fetchPlaystoreIngestionStatus,
  triggerChatbotPoll,
  triggerEmailIngestion,
  triggerPlaystoreIngestion,
  type EmailIngestionStats,
  type FilteredEmailItem,
} from '../../api/ingestion'
import { enterpriseFetchEmailFilteredStats } from '../../api/enterprise'
import { ensurePlatformSession } from '../../api/platformClient'
import { ApiError } from '../../api/client'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'

export function IntegrationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emailStats, setEmailStats] = useState<EmailIngestionStats | null>(null)
  const [playstoreStats, setPlaystoreStats] = useState<Record<string, unknown> | null>(null)
  const [chatbotStats, setChatbotStats] = useState<Record<string, unknown> | null>(null)
  const [filteredStats, setFilteredStats] = useState<Record<string, number> | null>(null)
  const [filtered, setFiltered] = useState<FilteredEmailItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      await ensurePlatformSession()
      const [email, playstore, chatbot, quarantine, quarantineStats] = await Promise.all([
        fetchEmailIngestionStatus(),
        fetchPlaystoreIngestionStatus(),
        fetchChatbotIngestionStatus(),
        fetchFilteredEmails(1, 8),
        enterpriseFetchEmailFilteredStats().catch(() => ({})),
      ])
      setEmailStats(email)
      setPlaystoreStats(playstore as Record<string, unknown>)
      setChatbotStats(chatbot as Record<string, unknown>)
      setFiltered(quarantine.items ?? [])
      setFilteredStats(quarantineStats as Record<string, number>)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load ingestion status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function runAction(key: string, action: () => Promise<unknown>) {
    setBusy(key)
    setError('')
    try {
      await ensurePlatformSession()
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <EmptyState message="Loading ingestion pipelines…" />
  }

  return (
    <div className="integrations-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow"><span className="online-indicator" />CONNECTED TOOLS</div>
          <h1>Ingestion & pipelines</h1>
          <p>Email directory watcher, Play Store sync, and chatbot polling via the enterprise review platform.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {error && <p className="login-error form-level-error" role="alert">{error}</p>}

      <section className="integrations-grid">
        <article className="panel integration-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">EMAIL-SFTP</span>
              <h2>Email ingestion</h2>
            </div>
            <Icon name="plug" size={20} />
          </div>
          <ul className="integration-metrics">
            <li><span>Status</span><b>{emailStats?.isProcessing ? 'Processing' : 'Monitoring'}</b></li>
            <li><span>Pending files</span><b>{emailStats?.pendingCount ?? 0}</b></li>
            <li><span>Support ingested</span><b>{emailStats?.supportCount ?? 0}</b></li>
            <li><span>Non-support</span><b>{emailStats?.nonSupportCount ?? 0}</b></li>
            <li><span>Last run</span><b>{emailStats?.lastRunAt ? new Date(emailStats.lastRunAt).toLocaleString() : '—'}</b></li>
          </ul>
          <button
            type="button"
            className="primary-button"
            disabled={busy === 'email'}
            onClick={() => void runAction('email', triggerEmailIngestion)}
          >
            {busy === 'email' ? 'Running…' : 'Run email ingestion'}
          </button>
        </article>

        <article className="panel integration-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">GOOGLE PLAY</span>
              <h2>Play Store sync</h2>
            </div>
            <Icon name="layers" size={20} />
          </div>
          <ul className="integration-metrics">
            <li><span>Scraping</span><b>{playstoreStats?.isScraping ? 'Yes' : 'Idle'}</b></li>
            <li><span>Total scraped</span><b>{String(playstoreStats?.totalScraped ?? '—')}</b></li>
            <li><span>Last run</span><b>{playstoreStats?.lastRunAt ? new Date(String(playstoreStats.lastRunAt)).toLocaleString() : '—'}</b></li>
          </ul>
          <button
            type="button"
            className="primary-button"
            disabled={busy === 'playstore'}
            onClick={() => void runAction('playstore', triggerPlaystoreIngestion)}
          >
            {busy === 'playstore' ? 'Running…' : 'Trigger Play Store sync'}
          </button>
        </article>

        <article className="panel integration-card">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CHATBOT</span>
              <h2>Chatbot feedback</h2>
            </div>
            <Icon name="spark" size={20} />
          </div>
          <ul className="integration-metrics">
            <li><span>Polling</span><b>{chatbotStats?.isPolling ? 'Active' : 'Idle'}</b></li>
            <li><span>Sessions</span><b>{String(chatbotStats?.totalSessions ?? '—')}</b></li>
            <li><span>Last poll</span><b>{chatbotStats?.lastPollAt ? new Date(String(chatbotStats.lastPollAt)).toLocaleString() : '—'}</b></li>
          </ul>
          <button
            type="button"
            className="primary-button"
            disabled={busy === 'chatbot'}
            onClick={() => void runAction('chatbot', triggerChatbotPoll)}
          >
            {busy === 'chatbot' ? 'Running…' : 'Poll chatbot now'}
          </button>
        </article>
      </section>

      <section className="panel integration-quarantine">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">QUARANTINE</span>
            <h2>Filtered non-support email</h2>
            {filteredStats?.total != null && <p className="panel-sub">Total quarantined: {filteredStats.total}</p>}
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No quarantined messages in the latest page." />
        ) : (
          <div className="reviews-table-wrap">
            <table className="reviews-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Reason</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.from_address}</td>
                    <td>{row.subject}</td>
                    <td>{row.rejection_reason}</td>
                    <td>{new Date(row.received_date_time).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
