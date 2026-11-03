import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { TaskRow } from '../tasks/TaskRow'
import type { WorkspaceContent } from '../../mocks/workspaceData'
import { getStatusClass } from '../../utils/status'
import type { Employee, Page, Project, Task } from '../../types/workspace'
import type { ReactNode } from 'react'

export function Dashboard({ currentUser, content, visiblePeople, visibleTasks, visibleProjects, onNavigate, onOpenProfile, onAskAI, afterGreeting, hideMetrics = false }: {
  currentUser: Employee
  content: WorkspaceContent
  visiblePeople: Employee[]
  visibleTasks: Task[]
  visibleProjects: Project[]
  onNavigate: (page: Page) => void
  onOpenProfile: (person: Employee) => void
  onAskAI: (prompt?: string) => void
  afterGreeting?: ReactNode
  hideMetrics?: boolean
}) {
  const teamPeople = visiblePeople.filter((person) => person.id !== currentUser.id)
  const blockedTasks = visibleTasks.filter((task) => task.status === 'Blocked')
  const upcomingTasks = visibleTasks.filter((task) => task.due === 'Today' || task.due === 'Overdue' || task.due === 'Oct 23').slice(0, 4)
  const teamActivity = visibleTasks.length || visibleProjects.length ? [
    { name: 'Workspace', detail: 'Activity from connected tools will appear here.', time: '—', icon: 'work', color: 'violet' },
  ] : [
    { name: 'Getting started', detail: 'Connect integrations or add team data to see activity in your workspace.', time: 'Now', icon: 'spark', color: 'blue' },
  ]
  return <div className="dashboard-page">
    <div className="welcome-row"><div><div className="welcome-eyebrow"><span className="online-indicator" />{content.eyebrow}</div><h1>{content.title}</h1><p>{content.description}</p></div><button className="primary-button briefing-button" type="button" onClick={() => onAskAI('What needs my attention today?')}><Icon name="spark" size={16} />Get my briefing</button></div>
    <div className="greeting-strip"><span className="greeting-icon"><Icon name="spark" size={17} /></span><span><b>Good morning, {currentUser.name.split(' ')[0]}.</b> Here’s what’s moving in your workspace today.</span><button type="button" onClick={() => onAskAI('What needs my attention today?')}>View briefing <Icon name="arrow" size={14} /></button></div>
    {afterGreeting}
    {!hideMetrics && <section className="metric-grid" aria-label="Workspace metrics">{content.metrics.map((metric, index) => <article className="metric-card" key={metric[0]}><div className="metric-top"><span>{metric[0]}</span><span className={`metric-icon metric-${metric[3]}`}><Icon name={index === 2 ? 'clock' : index === 3 ? 'layers' : 'grid'} size={16} /></span></div><div className="metric-value">{metric[1]}</div><div className="metric-foot"><span className={metric[3] === 'orange' ? 'change-warning' : 'change-positive'}>{metric[2]}</span><span className="mini-bars"><i /><i /><i /><i /><i /><i /></span></div></article>)}</section>}
    <div className="dashboard-columns">
      <div className="dashboard-main-column">
        <section className="panel project-panel"><div className="panel-heading"><div><span className="section-kicker">FOCUS AREAS</span><h2>{content.focusTitle}</h2></div><button className="text-button" type="button" onClick={() => onNavigate('Projects')}>View projects <Icon name="arrow" size={15} /></button></div><div className="project-list">{visibleProjects.slice(0, 3).map((project) => <button className="project-row" type="button" key={project.id} onClick={() => onNavigate('Projects')}><span className={`project-symbol symbol-${project.department.toLowerCase()}`}>{project.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><span className="project-main"><b>{project.name}</b><small>{project.department} <span>·</span> Due {project.due}</small></span><span className="project-progress"><b>{project.progress}%</b><span className="progress-track"><i style={{ width: `${project.progress}%` }} /></span></span><span className={`status-pill ${getStatusClass(project.status)}`}>{project.status}</span><Icon name="chevron" size={16} /></button>)}</div><div className="focus-divider" /><div className="pulse-list">{content.focus.map((item, index) => <div className="pulse-item" key={item}><span className={`pulse-bullet pulse-${index}`}><Icon name={index === 0 ? 'check' : index === 1 ? 'clock' : 'spark'} size={14} /></span><span>{item}</span></div>)}</div></section>
        <section className="panel tasks-panel"><div className="panel-heading"><div><span className="section-kicker">PRIORITIES</span><h2>Coming up next</h2></div><button className="text-button" type="button" onClick={() => onNavigate('My work')}>All tasks <Icon name="arrow" size={15} /></button></div><div className="task-list">{upcomingTasks.length ? upcomingTasks.map((task) => <TaskRow key={task.id} task={task} />) : <EmptyState message="You’re all caught up on upcoming work." />}</div></section>
      </div>
      <aside className="dashboard-side-column">
        <section className="panel team-panel"><div className="panel-heading"><div><span className="section-kicker">YOUR SCOPE</span><h2>People & teams</h2></div><button className="round-arrow" type="button" aria-label="View people and teams" onClick={() => onNavigate('People & teams')}><Icon name="arrow" size={16} /></button></div><div className="team-summary"><div className="avatar-stack">{teamPeople.slice(0, 4).map((person) => <span className="stack-avatar" key={person.id} onClick={() => onOpenProfile(person)}><Avatar person={person} size="small" /></span>)}</div><span><b>{teamPeople.length}</b> people in your scope</span></div><div className="team-people-list">{teamPeople.slice(0, 4).map((person) => <button type="button" className="team-person" key={person.id} onClick={() => onOpenProfile(person)}><Avatar person={person} size="small" /><span><b>{person.name}</b><small>{person.title}</small></span><span className="availability" /></button>)}{teamPeople.length === 0 && <EmptyState message="No other people in your scope yet." />}</div><button type="button" className="team-panel-footer" onClick={() => onNavigate('People & teams')}>Open team directory <Icon name="arrow" size={14} /></button></section>
        <section className="panel activity-panel"><div className="panel-heading"><div><span className="section-kicker">ACROSS YOUR TOOLS</span><h2>Team activity</h2></div><button type="button" className="icon-button small-more" aria-label="More activity options"><Icon name="more" size={17} /></button></div><div className="activity-list">{teamActivity.map((activity) => <div className="activity-item" key={activity.name}><span className={`activity-icon activity-${activity.color}`}><Icon name={activity.icon} size={15} /></span><div><b>{activity.name}</b><p>{activity.detail}</p><small>{activity.time}</small></div></div>)}</div><button className="activity-ai-link" type="button" onClick={() => onAskAI('Summarize my team’s recent activity.') }><Icon name="spark" size={15} />Summarize activity with AI</button></section>
      </aside>
    </div>
    {blockedTasks.length > 0 && <button className="blocker-banner" type="button" onClick={() => onNavigate('My work')}><span className="blocker-icon"><Icon name="clock" size={16} /></span><span><b>{blockedTasks.length} blocker{blockedTasks.length === 1 ? '' : 's'} need attention</b><small>{blockedTasks[0].title}</small></span><Icon name="arrow" size={16} /></button>}
  </div>
}
