import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermissionOrResponse, getAuthContext } from '../_shared/auth.ts'
import { logSecurityEvent } from '../_shared/audit.ts'

const UpdateProfileSchema = z.object({
  action: z.literal('UPDATE_PROFILE'),
  user_id: z.string().uuid(),
  full_name: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).optional(),
})

const StatusSchema = z.object({
  action: z.literal('SET_STATUS'),
  user_id: z.string().uuid(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']),
})

const RoleSchema = z.object({
  action: z.literal('ASSIGN_ROLE'),
  user_id: z.string().uuid(),
  role: z.enum(['CEO', 'HR', 'SALES']),
})

const RevokeSchema = z.object({
  action: z.literal('REVOKE_ROLE'),
  user_id: z.string().uuid(),
  role: z.enum(['CEO', 'HR', 'SALES']),
})

const BodySchema = z.discriminatedUnion('action', [
  UpdateProfileSchema,
  StatusSchema,
  RoleSchema,
  RevokeSchema,
])

const PERMISSION_FOR: Record<string, string> = {
  UPDATE_PROFILE: 'STAFF_UPDATE',
  SET_STATUS: 'STAFF_SUSPEND',
  ASSIGN_ROLE: 'STAFF_ROLE_ASSIGN',
  REVOKE_ROLE: 'STAFF_ROLE_ASSIGN',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = getServiceRoleClient()

  // Staff directory listing
  if (req.method === 'GET') {
    const guard = await requirePermissionOrResponse(req, 'STAFF_VIEW')
    if ('response' in guard) return guard.response

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, status, last_login_at, created_at, user_roles(role)')
      .eq('is_staff', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('staff list failed')
      return errorResponse('Unable to load staff', 500)
    }
    return jsonResponse({ staff: data })
  }

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return errorResponse('Invalid request body', 422)
  const body = parsed.data

  const guard = await requirePermissionOrResponse(req, PERMISSION_FOR[body.action])
  if ('response' in guard) return guard.response
  const actor = guard.ctx

  // Resource-level authorization: target must exist and be a staff account.
  const { data: target } = await supabase
    .from('profiles')
    .select('id, status, is_staff')
    .eq('id', body.user_id)
    .maybeSingle()
  if (!target) return errorResponse('Not found', 404)

  // Self-service escalation is impossible, including for a CEO.
  if (actor.userId === body.user_id && body.action !== 'UPDATE_PROFILE') {
    return errorResponse('You cannot change your own role or account status', 403)
  }

  if (body.action === 'UPDATE_PROFILE') {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: body.full_name, phone: body.phone })
      .eq('id', body.user_id)
    if (error) return errorResponse('Unable to update profile', 500)
    await logSecurityEvent({
      action: 'STAFF_CREATED',
      actorId: actor.userId,
      recordId: body.user_id,
      tableName: 'profiles',
      details: { change: 'profile_updated' },
      request: req,
    })
    return jsonResponse({ success: true })
  }

  if (body.action === 'SET_STATUS') {
    const { error } = await supabase
      .from('profiles')
      .update({ status: body.status })
      .eq('id', body.user_id)
    if (error) return errorResponse('Unable to update status', 500)
    await logSecurityEvent({
      action: body.status === 'ACTIVE' ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_SUSPENDED',
      actorId: actor.userId,
      recordId: body.user_id,
      tableName: 'profiles',
      details: { status: body.status },
      request: req,
    })
    return jsonResponse({ success: true, status: body.status })
  }

  if (body.action === 'ASSIGN_ROLE') {
    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: body.user_id, role: body.role }, { onConflict: 'user_id,role' })
    if (error) return errorResponse('Unable to assign role', 500)
    await supabase.from('profiles').update({ is_staff: true }).eq('id', body.user_id)
    return jsonResponse({ success: true, role: body.role })
  }

  // REVOKE_ROLE
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', body.user_id)
    .eq('role', body.role)
  if (error) return errorResponse('Unable to revoke role', 500)
  return jsonResponse({ success: true })
})
