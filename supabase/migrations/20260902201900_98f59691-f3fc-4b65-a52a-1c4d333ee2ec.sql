-- ============ 1. Columns ============
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- ============ 2. Constraints ============
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_status_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_status_check
  CHECK (status IN ('DRAFT','SCHEDULED','ACTIVE','EXPIRED','ARCHIVED'));

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_percentage_check;
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_value_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_value_check CHECK (
  (offer_type = 'PERCENTAGE'   AND value > 0 AND value <= 100)
  OR (offer_type = 'FIXED_AMOUNT' AND value > 0 AND value < 10000000000)
  OR (offer_type = 'LABEL_ONLY'   AND value = 0)
);

ALTER TABLE public.offers ADD CONSTRAINT offers_label_required CHECK (
  offer_type <> 'LABEL_ONLY' OR (promotional_label IS NOT NULL AND btrim(promotional_label) <> '')
);

ALTER TABLE public.offers ADD CONSTRAINT offers_label_format CHECK (
  promotional_label IS NULL
  OR (char_length(promotional_label) BETWEEN 2 AND 40
      AND promotional_label = btrim(promotional_label)
      AND promotional_label ~ '^[A-Za-z0-9][A-Za-z0-9 %+&''.-]*$')
);

ALTER TABLE public.offers ADD CONSTRAINT offers_name_format CHECK (
  char_length(btrim(name)) BETWEEN 2 AND 160 AND name = btrim(name)
);

ALTER TABLE public.offers ADD CONSTRAINT offers_notes_len CHECK (
  internal_notes IS NULL OR char_length(internal_notes) <= 2000
);

-- ============ 3. One live price-discount offer per product ============
CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_one_live_discount_per_product
  ON public.offers (product_id)
  WHERE offer_type <> 'LABEL_ONLY'
    AND product_id IS NOT NULL
    AND status IN ('DRAFT','SCHEDULED','ACTIVE');

-- ============ 4. Indexes ============
CREATE INDEX IF NOT EXISTS idx_offers_product   ON public.offers (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offers_category  ON public.offers (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offers_status    ON public.offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_window    ON public.offers (start_at, end_at) WHERE status IN ('SCHEDULED','ACTIVE');

-- ============ 5. Authoritative money maths ============
CREATE OR REPLACE FUNCTION public.money_round(_amount numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT round(_amount::numeric, 2);
$$;

-- Returns discount_amount and final_price for a base price + offer definition.
CREATE OR REPLACE FUNCTION public.calculate_discount(
  _base_price numeric, _offer_type text, _value numeric
) RETURNS TABLE(discount_amount numeric, final_price numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d numeric := 0;
BEGIN
  IF _base_price IS NULL OR _base_price < 0 THEN
    RAISE EXCEPTION 'Invalid base price';
  END IF;

  IF _offer_type = 'PERCENTAGE' THEN
    IF _value IS NULL OR _value <= 0 OR _value > 100 THEN RAISE EXCEPTION 'Invalid percentage'; END IF;
    d := public.money_round(_base_price * _value / 100);
  ELSIF _offer_type = 'FIXED_AMOUNT' THEN
    IF _value IS NULL OR _value <= 0 THEN RAISE EXCEPTION 'Invalid fixed amount'; END IF;
    d := public.money_round(LEAST(_value, _base_price));
  ELSIF _offer_type = 'LABEL_ONLY' THEN
    d := 0;
  ELSE
    RAISE EXCEPTION 'Unknown offer type';
  END IF;

  d := GREATEST(d, 0);
  RETURN QUERY SELECT d, public.money_round(_base_price - d);
END;
$$;

-- Time/status validity of an offer row.
CREATE OR REPLACE FUNCTION public.offer_is_live(_status text, _start_at timestamptz, _end_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _status IN ('ACTIVE','SCHEDULED')
     AND _start_at <= now()
     AND (_end_at IS NULL OR _end_at > now());
$$;

-- Single authoritative pricing entry point for a product.
CREATE OR REPLACE FUNCTION public.get_product_pricing(_product_id uuid)
RETURNS TABLE(
  product_id uuid, base_price numeric, discount_amount numeric, final_price numeric,
  offer_id uuid, offer_type text, offer_value numeric, promotional_label text,
  start_at timestamptz, end_at timestamptz, labels text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products%ROWTYPE; o public.offers%ROWTYPE; calc record;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF p.status = 'ACTIVE' THEN
    SELECT * INTO o FROM public.offers
     WHERE offers.product_id = _product_id
       AND offer_type <> 'LABEL_ONLY'
       AND public.offer_is_live(status, offers.start_at, offers.end_at)
     ORDER BY priority DESC, created_at DESC
     LIMIT 1;
  END IF;

  IF o.id IS NOT NULL THEN
    SELECT * INTO calc FROM public.calculate_discount(p.base_price, o.offer_type, o.value);
  ELSE
    calc := ROW(0::numeric, public.money_round(p.base_price));
  END IF;

  RETURN QUERY
  SELECT p.id, public.money_round(p.base_price), calc.discount_amount, calc.final_price,
         o.id, o.offer_type, o.value, o.promotional_label, o.start_at, o.end_at,
         COALESCE((
           SELECT array_agg(l.promotional_label ORDER BY l.priority DESC, l.created_at)
           FROM public.offers l
           WHERE l.product_id = _product_id
             AND l.offer_type = 'LABEL_ONLY'
             AND l.promotional_label IS NOT NULL
             AND public.offer_is_live(l.status, l.start_at, l.end_at)
             AND p.status = 'ACTIVE'
         ), ARRAY[]::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_pricing(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_product_pricing(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_discount(numeric, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.offer_is_live(text, timestamptz, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.money_round(numeric) TO anon, authenticated, service_role;

-- ============ 6. Validation trigger ============
CREATE OR REPLACE FUNCTION public.validate_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products%ROWTYPE;
BEGIN
  IF NEW.end_at IS NOT NULL AND NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'end_at must be later than start_at';
  END IF;

  IF NEW.promotional_label IS NOT NULL THEN
    NEW.promotional_label := btrim(NEW.promotional_label);
    IF NEW.promotional_label = '' THEN NEW.promotional_label := NULL; END IF;
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT * INTO p FROM public.products WHERE id = NEW.product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF p.status = 'ARCHIVED' AND NEW.status IN ('DRAFT','SCHEDULED','ACTIVE') THEN
      RAISE EXCEPTION 'Cannot attach a live offer to an archived product';
    END IF;
    IF NEW.offer_type = 'FIXED_AMOUNT' AND NEW.value > p.base_price THEN
      RAISE EXCEPTION 'Fixed discount cannot exceed the product price';
    END IF;
  END IF;

  IF NEW.status = 'ACTIVE' AND (OLD IS NULL OR OLD.status <> 'ACTIVE') THEN
    IF NEW.end_at IS NOT NULL AND NEW.end_at <= now() THEN
      RAISE EXCEPTION 'Cannot activate an offer that has already ended';
    END IF;
    NEW.activated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offers_validate ON public.offers;
CREATE TRIGGER offers_validate BEFORE INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.validate_offer();

DROP TRIGGER IF EXISTS offers_stamp_actor ON public.offers;
CREATE TRIGGER offers_stamp_actor BEFORE INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.stamp_actor();

DROP TRIGGER IF EXISTS offers_bump_version ON public.offers;
CREATE TRIGGER offers_bump_version BEFORE UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.bump_version();

-- ============ 7. Audit trigger ============
CREATE OR REPLACE FUNCTION public.audit_offer_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text; v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_action := CASE WHEN NEW.status = 'ACTIVE' THEN 'OFFER_ACTIVATED'
                     WHEN NEW.status = 'SCHEDULED' THEN 'OFFER_SCHEDULED'
                     ELSE 'OFFER_CREATED' END;
    IF v_action <> 'OFFER_CREATED' THEN
      INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, new_values)
      VALUES (auth.uid(), 'OFFER_CREATED', 'offers', NEW.id, v_new);
    END IF;
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    IF (v_old - 'updated_at' - 'version') = (v_new - 'updated_at' - 'version') THEN
      RETURN NEW;
    END IF;
    v_action := CASE
      WHEN NEW.status = 'ARCHIVED'  AND OLD.status <> 'ARCHIVED'  THEN 'OFFER_ARCHIVED'
      WHEN NEW.status = 'ACTIVE'    AND OLD.status <> 'ACTIVE'    THEN 'OFFER_ACTIVATED'
      WHEN NEW.status = 'SCHEDULED' AND OLD.status <> 'SCHEDULED' THEN 'OFFER_SCHEDULED'
      WHEN NEW.status = 'EXPIRED'   AND OLD.status <> 'EXPIRED'   THEN 'OFFER_EXPIRED'
      WHEN OLD.status = 'ACTIVE'    AND NEW.status = 'DRAFT'      THEN 'OFFER_DEACTIVATED'
      ELSE 'OFFER_UPDATED' END;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_values, new_values)
  VALUES (auth.uid(), v_action, 'offers', COALESCE(NEW.id, OLD.id), v_old, v_new);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offers_audit ON public.offers;
CREATE TRIGGER offers_audit AFTER INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.audit_offer_change();

-- ============ 8. Maintenance: promote / expire ============
CREATE OR REPLACE FUNCTION public.sync_offer_statuses()
RETURNS TABLE(activated integer, expired integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a integer; e integer;
BEGIN
  WITH up AS (
    UPDATE public.offers SET status = 'ACTIVE'
     WHERE status = 'SCHEDULED' AND start_at <= now() AND (end_at IS NULL OR end_at > now())
    RETURNING 1
  ) SELECT count(*) INTO a FROM up;

  WITH up AS (
    UPDATE public.offers SET status = 'EXPIRED'
     WHERE status IN ('SCHEDULED','ACTIVE') AND end_at IS NOT NULL AND end_at <= now()
    RETURNING 1
  ) SELECT count(*) INTO e FROM up;

  RETURN QUERY SELECT a, e;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_offer_statuses() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offer_statuses() TO service_role;

-- ============ 9. RLS refresh ============
DROP POLICY IF EXISTS "Running offers are publicly readable" ON public.offers;
CREATE POLICY "Running offers are publicly readable" ON public.offers
FOR SELECT TO anon, authenticated
USING (
  status = 'ACTIVE' AND start_at <= now() AND (end_at IS NULL OR end_at > now())
  AND (product_id IS NULL OR EXISTS (
        SELECT 1 FROM public.products pr WHERE pr.id = offers.product_id AND pr.status = 'ACTIVE'))
);

-- ============ 10. Permissions ============
INSERT INTO public.permissions (key, domain, description)
VALUES ('OFFER_ACTIVATE', 'catalog', 'Activate, schedule or deactivate an offer')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES ('CEO'::app_role), ('SALES'::app_role)) AS r(role)
CROSS JOIN public.permissions p
WHERE p.key = 'OFFER_ACTIVATE'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT 'HR'::app_role, p.id FROM public.permissions p WHERE p.key = 'OFFER_VIEW'
ON CONFLICT DO NOTHING;