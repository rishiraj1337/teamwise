import { useEffect, useMemo, useState } from 'react'
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest, register as registerRequest } from '../api/auth'
import { clearPlatformSession, ensurePlatformSession } from '../api/platformClient'
import { setStoredToken, getStoredToken, setStoredUserProfile } from '../api/client'
import { Avatar } from '../components/ui/Avatar'
import { EmptyState } from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import { AccountProfilePanel } from '../features/auth/AccountProfilePanel'
import { AuthScreen } from '../features/auth/AuthScreen'
import { Dashboard } from '../features/dashboard/Dashboard'
import { EmployeeProfile } from '../features/people/EmployeeProfile'
import { OrganizationChartPage } from '../features/organization/OrganizationChartPage'
import { OperationsOverviewReviewReports } from '../features/reviews/ReviewReportCards'
import { ReviewsRemarksPage } from '../features/reviews/ReviewsRemarksPage'
import type { ReviewListPreset } from '../features/reviews/reviewReportNavigation'
import { AuditLogPage } from '../features/audit/AuditLogPage'
import { ManageConfigurationsPage } from '../features/config/ManageConfigurationsPage'
import { ChatbotTicketsPage } from '../features/chatbot/ChatbotTicketsPage'
import { PlatformSettingsPage } from '../features/platform/PlatformSettingsPage'
import { IntegrationsPage } from '../features/integrations/IntegrationsPage'
import { isOperationsUser } from '../utils/department'
import { getDepartmentContent, projects, tasks } from '../mocks/workspaceData'
import type { UserPublic, UserRegister } from '../types/auth'
import type { Employee, Page } from '../types/workspace'
import { getAuthorizedPeople, getDescendants, getDirectReports, getOrganizationAnchor } from '../utils/organization'
import { userToEmployee, formatDepartmentLabel } from '../utils/user'
import { normalizeBrowserPath } from '../utils/browserPath'
import '../styles/app.css'

function App() {
  const [authUser, setAuthUser] = useState<UserPublic | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [page, setPage] = useState<Page>('Overview')
  const [profile, setProfile] = useState<Employee | null>(null)
  const [search, setSearch] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantInput, setAssistantInput] = useState('')
  const [messages, setMessages] = useState<{ from: 'user' | 'assistant'; text: string }[]>([])
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notificationRead, setNotificationRead] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [reviewListPreset, setReviewListPreset] = useState<ReviewListPreset | null>(null)

  const currentUser = useMemo(() => (authUser ? userToEmployee(authUser) : null), [authUser])

  useEffect(() => {
    normalizeBrowserPath()
  }, [])

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setAuthLoading(false)
      return
    }
    fetchCurrentUser()
      .then((user) => {
        setAuthUser(user)
        normalizeBrowserPath()
        if (isOperationsUser(user)) {
          void ensurePlatformSession()
        }
      })
      .catch(() => setStoredToken(null))
      .finally(() => setAuthLoading(false))
  }, [])

  const visiblePeople = useMemo(() => {
    if (!currentUser) return []
    const anchor = getOrganizationAnchor(currentUser)
    return [anchor, ...getDescendants(anchor.id)]
  }, [currentUser])

  const authorizedPeople = useMemo(() => (currentUser ? getAuthorizedPeople(currentUser) : []), [currentUser])
  const scopeIds = useMemo(() => new Set(authorizedPeople.map((person) => person.id)), [authorizedPeople])
  const visibleTasks = useMemo(() => tasks.filter((task) => scopeIds.has(task.ownerId)), [scopeIds])
  const visibleProjects = useMemo(
    () => projects.filter((project) => scopeIds.has(project.leadId) || visibleTasks.some((task) => task.project === project.name)),
    [scopeIds, visibleTasks],
  )
  const content = getDepartmentContent(formatDepartmentLabel(authUser?.department ?? 'Workspace'))

  async function handleLogin(email: string, password: string) {
    setAuthBusy(true)
    try {
      const response = await loginRequest(email, password)
      setStoredToken(response.access_token)
      setStoredUserProfile({
        email: response.user.email,
        emp_id: response.user.emp_id,
        name: response.user.name,
      })
      setAuthUser(response.user)
      setPage('Overview')
      normalizeBrowserPath()
      if (isOperationsUser(response.user)) {
        void ensurePlatformSession()
      }
      userToEmployee(response.user)
    } catch (error) {
      setAuthBusy(false)
      throw error
    }
    setAuthBusy(false)
  }

  async function handleRegister(payload: UserRegister) {
    setAuthBusy(true)
    try {
      await registerRequest(payload)
      await handleLogin(payload.email, payload.password)
    } catch (error) {
      setAuthBusy(false)
      throw error
    }
  }

  async function logout() {
    try {
      await logoutRequest()
    } catch {
      /* still clear local session if the network call fails */
    }
    setStoredToken(null)
    setStoredUserProfile(null)
    clearPlatformSession()
    setAuthUser(null)
    setProfile(null)
    setPage('Overview')
    setSearch('')
    setAccountOpen(false)
  }

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setProfile(null)
    setSearch('')
  }

  function navigateToReviewsWithFilters(preset: ReviewListPreset) {
    setReviewListPreset(preset)
    setPage('Reviews and Remarks')
    setProfile(null)
    setSearch('')
  }

  function openAssistant(prompt?: string) {
    setAssistantOpen(true)
    setNotificationOpen(false)
    setAccountOpen(false)
    if (prompt) {
      setMessages([
        { from: 'user', text: prompt },
        { from: 'assistant', text: 'AI preview — this assistant is not connected yet. In the full workspace, this answer would use only the people, projects, and tasks you are authorized to see.' },
      ])
    }
  }

  function sendAssistantMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = assistantInput.trim()
    if (!text || !currentUser) return
    setMessages((existing) => [...existing, { from: 'user', text }, { from: 'assistant', text: 'AI preview — responses are disabled in this prototype. Your connected company data remains unchanged.' }])
    setAssistantInput('')
  }

  if (authLoading) {
    return <main className="login-page auth-loading"><p>Loading your workspace…</p></main>
  }

  if (!authUser || !currentUser) {
    return <AuthScreen loading={authBusy} onLogin={handleLogin} onRegister={handleRegister} />
  }

  const operationsWorkspace = isOperationsUser(authUser)
  const workspaceNav: { label: Page; icon: string }[] = [
    { label: 'Overview', icon: 'grid' },
    ...(operationsWorkspace ? [{ label: 'Reviews and Remarks', icon: 'work' } as { label: Page; icon: string }] : []),
    ...(operationsWorkspace ? [{ label: 'Manage categories', icon: 'layers' } as { label: Page; icon: string }] : []),
    ...(operationsWorkspace ? [{ label: 'Audit log', icon: 'layers' } as { label: Page; icon: string }] : []),
    ...(operationsWorkspace ? [{ label: 'Chatbot tickets', icon: 'work' } as { label: Page; icon: string }] : []),
    ...(operationsWorkspace ? [{ label: 'Platform settings', icon: 'layers' } as { label: Page; icon: string }] : []),
    { label: 'My work', icon: 'work' },
    { label: 'People & teams', icon: 'people' },
    { label: 'Organization chart', icon: 'people' },
    { label: 'Projects', icon: 'layers' },
  ]
  const connectedNav: { label: Page; icon: string }[] = [{ label: 'Integrations', icon: 'plug' }]
  const navGroups: { title: string; items: { label: Page; icon: string }[] }[] = [
    { title: 'WORKSPACE', items: workspaceNav },
    { title: 'CONNECTED TOOLS', items: connectedNav },
  ]
  const pageTitle = profile ? 'People & teams' : page
  const headerSub = page === 'Overview' && !profile
    ? content.eyebrow
    : page === 'Integrations'
      ? 'YOUR CONNECTED WORKSPACE'
      : page === 'Reviews and Remarks'
        ? 'PLAY STORE INSIGHTS'
        : page === 'Audit log'
          ? 'COMPLIANCE & ACTIVITY'
          : page === 'Manage categories'
            ? 'CLASSIFICATION'
        : 'TEAMWISE WORKSPACE'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="sidebar-brand" type="button" onClick={() => navigate('Overview')} aria-label="Go to dashboard"><span className="brand-mark"><Icon name="spark" size={18} /></span><span>teamwise</span><span className="brand-beta">BETA</span></button>
        <button className="workspace-switcher" type="button"><span className="workspace-icon">N</span><span className="workspace-copy"><b>Network People Services Technologies</b><small>{formatDepartmentLabel(authUser.department)}</small></span><span className="switcher-dots"><Icon name="more" size={17} /></span></button>
        <nav className="side-nav" aria-label="Main navigation">
          {navGroups.map((group) => <div className="nav-group" key={group.title}><span className="nav-heading">{group.title}</span>{group.items.map((item) => <button type="button" key={item.label} className={`nav-item ${page === item.label && !profile ? 'active' : ''}`} onClick={() => navigate(item.label)}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.label === 'People & teams' && (operationsWorkspace ? <Icon name="chevron" size={14} /> : <span className="nav-count">{getDirectReports(currentUser.id).length || '—'}</span>)}</button>)}</div>)}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" className="ai-side-card" onClick={() => openAssistant()}><span className="ai-icon"><Icon name="spark" size={16} /></span><span><b>Ask Teamwise</b><small>Your work, answered.</small></span><Icon name="arrow" size={15} /></button>
          <button type="button" className="profile-switch" onClick={() => { setAccountOpen(true); setNotificationOpen(false) }}><Avatar person={currentUser} size="small" /><span className="profile-copy"><b>{currentUser.name}</b><small>{currentUser.title}</small></span><Icon name="chevron" size={16} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>TeamWise</span><Icon name="chevron" size={14} /><span className="breadcrumb-current">{pageTitle}</span>{profile && <><Icon name="chevron" size={14} /><span className="breadcrumb-current">{profile.name}</span></>}</div>
          <div className="topbar-actions">
            <div className="global-search"><Icon name="search" size={17} /><input aria-label="Search your workspace" placeholder="Search your workspace..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd>
              {search.trim() && <div className="search-results">
                {visiblePeople.filter((person) => `${person.name} ${person.username} ${person.department} ${person.title}`.toLowerCase().includes(search.toLowerCase())).slice(0, 4).map((person) => <button type="button" key={person.id} onClick={() => { setProfile(person); setPage('People & teams'); setSearch('') }}><Avatar person={person} size="small" /><span><b>{person.name}</b><small>{person.title}</small></span><Icon name="chevron" size={14} /></button>)}
                {visibleProjects.filter((project) => `${project.name} ${project.department}`.toLowerCase().includes(search.toLowerCase())).slice(0, 3).map((project) => <button type="button" key={project.id} onClick={() => { setPage('Projects'); setSearch('') }}><span className="search-icon"><Icon name="layers" size={16} /></span><span><b>{project.name}</b><small>{project.department} · Project</small></span><Icon name="chevron" size={14} /></button>)}
                {visibleTasks.filter((task) => `${task.title} ${task.project} ${task.id}`.toLowerCase().includes(search.toLowerCase())).slice(0, 3).map((task) => <button type="button" key={task.id} onClick={() => { setPage('My work'); setSearch('') }}><span className="search-icon"><Icon name="work" size={16} /></span><span><b>{task.title}</b><small>{task.id} · Task</small></span><Icon name="chevron" size={14} /></button>)}
                {!visiblePeople.some((person) => `${person.name} ${person.username} ${person.department} ${person.title}`.toLowerCase().includes(search.toLowerCase())) && !visibleProjects.some((project) => `${project.name} ${project.department}`.toLowerCase().includes(search.toLowerCase())) && !visibleTasks.some((task) => `${task.title} ${task.project} ${task.id}`.toLowerCase().includes(search.toLowerCase())) && <p className="search-empty">No matching items in your workspace scope.</p>}
              </div>}
            </div>
            <button className="top-ai-button" type="button" onClick={() => openAssistant()}><Icon name="spark" size={16} /><span>Ask AI</span></button>
            <div className="notification-wrap"><button className="icon-button notification-button" aria-label="Notifications" type="button" onClick={() => { setNotificationOpen(!notificationOpen); setAssistantOpen(false); setAccountOpen(false) }}><Icon name="bell" size={18} />{!notificationRead && <i />}</button>{notificationOpen && <div className="notification-popover"><div className="popover-heading"><b>Notifications</b><button type="button" onClick={() => setNotificationRead(true)}>Mark all read</button></div><p className="search-empty" style={{ padding: '16px' }}>No notifications yet.</p></div>}</div>
            <div className="account-wrap">
              <button className="top-avatar-button" type="button" aria-label={`Signed in as ${currentUser.name}`} aria-expanded={accountOpen} onClick={() => { setAccountOpen(!accountOpen); setNotificationOpen(false) }}><Avatar person={currentUser} size="small" /></button>
              {accountOpen && <AccountProfilePanel user={authUser} onClose={() => setAccountOpen(false)} onLogout={logout} />}
            </div>
          </div>
        </header>
        <div className="page-content">
          <div className="page-kicker">{headerSub}</div>
          {profile ? <EmployeeProfile employee={profile} canViewWork={scopeIds.has(profile.id)} visibleTasks={visibleTasks} visibleProjects={visibleProjects} onBack={() => setProfile(null)} onAskAI={openAssistant} /> :
            page === 'Overview' ? <Dashboard currentUser={currentUser} content={content} visiblePeople={authorizedPeople} visibleTasks={visibleTasks} visibleProjects={visibleProjects} onNavigate={navigate} onOpenProfile={setProfile} onAskAI={openAssistant} hideMetrics={operationsWorkspace} afterGreeting={operationsWorkspace ? <OperationsOverviewReviewReports onDrillDown={navigateToReviewsWithFilters} /> : undefined} /> :
              page === 'Organization chart' ? <OrganizationChartPage /> :
                page === 'Reviews and Remarks' ? (operationsWorkspace ? <ReviewsRemarksPage initialPreset={reviewListPreset} onPresetApplied={() => setReviewListPreset(null)} /> : <div className="coming-soon-state"><EmptyState message="Coming soon." /></div>) :
                  page === 'Audit log' ? (operationsWorkspace ? <AuditLogPage /> : <div className="coming-soon-state"><EmptyState message="Coming soon." /></div>) :
                    page === 'Manage categories' ? (operationsWorkspace ? <ManageConfigurationsPage /> : <div className="coming-soon-state"><EmptyState message="Coming soon." /></div>) :
                    page === 'Chatbot tickets' ? (operationsWorkspace ? <ChatbotTicketsPage /> : <div className="coming-soon-state"><EmptyState message="Coming soon." /></div>) :
                    page === 'Platform settings' ? (operationsWorkspace ? <PlatformSettingsPage /> : <div className="coming-soon-state"><EmptyState message="Coming soon." /></div>) :
                    page === 'Integrations' ? (
                      operationsWorkspace ? (
                        <IntegrationsPage />
                      ) : (
                        <div className="coming-soon-state"><EmptyState message="Coming soon." /></div>
                      )
                    ) :
                    <div className="coming-soon-state"><EmptyState message="Coming soon." /></div>}
        </div>
      </main>

      {assistantOpen && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssistantOpen(false) }}><aside className="assistant-drawer" aria-label="AI assistant"><div className="drawer-heading"><span className="assistant-heading-icon"><Icon name="spark" size={18} /></span><span><b>Ask Teamwise</b><small>AI workspace assistant <span className="preview-tag">PREVIEW</span></small></span><button className="icon-button" type="button" aria-label="Close assistant" onClick={() => setAssistantOpen(false)}><Icon name="close" size={19} /></button></div><div className="assistant-context"><span className="context-dot" />Using your authorized workspace scope<span className="context-lock">⌑</span></div><div className="assistant-chat">{messages.length === 0 ? <div className="assistant-welcome"><span className="welcome-spark"><Icon name="spark" size={24} /></span><h3>How can I help?</h3><p>Get a clearer view of your work across the tools you use every day.</p><span className="suggestion-label">TRY ASKING</span><button type="button" onClick={() => openAssistant('What is my team working on?')}>What is my team working on? <Icon name="arrow" size={15} /></button><button type="button" onClick={() => openAssistant('What is blocking delivery this week?')}>What is blocking delivery this week? <Icon name="arrow" size={15} /></button><button type="button" onClick={() => openAssistant('What needs my attention today?')}>What needs my attention today? <Icon name="arrow" size={15} /></button></div> : messages.map((message, index) => <div className={`chat-message ${message.from}`} key={`${index}-${message.text}`}><span className="chat-avatar">{message.from === 'assistant' ? <Icon name="spark" size={14} /> : <Avatar person={currentUser} size="small" />}</span><p>{message.text}</p></div>)}</div><form className="assistant-input" onSubmit={sendAssistantMessage}><input aria-label="Ask the AI assistant" placeholder="Ask about your work..." value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} /><button type="submit" aria-label="Send message"><Icon name="arrow" size={17} /></button></form><p className="assistant-disclaimer">Preview only. AI responses and source-system actions are not enabled.</p></aside></div>}
    </div>
  )
}

export default App
