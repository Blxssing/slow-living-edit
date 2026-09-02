
-- ============================================================
-- 1. FULL PERMISSION CATALOG
-- ============================================================
INSERT INTO public.permissions (key, domain, description) VALUES
  ('CATEGORY_VIEW',        'catalog',    'View categories including drafts'),
  ('CATEGORY_CREATE',      'catalog',    'Create categories'),
  ('CATEGORY_UPDATE',      'catalog',    'Update categories'),
  ('CATEGORY_ARCHIVE',     'catalog',    'Archive categories'),
  ('PRODUCT_IMAGE_VIEW',   'catalog',    'View product images'),
  ('PRODUCT_IMAGE_CREATE', 'catalog',    'Upload product images'),
  ('PRODUCT_IMAGE_DELETE', 'catalog',    'Remove product images'),
  ('CMS_ARCHIVE',          'cms',        'Archive content sections'),
  ('STAFF_VIEW',           'governance', 'View staff accounts'),
  ('STAFF_CREATE',         'governance', 'Provision staff accounts'),
  ('STAFF_UPDATE',         'governance', 'Update staff profile details'),
  ('STAFF_SUSPEND',        'governance', 'Suspend or disable staff accounts'),
  ('STAFF_ROLE_ASSIGN',    'governance', 'Assign or revoke staff roles')
ON CONFLICT (key) DO NOTHING;

-- Retire the lumped permissions after re-pointing policies (below)
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_status_check;

DROP POLICY IF EXISTS "Staff with CATEGORY_MANAGE insert categories" ON public.categories;
DROP POLICY IF EXISTS "Staff with CATEGORY_MANAGE update categories" ON public.categories;
DROP POLICY IF EXISTS "Staff with PRODUCT_VIEW read all categories" ON public.categories;
DROP POLICY IF EXISTS "Staff with PRODUCT_CREATE insert images" ON public.product_images;
DROP POLICY IF EXISTS "Staff with PRODUCT_UPDATE update images" ON public.product_images;

CREATE POLICY "Staff with CATEGORY_VIEW read all categories" ON public.categories
  FOR SELECT TO authenticated USING (public.has_permission((SELECT auth.uid()), 'CATEGORY_VIEW'));
CREATE POLICY "Staff with CATEGORY_CREATE insert categories" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (public.has_permission((SELECT auth.uid()), 'CATEGORY_CREATE'));
CREATE POLICY "Staff with CATEGORY_UPDATE update categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (public.has_permission((SELECT auth.uid()), 'CATEGORY_UPDATE'))
  WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'CATEGORY_UPDATE')
    AND (status <> 'ARCHIVED' OR public.has_permission((SELECT auth.uid()), 'CATEGORY_ARCHIVE'))
  );

CREATE POLICY "Staff with PRODUCT_IMAGE_VIEW read images" ON public.product_images
  FOR SELECT TO authenticated USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_VIEW'));
CREATE POLICY "Staff with PRODUCT_IMAGE_CREATE insert images" ON public.product_images
  FOR INSERT TO authenticated WITH CHECK (public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_CREATE'));
CREATE POLICY "Staff with PRODUCT_IMAGE_DELETE delete images" ON public.product_images
  FOR DELETE TO authenticated USING (public.has_permission((SELECT auth.uid()), 'PRODUCT_IMAGE_DELETE'));
GRANT DELETE ON public.product_images TO authenticated;

-- CMS archive gate
DROP POLICY IF EXISTS "Staff with CMS_UPDATE update content" ON public.content_sections;
CREATE POLICY "Staff with CMS_UPDATE update content" ON public.content_sections
  FOR UPDATE TO authenticated
  USING (public.has_permission((SELECT auth.uid()), 'CMS_UPDATE'))
  WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'CMS_UPDATE')
    AND (status <> 'PUBLISHED' OR public.has_permission((SELECT auth.uid()), 'CMS_PUBLISH'))
    AND (status <> 'ARCHIVED'  OR public.has_permission((SELECT auth.uid()), 'CMS_ARCHIVE'))
  );

DELETE FROM public.role_permissions rp
  USING public.permissions p
  WHERE rp.permission_id = p.id AND p.key IN ('CATEGORY_MANAGE','STAFF_MANAGE');
DELETE FROM public.permissions WHERE key IN ('CATEGORY_MANAGE','STAFF_MANAGE');

-- ============================================================
-- 2. ROLE -> PERMISSION MAPPING (rebuilt from spec)
-- ============================================================
DELETE FROM public.role_permissions;

-- CEO: everything
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'CEO'::public.app_role, id FROM public.permissions;

-- HR: finance visibility + order visibility + staff directory (read only)
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'HR'::public.app_role, id FROM public.permissions
WHERE key IN ('TRANSACTION_VIEW','REPORT_VIEW','ANALYTICS_VIEW','ORDER_VIEW','STAFF_VIEW','AUDIT_VIEW');

-- SALES: catalog, images, offers, orders, payments, inventory visibility
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'SALES'::public.app_role, id FROM public.permissions
WHERE key IN (
  'PRODUCT_VIEW','PRODUCT_CREATE','PRODUCT_UPDATE','PRODUCT_ARCHIVE',
  'CATEGORY_VIEW','CATEGORY_CREATE','CATEGORY_UPDATE','CATEGORY_ARCHIVE',
  'PRODUCT_IMAGE_VIEW','PRODUCT_IMAGE_CREATE','PRODUCT_IMAGE_DELETE',
  'OFFER_VIEW','OFFER_CREATE','OFFER_UPDATE','OFFER_ARCHIVE',
  'ORDER_VIEW','ORDER_PROCESS','ORDER_UPDATE_STATUS',
  'PAYMENT_VIEW','PAYMENT_CONFIRM',
  'INVENTORY_VIEW','CUSTOMER_VIEW','CMS_VIEW'
);

-- ============================================================
-- 3. ACCOUNT STATUS ENFORCEMENT AT THE AUTHORIZATION CHOKE POINT
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('ACTIVE','SUSPENDED','DISABLED'));

CREATE OR REPLACE FUNCTION public.is_active_account(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'ACTIVE');
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.profiles pr ON pr.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND p.key = _permission_key
      AND pr.status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = _role AND pr.status = 'ACTIVE'
  );
$$;

-- Self-service view of own identity (no parameters -> cannot be aimed at others)
CREATE OR REPLACE FUNCTION public.my_access()
RETURNS TABLE (role text, permission_key text, account_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.role::text, p.key, pr.status
  FROM public.user_roles ur
  JOIN public.profiles pr ON pr.id = ur.user_id
  JOIN public.role_permissions rp ON rp.role = ur.role
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = auth.uid() AND pr.status = 'ACTIVE';
$$;
REVOKE EXECUTE ON FUNCTION public.my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_active_account(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4. PRIVILEGE ESCALATION PROTECTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF _actor IS NOT NULL THEN
    IF _actor = COALESCE(NEW.user_id, OLD.user_id) THEN
      RAISE EXCEPTION 'A user cannot modify their own role assignments';
    END IF;
    IF NOT public.has_permission(_actor, 'STAFF_ROLE_ASSIGN') THEN
      RAISE EXCEPTION 'STAFF_ROLE_ASSIGN permission required';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    _actor,
    CASE TG_OP WHEN 'INSERT' THEN 'ROLE_ASSIGNED' WHEN 'DELETE' THEN 'ROLE_REVOKED' ELSE 'ROLE_CHANGED' END,
    'user_roles',
    COALESCE(NEW.user_id, OLD.user_id),
    CASE WHEN OLD IS NULL THEN NULL ELSE jsonb_build_object('role', OLD.role) END,
    CASE WHEN NEW IS NULL THEN NULL ELSE jsonb_build_object('role', NEW.role) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER user_roles_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles();

CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF _actor IS NOT NULL
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.is_staff IS DISTINCT FROM OLD.is_staff)
     AND NOT public.has_permission(_actor, 'STAFF_SUSPEND') THEN
    RAISE EXCEPTION 'STAFF_SUSPEND permission required to change account status';
  END IF;

  -- last_login_at is set by trusted backend paths only
  IF _actor IS NOT NULL AND NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    NEW.last_login_at := OLD.last_login_at;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_values, new_values)
    VALUES (_actor, 'ACCOUNT_STATUS_CHANGED', 'profiles', NEW.id,
            jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_privilege_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- Staff directory access for governance permissions
DROP POLICY IF EXISTS "Staff with STAFF_VIEW read profiles" ON public.profiles;
CREATE POLICY "Staff with STAFF_VIEW read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_permission((SELECT auth.uid()), 'STAFF_VIEW'));
CREATE POLICY "Staff with STAFF_UPDATE update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_permission((SELECT auth.uid()), 'STAFF_UPDATE'))
  WITH CHECK (public.has_permission((SELECT auth.uid()), 'STAFF_UPDATE'));

-- Staff may read the permission catalogue that applies to them
DROP POLICY IF EXISTS "Staff can read role permissions" ON public.role_permissions;
CREATE POLICY "Staff can read own role permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = role_permissions.role));
