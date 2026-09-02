ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS tagline text;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_theme_check;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_theme_check
  CHECK (theme IN ('default','gold-pink','diamond-cream','silver-orange'));