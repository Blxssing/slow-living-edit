-- ============================================================
-- M2: Catalog hardening + offers
-- ============================================================

-- ---- Categories -------------------------------------------------
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_status_check;

UPDATE public.categories SET status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'ARCHIVED' END;

ALTER TABLE public.categories ADD CONSTRAINT categories_status_check
  CHECK (status IN ('ACTIVE','ARCHIVED'));

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_slug_key UNIQUE (slug);

DROP POLICY IF EXISTS "Active categories are publicly readable" ON public.categories;
CREATE POLICY "Active categories are publicly readable"
  ON public.categories FOR SELECT TO anon, authenticated
  USING (status = 'ACTIVE');

-- ---- Products ---------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'KES',
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

UPDATE public.products SET status = upper(status);

ALTER TABLE public.products
  ALTER COLUMN base_price TYPE numeric(12,2),
  ALTER COLUMN compare_at_price TYPE numeric(12,2);

ALTER TABLE public.products ADD CONSTRAINT products_status_check
  CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED'));

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_base_price_check;
ALTER TABLE public.products ADD CONSTRAINT products_base_price_check
  CHECK (base_price >= 0);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_compare_at_price_check;
ALTER TABLE public.products ADD CONSTRAINT products_compare_at_price_check
  CHECK (compare_at_price IS NULL OR compare_at_price >= 0);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_slug_key;
ALTER TABLE public.products ADD CONSTRAINT products_slug_key UNIQUE (slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku) WHERE sku IS NOT NULL;

DROP POLICY IF EXISTS "Active products are publicly readable" ON public.products;
CREATE POLICY "Active products are publicly readable"
  ON public.products FOR SELECT TO anon, authenticated
  USING (status = 'ACTIVE');

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_status_featured ON public.products(status, is_featured);

-- ---- Variants & images -----------------------------------------
ALTER TABLE public.product_variants
  ALTER COLUMN price_adjustment TYPE numeric(12,2);

DROP POLICY IF EXISTS "Active variants of active products are publicly readable" ON public.product_variants;
CREATE POLICY "Active variants of active products are publicly readable"
  ON public.product_variants FOR SELECT TO anon, authenticated
  USING (is_active = true AND EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'ACTIVE'
  ));

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Product images are publicly readable" ON public.product_images;
CREATE POLICY "Product images are publicly readable"
  ON public.product_images FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'ACTIVE'
  ));

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary
  ON public.product_images(product_id) WHERE is_primary;

-- ---- Offers -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  offer_type        text NOT NULL CHECK (offer_type IN ('PERCENTAGE','FIXED_AMOUNT','LABEL_ONLY')),
  value             numeric(12,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  promotional_label text,
  scope             text NOT NULL CHECK (scope IN ('PRODUCT','CATEGORY','GLOBAL')),
  product_id        uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category_id       uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  priority          integer NOT NULL DEFAULT 0,
  start_at          timestamptz NOT NULL DEFAULT now(),
  end_at            timestamptz,
  status            text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_scope_target_check CHECK (
    (scope = 'PRODUCT'  AND product_id IS NOT NULL AND category_id IS NULL) OR
    (scope = 'CATEGORY' AND category_id IS NOT NULL AND product_id IS NULL) OR
    (scope = 'GLOBAL'   AND product_id IS NULL AND category_id IS NULL)
  ),
  CONSTRAINT offers_date_range_check CHECK (end_at IS NULL OR end_at > start_at),
  CONSTRAINT offers_percentage_check CHECK (offer_type <> 'PERCENTAGE' OR value <= 100)
);

GRANT SELECT ON public.offers TO anon, authenticated;
GRANT ALL ON public.offers TO service_role;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Running offers are publicly readable"
  ON public.offers FOR SELECT TO anon, authenticated
  USING (status = 'ACTIVE' AND start_at <= now() AND (end_at IS NULL OR end_at > now()));

CREATE POLICY "Staff with OFFER_VIEW can read all offers"
  ON public.offers FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'OFFER_VIEW'));

CREATE INDEX IF NOT EXISTS idx_offers_active_window ON public.offers(status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_offers_product_id ON public.offers(product_id);
CREATE INDEX IF NOT EXISTS idx_offers_category_id ON public.offers(category_id);

CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();