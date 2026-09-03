-- 1. Writes to ledgers/reservations/webhook events are server-side only ----
REVOKE INSERT, UPDATE, DELETE ON public.inventory_movements FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_reservations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events FROM anon, authenticated;
REVOKE SELECT ON public.inventory_movements, public.inventory_reservations,
                 public.inventory, public.payment_events FROM anon;

GRANT ALL ON public.inventory_movements TO service_role;
GRANT ALL ON public.inventory_reservations TO service_role;
GRANT ALL ON public.inventory TO service_role;
GRANT ALL ON public.payment_events TO service_role;

-- 2. Stop role/permission enumeration by signed-in users -------------------
DROP POLICY IF EXISTS "Staff can read own role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Staff can read permission catalogue" ON public.permissions;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.role_permissions FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.permissions FROM anon, authenticated;
GRANT ALL ON public.role_permissions TO service_role;
GRANT ALL ON public.permissions TO service_role;

-- 3. Role helpers may only be asked about the caller -----------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles pr ON pr.id = ur.user_id
      WHERE ur.user_id = _user_id AND ur.role = _role AND pr.status = 'ACTIVE')
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      JOIN public.permissions p ON p.id = rp.permission_id
      JOIN public.profiles pr ON pr.id = ur.user_id
      WHERE ur.user_id = _user_id AND p.key = _permission_key AND pr.status = 'ACTIVE')
  END;
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated, service_role;

-- 4. Product image files: no direct client writes --------------------------
DROP POLICY IF EXISTS "Staff with PRODUCT_IMAGE_CREATE upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Staff with PRODUCT_IMAGE_CREATE update product images" ON storage.objects;
DROP POLICY IF EXISTS "Staff with PRODUCT_IMAGE_DELETE delete product image files" ON storage.objects;