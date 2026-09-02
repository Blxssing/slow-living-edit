import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermissionOrResponse } from '../_shared/auth.ts'

const QuerySchema = z.object({ order_id: z.string().uuid() })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  const guard = await requirePermissionOrResponse(req, 'ORDER_VIEW')
  if ('response' in guard) return guard.response

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return errorResponse('A valid order_id is required', 400)

  const supabase = getServiceRoleClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      `
      id, order_number, status, payment_status, currency, subtotal, shipping_cost,
      tax_amount, discount_amount, total, notes, guest_email, guest_phone,
      created_at, updated_at, placed_at,
      customer:customer_ref(id, full_name, email, phone),
      address:delivery_address_id(recipient_name, phone, address_line_1, address_line_2, city, county, country),
      items:order_items(id, product_name, variant_label, sku, quantity, unit_price, total_price, variant_id),
      history:order_status_history(id, status, notes, created_at, actor_id),
      payments(id, provider, method, amount, status, result_desc, external_transaction_id, paid_at, created_at)
    `,
    )
    .eq('id', parsed.data.order_id)
    .maybeSingle()

  if (error) {
    console.error('order detail error', error.message)
    return errorResponse('Failed to load order', 500)
  }
  if (!order) return errorResponse('Order not found', 404)

  return jsonResponse({ order })
})
