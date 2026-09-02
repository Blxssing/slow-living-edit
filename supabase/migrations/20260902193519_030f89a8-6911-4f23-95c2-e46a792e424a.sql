-- ============================================================
-- M4: Customers, addresses, order numbering & money hardening
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name  text,
  email      text,
  phone      text,
  is_guest   boolean NOT NULL DEFAULT true,
  status     text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers read own record"
  ON public.customers FOR SELECT TO authenticated
  USING (profile_id = (select auth.uid()));
CREATE POLICY "Customers update own record"
  ON public.customers FOR UPDATE TO authenticated
  USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));
CREATE POLICY "Staff with CUSTOMER_VIEW read customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'CUSTOMER_VIEW'));

CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(lower(email));
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Customer addresses ----------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label          text,
  recipient_name text NOT NULL,
  phone          text NOT NULL,
  address_line_1 text NOT NULL,
  address_line_2 text,
  city           text NOT NULL,
  county         text,
  postal_code    text,
  country        text NOT NULL DEFAULT 'Kenya',
  is_default     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers manage own addresses"
  ON public.customer_addresses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c
                 WHERE c.id = customer_id AND c.profile_id = (select auth.uid())));
CREATE POLICY "Customers insert own addresses"
  ON public.customer_addresses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers c
                 WHERE c.id = customer_id AND c.profile_id = (select auth.uid())));
CREATE POLICY "Customers update own addresses"
  ON public.customer_addresses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c
                 WHERE c.id = customer_id AND c.profile_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers c
                 WHERE c.id = customer_id AND c.profile_id = (select auth.uid())));
CREATE POLICY "Staff with ORDER_VIEW read addresses"
  ON public.customer_addresses FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'ORDER_VIEW'));

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON public.customer_addresses(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_default
  ON public.customer_addresses(customer_id) WHERE is_default;

CREATE TRIGGER update_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Orders -----------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'MB-' || to_char(now(), 'YYYY') || '-' ||
                        lpad(nextval('public.order_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_order_number() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS customer_ref uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS delivery_address_id uuid REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS placed_at timestamptz NOT NULL DEFAULT now();

UPDATE public.orders SET order_number =
  'MB-' || to_char(created_at, 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0')
WHERE order_number IS NULL;

ALTER TABLE public.orders ALTER COLUMN order_number SET NOT NULL;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);

CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

ALTER TABLE public.orders
  ALTER COLUMN subtotal TYPE numeric(12,2),
  ALTER COLUMN shipping_cost TYPE numeric(12,2),
  ALTER COLUMN tax_amount TYPE numeric(12,2),
  ALTER COLUMN discount_amount TYPE numeric(12,2),
  ALTER COLUMN total TYPE numeric(12,2);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_money_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_money_check
  CHECK (subtotal >= 0 AND shipping_cost >= 0 AND tax_amount >= 0
         AND discount_amount >= 0 AND total >= 0);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('PENDING','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED'));

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_ref ON public.orders(customer_ref);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- ---- Order items -------------------------------------------------
ALTER TABLE public.order_items
  ALTER COLUMN unit_price TYPE numeric(12,2),
  ALTER COLUMN total_price TYPE numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_snapshot numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_amounts_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_amounts_check
  CHECK (quantity > 0 AND unit_price >= 0 AND total_price >= 0 AND discount_snapshot >= 0);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history(order_id, created_at DESC);