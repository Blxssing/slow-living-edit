CREATE POLICY "Staff with PRODUCT_IMAGE_CREATE update images"
ON public.product_images FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_CREATE'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_CREATE'));