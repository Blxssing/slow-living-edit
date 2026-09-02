import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermission } from '../_shared/auth.ts'

const AdjustSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.coerce.number().int(),
  movement_type: z
    .enum(['STOCK_IN', 'RESTOCK', 'ADJUSTMENT', 'DAMAGE', 'RETURN'])
    .default('ADJUSTMENT'),
  reason: z.string().min(1).max(500),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const user = await requirePermission(req, 'INVENTORY_ADJUST')
  if (!user) {
    return errorResponse('Unauthorized', 401)
  }

  const parsed = AdjustSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorResponse('Invalid inventory adjustment data', 400)
  }

  const { variant_id, quantity, movement_type, reason } = parsed.data
  const supabase = getServiceRoleClient()

  // Atomic, ledger-logged adjustment: refuses to drop stock below reserved + sold.
  const { data: applied, error: rpcError } = await supabase.rpc('adjust_inventory', {
    _variant_id: variant_id,
    _delta: quantity,
    _movement_type: movement_type,
    _reason: reason,
    _actor_id: user.id,
  })

  if (rpcError) {
    console.error('Inventory adjustment error:', rpcError.message)
    return errorResponse('Failed to adjust inventory', 500)
  }

  if (applied !== true) {
    return errorResponse(
      'Adjustment rejected: it would take stock below reserved or sold levels',
      400
    )
  }

  const { data: current } = await supabase
    .from('inventory')
    .select('id, quantity, reserved, sold')
    .eq('variant_id', variant_id)
    .single()

  await supabase.from('audit_logs').insert({
    actor_id: user.id,
    action: 'inventory_adjustment',
    table_name: 'inventory',
    record_id: current?.id ?? null,
    old_values: { delta: quantity },
    new_values: { movement_type, reason, quantity_after: current?.quantity ?? null },
  })

  return jsonResponse({
    success: true,
    variant_id,
    movement_type,
    new_quantity: current?.quantity ?? null,
    available: current ? current.quantity - current.reserved - current.sold : null,
  })
})
