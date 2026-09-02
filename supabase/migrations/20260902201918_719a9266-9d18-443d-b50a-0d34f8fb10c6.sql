CREATE OR REPLACE FUNCTION public.get_product_pricing(_product_id uuid)
RETURNS TABLE(
  product_id uuid, base_price numeric, discount_amount numeric, final_price numeric,
  offer_id uuid, offer_type text, offer_value numeric, promotional_label text,
  start_at timestamptz, end_at timestamptz, labels text[]
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
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