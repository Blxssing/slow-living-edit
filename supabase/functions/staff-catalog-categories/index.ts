import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getUserClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermissionOrResponse } from '../_shared/auth.ts'
import {
  safeText,
  SlugSchema,
  StatusSchema,
  PaginationSchema,
  escapeFilter,
  firstIssue,
  slugify,
} from '../_shared/catalog.ts'

const FIELDS =
  'id, name, slug, description, image_url, tagline, theme, sort_order, is_active, status, created_at, updated_at, created_by, updated_by'

const ListSchema = PaginationSchema.extend({
  search: z.string().max(120).optional(),
  status: StatusSchema.optional(),
})

const ThemeSchema = z.enum(['default', 'gold-pink', 'diamond-cream', 'silver-orange'])

const CreateSchema = z.object({
  action: z.literal('CREATE'),
  name: safeText(120),
  slug: SlugSchema.optional(),
  description: safeText(2000).optional().nullable(),
  tagline: safeText(160).optional().nullable(),
  image_url: z.string().url().max(1000).optional().nullable(),
  theme: ThemeSchema.default('default'),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
})

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: safeText(120).optional(),
  slug: SlugSchema.optional(),
  description: safeText(2000).optional().nullable(),
  tagline: safeText(160).optional().nullable(),
  image_url: z.string().url().max(1000).optional().nullable(),
  theme: ThemeSchema.optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional(),
  status: z.enum(['DRAFT', 'ACTIVE']).optional(),
})

const TransitionSchema = z.object({
  action: z.enum(['ARCHIVE', 'RESTORE']),
  id: z.string().uuid(),
  restore_to: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method === 'GET') {
      const guard = await requirePermissionOrResponse(req, 'CATEGORY_VIEW')
      if ('response' in guard) return guard.response
      const parsed = ListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const q = parsed.data
      const from = (q.page - 1) * q.page_size

      let query = getUserClient(req)
        .from('categories')
        .select(FIELDS, { count: 'exact' })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
        .range(from, from + q.page_size - 1)
      if (q.status) query = query.eq('status', q.status)
      if (q.search) query = query.ilike('name', `%${escapeFilter(q.search)}%`)

      const { data, error, count } = await query
      if (error) return errorResponse('Failed to load categories', 500)
      return jsonResponse({
        categories: data ?? [],
        pagination: { page: q.page, page_size: q.page_size, total: count ?? 0 },
      })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== 'object') return errorResponse('Invalid request body', 400)
      const action = (body as { action?: string }).action ?? 'CREATE'
      const supabaseFor = () => getUserClient(req)

      if (action === 'ARCHIVE' || action === 'RESTORE') {
        const guard = await requirePermissionOrResponse(req, 'CATEGORY_ARCHIVE')
        if ('response' in guard) return guard.response
        const parsed = TransitionSchema.safeParse(body)
        if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
        const supabase = supabaseFor()

        const { data: existing } = await supabase
          .from('categories')
          .select('id, status')
          .eq('id', parsed.data.id)
          .maybeSingle()
        if (!existing) return errorResponse('Category not found', 404)

        if (action === 'ARCHIVE') {
          const { count } = await supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('category_id', parsed.data.id)
            .in('status', ['ACTIVE', 'DRAFT'])
          if ((count ?? 0) > 0) {
            return errorResponse(
              `Cannot archive: ${count} active or draft product(s) still use this category. Reassign or archive them first.`,
              409,
            )
          }
        }

        const next = action === 'ARCHIVE' ? 'ARCHIVED' : parsed.data.restore_to
        const { data, error } = await supabase
          .from('categories')
          .update({ status: next, is_active: next === 'ACTIVE' })
          .eq('id', parsed.data.id)
          .select(FIELDS)
          .maybeSingle()
        if (error || !data) return errorResponse('Failed to change category status', 403)
        return jsonResponse({ category: data })
      }

      const guard = await requirePermissionOrResponse(req, 'CATEGORY_CREATE')
      if ('response' in guard) return guard.response
      const parsed = CreateSchema.safeParse({ ...body, action: 'CREATE' })
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const { action: _a, ...input } = parsed.data
      const slug = input.slug ?? slugify(input.name)
      if (slug.length < 2) return errorResponse('Unable to derive a valid slug', 400)

      const { data, error } = await supabaseFor()
        .from('categories')
        .insert({ ...input, slug, is_active: input.status === 'ACTIVE' })
        .select(FIELDS)
        .single()
      if (error) {
        if (error.code === '23505') return errorResponse('Category slug already exists', 409)
        if (error.code === '42501') return errorResponse('Insufficient permissions', 403)
        if (error.code === '23514') return errorResponse('Category data failed validation', 400)
        console.error('category create failed', error.message)
        return errorResponse('Failed to create category', 500)
      }
      return jsonResponse({ category: data }, 201)
    }

    if (req.method === 'PATCH') {
      const guard = await requirePermissionOrResponse(req, 'CATEGORY_UPDATE')
      if ('response' in guard) return guard.response
      const parsed = UpdateSchema.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const { id, ...updates } = parsed.data
      if (Object.keys(updates).length === 0) return errorResponse('No fields to update', 400)

      const supabase = getUserClient(req)
      const { data: existing } = await supabase
        .from('categories')
        .select('id, status')
        .eq('id', id)
        .maybeSingle()
      if (!existing) return errorResponse('Category not found', 404)

      const patch: Record<string, unknown> = { ...updates }
      if (updates.status) patch.is_active = updates.status === 'ACTIVE'

      const { data, error } = await supabase
        .from('categories')
        .update(patch)
        .eq('id', id)
        .select(FIELDS)
        .maybeSingle()
      if (error) {
        if (error.code === '23505') return errorResponse('Category slug already exists', 409)
        if (error.code === '42501') return errorResponse('Insufficient permissions', 403)
        if (error.code === '23514') return errorResponse('Category data failed validation', 400)
        return errorResponse('Failed to update category', 500)
      }
      if (!data) return errorResponse('Insufficient permissions', 403)
      return jsonResponse({ category: data })
    }

    if (req.method === 'DELETE') {
      return errorResponse('Categories are archived, never deleted', 405)
    }
    return errorResponse('Method not allowed', 405)
  } catch (_e) {
    console.error('staff-catalog-categories unexpected error')
    return errorResponse('Unexpected error', 500)
  }
})
