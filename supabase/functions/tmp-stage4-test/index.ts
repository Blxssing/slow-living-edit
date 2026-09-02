import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

const GUARD = 'stage4-catalog-verification-4b1e77c2'
const PASSWORD = 'Stage4-Test-Passw0rd!x'
const USERS = [
  { email: 'ceo.s4@miabella.test', role: 'CEO' },
  { email: 'hr.s4@miabella.test', role: 'HR' },
  { email: 'sales.s4@miabella.test', role: 'SALES' },
  { email: 'customer.s4@miabella.test', role: null },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const body = await req.json().catch(() => ({}))
  if (body.guard !== GUARD) return errorResponse('Not found', 404)
  const s = getServiceRoleClient()

  if (body.mode === 'create') {
    const out: Record<string, string> = {}
    for (const u of USERS) {
      const { data, error } = await s.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
      })
      if (error || !data.user) return errorResponse(`create failed: ${error?.message}`, 500)
      const id = data.user.id
      out[u.role ?? 'CUSTOMER'] = id
      await s.from('profiles').upsert({
        id,
        email: u.email,
        full_name: u.email,
        is_staff: Boolean(u.role),
        status: 'ACTIVE',
      })
      if (u.role) await s.from('user_roles').insert({ user_id: id, role: u.role })
    }
    return jsonResponse({ users: out })
  }

  if (body.mode === 'cleanup') {
    const { data } = await s.auth.admin.listUsers({ perPage: 200 })
    for (const u of data.users) {
      if (u.email?.endsWith('.s4@miabella.test')) {
        await s.from('user_roles').delete().eq('user_id', u.id)
        await s.from('profiles').delete().eq('id', u.id)
        await s.auth.admin.deleteUser(u.id)
      }
    }
    return jsonResponse({ cleaned: true })
  }

  return errorResponse('Unknown mode', 400)
})
