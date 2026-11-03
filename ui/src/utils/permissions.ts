import type { UserPublic } from '../types/auth'

export function userHasPermission(user: UserPublic | null | undefined, permission: string) {
  if (!user?.permissions?.length) return false
  return user.permissions.includes(permission)
}
