CREATE POLICY "Staff with PRODUCT_VIEW read all products"
ON public.products FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_VIEW'));

CREATE POLICY "Staff with PRODUCT_VIEW read all variants"
ON public.product_variants FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_VIEW'));