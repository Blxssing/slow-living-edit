import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requirePermission } from '../_shared/auth.ts'

const CreateSchema = z.object({
  category_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  base_price: z.coerce.number().positive(),
  compare_at_price: z.coerce.number().positive().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  is_featured: z.boolean().default(false),
  weight_g: z.coerce.number().int().nonnegative().optional(),
  meta_title: z.string().max(255).optional(),
  meta_description: z.string().max(500).optional(),
})

const UpdateSchema = CreateSchema.partial().extend({
  id: z.string().uuid(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const user =
    req.method === 'POST'
      ? await requirePermission(req, 'PRODUCT_CREATE')
      : await requirePermission(req, 'PRODUCT_UPDATE')
  if (!user) {
    return errorResponse('Unauthorized', 401)
  }

  const supabase = getServiceRoleClient()

  if (req.method === 'POST') {
    const parsed = CreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return errorResponse('Invalid product data', 400)
    }

    const { data, error } = await supabase.from('products').insert(parsed.data).select().single()
    if (error) {
      console.error('Create product error:', error)
      return errorResponse('Failed to create product', 500)
    }

    return jsonResponse({ product: data }, 201)
  }

  if (req.method === 'PATCH') {
    const parsed = UpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return errorResponse('Invalid product data', 400)
    }

    const { id, ...updates } = parsed.data
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update product error:', error)
      return errorResponse('Failed to update product', 500)
    }

    return jsonResponse({ product: data })
  }

  return errorResponse('Method not allowed', 405)
})
