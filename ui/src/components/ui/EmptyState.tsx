import { Icon } from './Icon'

export function EmptyState({ message }: { message: string }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon name="spark" size={17} /></span><p>{message}</p></div>
}
