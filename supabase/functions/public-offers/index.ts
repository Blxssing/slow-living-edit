import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { errorResponse, jsonResponse } from '../_shared/response.ts'
import { firstIssue, PaginationSchema } from '../_shared/catalog.ts'
import { calculatePrice, isLive, type OfferType } from '../_shared/offers.ts'

/**
 * Customer-facing promotions feed. Only live offers on ACTIVE products,
 * with server-calculated pricing. No staff or internal fields are returned.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  try {
    const url = new URL(req.url)
    const parsed = z
      .object({ product_id: z.string().uuid().optional() })
      .merge(PaginationSchema)
      .safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
    const q = parsed.data

    const service = getServiceRoleClient()
    let query = service
      .from('offers')
      .select(
        'id, name, offer_type, value, promotional_label, product_id, priority, start_at, end_at, status, products!inner(id, name, slug, base_price, currency, status)',
      )
      .in('status', ['ACTIVE', 'SCHEDULED'])
      .lte('start_at', new Date().toISOString())
      .eq('products.status', 'ACTIVE')
    if (q.product_id) query = query.eq('product_id', q.product_id)

    const from = (q.page - 1) * q.page_size
    const { data, error } = await query
      .order('priority', { ascending: false })
      .range(from, from + q.page_size - 1)
    if (error) return errorResponse('Unable to load offers', 500)

    type Row = {
      id: string
      name: string
      offer_type: string
      value: number
      promotional_label: string | null
      product_id: string | null
      start_at: string
      end_at: string | null
      status: string
      products: { id: string; name: string; slug: string; base_price: number; currency: string }
    }

    const rows = ((data ?? []) as unknown as Row[]).filter((r) => isLive(r))

    // Group by product: one price discount (highest priority wins) + any labels.
    const byProduct = new Map<string, Row[]>()
    for (const r of rows) {
      if (!r.product_id) continue
      byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), r])
    }

    const promotions = [...byProduct.values()].map((group) => {
      const p = group[0].products
      const discount = group.find((r) => r.offer_type !== 'LABEL_ONLY') ?? null
      const labels = group
        .filter((r) => r.promotional_label)
        .map((r) => r.promotional_label as string)
      const pricing = calculatePrice(
        p.base_price,
        discount ? { offer_type: discount.offer_type as OfferType, value: discount.value } : null,
      )
      return {
        product: { id: p.id, name: p.name, slug: p.slug },
        currency: p.currency ?? 'KES',
        original_price: pricing.base_price,
        discount_amount: pricing.discount_amount,
        effective_price: pricing.final_price,
        discount_percent:
          discount?.offer_type === 'PERCENTAGE' ? Number(discount.value) : null,
        offer_type: discount?.offer_type ?? 'LABEL_ONLY',
        promotional_labels: labels,
        starts_at: discount?.start_at ?? group[0].start_at,
        ends_at: discount?.end_at ?? null,
      }
    })

    return jsonResponse({ promotions, page: q.page, page_size: q.page_size })
  } catch (_e) {
    return errorResponse('Unexpected error', 500)
  }
})
