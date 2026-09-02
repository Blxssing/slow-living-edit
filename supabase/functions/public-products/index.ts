import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

const QuerySchema = z.object({
  category_slug: z.string().optional(),
  search: z.string().optional(),
  featured: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name_asc']).default('newest'),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) {
    return errorResponse('Invalid query parameters', 400)
  }

  const { category_slug, search, featured, page, limit, sort } = parsed.data
  const offset = (page - 1) * limit

  const supabase = getServiceRoleClient()

  let query = supabase
    .from('products')
    .select(
      `
      id,
      name,
      slug,
      description,
      base_price,
      compare_at_price,
      is_featured,
      created_at,
      categories!inner(id, name, slug),
      product_images(url, alt_text, is_primary, sort_order),
      product_variants(id, sku, option_1, option_2, option_3, price_adjustment, is_active)
    `,
      { count: 'exact' }
    )
    .eq('status', 'active')
    .eq('product_variants.is_active', true)
    .order('is_primary', { foreignTable: 'product_images', ascending: false })
    .order('sort_order', { foreignTable: 'product_images', ascending: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category_slug) {
    query = query.eq('categories.slug', category_slug)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
  }

  if (featured === 'true') {
    query = query.eq('is_featured', true)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Product list error:', error)
    return errorResponse('Failed to fetch products', 500)
  }

  const products = (data || []).map((product: any) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    base_price: product.base_price,
    compare_at_price: product.compare_at_price,
    is_featured: product.is_featured,
    category: product.categories,
    images: product.product_images || [],
    variants: product.product_variants || [],
  }))

  return jsonResponse({
    products,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  })
})
