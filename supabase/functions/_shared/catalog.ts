import { z } from 'npm:zod@3'

/** Trim + collapse whitespace, reject control characters and HTML markup. */
export const safeText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .refine((s) => !/[<>]/.test(s), 'HTML markup is not allowed')
    // deno-lint-ignore no-control-regex
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Invalid characters')
    .refine((s) => s.length <= max, `Must be at most ${max} characters`)

export const slugify = (input: string) =>
  input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)

export const SlugSchema = z
  .string()
  .transform((s) => slugify(s))
  .refine((s) => s.length >= 2, 'Slug is too short')

/** SKUs are normalised to upper-case, hyphen-separated tokens. */
export const SkuSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase().replace(/\s+/g, '-'))
  .refine((s) => /^[A-Z0-9][A-Z0-9-]{1,63}$/.test(s), 'Invalid SKU format')

/** Exact monetary value: non-negative, at most 2 decimal places, < 10^10. */
export const MoneySchema = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number(v)))
  .refine((n) => Number.isFinite(n), 'Price must be numeric')
  .refine((n) => n >= 0, 'Price cannot be negative')
  .refine((n) => n < 1e10, 'Price is out of range')
  .refine((n) => Math.round(n * 100) === Number((n * 100).toFixed(0)), 'Invalid precision')
  .transform((n) => Number(n.toFixed(2)))

export const CurrencySchema = z.literal('KES').default('KES')
export const StatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED'])

/** Safe allowlist — user input never reaches an ORDER BY column name. */
export const PRODUCT_SORTS: Record<string, { column: string; ascending: boolean }> = {
  newest: { column: 'created_at', ascending: false },
  oldest: { column: 'created_at', ascending: true },
  name_asc: { column: 'name', ascending: true },
  name_desc: { column: 'name', ascending: false },
  price_asc: { column: 'base_price', ascending: true },
  price_desc: { column: 'base_price', ascending: false },
  updated: { column: 'updated_at', ascending: false },
}

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
})

/** Escape PostgREST filter metacharacters before interpolating user input. */
export const escapeFilter = (s: string) => s.replace(/[%,()\\]/g, '').slice(0, 120)

export function firstIssue(error: z.ZodError) {
  const i = error.issues[0]
  return `${i.path.join('.') || 'input'}: ${i.message}`
}

/**
 * Product image records store an object-storage path (new uploads) or a
 * legacy absolute URL. Public responses expose only a short-lived signed
 * URL — storage stays private and credentials never reach the client.
 */
export async function publicImageUrls(
  service: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }> } } },
  images: { url: string; alt_text: string | null; is_primary: boolean; sort_order: number }[],
) {
  const sorted = [...images].sort((a, b) =>
    a.is_primary === b.is_primary ? a.sort_order - b.sort_order : a.is_primary ? -1 : 1,
  )
  return await Promise.all(
    sorted.map(async (img) => {
      let url = img.url
      if (!/^https?:\/\//i.test(url)) {
        const { data } = await service.storage.from('product-images').createSignedUrl(url, 3600)
        url = data?.signedUrl ?? ''
      }
      return { url, alt_text: img.alt_text, is_primary: img.is_primary, sort_order: img.sort_order }
    }),
  )
}
