import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getAuthContext } from '../_shared/auth.ts'
import { logSecurityEvent, isThrottled, maskEmail } from '../_shared/audit.ts'

const Schema = z.object({
  event: z.enum(['LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_CHANGED']),
  email: z.string().email().max(255).optional(),
})

/**
 * Records unauthenticated-side security events (failed logins, reset requests)
 * and answers throttle questions. It never confirms whether an account exists.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) return errorResponse('Invalid request body', 400)

  const { event, email } = parsed.data
  const hint = email ? maskEmail(email) : null
  const ctx = await getAuthContext(req)

  await logSecurityEvent({
    action: event,
    actorId: ctx?.userId ?? null,
    details: hint ? { email_hint: hint } : {},
    request: req,
  })

  const throttled = hint && event === 'LOGIN_FAILURE' ? await isThrottled(hint) : false

  // Deliberately uniform response — reveals nothing about account existence.
  return jsonResponse({ recorded: true, throttled })
})
