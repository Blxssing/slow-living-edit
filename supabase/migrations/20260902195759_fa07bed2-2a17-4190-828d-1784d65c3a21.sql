-- ============ PRODUCTS: integrity ============
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_base_price_check,
  DROP CONSTRAINT IF EXISTS products_compare_at_price_check,
  DROP CONSTRAINT IF EXISTS products_currency_check,
  DROP CONSTRAINT IF EXISTS products_name_check,
  DROP CONSTRAINT IF EXISTS products_slug_check,
  DROP CONSTRAINT IF EXISTS products_sku_check,
  DROP CONSTRAINT IF EXISTS products_status_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_base_price_check CHECK (base_price >= 0),
  ADD CONSTRAINT products_compare_at_price_check CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  ADD CONSTRAINT products_currency_check CHECK (currency = 'KES'),
  ADD CONSTRAINT products_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 255 AND name = btrim(name)),
  ADD CONSTRAINT products_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 255),
  ADD CONSTRAINT products_sku_check CHECK (sku IS NULL OR (sku ~ '^[A-Z0-9][A-Z0-9-]{1,63}$')),
  ADD CONSTRAINT products_status_check CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- ============ CATEGORIES: integrity ============
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_name_check,
  DROP CONSTRAINT IF EXISTS categories_slug_check,
  DROP CONSTRAINT IF EXISTS categories_status_check;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 120 AND name = btrim(name)),
  ADD CONSTRAINT categories_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160),
  ADD CONSTRAINT categories_status_check CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED'));

-- ============ PRODUCT IMAGES: integrity ============
ALTER TABLE public.product_images
  DROP CONSTRAINT IF EXISTS product_images_sort_order_check,
  DROP CONSTRAINT IF EXISTS product_images_alt_text_check,
  DROP CONSTRAINT IF EXISTS product_images_url_check;

ALTER TABLE public.product_images
  ADD CONSTRAINT product_images_sort_order_check CHECK (sort_order >= 0 AND sort_order <= 999),
  ADD CONSTRAINT product_images_alt_text_check CHECK (alt_text IS NULL OR char_length(alt_text) <= 300),
  ADD CONSTRAINT product_images_url_check CHECK (char_length(url) BETWEEN 3 AND 2048);

-- ============ Optimistic concurrency ============
CREATE OR REPLACE FUNCTION public.bump_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bump_version() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_bump_version ON public.products;
CREATE TRIGGER products_bump_version
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.bump_version();

-- ============ Actor stamping ============
CREATE OR REPLACE FUNCTION public.stamp_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    IF to_jsonb(NEW) ? 'updated_by' THEN
      NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    IF to_jsonb(NEW) ? 'updated_by' THEN
      NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_actor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_stamp_actor ON public.products;
CREATE TRIGGER products_stamp_actor
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.stamp_actor();

DROP TRIGGER IF EXISTS categories_stamp_actor ON public.categories;
CREATE TRIGGER categories_stamp_actor
BEFORE INSERT OR UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.stamp_actor();

DROP TRIGGER IF EXISTS product_images_stamp_actor ON public.product_images;
CREATE TRIGGER product_images_stamp_actor
BEFORE INSERT ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.stamp_actor();

-- ============ Catalog audit trail ============
CREATE OR REPLACE FUNCTION public.audit_catalog_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_entity text := TG_TABLE_NAME;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_action := CASE v_entity
      WHEN 'products' THEN 'PRODUCT_CREATED'
      WHEN 'categories' THEN 'CATEGORY_CREATED'
      ELSE 'PRODUCT_IMAGE_ADDED' END;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_action := 'PRODUCT_IMAGE_REMOVED';
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF v_entity = 'products' THEN
      v_action := CASE
        WHEN OLD.status <> 'ARCHIVED' AND NEW.status = 'ARCHIVED' THEN 'PRODUCT_ARCHIVED'
        WHEN OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED' THEN 'PRODUCT_RESTORED'
        ELSE 'PRODUCT_UPDATED' END;
    ELSIF v_entity = 'categories' THEN
      v_action := CASE
        WHEN OLD.status <> 'ARCHIVED' AND NEW.status = 'ARCHIVED' THEN 'CATEGORY_ARCHIVED'
        WHEN OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED' THEN 'CATEGORY_RESTORED'
        ELSE 'CATEGORY_UPDATED' END;
    ELSE
      v_action := CASE
        WHEN COALESCE(OLD.is_primary,false) IS DISTINCT FROM COALESCE(NEW.is_primary,false)
             AND NEW.is_primary THEN 'PRODUCT_PRIMARY_IMAGE_CHANGED'
        ELSE 'PRODUCT_IMAGE_UPDATED' END;
    END IF;
    -- skip no-op updates
    IF (v_old - 'updated_at' - 'version') = (v_new - 'updated_at' - 'version') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(),
    v_action,
    v_entity,
    COALESCE(NEW.id, OLD.id),
    v_old,
    v_new
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_catalog_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_audit ON public.products;
CREATE TRIGGER products_audit
AFTER INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();

DROP TRIGGER IF EXISTS categories_audit ON public.categories;
CREATE TRIGGER categories_audit
AFTER INSERT OR UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();

DROP TRIGGER IF EXISTS product_images_audit ON public.product_images;
CREATE TRIGGER product_images_audit
AFTER INSERT OR UPDATE OR DELETE ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();

-- ============ Single primary image per product ============
CREATE OR REPLACE FUNCTION public.enforce_single_primary_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.product_images
       SET is_primary = false
     WHERE product_id = NEW.product_id
       AND id <> NEW.id
       AND is_primary;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_single_primary_image() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS product_images_single_primary ON public.product_images;
CREATE TRIGGER product_images_single_primary
AFTER INSERT OR UPDATE OF is_primary ON public.product_images
FOR EACH ROW WHEN (NEW.is_primary) EXECUTE FUNCTION public.enforce_single_primary_image();

-- ============ Category archival guard ============
CREATE OR REPLACE FUNCTION public.guard_category_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NEW.status = 'ARCHIVED' AND OLD.status <> 'ARCHIVED' THEN
    SELECT count(*) INTO n
      FROM public.products
     WHERE category_id = NEW.id AND status IN ('ACTIVE','DRAFT');
    IF n > 0 THEN
      RAISE EXCEPTION 'Cannot archive category: % product(s) still reference it. Reassign or archive them first.', n;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_category_archive() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS categories_guard_archive ON public.categories;
CREATE TRIGGER categories_guard_archive
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.guard_category_archive();

-- ============ Search / sort indexes ============
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products (brand) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_base_price ON public.products (base_price);
CREATE INDEX IF NOT EXISTS idx_categories_status ON public.categories (status);
CREATE INDEX IF NOT EXISTS idx_product_images_sort ON public.product_images (product_id, sort_order);

-- ============ Storage policies for product images ============
DROP POLICY IF EXISTS "Product images are publicly viewable" ON storage.objects;
CREATE POLICY "Product images are publicly viewable"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Staff with PRODUCT_IMAGE_CREATE upload product images" ON storage.objects;
CREATE POLICY "Staff with PRODUCT_IMAGE_CREATE upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_CREATE'));

DROP POLICY IF EXISTS "Staff with PRODUCT_IMAGE_CREATE update product images" ON storage.objects;
CREATE POLICY "Staff with PRODUCT_IMAGE_CREATE update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_CREATE'))
WITH CHECK (bucket_id = 'product-images' AND public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_CREATE'));

DROP POLICY IF EXISTS "Staff with PRODUCT_IMAGE_DELETE delete product image files" ON storage.objects;
CREATE POLICY "Staff with PRODUCT_IMAGE_DELETE delete product image files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_DELETE'));