import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getUserClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermissionOrResponse, getAuthContext } from '../_shared/auth.ts'
import {
  safeText,
  SlugSchema,
  SkuSchema,
  MoneySchema,
  CurrencySchema,
  StatusSchema,
  PRODUCT_SORTS,
  PaginationSchema,
  escapeFilter,
  firstIssue,
  slugify,
} from '../_shared/catalog.ts'

const STAFF_FIELDS =
  'id, name, slug, description, brand, sku, category_id, base_price, compare_at_price, currency, status, is_featured, weight_g, meta_title, meta_description, version, created_at, updated_at, created_by, updated_by'

const ListSchema = PaginationSchema.extend({
  search: z.string().max(120).optional(),
  category_id: z.string().uuid().optional(),
  status: StatusSchema.optional(),
  brand: z.string().max(120).optional(),
  min_price: z.coerce.number().min(0).optional(),
  max_price: z.coerce.number().min(0).optional(),
  sort: z.enum(Object.keys(PRODUCT_SORTS) as [string, ...string[]]).default('newest'),
  id: z.string().uuid().optional(),
})

const BaseProduct = {
  name: safeText(255),
  slug: SlugSchema.optional(),
  description: safeText(5000).optional().nullable(),
  brand: safeText(120).optional().nullable(),
  sku: SkuSchema.optional().nullable(),
  category_id: z.string().uuid().nullable().optional(),
  base_price: MoneySchema,
  compare_at_price: MoneySchema.optional().nullable(),
  currency: CurrencySchema,
  status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
  is_featured: z.boolean().default(false),
  weight_g: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  meta_title: safeText(255).optional().nullable(),
  meta_description: safeText(500).optional().nullable(),
}

const CreateSchema = z.object({ action: z.literal('CREATE') }).extend(BaseProduct)

const UpdateSchema = z.object({
  id: z.string().uuid(),
  expected_version: z.coerce.number().int().min(1),
  name: BaseProduct.name.optional(),
  slug: SlugSchema.optional(),
  description: BaseProduct.description,
  brand: BaseProduct.brand,
  sku: BaseProduct.sku,
  category_id: BaseProduct.category_id,
  base_price: MoneySchema.optional(),
  compare_at_price: BaseProduct.compare_at_price,
  status: z.enum(['DRAFT', 'ACTIVE']).optional(),
  is_featured: z.boolean().optional(),
  weight_g: BaseProduct.weight_g,
  meta_title: BaseProduct.meta_title,
  meta_description: BaseProduct.meta_description,
})

const TransitionSchema = z.object({
  action: z.enum(['ARCHIVE', 'RESTORE']),
  id: z.string().uuid(),
  restore_to: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    /* ---------------- LIST / DETAIL (PRODUCT_VIEW) ---------------- */
    if (req.method === 'GET') {
      const guard = await requirePermissionOrResponse(req, 'PRODUCT_VIEW')
      if ('response' in guard) return guard.response
      const parsed = ListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const q = parsed.data
      const supabase = getUserClient(req)

      if (q.id) {
        const { data, error } = await supabase
          .from('products')
          .select(`${STAFF_FIELDS}, categories(id, name, slug, status), product_images(id, url, alt_text, sort_order, is_primary)`)
          .eq('id', q.id)
          .maybeSingle()
        if (error) return errorResponse('Failed to load product', 500)
        if (!data) return errorResponse('Product not found', 404)
        return jsonResponse({ product: data })
      }

      const sort = PRODUCT_SORTS[q.sort]
      const from = (q.page - 1) * q.page_size
      let query = supabase
        .from('products')
        .select(`${STAFF_FIELDS}, categories(id, name, slug)`, { count: 'exact' })
        .order(sort.column, { ascending: sort.ascending })
        .range(from, from + q.page_size - 1)

      if (q.status) query = query.eq('status', q.status)
      if (q.category_id) query = query.eq('category_id', q.category_id)
      if (q.brand) query = query.ilike('brand', `%${escapeFilter(q.brand)}%`)
      if (q.min_price !== undefined) query = query.gte('base_price', q.min_price)
      if (q.max_price !== undefined) query = query.lte('base_price', q.max_price)
      if (q.search) {
        const s = escapeFilter(q.search)
        query = query.or(`name.ilike.%${s}%,sku.ilike.%${s}%,brand.ilike.%${s}%,slug.ilike.%${s}%`)
      }

      const { data, error, count } = await query
      if (error) {
        console.error('product list failed', error.message)
        return errorResponse('Failed to load products', 500)
      }
      return jsonResponse({
        products: data ?? [],
        pagination: {
          page: q.page,
          page_size: q.page_size,
          total: count ?? 0,
          total_pages: Math.ceil((count ?? 0) / q.page_size),
        },
      })
    }

    /* ---------------- CREATE / ARCHIVE / RESTORE ---------------- */
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== 'object') return errorResponse('Invalid request body', 400)
      const action = (body as { action?: string }).action ?? 'CREATE'

      if (action === 'ARCHIVE' || action === 'RESTORE') {
        const guard = await requirePermissionOrResponse(req, 'PRODUCT_ARCHIVE')
        if ('response' in guard) return guard.response
        const parsed = TransitionSchema.safeParse(body)
        if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
        const supabase = getUserClient(req)

        const { data: existing } = await supabase
          .from('products')
          .select('id, status')
          .eq('id', parsed.data.id)
          .maybeSingle()
        if (!existing) return errorResponse('Product not found', 404)

        const next = action === 'ARCHIVE' ? 'ARCHIVED' : parsed.data.restore_to
        if (existing.status === next) return jsonResponse({ product: existing, unchanged: true })

        const { data, error } = await supabase
          .from('products')
          .update({ status: next })
          .eq('id', parsed.data.id)
          .select(STAFF_FIELDS)
          .maybeSingle()
        if (error || !data) {
          console.error('product transition failed', error?.message)
          return errorResponse('Failed to change product status', 403)
        }
        return jsonResponse({ product: data })
      }

      const guard = await requirePermissionOrResponse(req, 'PRODUCT_CREATE')
      if ('response' in guard) return guard.response
      const parsed = CreateSchema.safeParse({ ...body, action: 'CREATE' })
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const supabase = getUserClient(req)
      const { action: _a, ...input } = parsed.data

      if (input.category_id) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id, status')
          .eq('id', input.category_id)
          .maybeSingle()
        if (!cat) return errorResponse('Category does not exist', 400)
        if (cat.status === 'ARCHIVED') return errorResponse('Category is archived', 400)
      }

      const slug = input.slug ?? slugify(input.name)
      if (slug.length < 2) return errorResponse('Unable to derive a valid slug from the name', 400)

      const { data, error } = await supabase
        .from('products')
        .insert({ ...input, slug })
        .select(STAFF_FIELDS)
        .single()

      if (error) {
        if (error.code === '23505') return errorResponse('Slug or SKU already exists', 409)
        if (error.code === '42501') return errorResponse('Insufficient permissions', 403)
        if (error.code === '23514') return errorResponse('Product data failed validation', 400)
        console.error('product create failed', error.message)
        return errorResponse('Failed to create product', 500)
      }
      return jsonResponse({ product: data }, 201)
    }

    /* ---------------- UPDATE (optimistic concurrency) ---------------- */
    if (req.method === 'PATCH') {
      const guard = await requirePermissionOrResponse(req, 'PRODUCT_UPDATE')
      if ('response' in guard) return guard.response
      const parsed = UpdateSchema.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const { id, expected_version, ...updates } = parsed.data
      if (Object.keys(updates).length === 0) return errorResponse('No fields to update', 400)

      const supabase = getUserClient(req)
      const { data: current } = await supabase
        .from('products')
        .select('id, version, status')
        .eq('id', id)
        .maybeSingle()
      if (!current) return errorResponse('Product not found', 404)
      if (current.status === 'ARCHIVED') {
        return errorResponse('Archived products must be restored before editing', 409)
      }
      if (current.version !== expected_version) {
        return errorResponse(
          'This product was modified by someone else. Reload and re-apply your changes.',
          409,
        )
      }

      if (updates.category_id) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id, status')
          .eq('id', updates.category_id)
          .maybeSingle()
        if (!cat) return errorResponse('Category does not exist', 400)
        if (cat.status === 'ARCHIVED') return errorResponse('Category is archived', 400)
      }

      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .eq('version', expected_version)
        .select(STAFF_FIELDS)
        .maybeSingle()

      if (error) {
        if (error.code === '23505') return errorResponse('Slug or SKU already exists', 409)
        if (error.code === '42501') return errorResponse('Insufficient permissions', 403)
        if (error.code === '23514') return errorResponse('Product data failed validation', 400)
        console.error('product update failed', error.message)
        return errorResponse('Failed to update product', 500)
      }
      if (!data) return errorResponse('Update conflict — reload the product and retry', 409)
      return jsonResponse({ product: data })
    }

    if (req.method === 'DELETE') {
      const ctx = await getAuthContext(req)
      return errorResponse(
        ctx ? 'Products are archived, never deleted' : 'Authentication required',
        ctx ? 405 : 401,
      )
    }

    return errorResponse('Method not allowed', 405)
  } catch (_e) {
    console.error('staff-catalog-products unexpected error')
    return errorResponse('Unexpected error', 500)
  }
})
