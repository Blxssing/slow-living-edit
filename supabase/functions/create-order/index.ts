import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requireAuth } from '../_shared/auth.ts'

const CartItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100),
})

const CreateOrderSchema = z.object({
  items: z.array(CartItemSchema).min(1).max(50),
  shipping_address: z.object({
    full_name: z.string().min(1),
    phone: z.string().min(1),
    address_line_1: z.string().min(1),
    address_line_2: z.string().optional(),
    city: z.string().min(1),
    state_province: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().default('Kenya'),
  }),
  notes: z.string().max(1000).optional(),
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const user = await requireAuth(req)
  if (!user) {
    return errorResponse('Authentication required', 401)
  }

  const parsed = CreateOrderSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorResponse('Invalid order data', 400)
  }

  const { items, shipping_address, notes } = parsed.data
  const supabase = getServiceRoleClient()

  const variantIds = items.map((item) => item.variant_id)

  const { data: variants, error: variantError } = await supabase
    .from('product_variants')
    .select(
      `
      id,
      sku,
      option_1,
      option_2,
      option_3,
      price_adjustment,
      product_id,
      products!inner(id, name, slug, base_price, status)
    `
    )
    .in('id', variantIds)
    .eq('is_active', true)
    .eq('products.status', 'active')

  if (variantError || !variants || variants.length !== items.length) {
    return errorResponse('One or more products are unavailable', 400)
  }

  const variantMap = new Map(variants.map((v: any) => [v.id, v]))

  const { data: inventoryRows, error: inventoryError } = await supabase
    .from('inventory')
    .select('variant_id, quantity, reserved, sold')
    .in('variant_id', variantIds)

  if (inventoryError) {
    return errorResponse('Failed to check inventory', 500)
  }

  const inventoryMap = new Map((inventoryRows || []).map((i: any) => [i.variant_id, i]))

  for (const item of items) {
    const inv = inventoryMap.get(item.variant_id)
    if (!inv) {
      return errorResponse(`No inventory record for variant ${item.variant_id}`, 400)
    }
    const available = inv.quantity - inv.reserved - inv.sold
    if (available < item.quantity) {
      return errorResponse(`Insufficient stock for variant ${item.variant_id}`, 400)
    }
  }

  const reserved: string[] = []
  try {
    for (const item of items) {
      const { data: reservedSuccess, error: reserveError } = await supabase.rpc(
        'reserve_inventory',
        {
          _variant_id: item.variant_id,
          _qty: item.quantity,
        }
      )

      if (reserveError || !reservedSuccess) {
        throw new Error(`Failed to reserve inventory for variant ${item.variant_id}`)
      }
      reserved.push(item.variant_id)
    }
  } catch (err) {
    for (const variantId of reserved) {
      const item = items.find((i) => i.variant_id === variantId)
      if (item) {
        await supabase.rpc('release_inventory', {
          _variant_id: variantId,
          _qty: item.quantity,
        })
      }
    }
    return errorResponse('Failed to reserve inventory. Please try again.', 500)
  }

  const subtotal = items.reduce((sum, item) => {
    const variant = variantMap.get(item.variant_id)
    const unitPrice = (variant?.products?.base_price || 0) + (variant?.price_adjustment || 0)
    return sum + unitPrice * item.quantity
  }, 0)

  const shippingCost = 0
  const taxAmount = 0
  const discountAmount = 0
  const total = subtotal + shippingCost + taxAmount - discountAmount

  const { data: address, error: addressError } = await supabase
    .from('shipping_addresses')
    .insert({
      profile_id: user.id,
      ...shipping_address,
      is_default: true,
    })
    .select()
    .single()

  if (addressError || !address) {
    for (const item of items) {
      await supabase.rpc('release_inventory', {
        _variant_id: item.variant_id,
        _qty: item.quantity,
      })
    }
    return errorResponse('Failed to save shipping address', 500)
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_id: user.id,
      status: 'pending_payment',
      currency: 'KES',
      subtotal,
      shipping_cost: shippingCost,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total,
      shipping_address_id: address.id,
      notes,
    })
    .select()
    .single()

  if (orderError || !order) {
    await supabase.from('shipping_addresses').delete().eq('id', address.id)
    for (const item of items) {
      await supabase.rpc('release_inventory', {
        _variant_id: item.variant_id,
        _qty: item.quantity,
      })
    }
    return errorResponse('Failed to create order', 500)
  }

  const orderItems = items.map((item) => {
    const variant = variantMap.get(item.variant_id)
    const unitPrice = (variant?.products?.base_price || 0) + (variant?.price_adjustment || 0)
    const variantLabel = [variant?.option_1, variant?.option_2, variant?.option_3]
      .filter(Boolean)
      .join(' / ')

    return {
      order_id: order.id,
      product_id: variant?.products?.id,
      variant_id: variant?.id,
      product_name: variant?.products?.name || 'Unknown Product',
      variant_label: variantLabel || undefined,
      sku: variant?.sku,
      unit_price: unitPrice,
      quantity: item.quantity,
      total_price: unitPrice * item.quantity,
    }
  })

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems)

  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id)
    await supabase.from('shipping_addresses').delete().eq('id', address.id)
    for (const item of items) {
      await supabase.rpc('release_inventory', {
        _variant_id: item.variant_id,
        _qty: item.quantity,
      })
    }
    return errorResponse('Failed to create order items', 500)
  }

  await supabase.from('order_status_history').insert({
    order_id: order.id,
    status: 'pending_payment',
    actor_id: user.id,
    notes: 'Order created, awaiting payment',
  })

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      order_id: order.id,
      method: 'mpesa',
      amount: total,
      currency: 'KES',
      status: 'pending',
    })
    .select()
    .single()

  if (paymentError || !payment) {
    console.error('Payment record error:', paymentError)
  }

  return jsonResponse({
    order: {
      id: order.id,
      status: order.status,
      total: order.total,
      currency: order.currency,
    },
    payment: payment
      ? {
          id: payment.id,
          status: payment.status,
          amount: payment.amount,
        }
      : null,
  })
})
