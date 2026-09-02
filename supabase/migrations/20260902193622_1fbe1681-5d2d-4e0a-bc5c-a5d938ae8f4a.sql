-- ============================================================
-- M6: CMS, reporting, permission-based policy switch-over
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page         text NOT NULL,
  section_type text NOT NULL CHECK (section_type IN
                 ('HERO','BANNER','PRODUCT_GRID','PROMOTION','IMAGE_TEXT','TESTIMONIALS',
                  'FAQ','VIDEO','FEATURED_PRODUCTS','CATEGORY_SECTION')),
  title        text,
  subtitle     text,
  content      text,
  image_url    text,
  link_url     text,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order   integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.content_sections TO anon, authenticated;
GRANT ALL ON public.content_sections TO service_role;
ALTER TABLE public.content_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published content is publicly readable"
  ON public.content_sections FOR SELECT TO anon, authenticated
  USING (status = 'PUBLISHED');

CREATE POLICY "Staff with CMS_VIEW read all content"
  ON public.content_sections FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'CMS_VIEW'));

CREATE INDEX IF NOT EXISTS idx_content_sections_page ON public.content_sections(page, status, sort_order);

CREATE TRIGGER update_content_sections_updated_at
  BEFORE UPDATE ON public.content_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Permission-based policy switch-over -------------------------
DROP POLICY IF EXISTS "Staff can read all orders" ON public.orders;
CREATE POLICY "Staff with ORDER_VIEW read all orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'ORDER_VIEW'));

DROP POLICY IF EXISTS "Customers can read own orders" ON public.orders;
CREATE POLICY "Customers read own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (customer_id = (select auth.uid()));

DROP POLICY IF EXISTS "Staff can read all order items" ON public.order_items;
CREATE POLICY "Staff with ORDER_VIEW read all order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'ORDER_VIEW'));

DROP POLICY IF EXISTS "Staff can read all order status history" ON public.order_status_history;
CREATE POLICY "Staff with ORDER_VIEW read all order status history"
  ON public.order_status_history FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'ORDER_VIEW'));

DROP POLICY IF EXISTS "Staff can read all payments" ON public.payments;
CREATE POLICY "Staff with PAYMENT_VIEW read all payments"
  ON public.payments FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'PAYMENT_VIEW'));

DROP POLICY IF EXISTS "Staff can read all payment attempts" ON public.payment_attempts;
CREATE POLICY "Staff with PAYMENT_VIEW read all payment attempts"
  ON public.payment_attempts FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'PAYMENT_VIEW'));

DROP POLICY IF EXISTS "Staff can read inventory" ON public.inventory;
CREATE POLICY "Staff with INVENTORY_VIEW read inventory"
  ON public.inventory FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'INVENTORY_VIEW'));

DROP POLICY IF EXISTS "Staff can read audit logs" ON public.audit_logs;
CREATE POLICY "Staff with AUDIT_VIEW read audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'AUDIT_VIEW'));

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ---- Reporting views (security_invoker: RLS of the caller applies) ----
CREATE OR REPLACE VIEW public.v_daily_sales
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', o.created_at)::date       AS sales_date,
  o.currency,
  count(DISTINCT o.id)                        AS order_count,
  coalesce(sum(oi.quantity), 0)               AS units_sold,
  coalesce(sum(o.subtotal), 0)                AS gross_amount,
  coalesce(sum(o.discount_amount), 0)         AS discount_amount,
  coalesce(sum(o.total), 0)                   AS net_amount,
  round(coalesce(avg(o.total), 0), 2)         AS average_order_value
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.payment_status = 'PAID'
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.v_payment_summary
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', p.created_at)::date AS payment_date,
  p.provider,
  p.currency,
  count(*) FILTER (WHERE p.status = 'PAID')      AS paid_count,
  count(*) FILTER (WHERE p.status = 'FAILED')    AS failed_count,
  count(*) FILTER (WHERE p.status = 'REFUNDED')  AS refunded_count,
  coalesce(sum(p.amount) FILTER (WHERE p.status = 'PAID'), 0)     AS paid_amount,
  coalesce(sum(p.amount) FILTER (WHERE p.status = 'REFUNDED'), 0) AS refunded_amount
FROM public.payments p
GROUP BY 1, 2, 3;

GRANT SELECT ON public.v_daily_sales, public.v_payment_summary TO authenticated;
GRANT SELECT ON public.v_daily_sales, public.v_payment_summary TO service_role;