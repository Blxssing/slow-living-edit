import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requireCronAuth } from '../_shared/cron-auth.ts'
import { expireStaleReservations } from '../_shared/inventory.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)
  if (!requireCronAuth(req)) return errorResponse('Unauthorized', 401)

  const result = await expireStaleReservations(500)
  if (!result.ok) return errorResponse(result.message, result.status)

  return jsonResponse({ success: true, expired: result.data ?? 0 })
})
