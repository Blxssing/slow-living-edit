import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermission } from '../_shared/auth.ts'

const QuerySchema = z.object({
  status: z.enum(['pending_payment', 'paid', 'payment_failed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).default('newest'),
})

function sortClause(sort: string) {
  switch (sort) {
    case 'oldest':
      return { column: 'created_at', ascending: true }
    case 'total_desc':
      return { column: 'total', ascending: false }
    case 'total_asc':
      return { column: 'total', ascending: true }
    case 'newest':
    default:
      return { column: 'created_at', ascending: false }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  const user = await requirePermission(req, 'ORDER_VIEW')
  if (!user) {
    return errorResponse('Unauthorized', 401)
  }

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) {
    return errorResponse('Invalid query parameters', 400)
  }

  const { status, page, limit, sort } = parsed.data
  const offset = (page - 1) * limit
  const order = sortClause(sort)

  const supabase = getServiceRoleClient()

  let query = supabase
    .from('orders')
    .select(
      `
      id,
      order_number,
      status,
      payment_status,
      currency,
      subtotal,
      shipping_cost,
      tax_amount,
      discount_amount,
      total,
      notes,
      guest_email,
      guest_phone,
      created_at,
      updated_at,
      customer:customer_ref(id, full_name, email, phone),
      items:order_items(id, product_name, variant_label, quantity, unit_price, total_price)
    `,
      { count: 'exact' }
    )
    .order(order.column, { ascending: order.ascending })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('List orders error:', error)
    return errorResponse('Failed to fetch orders', 500)
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
