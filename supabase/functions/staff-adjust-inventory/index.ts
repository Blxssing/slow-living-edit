import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requireRole } from '../_shared/auth.ts'

const AdjustSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.coerce.number().int(),
  reason: z.string().min(1).max(500),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const user = (await requireRole(req, 'CEO')) || (await requireRole(req, 'SALES PEOPLE'))
  if (!user) {
    return errorResponse('Unauthorized', 401)
  }

  const parsed = AdjustSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorResponse('Invalid inventory adjustment data', 400)
  }

  const { variant_id, quantity, reason } = parsed.data
  const supabase = getServiceRoleClient()

  const { data: existing, error: fetchError } = await supabase
    .from('inventory')
    .select('id, quantity, reserved, sold')
    .eq('variant_id', variant_id)
    .single()

  if (fetchError || !existing) {
    return errorResponse('Inventory record not found', 404)
  }

  const newQuantity = existing.quantity + quantity
  if (newQuantity < existing.reserved + existing.sold) {
    return errorResponse('Adjustment would drop available stock below reserved/sold levels', 400)
  }

  const { error: updateError } = await supabase
    .from('inventory')
    .update({ quantity: newQuantity })
    .eq('id', existing.id)

  if (updateError) {
    console.error('Inventory adjustment error:', updateError)
    return errorResponse('Failed to adjust inventory', 500)
  }

  await supabase.from('audit_logs').insert({
    actor_id: user.id,
    action: 'inventory_adjustment',
    table_name: 'inventory',
    record_id: existing.id,
    old_values: { quantity: existing.quantity, reserved: existing.reserved, sold: existing.sold },
    new_values: { quantity: newQuantity, reason },
  })

  return jsonResponse({
    success: true,
    variant_id,
    previous_quantity: existing.quantity,
    new_quantity: newQuantity,
  })
})
