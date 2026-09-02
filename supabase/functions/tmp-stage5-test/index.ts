import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getServiceRoleClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { calculatePrice } from '../_shared/offers.ts'

const URL_ = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const PRODUCT_A = 'e7ec1173-fdb2-4ea8-9b79-02fc8f987ffc' // 1850
const PRODUCT_B = '7c6af81b-495d-4f3e-a9e9-4154b50fb1e3' // 950
const PRODUCT_C = 'c0d3ae63-039c-4bae-88a3-0c74a00b403c' // 1200
const PRODUCT_D = '776211b6-8492-4a86-8c62-b929b87babdd' // 3200

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const secret = 'stage5-run-7f3a9c21'
  if (req.headers.get('x-test-secret') !== secret) return errorResponse('Unauthorized', 401)

  const phase = Number(new URL(req.url).searchParams.get('phase') ?? '1')
  const svc = getServiceRoleClient()
  const results: { name: string; pass: boolean; detail?: unknown }[] = []
  const ok = (name: string, pass: boolean, detail?: unknown) => results.push({ name, pass, detail: pass ? undefined : detail })

  const users: Record<string, { id: string; token: string }> = {}
  const created: string[] = []
  const offerIds: string[] = []

  const call = async (fn: string, init: RequestInit & { query?: string } = {}) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${URL_}/functions/v1/${fn}${init.query ?? ''}`, {
        method: init.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', apikey: ANON, ...(init.headers ?? {}) },
        body: init.body,
      })
      let body: unknown = null
      try { body = await res.json() } catch { /* ignore */ }
      const err = String((body as { error?: string } | null)?.error ?? '')
      if (attempt < 4 && (res.status === 429 || err.includes('RateLimit'))) {
        const m = /Retry after (\d+)ms/.exec(err)
        await new Promise((r) => setTimeout(r, Math.min(m ? Number(m[1]) + 2000 : 10_000, 70_000)))
        continue
      }
      return { status: res.status, body: body as Record<string, unknown> }
    }
  }
  const auth = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {})

  let step = 'start'
  try {
    /* ---- restore fixture products to a known-good ACTIVE state ---- */
    step = 'fixtures'
    await svc.from('products').update({ status: 'ACTIVE' }).in('id', [PRODUCT_A, PRODUCT_B, PRODUCT_C, PRODUCT_D])
    await svc.from('offers').update({ status: 'ARCHIVED' }).in('product_id', [PRODUCT_A, PRODUCT_B, PRODUCT_C, PRODUCT_D]).in('status', ['DRAFT', 'SCHEDULED', 'ACTIVE'])
    /* ---- provision users ---- */
    for (const [key, role] of [['ceo', 'CEO'], ['hr', 'HR'], ['sales', 'SALES'], ['customer', null]] as const) {
      const email = `stage5-${key}@miabella.test`
      const password = 'Stage5Fixture!aA1'
      step = `listUsers:${key}`
      const { data: existingList } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
      const existingUser = existingList?.users?.find((u: any) => u.email === email)
      let userId: string
      if (existingUser) {
        userId = existingUser.id
      } else {
        step = `createUser:${key}`
        const r = await svc.auth.admin.createUser({ email, password, email_confirm: true })
        if (r.error || !r.data.user) throw new Error(`user create failed: ${JSON.stringify(r.error)}`)
        userId = r.data.user.id
      }
      const data = { user: { id: userId } }
      await svc.from('profiles').upsert({ id: data.user.id, email, status: 'ACTIVE', is_staff: Boolean(role), full_name: `Stage5 ${key}` })
      if (role) { const { data: has } = await svc.from('user_roles').select('id').eq('user_id', data.user.id).maybeSingle(); if (!has) await svc.from('user_roles').insert({ user_id: data.user.id, role }) }
      step = `signIn:${key}`
      const anon = createClient(URL_, ANON)
      let session: any = null, sErr: any = null
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await anon.auth.signInWithPassword({ email, password })
        session = r.data; sErr = r.error
        if (!sErr && r.data.session) break
        const m = /Retry after (\d+)ms/.exec(String(sErr?.message ?? ''))
        const waitMs = m ? Math.min(Number(m[1]) + 2000, 70_000) : 5_000
        await new Promise((res) => setTimeout(res, waitMs))
      }
      if (sErr || !session?.session) throw new Error(`sign-in failed: ${JSON.stringify(sErr)}`)
      users[key] = { id: data.user.id, token: session.session.access_token }
    }

    /* ================= CALCULATION ================= */
    const c1 = calculatePrice(2000, { offer_type: 'PERCENTAGE', value: 20 })
    ok('CALC 20% of KES 2000 -> 1600 (discount 400)', c1.final_price === 1600 && c1.discount_amount === 400, c1)
    const c2 = calculatePrice(2000, { offer_type: 'FIXED_AMOUNT', value: 500 })
    ok('CALC KES 500 off 2000 -> 1500', c2.final_price === 1500 && c2.discount_amount === 500, c2)
    const c3 = calculatePrice(1999.99, { offer_type: 'PERCENTAGE', value: 15 })
    ok('CALC rounding 15% of 1999.99 -> 300.00 / 1699.99', c3.discount_amount === 300 && c3.final_price === 1699.99, c3)
    const c4 = calculatePrice(1850, null)
    ok('CALC label-only leaves price unchanged', c4.final_price === 1850 && c4.discount_amount === 0, c4)

    // DB calculation must agree with TS calculation
    const { data: dbCalc } = await svc.rpc('calculate_discount', { _base_price: 1999.99, _offer_type: 'PERCENTAGE', _value: 15 })
    const dbRow = Array.isArray(dbCalc) ? dbCalc[0] : dbCalc
    ok('CALC database and edge function agree', Number(dbRow?.final_price) === 1699.99, dbRow)

    /* ================= RBAC: CEO ================= */
    const ceoCreate = await call('staff-offers', {
      method: 'POST', headers: auth(users.ceo.token),
      body: JSON.stringify({ action: 'CREATE', name: 'CEO 20% serum', offer_type: 'PERCENTAGE', value: 20, product_id: PRODUCT_A, status: 'DRAFT' }),
    })
    ok('CEO create offer ALLOWED', ceoCreate.status === 201, ceoCreate)
    const offerA = (ceoCreate.body?.offer as { id: string; version: number })?.id
    if (offerA) offerIds.push(offerA)

    const ceoEdit = await call('staff-offers', {
      method: 'PATCH', headers: auth(users.ceo.token),
      body: JSON.stringify({ id: offerA, value: 30 }),
    })
    ok('CEO edit offer ALLOWED (20% -> 30%)', ceoEdit.status === 200 && Number((ceoEdit.body?.offer as any)?.value) === 30, ceoEdit)

    const ceoActivate = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'ACTIVATE', id: offerA }) })
    ok('CEO activate offer ALLOWED', ceoActivate.status === 200 && (ceoActivate.body?.offer as any)?.status === 'ACTIVE', ceoActivate)

    const ceoView = await call('staff-offers', { headers: auth(users.ceo.token) })
    ok('CEO view offers ALLOWED', ceoView.status === 200, ceoView)

    /* ================= RBAC: SALES ================= */
    const salesCreate = await call('staff-offers', {
      method: 'POST', headers: auth(users.sales.token),
      body: JSON.stringify({ action: 'CREATE', name: 'Sales 500 off lipstick', offer_type: 'FIXED_AMOUNT', value: 500, product_id: PRODUCT_B, status: 'DRAFT' }),
    })
    ok('SALES create offer ALLOWED', salesCreate.status === 201, salesCreate)
    const offerB = (salesCreate.body?.offer as { id: string })?.id
    if (offerB) offerIds.push(offerB)

    const salesLabel = await call('staff-offers', {
      method: 'POST', headers: auth(users.sales.token),
      body: JSON.stringify({ action: 'CREATE', name: 'Best seller badge', offer_type: 'LABEL_ONLY', promotional_label: 'BEST SELLER', product_id: PRODUCT_A, status: 'ACTIVE' }),
    })
    ok('SALES add promotional label ALLOWED (coexists with discount)', salesLabel.status === 201, salesLabel)
    const offerLabel = (salesLabel.body?.offer as { id: string })?.id
    if (offerLabel) offerIds.push(offerLabel)

    const salesActivate = await call('staff-offers', { method: 'POST', headers: auth(users.sales.token), body: JSON.stringify({ action: 'ACTIVATE', id: offerB }) })
    ok('SALES activate offer ALLOWED', salesActivate.status === 200, salesActivate)

    const salesEdit = await call('staff-offers', { method: 'PATCH', headers: auth(users.sales.token), body: JSON.stringify({ id: offerB, name: 'Sales KES 400 off lipstick', value: 400 }) })
    ok('SALES edit offer ALLOWED', salesEdit.status === 200, salesEdit)

    if (phase === 1) {
    /* ================= RBAC: HR ================= */
    const hrView = await call('staff-offers', { headers: auth(users.hr.token) })
    ok('HR view offers ALLOWED (read-only reporting)', hrView.status === 200, hrView)
    const hrLeak = Array.isArray((hrView.body as any)?.offers)
    ok('HR report returns internal reporting fields (read-only)', hrLeak, hrView.body)

    const hrCreate = await call('staff-offers', { method: 'POST', headers: auth(users.hr.token), body: JSON.stringify({ action: 'CREATE', name: 'HR attempt', offer_type: 'PERCENTAGE', value: 10, product_id: PRODUCT_C }) })
    ok('HR create offer DENIED', hrCreate.status === 403, hrCreate)
    const hrEdit = await call('staff-offers', { method: 'PATCH', headers: auth(users.hr.token), body: JSON.stringify({ id: offerA, value: 90 }) })
    ok('HR edit offer DENIED', hrEdit.status === 403, hrEdit)
    const hrArchive = await call('staff-offers', { method: 'POST', headers: auth(users.hr.token), body: JSON.stringify({ action: 'ARCHIVE', id: offerA }) })
    ok('HR archive offer DENIED', hrArchive.status === 403, hrArchive)
    const hrActivate = await call('staff-offers', { method: 'POST', headers: auth(users.hr.token), body: JSON.stringify({ action: 'DEACTIVATE', id: offerA }) })
    ok('HR deactivate offer DENIED', hrActivate.status === 403, hrActivate)

    /* ================= CUSTOMER / ANON ================= */
    const custStaff = await call('staff-offers', { headers: auth(users.customer.token) })
    ok('CUSTOMER staff offer API DENIED', custStaff.status === 403, custStaff)
    const custCreate = await call('staff-offers', { method: 'POST', headers: auth(users.customer.token), body: JSON.stringify({ action: 'CREATE', name: 'Cust', offer_type: 'PERCENTAGE', value: 50, product_id: PRODUCT_C }) })
    ok('CUSTOMER create offer DENIED', custCreate.status === 403, custCreate)
    const custPatch = await call('staff-offers', { method: 'PATCH', headers: auth(users.customer.token), body: JSON.stringify({ id: offerA, value: 99 }) })
    ok('CUSTOMER modify offer DENIED', custPatch.status === 403, custPatch)
    const anonStaff = await call('staff-offers', {})
    ok('UNAUTHENTICATED staff offer API DENIED', anonStaff.status === 401, anonStaff)
    const anonCreate = await call('staff-offers', { method: 'POST', body: JSON.stringify({ action: 'CREATE', name: 'x', offer_type: 'PERCENTAGE', value: 5, product_id: PRODUCT_C }) })
    ok('UNAUTHENTICATED create offer DENIED', anonCreate.status === 401, anonCreate)

    /* ---- customer RLS: direct table read must hide non-public rows ---- */
    const custClient = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${users.customer.token}` } } })
    const { data: custRows } = await custClient.from('offers').select('id, status')
    const custStatuses = new Set((custRows ?? []).map((r: { status: string }) => r.status))
    ok('CUSTOMER direct read sees only ACTIVE offers', [...custStatuses].every((s) => s === 'ACTIVE'), [...custStatuses])
    const { error: custWrite } = await custClient.from('offers').insert({ name: 'hack', offer_type: 'PERCENTAGE', value: 90, scope: 'PRODUCT', product_id: PRODUCT_C, start_at: new Date().toISOString(), status: 'ACTIVE' })
    ok('CUSTOMER direct table insert blocked by RLS', Boolean(custWrite), custWrite)

    /* ================= PUBLIC API ================= */
    const pub = await call('public-offers')
    const promos = (pub.body?.promotions ?? []) as any[]
    const promoA = promos.find((p) => p.product.id === PRODUCT_A)
    ok('PUBLIC valid active promotion visible', pub.status === 200 && Boolean(promoA), pub.body)
    ok('PUBLIC pricing is server-calculated (30% of 1850 = 555 -> 1295)', promoA?.discount_amount === 555 && promoA?.effective_price === 1295, promoA)
    ok('PUBLIC labels coexist with price discount', Array.isArray(promoA?.promotional_labels) && promoA.promotional_labels.includes('BEST SELLER'), promoA)
    const pubStr = JSON.stringify(pub.body)
    ok('PUBLIC response hides created_by/updated_by/internal notes', !/created_by|updated_by|internal_notes|actor/.test(pubStr))

    /* ================= EDGE CASES ================= */
    const e101 = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'CREATE', name: 'Too much', offer_type: 'PERCENTAGE', value: 101, product_id: PRODUCT_C }) })
    ok('EDGE 101% discount REJECTED', e101.status === 400, e101)
    const eNeg = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'CREATE', name: 'Negative', offer_type: 'FIXED_AMOUNT', value: -100, product_id: PRODUCT_C }) })
    ok('EDGE negative discount REJECTED', eNeg.status === 400, eNeg)
    const eNaN = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'CREATE', name: 'Malformed', offer_type: 'PERCENTAGE', value: 'abc', product_id: PRODUCT_C }) })
    ok('EDGE malformed numeric value REJECTED', eNaN.status === 400, eNaN)
    const eDates = await call('staff-offers', {
      method: 'POST', headers: auth(users.ceo.token),
      body: JSON.stringify({ action: 'CREATE', name: 'Bad dates', offer_type: 'PERCENTAGE', value: 10, product_id: PRODUCT_C, start_at: '2026-10-01T00:00:00Z', end_at: '2026-09-01T00:00:00Z' }),
    })
    ok('EDGE end date before start date REJECTED', eDates.status === 400, eDates)
    const eOver = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'CREATE', name: 'Over price', offer_type: 'FIXED_AMOUNT', value: 99999, product_id: PRODUCT_C }) })
    ok('EDGE fixed discount above product price REJECTED', eOver.status === 400, eOver)
    const eXss = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'CREATE', name: 'XSS label', offer_type: 'LABEL_ONLY', promotional_label: '<script>alert(1)</script>', product_id: PRODUCT_C }) })
    ok('EDGE XSS promotional label REJECTED', eXss.status === 400, eXss)
    const eSql = await call('staff-offers', { headers: auth(users.ceo.token), query: `?product_id=${encodeURIComponent("' OR 1=1; DROP TABLE offers;--")}` })
    ok('EDGE SQL injection in query REJECTED', eSql.status === 400 || eSql.status === 403, eSql)

    const eStack = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'CREATE', name: 'Second discount', offer_type: 'FIXED_AMOUNT', value: 100, product_id: PRODUCT_A }) })
    ok('EDGE two live price discounts on one product REJECTED', eStack.status === 409, eStack)

    const eDup1 = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'CREATE', name: 'Dup test', offer_type: 'PERCENTAGE', value: 10, product_id: PRODUCT_D, status: 'ACTIVE' }) })
    const dupId = (eDup1.body?.offer as { id: string })?.id
    if (dupId) offerIds.push(dupId)
    const eDup2 = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'CREATE', name: 'Dup test', offer_type: 'PERCENTAGE', value: 10, product_id: PRODUCT_D, status: 'ACTIVE' }) })
    ok('EDGE duplicate submission creates only one offer', eDup1.status === 201 && eDup2.status === 409, { first: eDup1.status, second: eDup2.status })

    /* ---- expired offer not applied ---- */
    const { data: expOffer } = await svc.from('offers').insert({
      name: 'Expired promo', offer_type: 'PERCENTAGE', value: 50, scope: 'PRODUCT', product_id: PRODUCT_C,
      start_at: new Date(Date.now() - 172800000).toISOString(), end_at: new Date(Date.now() - 86400000).toISOString(), status: 'SCHEDULED',
    }).select('id').single()
    if (expOffer) offerIds.push(expOffer.id)
    const pubExpired = await call('public-offers', { query: `?product_id=${PRODUCT_C}` })
    ok('EDGE expired offer NOT applied publicly', ((pubExpired.body?.promotions ?? []) as any[]).length === 0, pubExpired.body)
    const detailC = await call('public-product-detail', { query: '?slug=repairing-hair-mask' })
    const promoC = (detailC.body as any)?.promotion
    ok('EDGE expired offer gives no discount on product detail', !promoC || promoC.discount_amount === 0, promoC)
    const reactivate = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'ACTIVATE', id: expOffer?.id }) })
    ok('EDGE activating an already-ended offer REJECTED', reactivate.status === 409, reactivate)

    } // end phase 1
    /* ---- archived product ---- */
    await svc.from('products').update({ status: 'ARCHIVED' }).eq('id', PRODUCT_D)
    const pubArchived = await call('public-offers', { query: `?product_id=${PRODUCT_D}` })
    ok('EDGE offer on archived product NOT applied', ((pubArchived.body?.promotions ?? []) as any[]).length === 0, pubArchived.body)
    await svc.from('products').update({ status: 'ACTIVE' }).eq('id', PRODUCT_D)

    /* ---- client price manipulation ignored ---- */
    const manip = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'PREVIEW', product_id: PRODUCT_A, offer_type: 'PERCENTAGE', value: 30, final_price: 1, discount_amount: 1849 }) })
    ok('EDGE client-supplied final price IGNORED (recalculated 1850 -> 1295)', manip.status === 200 && (manip.body as any).final_price === 1295 && (manip.body as any).discount_amount === 555, manip.body)

    /* ---- preview ---- */
    const preview = await call('staff-offers', { method: 'POST', headers: auth(users.sales.token), body: JSON.stringify({ action: 'PREVIEW', product_id: PRODUCT_B, offer_type: 'FIXED_AMOUNT', value: 500 }) })
    ok('PREVIEW backend calculates 950 - 500 = 450', preview.status === 200 && (preview.body as any).final_price === 450, preview.body)

    /* ---- archive keeps history, removes promotion ---- */
    const archive = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'ARCHIVE', id: offerB }) })
    ok('CEO archive offer ALLOWED', archive.status === 200 && (archive.body?.offer as any)?.status === 'ARCHIVED', archive)
    const pubAfterArchive = await call('public-offers', { query: `?product_id=${PRODUCT_B}` })
    ok('CUSTOMER archived promotion NOT visible', ((pubAfterArchive.body?.promotions ?? []) as any[]).length === 0, pubAfterArchive.body)
    const editArchived = await call('staff-offers', { method: 'PATCH', headers: auth(users.ceo.token), body: JSON.stringify({ id: offerB, value: 10 }) })
    ok('Archived offer cannot be edited', editArchived.status === 409, editArchived)
    const reactivateArchived = await call('staff-offers', { method: 'POST', headers: auth(users.ceo.token), body: JSON.stringify({ action: 'ACTIVATE', id: offerB }) })
    ok('Archived offer cannot be reactivated', reactivateArchived.status === 409, reactivateArchived)

    /* ---- optimistic concurrency ---- */
    const stale = await call('staff-offers', { method: 'PATCH', headers: auth(users.ceo.token), body: JSON.stringify({ id: offerA, value: 25, expected_version: 1 }) })
    ok('Stale edit rejected with conflict', stale.status === 409, stale)

    /* ---- scheduling + expiry job ---- */
    const sched = await call('staff-offers', {
      method: 'POST', headers: auth(users.ceo.token),
      body: JSON.stringify({ action: 'CREATE', name: 'Future flash sale', offer_type: 'PERCENTAGE', value: 15, product_id: PRODUCT_C, status: 'ACTIVE', start_at: new Date(Date.now() + 86400000).toISOString(), end_at: new Date(Date.now() + 172800000).toISOString() }),
    })
    const schedId = (sched.body?.offer as { id: string })?.id
    if (schedId) offerIds.push(schedId)
    ok('Future-dated activation becomes SCHEDULED', sched.status === 201 && (sched.body?.offer as any)?.status === 'SCHEDULED', sched)
    const pubSched = await call('public-offers', { query: `?product_id=${PRODUCT_C}` })
    ok('Scheduled (not yet started) offer NOT public', ((pubSched.body?.promotions ?? []) as any[]).length === 0, pubSched.body)

    // ensure there is at least one ended offer for the expiry job to sweep
    await svc.from('offers').insert({
      name: 'Ended sweep fixture', offer_type: 'PERCENTAGE', value: 10, scope: 'PRODUCT', product_id: PRODUCT_B,
      start_at: new Date(Date.now() - 172800000).toISOString(), end_at: new Date(Date.now() - 86400000).toISOString(), status: 'SCHEDULED',
    })
    const cron = await call('cron-sync-offers', { method: 'POST', headers: { 'x-cron-secret': Deno.env.get('LOVABLE_CRON_SECRET') ?? '' } })
    ok('Expiry job marks ended offers EXPIRED', cron.status === 200 && Number((cron.body as any)?.expired) >= 1, cron.body)
    const cronNoSecret = await call('cron-sync-offers', { method: 'POST' })
    ok('Expiry job rejects unauthenticated calls', cronNoSecret.status === 401, cronNoSecret)

    /* ---- audit trail ---- */
    const { data: audits } = await svc.from('audit_logs').select('action, old_values, new_values, actor_id').eq('table_name', 'offers').in('record_id', offerIds).order('created_at')
    const actions = new Set((audits ?? []).map((a: { action: string }) => a.action))
    ok('Audit events recorded (created/updated/activated/archived)', ['OFFER_CREATED', 'OFFER_UPDATED', 'OFFER_ACTIVATED', 'OFFER_ARCHIVED'].every((a) => actions.has(a)), [...actions])
    const valueChange = (audits ?? []).some((a: any) => a.old_values && Number(a.old_values.value) === 20 && Number(a.new_values?.value) === 30)
    ok('Audit shows discount value change 20% -> 30%', valueChange, (audits ?? []).map((a: any) => [a.action, a.old_values?.value, a.new_values?.value]))
    const actorRecorded = (audits ?? []).some((a: any) => a.actor_id === users.ceo.id)
    ok('Audit records the acting staff member', actorRecorded)

    return jsonResponse({
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass),
      results: results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} — ${r.name}`),
    })
  } catch (e) {
    return jsonResponse({ error: String(e), step, results }, 500)
  } finally {
    if (offerIds.length) await svc.from('offers').delete().in('id', offerIds)
    void created
  }
})
