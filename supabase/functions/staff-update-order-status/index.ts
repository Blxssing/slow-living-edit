import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermission } from '../_shared/auth.ts'

const UpdateSchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(['paid', 'payment_failed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
  notes: z.string().max(1000).optional(),
})

const validTransitions: Record<string, string[]> = {
  pending_payment: ['paid', 'payment_failed', 'cancelled'],
  paid: ['processing', 'cancelled', 'refunded'],
  payment_failed: ['pending_payment', 'cancelled'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const user = await requirePermission(req, 'ORDER_UPDATE_STATUS')
  if (!user) {
    return errorResponse('Unauthorized', 401)
  }

  const parsed = UpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorResponse('Invalid update data', 400)
  }

  const { order_id, status, notes } = parsed.data
  const supabase = getServiceRoleClient()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', order_id)
    .single()

  if (orderError || !order) {
    return errorResponse('Order not found', 404)
  }

  const allowed = validTransitions[order.status]
  if (!allowed.includes(status)) {
    return errorResponse(`Cannot transition from ${order.status} to ${status}`, 400)
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', order_id)

  if (updateError) {
    console.error('Update order status error:', updateError)
    return errorResponse('Failed to update order status', 500)
  }

  await supabase.from('order_status_history').insert({
    order_id,
    status,
    actor_id: user.id,
    notes: notes || `Status changed to ${status}`,
  })

  if (status === 'cancelled') {
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('variant_id, quantity')
      .eq('order_id', order_id)

    for (const item of orderItems || []) {
      await supabase.rpc('release_inventory', {
        _variant_id: item.variant_id,
        _qty: item.quantity,
      })
    }
  }

  return jsonResponse({
    success: true,
    order_id,
    status,
  })
})
