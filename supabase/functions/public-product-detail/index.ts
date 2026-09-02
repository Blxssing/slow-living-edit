import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

const ParamsSchema = z.object({
  slug: z.string().min(1),
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  const slug = new URL(req.url).pathname.split('/').pop()
  const parsed = ParamsSchema.safeParse({ slug })
  if (!parsed.success) {
    return errorResponse('Invalid product slug', 400)
  }

  const supabase = getServiceRoleClient()

  const { data: product, error } = await supabase
    .from('products')
    .select(
      `
      id,
      name,
      slug,
      description,
      base_price,
      compare_at_price,
      weight_g,
      is_featured,
      created_at,
      categories(id, name, slug),
      product_images(url, alt_text, is_primary, sort_order),
      product_variants(id, sku, barcode, option_1, option_2, option_3, price_adjustment, weight_g, is_active)
    `
    )
    .eq('slug', parsed.data.slug)
    .eq('status', 'active')
    .single()

  if (error || !product) {
    return errorResponse('Product not found', 404)
  }

  const variantIds = (product.product_variants || [])
    .filter((v: any) => v.is_active)
    .map((v: any) => v.id)

  const { data: inventory } = await supabase
    .from('inventory')
    .select('variant_id, quantity, reserved, sold')
    .in('variant_id', variantIds.length > 0 ? variantIds : [])

  const inventoryMap = new Map((inventory || []).map((i: any) => [i.variant_id, i]))

  const variants = (product.product_variants || [])
    .filter((v: any) => v.is_active)
    .map((v: any) => {
      const inv = inventoryMap.get(v.id)
      return {
        ...v,
        available: inv ? inv.quantity - inv.reserved - inv.sold : 0,
      }
    })

  return jsonResponse({
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    base_price: product.base_price,
    compare_at_price: product.compare_at_price,
    weight_g: product.weight_g,
    is_featured: product.is_featured,
    category: product.categories,
    images: (product.product_images || []).sort((a: any, b: any) => {
      if (a.is_primary && !b.is_primary) return -1
      if (!a.is_primary && b.is_primary) return 1
      return a.sort_order - b.sort_order
    }),
    variants,
  })
})
