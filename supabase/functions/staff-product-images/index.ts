import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getUserClient, getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermissionOrResponse } from '../_shared/auth.ts'
import { safeText, firstIssue } from '../_shared/catalog.ts'

const BUCKET = 'product-images'
const MAX_BYTES = 5 * 1024 * 1024

/** Magic-byte sniffing — the declared MIME type and extension are never trusted. */
function sniff(bytes: Uint8Array): { mime: string; ext: string } | null {
  const b = bytes
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { mime: 'image/png', ext: 'png' }
  const riff = String.fromCharCode(b[0], b[1], b[2], b[3])
  const webp = String.fromCharCode(b[8], b[9], b[10], b[11])
  if (riff === 'RIFF' && webp === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

const UploadSchema = z.object({
  action: z.literal('UPLOAD'),
  product_id: z.string().uuid(),
  file_base64: z.string().min(16).max(9_000_000),
  alt_text: safeText(300),
  is_primary: z.boolean().default(false),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
})

const PrimarySchema = z.object({
  action: z.literal('SET_PRIMARY'),
  image_id: z.string().uuid(),
})

const ReorderSchema = z.object({
  action: z.literal('REORDER'),
  product_id: z.string().uuid(),
  order: z
    .array(z.object({ image_id: z.string().uuid(), sort_order: z.number().int().min(0).max(999) }))
    .min(1)
    .max(50),
})

const UpdateSchema = z.object({
  action: z.literal('UPDATE'),
  image_id: z.string().uuid(),
  alt_text: safeText(300),
})

const DeleteSchema = z.object({ image_id: z.string().uuid() })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method === 'GET') {
      const guard = await requirePermissionOrResponse(req, 'PRODUCT_IMAGE_VIEW')
      if ('response' in guard) return guard.response
      const productId = new URL(req.url).searchParams.get('product_id')
      if (!productId || !z.string().uuid().safeParse(productId).success) {
        return errorResponse('product_id is required', 400)
      }
      const supabase = getUserClient(req)
      const { data, error } = await supabase
        .from('product_images')
        .select('id, product_id, url, alt_text, sort_order, is_primary, created_at, created_by')
        .eq('product_id', productId)
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true })
      if (error) return errorResponse('Failed to load images', 500)

      const service = getServiceRoleClient()
      const withUrls = await Promise.all(
        (data ?? []).map(async (img) => {
          const { data: signed } = await service.storage
            .from(BUCKET)
            .createSignedUrl(img.url, 3600)
          return { ...img, signed_url: signed?.signedUrl ?? null }
        }),
      )
      return jsonResponse({ images: withUrls })
    }

    if (req.method === 'DELETE') {
      const guard = await requirePermissionOrResponse(req, 'PRODUCT_IMAGE_DELETE')
      if ('response' in guard) return guard.response
      const parsed = DeleteSchema.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const supabase = getUserClient(req)

      const { data: img } = await supabase
        .from('product_images')
        .select('id, url')
        .eq('id', parsed.data.image_id)
        .maybeSingle()
      if (!img) return errorResponse('Image not found', 404)

      const { error } = await supabase.from('product_images').delete().eq('id', img.id)
      if (error) return errorResponse('Failed to delete image', 403)
      await getServiceRoleClient().storage.from(BUCKET).remove([img.url])
      return jsonResponse({ deleted: true })
    }

    if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return errorResponse('Invalid request body', 400)
    const action = (body as { action?: string }).action

    /* ---------------- UPLOAD ---------------- */
    if (action === 'UPLOAD') {
      const guard = await requirePermissionOrResponse(req, 'PRODUCT_IMAGE_CREATE')
      if ('response' in guard) return guard.response
      const parsed = UploadSchema.safeParse(body)
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const input = parsed.data
      const supabase = getUserClient(req)

      const { data: product } = await supabase
        .from('products')
        .select('id, status')
        .eq('id', input.product_id)
        .maybeSingle()
      if (!product) return errorResponse('Product not found', 404)

      let bytes: Uint8Array
      try {
        const raw = input.file_base64.replace(/^data:[^;]+;base64,/, '')
        bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
      } catch {
        return errorResponse('File is not valid base64 data', 400)
      }
      if (bytes.byteLength === 0) return errorResponse('File is empty', 400)
      if (bytes.byteLength > MAX_BYTES) return errorResponse('File exceeds the 5 MB limit', 400)

      const kind = sniff(bytes)
      if (!kind) return errorResponse('Only JPEG, PNG and WebP images are accepted', 400)

      const path = `${input.product_id}/${crypto.randomUUID()}.${kind.ext}`
      const service = getServiceRoleClient()
      const { error: upErr } = await service.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: kind.mime, upsert: false })
      if (upErr) {
        console.error('image upload failed', upErr.message)
        return errorResponse('Failed to store image', 500)
      }

      const { data, error } = await supabase
        .from('product_images')
        .insert({
          product_id: input.product_id,
          url: path,
          alt_text: input.alt_text,
          sort_order: input.sort_order,
          is_primary: input.is_primary,
        })
        .select('id, product_id, url, alt_text, sort_order, is_primary, created_at')
        .single()

      if (error) {
        await service.storage.from(BUCKET).remove([path])
        if (error.code === '42501') return errorResponse('Insufficient permissions', 403)
        console.error('image record failed', error.message)
        return errorResponse('Failed to save image record', 500)
      }

      const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(path, 3600)
      return jsonResponse({ image: { ...data, signed_url: signed?.signedUrl ?? null } }, 201)
    }

    /* ---------------- SET PRIMARY / REORDER / UPDATE ALT ---------------- */
    const guard = await requirePermissionOrResponse(req, 'PRODUCT_IMAGE_CREATE')
    if ('response' in guard) return guard.response
    const supabase = getUserClient(req)

    if (action === 'SET_PRIMARY') {
      const parsed = PrimarySchema.safeParse(body)
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const { data: img } = await supabase
        .from('product_images')
        .select('id, product_id')
        .eq('id', parsed.data.image_id)
        .maybeSingle()
      if (!img) return errorResponse('Image not found', 404)

      const { error } = await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', img.id)
      if (error) return errorResponse('Failed to set primary image', 403)
      return jsonResponse({ primary_image_id: img.id, product_id: img.product_id })
    }

    if (action === 'REORDER') {
      const parsed = ReorderSchema.safeParse(body)
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const ids = parsed.data.order.map((o) => o.image_id)
      if (new Set(ids).size !== ids.length) return errorResponse('Duplicate image ids', 400)

      const { data: owned } = await supabase
        .from('product_images')
        .select('id')
        .eq('product_id', parsed.data.product_id)
        .in('id', ids)
      if ((owned?.length ?? 0) !== ids.length) {
        return errorResponse('One or more images do not belong to this product', 400)
      }

      for (const item of parsed.data.order) {
        const { error } = await supabase
          .from('product_images')
          .update({ sort_order: item.sort_order })
          .eq('id', item.image_id)
          .eq('product_id', parsed.data.product_id)
        if (error) return errorResponse('Failed to reorder images', 403)
      }
      return jsonResponse({ reordered: ids.length })
    }

    if (action === 'UPDATE') {
      const parsed = UpdateSchema.safeParse(body)
      if (!parsed.success) return errorResponse(firstIssue(parsed.error), 400)
      const { data, error } = await supabase
        .from('product_images')
        .update({ alt_text: parsed.data.alt_text })
        .eq('id', parsed.data.image_id)
        .select('id, alt_text')
        .maybeSingle()
      if (error) return errorResponse('Failed to update image', 403)
      if (!data) return errorResponse('Image not found', 404)
      return jsonResponse({ image: data })
    }

    return errorResponse('Unknown action', 400)
  } catch (_e) {
    console.error('staff-product-images unexpected error')
    return errorResponse('Unexpected error', 500)
  }
})
