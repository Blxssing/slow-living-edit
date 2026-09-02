
-- Categories
CREATE POLICY "Staff with CATEGORY_MANAGE insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_permission((SELECT auth.uid()), 'CATEGORY_MANAGE'));
CREATE POLICY "Staff with CATEGORY_MANAGE update categories" ON public.categories FOR UPDATE TO authenticated USING (public.has_permission((SELECT auth.uid()), 'CATEGORY_MANAGE')) WITH CHECK (public.has_permission((SELECT auth.uid()), 'CATEGORY_MANAGE'));
CREATE POLICY "Staff with PRODUCT_VIEW read all categories" ON public.categories FOR SELECT TO authenticated USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_VIEW'));

-- Products
CREATE POLICY "Staff with PRODUCT_CREATE insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.has_permission((SELECT auth.uid()), 'PRODUCT_CREATE'));
CREATE POLICY "Staff with PRODUCT_UPDATE update products" ON public.products FOR UPDATE TO authenticated
  USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_UPDATE'))
  WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'PRODUCT_UPDATE')
    AND (status <> 'ARCHIVED' OR public.has_permission((SELECT auth.uid()), 'PRODUCT_ARCHIVE'))
  );

-- Variants and images follow product permissions
CREATE POLICY "Staff with PRODUCT_CREATE insert variants" ON public.product_variants FOR INSERT TO authenticated WITH CHECK (public.has_permission((SELECT auth.uid()), 'PRODUCT_CREATE'));
CREATE POLICY "Staff with PRODUCT_UPDATE update variants" ON public.product_variants FOR UPDATE TO authenticated USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_UPDATE')) WITH CHECK (public.has_permission((SELECT auth.uid()), 'PRODUCT_UPDATE'));
CREATE POLICY "Staff with PRODUCT_CREATE insert images" ON public.product_images FOR INSERT TO authenticated WITH CHECK (public.has_permission((SELECT auth.uid()), 'PRODUCT_CREATE'));
CREATE POLICY "Staff with PRODUCT_UPDATE update images" ON public.product_images FOR UPDATE TO authenticated USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_UPDATE')) WITH CHECK (public.has_permission((SELECT auth.uid()), 'PRODUCT_UPDATE'));

-- Offers
CREATE POLICY "Staff with OFFER_CREATE insert offers" ON public.offers FOR INSERT TO authenticated WITH CHECK (public.has_permission((SELECT auth.uid()), 'OFFER_CREATE'));
CREATE POLICY "Staff with OFFER_UPDATE update offers" ON public.offers FOR UPDATE TO authenticated
  USING (public.has_permission((SELECT auth.uid()), 'OFFER_UPDATE'))
  WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'OFFER_UPDATE')
    AND (status <> 'ARCHIVED' OR public.has_permission((SELECT auth.uid()), 'OFFER_ARCHIVE'))
  );

-- CMS
CREATE POLICY "Staff with CMS_CREATE insert content" ON public.content_sections FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'CMS_CREATE')
    AND (status <> 'PUBLISHED' OR public.has_permission((SELECT auth.uid()), 'CMS_PUBLISH'))
  );
CREATE POLICY "Staff with CMS_UPDATE update content" ON public.content_sections FOR UPDATE TO authenticated
  USING (public.has_permission((SELECT auth.uid()), 'CMS_UPDATE'))
  WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'CMS_UPDATE')
    AND (status <> 'PUBLISHED' OR public.has_permission((SELECT auth.uid()), 'CMS_PUBLISH'))
  );

-- Orders
CREATE POLICY "Staff with ORDER_PROCESS update orders" ON public.orders FOR UPDATE TO authenticated USING (public.has_permission((SELECT auth.uid()), 'ORDER_PROCESS')) WITH CHECK (public.has_permission((SELECT auth.uid()), 'ORDER_PROCESS'));
CREATE POLICY "Staff with ORDER_UPDATE_STATUS insert status history" ON public.order_status_history FOR INSERT TO authenticated WITH CHECK (public.has_permission((SELECT auth.uid()), 'ORDER_UPDATE_STATUS') AND actor_id = (SELECT auth.uid()));

-- Customers
CREATE POLICY "Staff with CUSTOMER_VIEW update customers" ON public.customers FOR UPDATE TO authenticated USING (public.has_permission((SELECT auth.uid()), 'CUSTOMER_VIEW')) WITH CHECK (public.has_permission((SELECT auth.uid()), 'CUSTOMER_VIEW'));
CREATE POLICY "Staff with CUSTOMER_VIEW update addresses" ON public.customer_addresses FOR UPDATE TO authenticated USING (public.has_permission((SELECT auth.uid()), 'CUSTOMER_VIEW')) WITH CHECK (public.has_permission((SELECT auth.uid()), 'CUSTOMER_VIEW'));

-- Payments
CREATE POLICY "Staff with PAYMENT_CONFIRM update payments" ON public.payments FOR UPDATE TO authenticated USING (public.has_permission((SELECT auth.uid()), 'PAYMENT_CONFIRM')) WITH CHECK (public.has_permission((SELECT auth.uid()), 'PAYMENT_CONFIRM'));

-- Grants required for the Data API to honour the new write policies
GRANT INSERT, UPDATE ON public.categories, public.products, public.product_variants, public.product_images, public.offers, public.content_sections TO authenticated;
GRANT UPDATE ON public.orders, public.customers, public.customer_addresses, public.payments TO authenticated;
GRANT INSERT ON public.order_status_history TO authenticated;
