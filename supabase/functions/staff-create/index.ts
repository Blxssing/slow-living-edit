import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermission } from '../_shared/auth.ts'

const CreateStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
  role: z.enum(['CEO', 'HR', 'SALES']),
  bootstrap_secret: z.string().optional(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const parsed = CreateStaffSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorResponse('Invalid staff data', 400)
  }

  const { email, password, full_name, phone, role, bootstrap_secret } = parsed.data
  const supabase = getServiceRoleClient()

  const { data: existingStaff, error: countError } = await supabase
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })

  if (countError) {
    console.error('Failed to count staff:', countError)
    return errorResponse('Failed to verify staff state', 500)
  }

  const isFirstStaff = (existingStaff?.length ?? 0) === 0
  let actorId: string | null = null

  if (isFirstStaff) {
    const expectedSecret = Deno.env.get('STAFF_BOOTSTRAP_SECRET')
    if (!expectedSecret || bootstrap_secret !== expectedSecret) {
      return errorResponse('Invalid bootstrap secret', 401)
    }
    if (role !== 'CEO') {
      return errorResponse('First staff member must be CEO', 400)
    }
  } else {
    const user = await requirePermission(req, 'STAFF_MANAGE')
    if (!user) {
      return errorResponse('Unauthorized', 401)
    }
    actorId = user.id
  }

  const { data: authUser, error: signUpError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (signUpError || !authUser.user) {
    console.error('Create user error:', signUpError)
    return errorResponse(signUpError?.message || 'Failed to create user', 400)
  }

  const userId = authUser.user.id

  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    full_name,
    email,
    phone: phone || null,
    is_staff: true,
    status: 'ACTIVE',
  })

  if (profileError) {
    console.error('Create profile error:', profileError)
    await supabase.auth.admin.deleteUser(userId)
    return errorResponse('Failed to create profile', 500)
  }

  const { error: roleError } = await supabase.from('user_roles').insert({
    user_id: userId,
    role,
  })

  if (roleError) {
    console.error('Create role error:', roleError)
    await supabase.auth.admin.deleteUser(userId)
    return errorResponse('Failed to assign role', 500)
  }

  await supabase.from('audit_logs').insert({
    actor_id: actorId || userId,
    action: 'staff.create',
    target_id: userId,
    target_type: 'user',
    details: { role },
  })

  return jsonResponse({
    success: true,
    user_id: userId,
    email,
    role,
  })
})
