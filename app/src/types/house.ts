export type HouseRole = 'owner' | 'admin' | 'editor' | 'member' | 'viewer'

export interface House {
  id: string
  name: string
  invite_code: string
  role: HouseRole
}

export const ROLE_LABELS: Record<HouseRole, string> = {
  owner: 'Proprietário',
  admin: 'Admin',
  editor: 'Editor',
  member: 'Membro',
  viewer: 'Visitante',
}

export const ROLE_COLORS: Record<HouseRole, string> = {
  owner: 'text-gold',
  admin: 'text-accent',
  editor: 'text-blue',
  member: 'text-sage',
  viewer: 'text-muted',
}

/** Pode criar/editar dados da Casa (funcionários, folha, feriados etc). */
export function canWrite(role: HouseRole | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'editor' || role === 'member'
}

/** Proprietário e Admin: gerenciam membros, convite, configurações da Casa e podem excluir dados. */
export function isAdminOrOwner(role: HouseRole | null | undefined) {
  return role === 'owner' || role === 'admin'
}

/** Só o Proprietário: dono original da Casa, único por Casa. Pode excluir a Casa e transferir a propriedade. */
export function isOwner(role: HouseRole | null | undefined) {
  return role === 'owner'
}
