import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requireAuth } from '../_shared/auth.ts'

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  const user = await requireAuth(req)
  if (!user) {
    return errorResponse('Authentication required', 401)
  }

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) {
    return errorResponse('Invalid query parameters', 400)
  }

  const { page, limit } = parsed.data
  const offset = (page - 1) * limit

  const supabase = getServiceRoleClient()

  const { data, error, count } = await supabase
    .from('orders')
    .select(
      `
      id,
      status,
      currency,
      subtotal,
      shipping_cost,
      tax_amount,
      discount_amount,
      total,
      notes,
      created_at,
      updated_at,
      order_items(id, product_name, variant_label, sku, unit_price, quantity, total_price),
      payments(id, method, amount, status, external_transaction_id)
    `,
      { count: 'exact' }
    )
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Order history error:', error)
    return errorResponse('Failed to fetch order history', 500)
  }

  return jsonResponse({
    orders: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  })
})
