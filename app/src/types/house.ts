export type HouseRole = 'admin' | 'editor' | 'member' | 'viewer'

export interface House {
  id: string
  name: string
  invite_code: string
  role: HouseRole
}

export function canWrite(role: HouseRole | null | undefined) {
  return role === 'admin' || role === 'editor' || role === 'member'
}
