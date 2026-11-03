import { initialsFromName } from '../../utils/user'

export type AvatarPerson = {
  name: string
  initials?: string
  color: string
}

export function Avatar({ person, size = 'normal' }: { person: AvatarPerson; size?: 'small' | 'normal' | 'large' }) {
  return <span className={`avatar avatar-${person.color} avatar-${size}`}>{person.initials || initialsFromName(person.name)}</span>
}
