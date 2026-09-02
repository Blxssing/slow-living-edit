import { z } from 'npm:zod@3'
import { safeText } from './catalog.ts'

/* ------------------------------------------------------------------ *
 * ONE authoritative discount calculation (mirrors public.calculate_discount)
 * All maths is done in integer cents — never float arithmetic.
 * ------------------------------------------------------------------ */

export type OfferType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'LABEL_ONLY'
export type OfferStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED'

const toCents = (v: number | string) => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error('Invalid monetary value')
  // round-half-up on the scaled value, avoiding binary float drift
  return Math.round(Number((n * 100).toFixed(4)))
}
const fromCents = (c: number) => Number((c / 100).toFixed(2))

export interface PriceBreakdown {
  base_price: number
  discount_amount: number
  final_price: number
  offer_type: OfferType | null
  offer_value: number | null
}

/** Authoritative price computation. Used by preview, public API and (later) orders. */
export function calculatePrice(
  basePrice: number | string,
  offer?: { offer_type: OfferType; value: number | string } | null,
): PriceBreakdown {
  const baseC = toCents(basePrice)
  if (baseC < 0) throw new Error('Invalid base price')
  if (!offer || offer.offer_type === 'LABEL_ONLY') {
    return {
      base_price: fromCents(baseC),
      discount_amount: 0,
      final_price: fromCents(baseC),
      offer_type: offer?.offer_type ?? null,
      offer_value: offer ? Number(offer.value) : null,
    }
  }

  const value = Number(offer.value)
  let discountC: number
  if (offer.offer_type === 'PERCENTAGE') {
    if (!(value > 0) || value > 100) throw new Error('Invalid percentage')
    discountC = Math.round(Number(((baseC * value) / 100).toFixed(4)))
  } else if (offer.offer_type === 'FIXED_AMOUNT') {
    if (!(value > 0)) throw new Error('Invalid fixed amount')
    discountC = Math.min(toCents(value), baseC)
  } else {
    throw new Error('Unknown offer type')
  }
  discountC = Math.max(0, Math.min(discountC, baseC))

  return {
    base_price: fromCents(baseC),
    discount_amount: fromCents(discountC),
    final_price: fromCents(baseC - discountC),
    offer_type: offer.offer_type,
    offer_value: value,
  }
}

/** An offer only applies when its status AND its time window both allow it. */
export function isLive(o: { status: string; start_at: string; end_at: string | null }, at = new Date()) {
  if (o.status !== 'ACTIVE' && o.status !== 'SCHEDULED') return false
  if (new Date(o.start_at).getTime() > at.getTime()) return false
  if (o.end_at && new Date(o.end_at).getTime() <= at.getTime()) return false
  return true
}

/** Reporting status derived from the row + current time (never trusted from client). */
export function effectiveStatus(o: { status: string; start_at: string; end_at: string | null }): OfferStatus {
  if (o.status === 'ARCHIVED' || o.status === 'DRAFT') return o.status as OfferStatus
  const now = Date.now()
  if (o.end_at && new Date(o.end_at).getTime() <= now) return 'EXPIRED'
  if (new Date(o.start_at).getTime() > now) return 'SCHEDULED'
  return 'ACTIVE'
}

/* ------------------------------------------------------------------ *
 * Validation schemas
 * ------------------------------------------------------------------ */

export const OFFER_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'LABEL_ONLY'] as const
export const OFFER_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED'] as const

/** Promotional labels: short, plain, no markup — blocks XSS at the boundary. */
export const LabelSchema = safeText(40).refine(
  (s) => /^[A-Za-z0-9][A-Za-z0-9 %+&'.-]*$/.test(s) && s.length >= 2,
  'Label may only contain letters, numbers and simple punctuation',
)

export const OfferValueSchema = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number(v)))
  .refine((n) => Number.isFinite(n), 'Value must be numeric')
  .refine((n) => n >= 0 && n < 1e10, 'Value is out of range')
  .refine((n) => Math.round(n * 100) === Number((n * 100).toFixed(0)), 'At most 2 decimal places')
  .transform((n) => Number(n.toFixed(2)))

const IsoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date')
  .transform((s) => new Date(s).toISOString())

export const CreateOfferSchema = z
  .object({
    name: safeText(160).refine((s) => s.length >= 2, 'Name is too short'),
    offer_type: z.enum(OFFER_TYPES),
    value: OfferValueSchema.optional(),
    product_id: z.string().uuid().optional().nullable(),
    promotional_label: LabelSchema.optional().nullable(),
    internal_notes: safeText(2000).optional().nullable(),
    priority: z.coerce.number().int().min(0).max(1000).optional(),
    start_at: IsoDate.optional(),
    end_at: IsoDate.optional().nullable(),
    status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE']).default('DRAFT'),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })

    if (v.offer_type === 'LABEL_ONLY') {
      if (!v.promotional_label) add('promotional_label', 'A label is required for LABEL_ONLY offers')
      if (v.value && v.value !== 0) add('value', 'LABEL_ONLY offers cannot carry a discount')
    } else {
      if (v.value === undefined) add('value', 'A discount value is required')
      else if (v.value <= 0) add('value', 'Discount must be greater than zero')
      else if (v.offer_type === 'PERCENTAGE' && v.value > 100)
        add('value', 'Percentage discount cannot exceed 100')
      if (!v.product_id) add('product_id', 'A product is required for price-discount offers')
    }
    if (v.end_at && v.start_at && new Date(v.end_at) <= new Date(v.start_at))
      add('end_at', 'end_at must be later than start_at')
  })

export const UpdateOfferSchema = z
  .object({
    id: z.string().uuid(),
    expected_version: z.coerce.number().int().min(1).optional(),
    name: safeText(160).refine((s) => s.length >= 2, 'Name is too short').optional(),
    value: OfferValueSchema.optional(),
    promotional_label: LabelSchema.nullable().optional(),
    internal_notes: safeText(2000).nullable().optional(),
    priority: z.coerce.number().int().min(0).max(1000).optional(),
    product_id: z.string().uuid().nullable().optional(),
    start_at: IsoDate.optional(),
    end_at: IsoDate.nullable().optional(),
  })
  .strict()

export const PreviewSchema = z.object({
  product_id: z.string().uuid(),
  offer_type: z.enum(OFFER_TYPES),
  value: OfferValueSchema.default(0),
})

/** Customer-safe projection — never exposes staff or internal fields. */
export function publicOffer(row: {
  id: string
  name: string
  offer_type: string
  value: number
  promotional_label: string | null
  start_at: string
  end_at: string | null
  product_id: string | null
}) {
  return {
    id: row.id,
    name: row.name,
    offer_type: row.offer_type,
    promotional_label: row.promotional_label,
    start_at: row.start_at,
    end_at: row.end_at,
    product_id: row.product_id,
  }
}

/* ------------------------------------------------------------------ *
 * Shared storefront pricing resolver — the ONLY way public endpoints
 * (and later cart/checkout/orders) derive an effective price.
 * ------------------------------------------------------------------ */

export interface ProductPromotion {
  base_price: number
  discount_amount: number
  effective_price: number
  offer_id: string | null
  offer_type: OfferType | null
  offer_value: number | null
  discount_percent: number | null
  promotional_labels: string[]
  ends_at: string | null
}

export async function resolveProductPromotions(
  service: {
    from: (t: string) => {
      select: (c: string) => {
        in: (col: string, v: string[]) => {
          in: (col: string, v: string[]) => Promise<{ data: unknown[] | null }>
        }
      }
    }
  },
  products: { id: string; base_price: number | string }[],
): Promise<Map<string, ProductPromotion>> {
  const map = new Map<string, ProductPromotion>()
  const ids = products.map((p) => p.id)
  if (ids.length === 0) return map

  const { data } = await service
    .from('offers')
    .select('id, product_id, offer_type, value, promotional_label, priority, status, start_at, end_at')
    .in('product_id', ids)
    .in('status', ['ACTIVE', 'SCHEDULED'])

  type Row = {
    id: string
    product_id: string
    offer_type: OfferType
    value: number
    promotional_label: string | null
    priority: number
    status: string
    start_at: string
    end_at: string | null
  }
  const live = ((data ?? []) as Row[]).filter((r) => isLive(r))

  for (const p of products) {
    const group = live.filter((r) => r.product_id === p.id)
    const discount = group
      .filter((r) => r.offer_type !== 'LABEL_ONLY')
      .sort((a, b) => b.priority - a.priority)[0] ?? null
    const pricing = calculatePrice(
      p.base_price,
      discount ? { offer_type: discount.offer_type, value: discount.value } : null,
    )
    map.set(p.id, {
      base_price: pricing.base_price,
      discount_amount: pricing.discount_amount,
      effective_price: pricing.final_price,
      offer_id: discount?.id ?? null,
      offer_type: discount?.offer_type ?? null,
      offer_value: discount ? Number(discount.value) : null,
      discount_percent:
        discount?.offer_type === 'PERCENTAGE' ? Number(discount.value) : null,
      promotional_labels: group
        .filter((r) => r.promotional_label)
        .sort((a, b) => b.priority - a.priority)
        .map((r) => r.promotional_label as string),
      ends_at: discount?.end_at ?? null,
    })
  }
  return map
}
