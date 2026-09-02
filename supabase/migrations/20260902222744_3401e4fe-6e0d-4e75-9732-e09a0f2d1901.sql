-- 1. Inventory columns + constraints -------------------------------------
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS returned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS chk_inventory_non_negative,
  DROP CONSTRAINT IF EXISTS chk_inventory_capacity,
  DROP CONSTRAINT IF EXISTS chk_inventory_threshold;

ALTER TABLE public.inventory
  ADD CONSTRAINT chk_inventory_non_negative CHECK (
    quantity >= 0 AND reserved >= 0 AND sold >= 0
    AND returned >= 0 AND damaged >= 0 AND lost >= 0),
  ADD CONSTRAINT chk_inventory_capacity CHECK (reserved + sold <= quantity),
  ADD CONSTRAINT chk_inventory_threshold CHECK (low_stock_threshold >= 0);

-- 2. Movement ledger enrichment -------------------------------------------
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS quantity_before integer,
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reservation_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS inventory_id uuid REFERENCES public.inventory(id);

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS chk_movement_type;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT chk_movement_type CHECK (movement_type IN (
    'INITIAL_STOCK','RESTOCK','STOCK_IN','RESERVATION','RESERVATION_RELEASE',
    'RESERVATION_EXPIRED','RELEASE','SALE','RETURN_RESTOCK','RETURN_DAMAGED',
    'RETURN_NON_RESELLABLE','RETURN','DAMAGE','LOSS','MANUAL_ADJUSTMENT',
    'ADJUSTMENT','CORRECTION'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_movements_idempotency
  ON public.inventory_movements (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type_created
  ON public.inventory_movements (movement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference
  ON public.inventory_movements (reference_type, reference_id);

-- 3. Reservations ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  reference_type text NOT NULL DEFAULT 'CART'
    CHECK (reference_type IN ('CART','ORDER','MANUAL','SYSTEM')),
  reference_id uuid,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','CONVERTED','RELEASED','EXPIRED','CANCELLED')),
  idempotency_key text,
  expires_at timestamptz,
  released_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inventory_reservations TO authenticated;
GRANT ALL ON public.inventory_reservations TO service_role;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff with INVENTORY_VIEW read reservations" ON public.inventory_reservations;
CREATE POLICY "Staff with INVENTORY_VIEW read reservations"
  ON public.inventory_reservations FOR SELECT TO authenticated
  USING (public.has_permission((SELECT auth.uid()), 'INVENTORY_VIEW'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservations_idempotency
  ON public.inventory_reservations (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_variant_status
  ON public.inventory_reservations (variant_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_active_expiry
  ON public.inventory_reservations (expires_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_reservations_reference
  ON public.inventory_reservations (reference_type, reference_id);

DROP TRIGGER IF EXISTS update_inventory_reservations_updated_at ON public.inventory_reservations;
CREATE TRIGGER update_inventory_reservations_updated_at
  BEFORE UPDATE ON public.inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Status helper ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_status(_available integer, _threshold integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE(_available,0) <= 0 THEN 'OUT_OF_STOCK'
    WHEN COALESCE(_available,0) <= COALESCE(_threshold,0) THEN 'LOW_STOCK'
    ELSE 'IN_STOCK' END;
$$;

-- 5. Authoritative stock engine -------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  _variant_id uuid,
  _movement_type text,
  _quantity integer,
  _reason text DEFAULT NULL,
  _actor_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _reservation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.inventory%ROWTYPE;
  q integer := _quantity;
  new_qty integer; new_res integer; new_sold integer;
  new_ret integer; new_dam integer; new_lost integer;
  existing public.inventory_movements%ROWTYPE;
  mv public.inventory_movements%ROWTYPE;
  prod uuid;
BEGIN
  IF q IS NULL OR q = 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
  IF abs(q) > 1000000 THEN RAISE EXCEPTION 'QUANTITY_OUT_OF_RANGE'; END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.inventory_movements
      WHERE idempotency_key = _idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'movement_id', existing.id,
        'quantity', existing.quantity_after, 'reserved', existing.reserved_after,
        'sold', existing.sold_after);
    END IF;
  END IF;

  -- Row lock: serialises concurrent operations on the same variant.
  SELECT * INTO inv FROM public.inventory WHERE variant_id = _variant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_NOT_FOUND'; END IF;

  SELECT product_id INTO prod FROM public.product_variants WHERE id = _variant_id;

  new_qty := inv.quantity; new_res := inv.reserved; new_sold := inv.sold;
  new_ret := inv.returned; new_dam := inv.damaged; new_lost := inv.lost;

  CASE _movement_type
    WHEN 'INITIAL_STOCK','RESTOCK','STOCK_IN' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      new_qty := new_qty + q;
    WHEN 'MANUAL_ADJUSTMENT','ADJUSTMENT','CORRECTION' THEN
      new_qty := new_qty + q;
    WHEN 'DAMAGE' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      new_qty := new_qty - q; new_dam := new_dam + q; q := -q;
    WHEN 'LOSS' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      new_qty := new_qty - q; new_lost := new_lost + q; q := -q;
    WHEN 'RESERVATION' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      IF (inv.quantity - inv.reserved - inv.sold) < q THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK';
      END IF;
      new_res := new_res + q; q := -q;
    WHEN 'RESERVATION_RELEASE','RELEASE','RESERVATION_EXPIRED' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      IF inv.reserved < q THEN RAISE EXCEPTION 'RESERVATION_INVALID'; END IF;
      new_res := new_res - q;
    WHEN 'SALE' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      IF inv.reserved < q THEN RAISE EXCEPTION 'RESERVATION_INVALID'; END IF;
      new_res := new_res - q; new_sold := new_sold + q; q := -q;
    WHEN 'RETURN_RESTOCK','RETURN' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      IF inv.sold < q THEN RAISE EXCEPTION 'RETURN_EXCEEDS_SOLD'; END IF;
      new_sold := new_sold - q; new_ret := new_ret + q;
    WHEN 'RETURN_DAMAGED' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      IF inv.sold < q THEN RAISE EXCEPTION 'RETURN_EXCEEDS_SOLD'; END IF;
      new_sold := new_sold - q; new_ret := new_ret + q;
      new_qty := new_qty - q; new_dam := new_dam + q; q := -q;
    WHEN 'RETURN_NON_RESELLABLE' THEN
      IF q < 0 THEN RAISE EXCEPTION 'QUANTITY_INVALID'; END IF;
      IF inv.sold < q THEN RAISE EXCEPTION 'RETURN_EXCEEDS_SOLD'; END IF;
      new_sold := new_sold - q; new_ret := new_ret + q;
      new_qty := new_qty - q; new_lost := new_lost + q; q := -q;
    ELSE
      RAISE EXCEPTION 'MOVEMENT_TYPE_INVALID';
  END CASE;

  IF new_qty < 0 OR new_res < 0 OR new_sold < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_STOCK';
  END IF;
  IF new_res + new_sold > new_qty THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK';
  END IF;

  UPDATE public.inventory
     SET quantity = new_qty, reserved = new_res, sold = new_sold,
         returned = new_ret, damaged = new_dam, lost = new_lost,
         updated_by = COALESCE(_actor_id, updated_by), updated_at = now()
   WHERE id = inv.id;

  INSERT INTO public.inventory_movements
    (variant_id, product_id, inventory_id, movement_type, quantity_delta,
     quantity_before, quantity_after, reserved_after, sold_after, reason, notes,
     reference_type, reference_id, order_id, idempotency_key, reservation_id, actor_id)
  VALUES
    (_variant_id, prod, inv.id, _movement_type, q,
     inv.quantity, new_qty, new_res, new_sold, _reason, _notes,
     _reference_type, _reference_id,
     CASE WHEN _reference_type = 'ORDER' THEN _reference_id END,
     _idempotency_key, _reservation_id, _actor_id)
  RETURNING * INTO mv;

  INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_values, new_values)
  VALUES (_actor_id,
    CASE _movement_type
      WHEN 'RESTOCK' THEN 'STOCK_RESTOCKED' WHEN 'INITIAL_STOCK' THEN 'INVENTORY_CREATED'
      WHEN 'STOCK_IN' THEN 'STOCK_RESTOCKED'
      WHEN 'RESERVATION' THEN 'STOCK_RESERVED'
      WHEN 'RESERVATION_RELEASE' THEN 'STOCK_RESERVATION_RELEASED'
      WHEN 'RELEASE' THEN 'STOCK_RESERVATION_RELEASED'
      WHEN 'RESERVATION_EXPIRED' THEN 'STOCK_RESERVATION_RELEASED'
      WHEN 'SALE' THEN 'STOCK_SOLD'
      WHEN 'DAMAGE' THEN 'STOCK_MARKED_DAMAGED' WHEN 'RETURN_DAMAGED' THEN 'STOCK_MARKED_DAMAGED'
      WHEN 'LOSS' THEN 'STOCK_MARKED_LOST' WHEN 'RETURN_NON_RESELLABLE' THEN 'STOCK_MARKED_LOST'
      WHEN 'RETURN' THEN 'STOCK_RETURNED' WHEN 'RETURN_RESTOCK' THEN 'STOCK_RETURNED'
      ELSE 'STOCK_ADJUSTED' END,
    'inventory', inv.id,
    jsonb_build_object('quantity', inv.quantity, 'reserved', inv.reserved, 'sold', inv.sold,
                       'returned', inv.returned, 'damaged', inv.damaged, 'lost', inv.lost),
    jsonb_build_object('quantity', new_qty, 'reserved', new_res, 'sold', new_sold,
                       'returned', new_ret, 'damaged', new_dam, 'lost', new_lost,
                       'movement_type', _movement_type, 'reason', _reason,
                       'reference_type', _reference_type, 'reference_id', _reference_id));

  RETURN jsonb_build_object(
    'duplicate', false, 'movement_id', mv.id, 'variant_id', _variant_id,
    'quantity', new_qty, 'reserved', new_res, 'sold', new_sold,
    'returned', new_ret, 'damaged', new_dam, 'lost', new_lost,
    'available', new_qty - new_res - new_sold,
    'status', public.inventory_status(new_qty - new_res - new_sold, inv.low_stock_threshold));
END;
$$;

REVOKE ALL ON FUNCTION public.apply_inventory_movement(uuid,text,integer,text,uuid,text,text,uuid,text,uuid) FROM PUBLIC, anon, authenticated;

-- 6. Reservation lifecycle -------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_stock(
  _variant_id uuid, _quantity integer, _reference_type text DEFAULT 'CART',
  _reference_id uuid DEFAULT NULL, _ttl_minutes integer DEFAULT 30,
  _actor_id uuid DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.inventory%ROWTYPE; res public.inventory_reservations%ROWTYPE; r jsonb; prod uuid;
BEGIN
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO res FROM public.inventory_reservations WHERE idempotency_key = _idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'reservation_id', res.id, 'status', res.status);
    END IF;
  END IF;

  SELECT * INTO inv FROM public.inventory WHERE variant_id = _variant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_NOT_FOUND'; END IF;
  SELECT product_id INTO prod FROM public.product_variants WHERE id = _variant_id;

  INSERT INTO public.inventory_reservations
    (inventory_id, variant_id, product_id, quantity, reference_type, reference_id,
     expires_at, created_by, idempotency_key)
  VALUES (inv.id, _variant_id, prod, _quantity, COALESCE(_reference_type,'CART'), _reference_id,
          now() + make_interval(mins => GREATEST(COALESCE(_ttl_minutes,30),1)),
          _actor_id, _idempotency_key)
  RETURNING * INTO res;

  r := public.apply_inventory_movement(_variant_id, 'RESERVATION', _quantity,
        'Stock reserved', _actor_id, NULL, COALESCE(_reference_type,'CART'), _reference_id,
        NULL, res.id);

  RETURN r || jsonb_build_object('reservation_id', res.id, 'expires_at', res.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_reservation(
  _reservation_id uuid, _actor_id uuid DEFAULT NULL, _final_status text DEFAULT 'RELEASED',
  _reason text DEFAULT 'Reservation released'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res public.inventory_reservations%ROWTYPE; r jsonb;
BEGIN
  IF _final_status NOT IN ('RELEASED','EXPIRED','CANCELLED') THEN
    RAISE EXCEPTION 'STATUS_INVALID';
  END IF;

  UPDATE public.inventory_reservations
     SET status = _final_status, released_at = now()
   WHERE id = _reservation_id AND status = 'ACTIVE'
  RETURNING * INTO res;

  IF NOT FOUND THEN
    SELECT * INTO res FROM public.inventory_reservations WHERE id = _reservation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
    RETURN jsonb_build_object('duplicate', true, 'reservation_id', res.id, 'status', res.status);
  END IF;

  r := public.apply_inventory_movement(res.variant_id,
        CASE WHEN _final_status = 'EXPIRED' THEN 'RESERVATION_EXPIRED' ELSE 'RESERVATION_RELEASE' END,
        res.quantity, _reason, _actor_id, NULL, res.reference_type, res.reference_id, NULL, res.id);

  RETURN r || jsonb_build_object('reservation_id', res.id, 'status', _final_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_reservation(
  _reservation_id uuid, _actor_id uuid DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res public.inventory_reservations%ROWTYPE; r jsonb;
BEGIN
  UPDATE public.inventory_reservations
     SET status = 'CONVERTED', released_at = now()
   WHERE id = _reservation_id AND status = 'ACTIVE'
  RETURNING * INTO res;

  IF NOT FOUND THEN
    SELECT * INTO res FROM public.inventory_reservations WHERE id = _reservation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
    RETURN jsonb_build_object('duplicate', true, 'reservation_id', res.id, 'status', res.status);
  END IF;

  r := public.apply_inventory_movement(res.variant_id, 'SALE', res.quantity,
        'Reservation converted to sale', _actor_id, NULL, res.reference_type, res.reference_id,
        _idempotency_key, res.id);

  RETURN r || jsonb_build_object('reservation_id', res.id, 'status', 'CONVERTED');
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_reservations(_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec record; n integer := 0;
BEGIN
  FOR rec IN
    SELECT id FROM public.inventory_reservations
     WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= now()
     ORDER BY expires_at LIMIT GREATEST(COALESCE(_limit,500),1)
  LOOP
    PERFORM public.release_reservation(rec.id, NULL, 'EXPIRED', 'Reservation expired');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_stock(uuid,integer,text,uuid,integer,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_reservation(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_reservation(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_reservations(integer) FROM PUBLIC, anon, authenticated;

-- 7. Legacy RPCs now delegate to the single engine -------------------------
CREATE OR REPLACE FUNCTION public.reserve_inventory(_variant_id uuid, _qty integer, _order_id uuid DEFAULT NULL, _actor_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  PERFORM public.apply_inventory_movement(_variant_id, 'RESERVATION', _qty,
    'Checkout reservation', _actor_id, NULL, CASE WHEN _order_id IS NOT NULL THEN 'ORDER' END, _order_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_inventory(_variant_id uuid, _qty integer, _order_id uuid DEFAULT NULL, _actor_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  PERFORM public.apply_inventory_movement(_variant_id, 'RESERVATION_RELEASE', _qty,
    'Reservation released', _actor_id, NULL, CASE WHEN _order_id IS NOT NULL THEN 'ORDER' END, _order_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_inventory(_variant_id uuid, _qty integer, _order_id uuid DEFAULT NULL, _actor_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  PERFORM public.apply_inventory_movement(_variant_id, 'SALE', _qty,
    'Payment confirmed', _actor_id, NULL, CASE WHEN _order_id IS NOT NULL THEN 'ORDER' END, _order_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory(_variant_id uuid, _delta integer, _movement_type text, _reason text, _actor_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.apply_inventory_movement(_variant_id,
    CASE _movement_type WHEN 'STOCK_IN' THEN 'RESTOCK' WHEN 'ADJUSTMENT' THEN 'MANUAL_ADJUSTMENT'
                        WHEN 'RETURN' THEN 'RETURN_RESTOCK' ELSE _movement_type END,
    CASE WHEN _movement_type IN ('DAMAGE','LOSS','RETURN') THEN abs(_delta) ELSE _delta END,
    _reason, _actor_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

-- 8. Permissions -----------------------------------------------------------
INSERT INTO public.permissions (key, domain, description) VALUES
  ('INVENTORY_RESTOCK','inventory','Add received stock to inventory'),
  ('INVENTORY_RESERVE','inventory','Create and release stock reservations'),
  ('INVENTORY_WRITE_OFF','inventory','Record damaged, lost or non-resellable stock'),
  ('INVENTORY_MOVEMENT_VIEW','inventory','View the inventory movement ledger')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT r.role, p.id FROM (VALUES
  ('CEO'::app_role,'INVENTORY_RESTOCK'),('CEO','INVENTORY_RESERVE'),
  ('CEO','INVENTORY_WRITE_OFF'),('CEO','INVENTORY_MOVEMENT_VIEW'),
  ('SALES'::app_role,'INVENTORY_RESTOCK'),('SALES','INVENTORY_RESERVE'),
  ('SALES','INVENTORY_MOVEMENT_VIEW'),
  ('HR'::app_role,'INVENTORY_VIEW')
) AS r(role, key)
JOIN public.permissions p ON p.key = r.key
ON CONFLICT DO NOTHING;