import { getServiceRoleClient } from './supabase.ts'
import { errorResponse } from './response.ts'

export type StaffRole = 'CEO' | 'HR' | 'SALES'

export interface AuthContext {
  userId: string
  email: string | null
  roles: StaffRole[]
  permissions: string[]
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | null
  isStaff: boolean
}

/**
 * authenticate() -> getCurrentUser() -> getUserRole() -> resolvePermissions()
 *
 * Single source of truth for identity. Never trusts anything in the request
 * body — identity comes only from the verified bearer token.
 */
export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  const userId = data.user.id

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from('profiles').select('status, is_staff').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ])

  const roles = ((roleRows ?? []) as { role: StaffRole }[]).map((r) => r.role)
  let permissions: string[] = []

  if (roles.length > 0 && profile?.status === 'ACTIVE') {
    const { data: perms } = await supabase
      .from('role_permissions')
      .select('permissions(key)')
      .in('role', roles)
    permissions = [
      ...new Set(
        ((perms ?? []) as { permissions: { key: string } | null }[])
          .map((p) => p.permissions?.key)
          .filter((k): k is string => Boolean(k)),
      ),
    ]
  }

  return {
    userId,
    email: data.user.email ?? null,
    roles,
    permissions,
    status: (profile?.status as AuthContext['status']) ?? null,
    isStaff: Boolean(profile?.is_staff),
  }
}

/** 401 unauthenticated / 403 suspended-or-forbidden, never leaks internals. */
export async function requirePermissionOrResponse(
  request: Request,
  permission: string,
): Promise<{ ctx: AuthContext } | { response: Response }> {
  const ctx = await getAuthContext(request)
  if (!ctx) return { response: errorResponse('Authentication required', 401) }
  if (ctx.status !== 'ACTIVE') return { response: errorResponse('Account is not active', 403) }
  if (!ctx.permissions.includes(permission)) {
    return { response: errorResponse('Insufficient permissions', 403) }
  }
  return { ctx }
}

export async function requireStaffOrResponse(
  request: Request,
): Promise<{ ctx: AuthContext } | { response: Response }> {
  const ctx = await getAuthContext(request)
  if (!ctx) return { response: errorResponse('Authentication required', 401) }
  if (ctx.status !== 'ACTIVE' || ctx.roles.length === 0) {
    return { response: errorResponse('Staff access denied', 403) }
  }
  return { ctx }
}

/* ------------------------------------------------------------------ *
 * Legacy helpers (return user-like object or null). Status enforcement
 * is guaranteed inside the has_permission()/has_role() SQL functions.
 * ------------------------------------------------------------------ */

export async function requireAuth(request: Request) {
  const ctx = await getAuthContext(request)
  return ctx ? { id: ctx.userId, email: ctx.email } : null
}

export async function requirePermission(request: Request, permission: string) {
  const ctx = await getAuthContext(request)
  if (!ctx || ctx.status !== 'ACTIVE') return null
  return ctx.permissions.includes(permission) ? { id: ctx.userId, email: ctx.email } : null
}

export async function requireAllPermissions(request: Request, permissions: string[]) {
  const ctx = await getAuthContext(request)
  if (!ctx || ctx.status !== 'ACTIVE') return null
  return permissions.every((p) => ctx.permissions.includes(p))
    ? { id: ctx.userId, email: ctx.email }
    : null
}

export async function requireRole(request: Request, role: StaffRole) {
  const ctx = await getAuthContext(request)
  if (!ctx || ctx.status !== 'ACTIVE') return null
  return ctx.roles.includes(role) ? { id: ctx.userId, email: ctx.email } : null
}

export async function requireAnyStaffRole(request: Request) {
  const ctx = await getAuthContext(request)
  if (!ctx || ctx.status !== 'ACTIVE' || ctx.roles.length === 0) return null
  return { id: ctx.userId, email: ctx.email }
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const supabase = getServiceRoleClient()
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId)
  return (data || []).map((r: { role: string }) => r.role)
}
