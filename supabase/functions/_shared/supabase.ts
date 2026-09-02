import { createClient } from 'npm:@supabase/supabase-js@2'

export function getServiceRoleClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error('Missing Supabase service role configuration')
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function getAnonClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')

  if (!url || !key) {
    throw new Error('Missing Supabase anon configuration')
  }

  return createClient(url, key)
}
