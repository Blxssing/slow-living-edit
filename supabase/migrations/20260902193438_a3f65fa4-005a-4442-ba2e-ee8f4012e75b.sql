-- ============================================================
-- M3: Inventory movement ledger + integrity
-- ============================================================

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_non_negative_check;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_non_negative_check
  CHECK (quantity >= 0 AND reserved >= 0 AND sold >= 0);

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_variant_id_key;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_variant_id_key UNIQUE (variant_id);

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_threshold_check;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_threshold_check
  CHECK (low_stock_threshold >= 0);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  movement_type  text NOT NULL CHECK (movement_type IN
                   ('STOCK_IN','SALE','RETURN','ADJUSTMENT','DAMAGE','RESTOCK','RESERVATION','RELEASE')),
  quantity_delta integer NOT NULL,
  quantity_after integer NOT NULL CHECK (quantity_after >= 0),
  reserved_after integer NOT NULL CHECK (reserved_after >= 0),
  sold_after     integer NOT NULL CHECK (sold_after >= 0),
  reason         text,
  order_id       uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  actor_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with INVENTORY_VIEW can read movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'INVENTORY_VIEW'));

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant ON public.inventory_movements(variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON public.inventory_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant_id ON public.inventory(variant_id);

-- Immutability: ledger rows can never be changed or removed, even by service_role
CREATE OR REPLACE FUNCTION public.prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Rows in % are append-only and cannot be modified or deleted', TG_TABLE_NAME;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER inventory_movements_immutable
  BEFORE UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();