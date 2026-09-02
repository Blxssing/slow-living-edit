-- ============================================================
-- M7: Race-safe inventory operations with ledger writes
-- ============================================================

CREATE OR REPLACE FUNCTION public.reserve_inventory(
  _variant_id uuid, _qty integer, _order_id uuid DEFAULT NULL, _actor_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.inventory%ROWTYPE;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;

  UPDATE public.inventory
     SET reserved = reserved + _qty, updated_at = now()
   WHERE variant_id = _variant_id
     AND (quantity - reserved - sold) >= _qty
  RETURNING * INTO r;

  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.inventory_movements
    (variant_id, movement_type, quantity_delta, quantity_after, reserved_after, sold_after, reason, order_id, actor_id)
  VALUES (_variant_id, 'RESERVATION', -_qty, r.quantity, r.reserved, r.sold, 'Checkout reservation', _order_id, _actor_id);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_inventory(
  _variant_id uuid, _qty integer, _order_id uuid DEFAULT NULL, _actor_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.inventory%ROWTYPE;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;

  UPDATE public.inventory
     SET reserved = reserved - _qty, updated_at = now()
   WHERE variant_id = _variant_id AND reserved >= _qty
  RETURNING * INTO r;

  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.inventory_movements
    (variant_id, movement_type, quantity_delta, quantity_after, reserved_after, sold_after, reason, order_id, actor_id)
  VALUES (_variant_id, 'RELEASE', _qty, r.quantity, r.reserved, r.sold, 'Reservation released', _order_id, _actor_id);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_inventory(
  _variant_id uuid, _qty integer, _order_id uuid DEFAULT NULL, _actor_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.inventory%ROWTYPE;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;

  UPDATE public.inventory
     SET reserved = reserved - _qty, sold = sold + _qty, updated_at = now()
   WHERE variant_id = _variant_id AND reserved >= _qty
  RETURNING * INTO r;

  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.inventory_movements
    (variant_id, movement_type, quantity_delta, quantity_after, reserved_after, sold_after, reason, order_id, actor_id)
  VALUES (_variant_id, 'SALE', -_qty, r.quantity, r.reserved, r.sold, 'Payment confirmed', _order_id, _actor_id);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory(
  _variant_id uuid, _delta integer, _movement_type text, _reason text, _actor_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.inventory%ROWTYPE;
BEGIN
  IF _movement_type NOT IN ('STOCK_IN','RESTOCK','ADJUSTMENT','DAMAGE','RETURN') THEN
    RAISE EXCEPTION 'Invalid movement type';
  END IF;

  UPDATE public.inventory
     SET quantity = quantity + _delta, updated_at = now()
   WHERE variant_id = _variant_id
     AND (quantity + _delta) >= (reserved + sold)
     AND (quantity + _delta) >= 0
  RETURNING * INTO r;

  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.inventory_movements
    (variant_id, movement_type, quantity_delta, quantity_after, reserved_after, sold_after, reason, actor_id)
  VALUES (_variant_id, _movement_type, _delta, r.quantity, r.reserved, r.sold, _reason, _actor_id);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_inventory(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_inventory(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_inventory(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_inventory(uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_inventory(uuid, integer, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_inventory(uuid, integer, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_inventory(uuid, integer, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, integer, text, text, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.reserve_inventory(uuid, integer);
DROP FUNCTION IF EXISTS public.release_inventory(uuid, integer);
DROP FUNCTION IF EXISTS public.commit_inventory(uuid, integer);