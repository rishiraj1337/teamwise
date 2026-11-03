import { useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { employees } from '../../mocks/workspaceData'
import type { Employee } from '../../types/workspace'
import { getDirectReports } from '../../utils/organization'

export function OrganizationChartPage() {
  const [expanded, setExpanded] = useState(() => new Set(employees.filter((person) => getDirectReports(person.id).length > 0).map((person) => person.id)))
  const root = employees.find((person) => person.managerId === null)
  if (!root) return <EmptyState message="The organization chart is unavailable." />
  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return <div className="subpage"><div className="subpage-heading"><div><span className="section-kicker">COMPANY DIRECTORY</span><h1>Organization chart.</h1><p>A view-only map of reporting relationships across Company, Inc.</p></div><span className="people-count-chip"><Icon name="people" size={16} />{employees.length} people</span></div><section className="panel company-chart-panel"><div className="panel-heading"><div><span className="section-kicker">ALL TEAMS</span><h2>Company, Inc.</h2></div><span className="scope-lock-label">Names & designations only</span></div><p className="org-help">This company-wide chart shows names and designations only. It does not include employee work details.</p><div className="company-chart-tree"><ChartNode person={root} expanded={expanded} onToggle={toggle} /></div></section></div>
}

function ChartNode({ person, expanded, onToggle }: { person: Employee; expanded: Set<string>; onToggle: (id: string) => void }) {
  const children = getDirectReports(person.id)
  const isExpanded = expanded.has(person.id)
  return <div className="chart-node"><div className="chart-person-row">{children.length > 0 ? <button type="button" className={`chart-toggle ${isExpanded ? 'expanded' : ''}`} aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${person.name}`} onClick={() => onToggle(person.id)}>{isExpanded ? '−' : '+'}</button> : <span className="chart-toggle-spacer" />}<div className="chart-person-card"><b>{person.name}</b><span>{person.title}</span></div></div>{isExpanded && children.length > 0 && <div className="chart-children">{children.map((child) => <ChartNode key={child.id} person={child} expanded={expanded} onToggle={onToggle} />)}</div>}</div>
}
