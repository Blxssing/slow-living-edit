-- ============================================================
-- M5: Payments idempotency + financial ledger
-- ============================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'MPESA',
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS checkout_request_id text,
  ADD COLUMN IF NOT EXISTS merchant_request_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

ALTER TABLE public.payments ALTER COLUMN amount TYPE numeric(12,2);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
UPDATE public.payments SET status = upper(status);
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('PENDING','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED'));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0);

-- An order can only ever have one successful payment
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_paid_per_order
  ON public.payments(order_id) WHERE status = 'PAID';

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_external_txn ON public.payments(external_transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_checkout_request
  ON public.payments(checkout_request_id) WHERE checkout_request_id IS NOT NULL;

-- ---- Payment events (idempotent callback intake) -----------------
CREATE TABLE IF NOT EXISTS public.payment_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id          uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  provider          text NOT NULL DEFAULT 'MPESA',
  provider_event_id text NOT NULL,
  event_type        text NOT NULL,
  result_code       text,
  result_desc       text,
  raw_payload       jsonb NOT NULL,
  processed         boolean NOT NULL DEFAULT false,
  processed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_events_unique_event UNIQUE (provider, provider_event_id)
);

GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with PAYMENT_VIEW read payment events"
  ON public.payment_events FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'PAYMENT_VIEW'));

CREATE INDEX IF NOT EXISTS idx_payment_events_order ON public.payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON public.payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_unprocessed ON public.payment_events(processed) WHERE NOT processed;

-- ---- Financial transactions ledger -------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  payment_id       uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN ('SALE','REFUND','ADJUSTMENT')),
  amount           numeric(12,2) NOT NULL,
  currency         char(3) NOT NULL DEFAULT 'KES',
  reference        text,
  status           text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','FAILED','REVERSED')),
  notes            text,
  actor_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_date timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with TRANSACTION_VIEW read transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'TRANSACTION_VIEW'));

CREATE POLICY "Customers read transactions on own orders"
  ON public.transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o
                 WHERE o.id = order_id AND o.customer_id = (select auth.uid())));

CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON public.transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment ON public.transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(transaction_type);

CREATE TRIGGER transactions_immutable
  BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

CREATE TRIGGER payment_events_no_delete
  BEFORE DELETE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();