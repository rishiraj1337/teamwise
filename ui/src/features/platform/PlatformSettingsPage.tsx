import { useCallback, useEffect, useState } from 'react'
import {
  buildPollingSettingsPayload,
  enterpriseFetchAiSettings,
  enterpriseFetchPollingSettings,
  enterpriseUpdateAiSettings,
  enterpriseUpdatePollingSettings,
} from '../../api/enterprise'
import {
  assignUserRole,
  fetchRolesMatrix,
  fetchTeamwiseDirectoryUsers,
  updateRolesMatrix,
  type RolesMatrixData,
  type TeamwiseDirectoryUser,
} from '../../api/teamwiseUsers'
import { ensurePlatformSession } from '../../api/platformClient'
import { ApiError } from '../../api/client'
import { EmptyState } from '../../components/ui/EmptyState'
import { toast } from '../../components/ui/Toast'

type Tab = 'polling' | 'ai' | 'users' | 'matrix'

export function PlatformSettingsPage() {
  const [tab, setTab] = useState<Tab>('polling')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [polling, setPolling] = useState<Record<string, unknown>>({})
  const [ai, setAi] = useState<Record<string, unknown>>({})
  const [users, setUsers] = useState<TeamwiseDirectoryUser[]>([])
  const [rolesMatrix, setRolesMatrix] = useState<RolesMatrixData | null>(null)
  const [matrixState, setMatrixState] = useState<Record<string, number[]>>({})
  const [busy, setBusy] = useState(false)
  const [assigningUserId, setAssigningUserId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await ensurePlatformSession()
      const [pollingConfig, aiConfig, directory, matrixData] = await Promise.all([
        enterpriseFetchPollingSettings(),
        enterpriseFetchAiSettings(),
        fetchTeamwiseDirectoryUsers(),
        fetchRolesMatrix().catch(() => null),
      ])
      setPolling(pollingConfig)
      setAi(aiConfig)
      setUsers(directory.users ?? [])
      if (matrixData) {
        setRolesMatrix(matrixData)
        setMatrixState(matrixData.matrix || {})
      }
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
      const msg = 'Polling schedules updated successfully.'
      setSuccess(msg)
      toast.success(msg)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Save failed.'
      const hint =
        message.includes('settings:write') || message.includes('ADMIN')
          ? ' Enterprise bridge user must have ADMIN role.'
          : ''
      const finalMsg = message + hint
      setError(finalMsg)
      toast.error(finalMsg)
    } finally {
      setBusy(false)
    }
  }

  async function saveAi(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')

    const provider = String(ai.provider || 'openrouter').toLowerCase()
    let defaultModel = String(ai.model || '')
    let defaultBaseUrl = String(ai.baseUrl || '')

    if (provider === 'openai' && !defaultModel) defaultModel = 'gpt-4o'
    if (provider === 'openai' && !defaultBaseUrl) defaultBaseUrl = 'https://api.openai.com/v1'

    try {
      await enterpriseUpdateAiSettings({
        enabled: Boolean(ai.enabled),
        provider,
        model: defaultModel,
        baseUrl: defaultBaseUrl || undefined,
        apiKey: ai.apiKey && ai.apiKey !== '***' ? String(ai.apiKey) : undefined,
        sourceEmailEnabled: ai.sourceEmailEnabled !== undefined ? Boolean(ai.sourceEmailEnabled) : true,
        sourcePlaystoreEnabled: Boolean(ai.sourcePlaystoreEnabled),
        sourceChatbotEnabled: Boolean(ai.sourceChatbotEnabled),
      })
      const msg = `AI classification configured with provider: ${provider.toUpperCase()}`
      setSuccess(msg)
      toast.success(msg)
      await refresh()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Save failed (admin role required).'
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  async function handleAssignRole(userId: number, roleName: string) {
    setAssigningUserId(userId)
    try {
      await assignUserRole(userId, roleName)
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: roleName } : u)),
      )
      toast.success(`Assigned role '${roleName}' to user #${userId}`)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to assign role.'
      toast.error(msg)
    } finally {
      setAssigningUserId(null)
    }
  }

  function toggleMatrixPermission(roleId: number, permissionId: number) {
    const key = String(roleId)
    const current = matrixState[key] || []
    const next = current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId]

    setMatrixState({
      ...matrixState,
      [key]: next,
    })
  }

  async function saveRolesMatrix() {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const updated = await updateRolesMatrix(matrixState)
      setRolesMatrix(updated)
      setMatrixState(updated.matrix || {})
      const msg = 'Roles and permissions matrix saved successfully.'
      setSuccess(msg)
      toast.success(msg)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save roles matrix.'
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <EmptyState message="Loading platform settings…" />

  const selectedProvider = String(ai.provider || 'openrouter').toLowerCase()

  return (
    <div className="reviews-page platform-settings-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow">
            <span className="online-indicator" />
            ENTERPRISE PLATFORM & GOVERNANCE
          </div>
          <h1>Platform Settings</h1>
          <p>Configure ingestion schedules, AI intelligence providers, user access, and RBAC matrix.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {error && <p className="login-error form-level-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}

      <div className="platform-settings-tabs" role="tablist" aria-label="Platform settings sections">
        {(
          [
            ['polling', 'Ingestion Polling'],
            ['ai', 'AI Classification'],
            ['users', 'User Roles'],
            ['matrix', 'Roles & Perms Matrix'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'primary-button' : 'secondary-button'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 1. Polling Tab */}
      {tab === 'polling' && (
        <form className="panel platform-settings-form" onSubmit={(e) => void savePolling(e)}>
          <h2>Ingestion Polling & Automated Checkpoints</h2>
          <p className="platform-settings-form-note">
            When enabled, background services poll on dynamic schedules. Email watches incoming directory files; Play Store synchronizes ratings; Chatbot polls session feedback.
          </p>
          <div className="platform-settings-ingest-list">
            <div className="platform-settings-ingest-row">
              <label className="platform-settings-check">
                <input
                  type="checkbox"
                  checked={Boolean(polling.emailEnabled)}
                  onChange={(e) => setPolling({ ...polling, emailEnabled: e.target.checked })}
                />
                <span>Email Ingestion Enabled</span>
              </label>
              {Boolean(polling.emailEnabled) && (
                <label className="platform-settings-interval">
                  <span>Email Interval (minutes)</span>
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
                <span>Play Store Sync Enabled</span>
              </label>
              {Boolean(polling.playstoreEnabled) && (
                <label className="platform-settings-interval">
                  <span>Play Store Interval (minutes)</span>
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
                <span>Chatbot Feedback Enabled</span>
              </label>
              {Boolean(polling.chatbotEnabled) && (
                <label className="platform-settings-interval">
                  <span>Chatbot Interval (minutes)</span>
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
              {busy ? 'Saving…' : 'Save Polling Settings'}
            </button>
          </div>
        </form>
      )}

      {/* 2. AI Tab with OpenAI Provider Support */}
      {tab === 'ai' && (
        <form className="panel platform-settings-form" onSubmit={(e) => void saveAi(e)}>
          <h2>AI Classification Engine</h2>
          <p className="platform-settings-form-note">
            Configure LLM classification for automatic sentiment analysis, category tagging, and severity detection across incoming feedback.
          </p>

          <div className="platform-settings-fields">
            <label className="platform-settings-check platform-settings-check--full">
              <input
                type="checkbox"
                checked={Boolean(ai.enabled)}
                onChange={(e) => setAi({ ...ai, enabled: e.target.checked })}
              />
              <span>AI Classification Enabled</span>
            </label>

            <label>
              <span>AI Provider</span>
              <select
                value={selectedProvider}
                onChange={(e) => {
                  const prov = e.target.value
                  const nextModel =
                    prov === 'openai'
                      ? 'gpt-4o'
                      : prov === 'openrouter'
                        ? 'meta-llama/llama-3.3-70b-instruct'
                        : ''
                  const nextUrl =
                    prov === 'openai'
                      ? 'https://api.openai.com/v1'
                      : prov === 'openrouter'
                        ? 'https://openrouter.ai/api/v1'
                        : ''
                  setAi({ ...ai, provider: prov, model: nextModel, baseUrl: nextUrl })
                }}
              >
                <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                <option value="openrouter">OpenRouter (Llama 3.3, Claude, etc.)</option>
                <option value="heuristic">Heuristic (Rule-based Fallback)</option>
              </select>
            </label>

            <label>
              <span>Model Identifier</span>
              <input
                type="text"
                value={String(ai.model ?? '')}
                placeholder={selectedProvider === 'openai' ? 'gpt-4o' : 'meta-llama/llama-3.3-70b-instruct'}
                onChange={(e) => setAi({ ...ai, model: e.target.value })}
                disabled={selectedProvider === 'heuristic'}
              />
            </label>

            <label>
              <span>API Base URL</span>
              <input
                type="text"
                value={String(ai.baseUrl ?? '')}
                placeholder={selectedProvider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1'}
                onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
                disabled={selectedProvider === 'heuristic'}
              />
            </label>

            <label>
              <span>API Key</span>
              <input
                type="password"
                placeholder={
                  selectedProvider === 'openai'
                    ? 'Configured via OPENAI_API_KEY (.env) or set custom'
                    : selectedProvider === 'openrouter'
                      ? 'Configured via OPENROUTER_API_KEY (.env) or set custom'
                      : 'Not required for heuristic'
                }
                value={String(ai.apiKey ?? '')}
                onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
                disabled={selectedProvider === 'heuristic'}
              />
            </label>

            <div className="platform-settings-check--full" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px' }}>
              <label className="platform-settings-check">
                <input
                  type="checkbox"
                  checked={ai.sourceEmailEnabled !== false}
                  onChange={(e) => setAi({ ...ai, sourceEmailEnabled: e.target.checked })}
                />
                <span>Classify Email Feedback</span>
              </label>

              <label className="platform-settings-check">
                <input
                  type="checkbox"
                  checked={Boolean(ai.sourcePlaystoreEnabled)}
                  onChange={(e) => setAi({ ...ai, sourcePlaystoreEnabled: e.target.checked })}
                />
                <span>Classify Play Store Reviews</span>
              </label>

              <label className="platform-settings-check">
                <input
                  type="checkbox"
                  checked={Boolean(ai.sourceChatbotEnabled)}
                  onChange={(e) => setAi({ ...ai, sourceChatbotEnabled: e.target.checked })}
                />
                <span>Classify Chatbot Feedback</span>
              </label>
            </div>
          </div>

          <div className="platform-settings-actions">
            <button type="submit" className="primary-button platform-settings-save" disabled={busy}>
              {busy ? 'Saving…' : 'Save AI Settings'}
            </button>
          </div>
        </form>
      )}

      {/* 3. Users Tab with Role Assignment */}
      {tab === 'users' && (
        <section className="panel platform-settings-users">
          <h2>Teamwise Users & Role Assignments</h2>
          <p className="platform-settings-form-note">
            Assign security roles directly to employees. Roles grant access to operational modules, review triage, and settings.
          </p>

          <div className="reviews-table-wrap">
            <table className="reviews-table">
              <thead>
                <tr>
                  <th>Emp ID</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Role (Change)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No users found in teamwisedb.</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.emp_id}</td>
                      <td>{u.email}</td>
                      <td>{u.name}</td>
                      <td>{u.department}</td>
                      <td>
                        <select
                          value={u.role.toLowerCase()}
                          disabled={assigningUserId === u.id}
                          className="role-assign-select"
                          onChange={(e) => handleAssignRole(u.id, e.target.value)}
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="employee">Employee</option>
                        </select>
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${u.status.toLowerCase()}`}>
                          {u.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. Roles & Permissions Matrix Tab */}
      {tab === 'matrix' && (
        <section className="panel platform-settings-matrix">
          <div className="panel-heading" style={{ marginBottom: '14px' }}>
            <div>
              <span className="section-kicker">GOVERNANCE & ACCESS CONTROL</span>
              <h2>Role-Based Access Control (RBAC) Matrix</h2>
              <p className="panel-sub" style={{ marginTop: '4px' }}>
                Toggle granular permissions for each role. Changes affect authorized workspaces immediately upon saving.
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={saveRolesMatrix}
              disabled={busy}
              style={{ height: '38px', padding: '0 20px', fontSize: '13.5px' }}
            >
              {busy ? 'Saving Matrix…' : 'Save Roles Matrix'}
            </button>
          </div>

          {!rolesMatrix ? (
            <EmptyState message="Loading RBAC matrix…" />
          ) : (
            <div className="reviews-table-wrap">
              <table className="reviews-table matrix-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: '220px' }}>Permission / Resource</th>
                    {rolesMatrix.roles.map((r) => (
                      <th key={r.id} style={{ textAlign: 'center', minWidth: '130px' }}>
                        <span className="matrix-role-heading">{r.name.toUpperCase()}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rolesMatrix.permissions.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="matrix-perm-row">
                          <code className="matrix-perm-key">{p.key}</code>
                          <span className="matrix-perm-desc">
                            Action: <b>{p.action}</b> on <b>{p.resource}</b>
                          </span>
                        </div>
                      </td>
                      {rolesMatrix.roles.map((r) => {
                        const currentPerms = matrixState[String(r.id)] || []
                        const checked = currentPerms.includes(p.id)
                        return (
                          <td key={r.id} style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              className="matrix-checkbox"
                              checked={checked}
                              onChange={() => toggleMatrixPermission(r.id, p.id)}
                              aria-label={`${r.name} has ${p.key}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
