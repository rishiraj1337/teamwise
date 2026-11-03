import { Avatar } from '../../components/ui/Avatar'
import { Icon } from '../../components/ui/Icon'
import { getEmployee } from '../../utils/organization'
import type { Task } from '../../types/workspace'

export function TaskRow({ task }: { task: Task }) {
  const owner = getEmployee(task.ownerId)
  return <div className="task-row"><span className={`task-checkbox ${task.status === 'Done' ? 'checked' : ''}`}>{task.status === 'Done' && <Icon name="check" size={12} />}</span><span className="task-row-title"><b>{task.title}</b><small>{task.project} <span>·</span> {task.id}</small></span>{owner && <span className="task-owner"><Avatar person={owner} size="small" /></span>}<span className={`priority-text priority-${task.priority.toLowerCase()}`}>{task.priority}</span><span className={`task-due ${task.due === 'Today' || task.due === 'Overdue' ? 'due-soon' : ''}`}>{task.due}</span></div>
}
