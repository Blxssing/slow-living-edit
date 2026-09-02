import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

// TEMPORARY: provisions throwaway RBAC test identities. Deleted after Stage 3 testing.
const GUARD = 'stage3-rbac-verification-9f3c1a7d'

const ACCOUNTS = [
  { email: 'ceo.test@miabella.test', role: 'CEO' },
  { email: 'hr.test@miabella.test', role: 'HR' },
  { email: 'sales.test@miabella.test', role: 'SALES' },
  { email: 'customer.test@miabella.test', role: null },
] as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const body = await req.json().catch(() => ({}))
  if (body.guard !== GUARD) return errorResponse('Not found', 404)

  const supabase = getServiceRoleClient()
  const password = body.password as string
  const out: Record<string, string> = {}

  if (body.mode === 'cleanup') {
    for (const a of ACCOUNTS) {
      const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
      const u = data.users.find((x) => x.email === a.email)
      if (u) {
        await supabase.from('user_roles').delete().eq('user_id', u.id)
        await supabase.from('profiles').delete().eq('id', u.id)
        await supabase.auth.admin.deleteUser(u.id)
      }
    }
    return jsonResponse({ cleaned: true })
  }

  if (body.mode === 'suspend') {
    await supabase.from('profiles').update({ status: 'SUSPENDED' }).eq('email', body.email)
    return jsonResponse({ suspended: body.email })
  }

  for (const a of ACCOUNTS) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: a.email,
      password,
      email_confirm: true,
    })
    if (error || !created.user) {
      out[a.email] = `error: ${error?.message}`
      continue
    }
    await supabase.from('profiles').insert({
      id: created.user.id,
      email: a.email,
      full_name: a.email,
      is_staff: a.role !== null,
      status: 'ACTIVE',
    })
    if (a.role) {
      await supabase.from('user_roles').insert({ user_id: created.user.id, role: a.role })
    }
    out[a.email] = created.user.id
  }

  return jsonResponse({ created: out })
})
