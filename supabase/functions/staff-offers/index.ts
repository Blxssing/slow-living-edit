import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { requirePermissionOrResponse } from '../_shared/auth.ts'
import { errorResponse, jsonResponse } from '../_shared/response.ts'
import { firstIssue, PaginationSchema } from '../_shared/catalog.ts'
import {
  calculatePrice,
  CreateOfferSchema,
  effectiveStatus,
  OFFER_STATUSES,
  PreviewSchema,
  UpdateOfferSchema,
  type OfferType,
} from '../_shared/offers.ts'

const OFFER_COLUMNS =
  'id, name, offer_type, value, promotional_label, scope, product_id, category_id, priority, start_at, end_at, status, internal_notes, version, activated_at, created_by, updated_by, created_at, updated_at'

const LIVE_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE']

type OfferRow = Record<string, unknown> & {
  status: string
  start_at: string
  end_at: string | null
  offer_type: string
  value: number
  product_id: string | null
}

const decorate = (row: OfferRow, basePrice?: number | null) => {
  const eff = effectiveStatus(row)
  const pricing =
    basePrice != null && row.offer_type !== 'LABEL_ONLY'
      ? calculatePrice(basePrice, { offer_type: row.offer_type as OfferType, value: row.value })
      : null
  return { ...row, effective_status: eff, pricing }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const service = getServiceRoleClient()
    const url = new URL(req.url)

    /* ----------------------------- READ ----------------------------- */
    if (req.method === 'GET') {
      const guard = await requirePermissionOrResponse(req, 'OFFER_VIEW')
      if ('response' in guard) return guard.response

      const params = Object.fromEntries(url.searchParams)
      const parsed = z
        .object({
          status: z.enum(OFFER_STATUSES).optional(),
          offer_type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'LABEL_ONLY']).optional(),
          product_id: z.string().uuid().optional(),
          id: z.string().uuid().optional(),
        })
        .merge(PaginationSchema)
        .safeParse(params)
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const q = parsed.data

      let query = service
        .from('offers')
        .select(`${OFFER_COLUMNS}, products(id, name, slug, base_price, status)`, { count: 'exact' })
      if (q.id) query = query.eq('id', q.id)
      if (q.status) query = query.eq('status', q.status)
      if (q.offer_type) query = query.eq('offer_type', q.offer_type)
      if (q.product_id) query = query.eq('product_id', q.product_id)

      const from = (q.page - 1) * q.page_size
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, from + q.page_size - 1)
      if (error) return errorResponse('Unable to load offers', 500)

      const offers = (data ?? []).map((row) => {
        const r = row as OfferRow & { products?: { base_price: number } | null }
        return decorate(r, r.products?.base_price ?? null)
      })
      return jsonResponse({ offers, page: q.page, page_size: q.page_size, total: count ?? 0 })
    }

    /* ----------------------------- WRITE ----------------------------- */
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== 'object') return errorResponse('Invalid request body', 400)
      const action = String((body as { action?: string }).action ?? '').toUpperCase()

      /* -------- PREVIEW (trusted server-side calculation) -------- */
      if (action === 'PREVIEW') {
        const guard = await requirePermissionOrResponse(req, 'OFFER_VIEW')
        if ('response' in guard) return guard.response
        const parsed = PreviewSchema.safeParse(body)
        if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)

        const { data: product } = await service
          .from('products')
          .select('id, name, base_price, status, currency')
          .eq('id', parsed.data.product_id)
          .maybeSingle()
        if (!product) return errorResponse('Product not found', 404)

        try {
          const pricing = calculatePrice(
            product.base_price,
            parsed.data.offer_type === 'LABEL_ONLY'
              ? null
              : { offer_type: parsed.data.offer_type, value: parsed.data.value },
          )
          return jsonResponse({
            product: { id: product.id, name: product.name, status: product.status },
            currency: product.currency ?? 'KES',
            ...pricing,
            applicable: product.status === 'ACTIVE',
          })
        } catch {
          return errorResponse('Invalid discount value', 400)
        }
      }

      /* -------- CREATE -------- */
      if (action === 'CREATE') {
        const guard = await requirePermissionOrResponse(req, 'OFFER_CREATE')
        if ('response' in guard) return guard.response
        const parsed = CreateOfferSchema.safeParse(body)
        if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
        const o = parsed.data

        if (o.status === 'ACTIVE') {
          const act = await requirePermissionOrResponse(req, 'OFFER_ACTIVATE')
          if ('response' in act) return act.response
        }

        if (o.product_id) {
          const { data: product } = await service
            .from('products')
            .select('id, status, base_price')
            .eq('id', o.product_id)
            .maybeSingle()
          if (!product) return errorResponse('Product not found', 404)
          if (product.status === 'ARCHIVED')
            return errorResponse('Cannot create an offer for an archived product', 409)
          if (o.offer_type === 'FIXED_AMOUNT' && (o.value ?? 0) > Number(product.base_price))
            return errorResponse('Fixed discount cannot exceed the product price', 400)

          if (o.offer_type !== 'LABEL_ONLY') {
            const { data: conflict } = await service
              .from('offers')
              .select('id')
              .eq('product_id', o.product_id)
              .neq('offer_type', 'LABEL_ONLY')
              .in('status', LIVE_STATUSES)
              .maybeSingle()
            if (conflict)
              return errorResponse(
                'This product already has a live price-discount offer. Archive it first.',
                409,
              )
          }
        }

        const start = o.start_at ?? new Date().toISOString()
        let status = o.status
        if (status === 'ACTIVE' && new Date(start).getTime() > Date.now()) status = 'SCHEDULED'
        if (o.end_at && new Date(o.end_at).getTime() <= Date.now())
          return errorResponse('end_at must be in the future', 400)

        const { data, error } = await service
          .from('offers')
          .insert({
            name: o.name,
            offer_type: o.offer_type,
            value: o.offer_type === 'LABEL_ONLY' ? 0 : o.value,
            promotional_label: o.promotional_label ?? null,
            internal_notes: o.internal_notes ?? null,
            priority: o.priority ?? 0,
            scope: o.product_id ? 'PRODUCT' : 'GLOBAL',
            product_id: o.product_id ?? null,
            start_at: start,
            end_at: o.end_at ?? null,
            status,
            created_by: guard.ctx.userId,
            updated_by: guard.ctx.userId,
          })
          .select(OFFER_COLUMNS)
          .single()

        if (error) {
          if (error.code === '23505')
            return errorResponse('This product already has a live price-discount offer.', 409)
          return errorResponse(error.message.replace(/^.*?:\s*/, '').slice(0, 200) || 'Unable to create offer', 400)
        }
        return jsonResponse({ offer: decorate(data as OfferRow) }, 201)
      }

      /* -------- STATUS TRANSITIONS -------- */
      const transitions: Record<string, { permission: string; status: string }> = {
        ACTIVATE: { permission: 'OFFER_ACTIVATE', status: 'ACTIVE' },
        SCHEDULE: { permission: 'OFFER_ACTIVATE', status: 'SCHEDULED' },
        DEACTIVATE: { permission: 'OFFER_ACTIVATE', status: 'DRAFT' },
        ARCHIVE: { permission: 'OFFER_ARCHIVE', status: 'ARCHIVED' },
      }
      const t = transitions[action]
      if (!t) return errorResponse('Unsupported action', 400)

      const guard = await requirePermissionOrResponse(req, t.permission)
      if ('response' in guard) return guard.response

      const idParsed = z.object({ id: z.string().uuid() }).safeParse(body)
      if (!idParsed.success) return errorResponse('A valid offer id is required', 400)

      const { data: existing } = await service
        .from('offers')
        .select(`${OFFER_COLUMNS}, products(status, base_price)`)
        .eq('id', idParsed.data.id)
        .maybeSingle()
      if (!existing) return errorResponse('Offer not found', 404)
      const row = existing as OfferRow & { products?: { status: string; base_price: number } | null }

      if (row.status === 'ARCHIVED' && t.status !== 'ARCHIVED')
        return errorResponse('Archived offers cannot be reactivated', 409)

      if (t.status === 'ACTIVE' || t.status === 'SCHEDULED') {
        if (row.product_id && row.products?.status !== 'ACTIVE')
          return errorResponse('The product is not active', 409)
        if (row.end_at && new Date(row.end_at).getTime() <= Date.now())
          return errorResponse('Offer has already ended', 409)
        if (row.offer_type !== 'LABEL_ONLY' && row.products)
          calculatePrice(row.products.base_price, {
            offer_type: row.offer_type as OfferType,
            value: row.value,
          })
      }

      const nextStatus =
        t.status === 'ACTIVE' && new Date(row.start_at).getTime() > Date.now() ? 'SCHEDULED' : t.status

      const { data, error } = await service
        .from('offers')
        .update({ status: nextStatus, updated_by: guard.ctx.userId })
        .eq('id', row.id as string)
        .select(OFFER_COLUMNS)
        .maybeSingle()
      if (error || !data) return errorResponse('Unable to update offer status', 400)
      return jsonResponse({ offer: decorate(data as OfferRow) })
    }

    /* ----------------------------- PATCH ----------------------------- */
    if (req.method === 'PATCH') {
      const guard = await requirePermissionOrResponse(req, 'OFFER_UPDATE')
      if ('response' in guard) return guard.response

      const body = await req.json().catch(() => null)
      const parsed = UpdateOfferSchema.safeParse(body)
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const { id, expected_version, ...patch } = parsed.data

      const { data: existing } = await service
        .from('offers')
        .select(OFFER_COLUMNS)
        .eq('id', id)
        .maybeSingle()
      if (!existing) return errorResponse('Offer not found', 404)
      const row = existing as OfferRow & { version: number }

      if (row.status === 'ARCHIVED') return errorResponse('Archived offers cannot be edited', 409)
      if (expected_version !== undefined && expected_version !== row.version)
        return errorResponse('This offer was modified by someone else. Reload and retry.', 409)

      const nextType = row.offer_type as OfferType
      const nextValue = patch.value ?? Number(row.value)
      const nextProduct = patch.product_id === undefined ? row.product_id : patch.product_id

      if (nextType === 'LABEL_ONLY') {
        if (patch.value !== undefined && patch.value !== 0)
          return errorResponse('LABEL_ONLY offers cannot carry a discount', 400)
        if (patch.promotional_label === null)
          return errorResponse('A label is required for LABEL_ONLY offers', 400)
      } else {
        if (!(nextValue > 0)) return errorResponse('Discount must be greater than zero', 400)
        if (nextType === 'PERCENTAGE' && nextValue > 100)
          return errorResponse('Percentage discount cannot exceed 100', 400)
        if (!nextProduct) return errorResponse('A product is required for price-discount offers', 400)
      }

      if (nextProduct) {
        const { data: product } = await service
          .from('products')
          .select('id, status, base_price')
          .eq('id', nextProduct)
          .maybeSingle()
        if (!product) return errorResponse('Product not found', 404)
        if (product.status === 'ARCHIVED')
          return errorResponse('Cannot attach an offer to an archived product', 409)
        if (nextType === 'FIXED_AMOUNT' && nextValue > Number(product.base_price))
          return errorResponse('Fixed discount cannot exceed the product price', 400)

        if (nextType !== 'LABEL_ONLY' && nextProduct !== row.product_id) {
          const { data: conflict } = await service
            .from('offers')
            .select('id')
            .eq('product_id', nextProduct)
            .neq('offer_type', 'LABEL_ONLY')
            .in('status', LIVE_STATUSES)
            .maybeSingle()
          if (conflict) return errorResponse('That product already has a live price-discount offer.', 409)
        }
      }

      const start = patch.start_at ?? row.start_at
      const end = patch.end_at === undefined ? row.end_at : patch.end_at
      if (end && new Date(end) <= new Date(start))
        return errorResponse('end_at must be later than start_at', 400)

      const { data, error } = await service
        .from('offers')
        .update({ ...patch, updated_by: guard.ctx.userId })
        .eq('id', id)
        .select(OFFER_COLUMNS)
        .maybeSingle()
      if (error || !data) return errorResponse('Unable to update offer', 400)
      return jsonResponse({ offer: decorate(data as OfferRow) })
    }

    return errorResponse('Method not allowed', 405)
  } catch (_e) {
    return errorResponse('Unexpected error', 500)
  }
})
