import { getServiceRoleClient } from './supabase.ts'

export type StaffRole = 'CEO' | 'HR' | 'SALES'

export async function requireAuth(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.replace('Bearer ', '')
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return null
  }

  return data.user
}

/**
 * Permission-based authorization. This is the only check business logic should
 * use — role names must never be hard-coded at the call site.
 */
export async function requirePermission(request: Request, permission: string) {
  const user = await requireAuth(request)
  if (!user) {
    return null
  }

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.rpc('has_permission', {
    _user_id: user.id,
    _permission_key: permission,
  })

  if (error) {
    console.error('Permission check failed:', error.message)
    return null
  }

  return data === true ? user : null
}

export async function requireAllPermissions(request: Request, permissions: string[]) {
  const user = await requireAuth(request)
  if (!user) {
    return null
  }

  const supabase = getServiceRoleClient()
  for (const permission of permissions) {
    const { data, error } = await supabase.rpc('has_permission', {
      _user_id: user.id,
      _permission_key: permission,
    })
    if (error || data !== true) {
      return null
    }
  }

  return user
}

export async function requireRole(request: Request, role: StaffRole) {
  const user = await requireAuth(request)
  if (!user) {
    return null
  }

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', role)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return user
}

export async function requireAnyStaffRole(request: Request) {
  const user = await requireAuth(request)
  if (!user) {
    return null
  }

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  if (error || !data || data.length === 0) {
    return null
  }

  return user
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const supabase = getServiceRoleClient()
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId)
  return (data || []).map((r: { role: string }) => r.role)
}
