import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getAuthContext } from '../_shared/auth.ts'
import { logSecurityEvent } from '../_shared/audit.ts'

/**
 * Called immediately after a successful sign-in.
 * Authoritative source for role + permissions + account status.
 * Records last_login and the LOGIN_SUCCESS audit event server-side.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const ctx = await getAuthContext(req)
  if (!ctx) return errorResponse('Authentication required', 401)

  const supabase = getServiceRoleClient()

  // Ensure a profile record exists for this identity (staff are provisioned
  // with one; this keeps customer identities consistent too).
  if (ctx.status === null) {
    await supabase.from('profiles').insert({
      id: ctx.userId,
      email: ctx.email,
      is_staff: false,
      status: 'ACTIVE',
    })
    ctx.status = 'ACTIVE'
  }

  if (ctx.status !== 'ACTIVE') {
    await logSecurityEvent({
      action: 'ACCESS_DENIED',
      actorId: ctx.userId,
      details: { reason: 'account_not_active', status: ctx.status },
      request: req,
    })
    return errorResponse('Account is not active', 403)
  }

  await supabase
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', ctx.userId)

  await logSecurityEvent({
    action: 'LOGIN_SUCCESS',
    actorId: ctx.userId,
    details: { roles: ctx.roles, staff: ctx.roles.length > 0 },
    request: req,
  })

  return jsonResponse({
    user_id: ctx.userId,
    email: ctx.email,
    is_staff: ctx.roles.length > 0,
    status: ctx.status,
    roles: ctx.roles,
    permissions: ctx.permissions,
  })
})
