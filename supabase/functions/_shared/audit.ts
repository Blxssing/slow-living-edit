import { getServiceRoleClient } from './supabase.ts'

export type SecurityAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_CHANGED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REACTIVATED'
  | 'STAFF_CREATED'
  | 'ROLE_ASSIGNED'
  | 'ACCESS_DENIED'

const SECRET_KEYS = /pass|token|secret|key|authorization|otp/i

function scrub(details: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(details)) {
    if (SECRET_KEYS.test(k)) continue
    clean[k] = v
  }
  return clean
}

/** Append-only security event log. Never writes credentials or tokens. */
export async function logSecurityEvent(opts: {
  action: SecurityAction
  actorId?: string | null
  recordId?: string | null
  tableName?: string
  details?: Record<string, unknown>
  request?: Request
}) {
  const supabase = getServiceRoleClient()
  const ip =
    opts.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  try {
    await supabase.from('audit_logs').insert({
      actor_id: opts.actorId ?? null,
      action: opts.action,
      table_name: opts.tableName ?? 'auth',
      record_id: opts.recordId ?? null,
      new_values: opts.details ? scrub(opts.details) : null,
      ip_address: ip,
      user_agent: opts.request?.headers.get('user-agent')?.slice(0, 500) ?? null,
    })
  } catch (_e) {
    console.error('audit write failed')
  }
}

/**
 * Soft throttle: counts recent failed logins for an email identifier.
 * Never hard-locks an account (that would let anyone lock out a colleague);
 * it only slows repeated failures from the same identifier.
 */
export async function isThrottled(emailKey: string, windowMinutes = 15, maxFailures = 8) {
  const supabase = getServiceRoleClient()
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  const { count } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', 'LOGIN_FAILURE')
    .eq('table_name', 'auth')
    .gte('created_at', since)
    .contains('new_values', { email_hint: emailKey })
  return (count ?? 0) >= maxFailures
}

/** Only ever store a masked hint of an email, never the full credential set. */
export function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!domain) return '***'
  return `${name.slice(0, 2)}***@${domain}`
}
