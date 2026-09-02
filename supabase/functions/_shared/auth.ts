import { getServiceRoleClient } from './supabase.ts'

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

export async function requireRole(request: Request, role: 'CEO' | 'HR' | 'SALES PEOPLE') {
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
    .single()

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
    .in('role', ['CEO', 'HR', 'SALES PEOPLE'])

  if (error || !data || data.length === 0) {
    return null
  }

  return user
}
