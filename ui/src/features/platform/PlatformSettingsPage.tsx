import { useCallback, useEffect, useState } from 'react'
import {
  buildPollingSettingsPayload,
  enterpriseFetchAiSettings,
  enterpriseFetchPollingSettings,
  enterpriseUpdateAiSettings,
  enterpriseUpdatePollingSettings,
} from '../../api/enterprise'
import { fetchTeamwiseDirectoryUsers, type TeamwiseDirectoryUser } from '../../api/teamwiseUsers'
import { ensurePlatformSession } from '../../api/platformClient'
import { ApiError } from '../../api/client'
import { EmptyState } from '../../components/ui/EmptyState'

type Tab = 'polling' | 'ai' | 'users'

export function PlatformSettingsPage() {
  const [tab, setTab] = useState<Tab>('polling')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [polling, setPolling] = useState<Record<string, unknown>>({})
  const [ai, setAi] = useState<Record<string, unknown>>({})
  const [users, setUsers] = useState<TeamwiseDirectoryUser[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await ensurePlatformSession()
      const [pollingConfig, aiConfig, directory] = await Promise.all([
        enterpriseFetchPollingSettings(),
        enterpriseFetchAiSettings(),
        fetchTeamwiseDirectoryUsers(),
      ])
      setPolling(pollingConfig)
      setAi(aiConfig)
      setUsers(directory.users ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load platform settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function savePolling(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const saved = await enterpriseUpdatePollingSettings(buildPollingSettingsPayload(polling))
      setPolling(saved)
      setSuccess('Polling settings saved.')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Save failed.'
      const hint =
        message.includes('settings:write') || message.includes('ADMIN')
          ? ' Enterprise bridge user must have ADMIN role (see ENTERPRISE_BRIDGE_EMAIL).'
          : ''
      setError(message + hint)
    } finally {
      setBusy(false)
    }
  }

  async function saveAi(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await enterpriseUpdateAiSettings({
        enabled: Boolean(ai.enabled),
        provider: String(ai.provider ?? 'heuristic'),
        model: String(ai.model ?? ''),
      })
      setSuccess('AI settings saved.')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed (admin role required).')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <EmptyState message="Loading platform settings…" />

  return (
    <div className="reviews-page platform-settings-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow"><span className="online-indicator" />ENTERPRISE PLATFORM</div>
          <h1>Platform settings</h1>
          <p>Ingestion schedules, AI classification, and platform user accounts (enterprise API).</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void refresh()}>Refresh</button>
      </div>

      {error && <p className="login-error form-level-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}

      <div className="platform-settings-tabs" role="tablist" aria-label="Platform settings sections">
        {(['polling', 'ai', 'users'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'primary-button' : 'secondary-button'}
            onClick={() => setTab(key)}
          >
            {key === 'polling' ? 'Polling' : key === 'ai' ? 'AI' : 'Users'}
          </button>
        ))}
      </div>

      {tab === 'polling' && (
        <form className="panel platform-settings-form" onSubmit={(e) => void savePolling(e)}>
          <h2>Ingestion polling</h2>
          <p className="platform-settings-form-note">
            When enabled, the enterprise service polls on a schedule (and on startup for Play Store and chatbot).
            Play Store uses the Google Play scraper; email watches the upload folder; chatbot calls the TimePay API.
          </p>
          <div className="platform-settings-ingest-list">
            <div className="platform-settings-ingest-row">
              <label className="platform-settings-check">
                <input
                  type="checkbox"
                  checked={Boolean(polling.emailEnabled)}
                  onChange={(e) => setPolling({ ...polling, emailEnabled: e.target.checked })}
                />
                <span>Email enabled</span>
              </label>
              {Boolean(polling.emailEnabled) && (
                <label className="platform-settings-interval">
                  <span>Email interval (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={Number(polling.emailIntervalMinutes ?? 1)}
                    onChange={(e) => setPolling({ ...polling, emailIntervalMinutes: e.target.value })}
                  />
                </label>
              )}
            </div>
            <div className="platform-settings-ingest-row">
              <label className="platform-settings-check">
                <input
                  type="checkbox"
                  checked={Boolean(polling.playstoreEnabled)}
                  onChange={(e) => setPolling({ ...polling, playstoreEnabled: e.target.checked })}
                />
                <span>Play Store enabled</span>
              </label>
              {Boolean(polling.playstoreEnabled) && (
                <label className="platform-settings-interval">
                  <span>Play Store interval (minutes)</span>
                  <input
                    type="number"
                    step={1}
                    min={1}
                    value={Number(polling.playstoreIntervalMinutes ?? 1440)}
                    onChange={(e) => setPolling({ ...polling, playstoreIntervalMinutes: e.target.value })}
                  />
                </label>
              )}
            </div>
            <div className="platform-settings-ingest-row">
              <label className="platform-settings-check">
                <input
                  type="checkbox"
                  checked={Boolean(polling.chatbotEnabled)}
                  onChange={(e) => setPolling({ ...polling, chatbotEnabled: e.target.checked })}
                />
                <span>Chatbot enabled</span>
              </label>
              {Boolean(polling.chatbotEnabled) && (
                <label className="platform-settings-interval">
                  <span>Chatbot interval (minutes)</span>
                  <input
                    type="number"
                    step={1}
                    min={1}
                    value={Number(polling.chatbotIntervalMinutes ?? 60)}
                    onChange={(e) => setPolling({ ...polling, chatbotIntervalMinutes: e.target.value })}
                  />
                </label>
              )}
            </div>
          </div>
          <div className="platform-settings-actions">
            <button type="submit" className="primary-button platform-settings-save" disabled={busy}>
              {busy ? 'Saving…' : 'Save polling settings'}
            </button>
          </div>
        </form>
      )}

      {tab === 'ai' && (
        <form className="panel platform-settings-form" onSubmit={(e) => void saveAi(e)}>
          <h2>AI classification</h2>
          <div className="platform-settings-fields">
            <label className="platform-settings-check platform-settings-check--full">
              <input
                type="checkbox"
                checked={Boolean(ai.enabled)}
                onChange={(e) => setAi({ ...ai, enabled: e.target.checked })}
              />
              <span>AI enabled</span>
            </label>
            <label>
              <span>Provider</span>
              <input value={String(ai.provider ?? '')} onChange={(e) => setAi({ ...ai, provider: e.target.value })} />
            </label>
            <label>
              <span>Model</span>
              <input value={String(ai.model ?? '')} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
            </label>
          </div>
          <div className="platform-settings-actions">
            <button type="submit" className="primary-button platform-settings-save" disabled={busy}>
              {busy ? 'Saving…' : 'Save AI settings'}
            </button>
          </div>
        </form>
      )}

      {tab === 'users' && (
        <section className="panel platform-settings-users">
          <h2>Teamwise users</h2>
          <p className="platform-settings-form-note">
            Accounts are stored in <strong>teamwisedb</strong> only. Register and manage access via Teamwise HR auth.
          </p>
          <div className="reviews-table-wrap">
            <table className="reviews-table">
              <thead>
                <tr>
                  <th>Emp ID</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={6}>No users found.</td></tr>
                ) : users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.emp_id}</td>
                    <td>{u.email}</td>
                    <td>{u.name}</td>
                    <td>{u.department}</td>
                    <td>{u.role}</td>
                    <td>{u.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
