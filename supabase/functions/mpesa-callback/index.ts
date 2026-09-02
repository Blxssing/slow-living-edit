import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

const CallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            })
          ),
        })
        .optional(),
    }),
  }),
})

function getMetadataValue(metadata: any, name: string) {
  const item = metadata?.Item?.find((i: any) => i.Name === name)
  return item?.Value
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const body = await req.json()
  const parsed = CallbackSchema.safeParse(body)
  if (!parsed.success) {
    console.error('Invalid M-Pesa callback payload:', body)
    return errorResponse('Invalid callback payload', 400)
  }

  const callback = parsed.data.Body.stkCallback
  const supabase = getServiceRoleClient()

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, order_id, status')
    .eq('external_transaction_id', callback.CheckoutRequestID)
    .single()

  if (paymentError || !payment) {
    console.error('Payment not found for callback:', callback.CheckoutRequestID)
    return errorResponse('Payment not found', 404)
  }

  const isSuccess = callback.ResultCode === 0
  const receiptNumber = getMetadataValue(callback.CallbackMetadata, 'MpesaReceiptNumber')
  const amount = getMetadataValue(callback.CallbackMetadata, 'Amount')
  const phoneNumber = getMetadataValue(callback.CallbackMetadata, 'PhoneNumber')
  const transactionDate = getMetadataValue(callback.CallbackMetadata, 'TransactionDate')

  await supabase.from('payment_attempts').insert({
    payment_id: payment.id,
    order_id: payment.order_id,
    direction: 'incoming',
    payload: body,
    status: isSuccess ? 'completed' : 'failed',
  })

  const { error: updatePaymentError } = await supabase
    .from('payments')
    .update({
      status: isSuccess ? 'completed' : 'failed',
      result_code: String(callback.ResultCode),
      result_desc: callback.ResultDesc,
      external_transaction_id: callback.CheckoutRequestID,
      metadata: {
        mpesa_receipt_number: receiptNumber,
        amount,
        phone_number: phoneNumber,
        transaction_date: transactionDate,
      },
    })
    .eq('id', payment.id)

  if (updatePaymentError) {
    console.error('Failed to update payment:', updatePaymentError)
    return errorResponse('Failed to process callback', 500)
  }

  if (isSuccess) {
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', payment.order_id)

    if (orderUpdateError) {
      console.error('Failed to update order:', orderUpdateError)
      return errorResponse('Failed to update order', 500)
    }

    await supabase.from('order_status_history').insert({
      order_id: payment.order_id,
      status: 'paid',
      notes: `M-Pesa payment confirmed. Receipt: ${receiptNumber || 'N/A'}`,
    })

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('variant_id, quantity')
      .eq('order_id', payment.order_id)

    for (const item of orderItems || []) {
      await supabase.rpc('commit_inventory', {
        _variant_id: item.variant_id,
        _qty: item.quantity,
        _order_id: payment.order_id,
      })
    }
  } else {
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({ status: 'payment_failed' })
      .eq('id', payment.order_id)

    if (orderUpdateError) {
      console.error('Failed to update order:', orderUpdateError)
    }

    await supabase.from('order_status_history').insert({
      order_id: payment.order_id,
      status: 'payment_failed',
      notes: `M-Pesa payment failed: ${callback.ResultDesc}`,
    })

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('variant_id, quantity')
      .eq('order_id', payment.order_id)

    for (const item of orderItems || []) {
      await supabase.rpc('release_inventory', {
        _variant_id: item.variant_id,
        _qty: item.quantity,
        _order_id: payment.order_id,
      })
    }
  }

  return jsonResponse({ success: true })
})
