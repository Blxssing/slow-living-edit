import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { errorResponse, jsonResponse } from '../_shared/response.ts'

/**
 * Housekeeping only: promotes due SCHEDULED offers and marks finished ones
 * EXPIRED so reporting/UI stays tidy. Business logic never depends on this —
 * every read path re-validates the offer window against the current time.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const secret = Deno.env.get('LOVABLE_CRON_SECRET')
  const provided = req.headers.get('x-cron-secret')
  if (!secret || provided !== secret) return errorResponse('Unauthorized', 401)

  const service = getServiceRoleClient()
  const { data, error } = await service.rpc('sync_offer_statuses')
  if (error) return errorResponse('Sync failed', 500)

  const row = Array.isArray(data) ? data[0] : data
  return jsonResponse({ activated: row?.activated ?? 0, expired: row?.expired ?? 0 })
})
