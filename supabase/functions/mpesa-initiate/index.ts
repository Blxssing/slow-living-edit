import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { requireAuth } from '../_shared/auth.ts'

const InitiateSchema = z.object({
  order_id: z.string().uuid(),
  phone_number: z.string().regex(/^254[0-9]{9}$/),
})

function getEnv() {
  return {
    consumerKey: Deno.env.get('MPESA_CONSUMER_KEY'),
    consumerSecret: Deno.env.get('MPESA_CONSUMER_SECRET'),
    passkey: Deno.env.get('MPESA_PASSKEY'),
    shortcode: Deno.env.get('MPESA_SHORTCODE'),
    env: Deno.env.get('MPESA_ENV') || 'sandbox',
  }
}

function baseUrl(env: string) {
  return env === 'production'
    ? 'https://api.safaricom.et'
    : 'https://sandbox.safaricom.et'
}

async function getAccessToken(env: string, consumerKey: string, consumerSecret: string) {
  const credentials = btoa(`${consumerKey}:${consumerSecret}`)
  const res = await fetch(`${baseUrl(env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to get access token: ${res.status}`)
  }

  const data = await res.json()
  return data.access_token as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const user = await requireAuth(req)
  if (!user) {
    return errorResponse('Authentication required', 401)
  }

  const parsed = InitiateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return errorResponse('Invalid request. phone_number must be in format 254XXXXXXXXX', 400)
  }

  const { order_id, phone_number } = parsed.data
  const env = getEnv()

  if (!env.consumerKey || !env.consumerSecret || !env.passkey || !env.shortcode) {
    return errorResponse('M-Pesa is not configured on this project', 503)
  }

  const supabase = getServiceRoleClient()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, total, status, customer_id')
    .eq('id', order_id)
    .single()

  if (orderError || !order) {
    return errorResponse('Order not found', 404)
  }

  if (order.customer_id !== user.id) {
    return errorResponse('Unauthorized', 401)
  }

  if (order.status !== 'pending_payment') {
    return errorResponse('Order is not awaiting payment', 400)
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, status')
    .eq('order_id', order_id)
    .eq('status', 'pending')
    .single()

  if (paymentError || !payment) {
    return errorResponse('Payment record not found', 404)
  }

  try {
    const accessToken = await getAccessToken(env.env, env.consumerKey, env.consumerSecret)
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
    const password = btoa(`${env.shortcode}${env.passkey}${timestamp}`)

    const payload = {
      BusinessShortCode: env.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(order.total),
      PartyA: phone_number,
      PartyB: env.shortcode,
      PhoneNumber: phone_number,
      CallBackURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`,
      AccountReference: `Order-${order.id.slice(0, 8)}`,
      TransactionDesc: 'Mia Bella Cosmetics order payment',
    }

    const res = await fetch(`${baseUrl(env.env)}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const responseData = await res.json()

    await supabase.from('payment_attempts').insert({
      payment_id: payment.id,
      order_id: order.id,
      direction: 'outgoing',
      payload,
      response: responseData,
      status: res.ok ? 'initiated' : 'failed',
      error_message: res.ok ? null : JSON.stringify(responseData),
    })

    if (!res.ok) {
      console.error('M-Pesa initiate error:', responseData)
      return errorResponse('Failed to initiate M-Pesa payment', 502)
    }

    await supabase
      .from('payments')
      .update({ status: 'initiated' })
      .eq('id', payment.id)

    return jsonResponse({
      success: true,
      checkout_request_id: responseData.CheckoutRequestID,
      merchant_request_id: responseData.MerchantRequestID,
    })
  } catch (err) {
    console.error('M-Pesa initiate exception:', err)
    return errorResponse('Failed to initiate M-Pesa payment', 502)
  }
})
