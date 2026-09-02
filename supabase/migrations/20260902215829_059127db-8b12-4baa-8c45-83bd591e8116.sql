CREATE OR REPLACE FUNCTION public.audit_offer_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_action text; v_old jsonb; v_new jsonb; v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_actor := COALESCE(auth.uid(), NEW.created_by, NEW.updated_by);
    v_action := CASE WHEN NEW.status = 'ACTIVE' THEN 'OFFER_ACTIVATED'
                     WHEN NEW.status = 'SCHEDULED' THEN 'OFFER_SCHEDULED'
                     ELSE 'OFFER_CREATED' END;
    IF v_action <> 'OFFER_CREATED' THEN
      INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, new_values)
      VALUES (v_actor, 'OFFER_CREATED', 'offers', NEW.id, v_new);
    END IF;
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    v_actor := COALESCE(auth.uid(), NEW.updated_by, NEW.created_by);
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
  VALUES (v_actor, v_action, 'offers', COALESCE(NEW.id, OLD.id), v_old, v_new);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_catalog_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_actor uuid;
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
    IF (v_old - 'updated_at' - 'version') = (v_new - 'updated_at' - 'version') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  v_actor := COALESCE(
    auth.uid(),
    CASE WHEN v_new ? 'updated_by' THEN (v_new ->> 'updated_by')::uuid END,
    CASE WHEN v_new ? 'created_by' THEN (v_new ->> 'created_by')::uuid END,
    CASE WHEN v_old ? 'updated_by' THEN (v_old ->> 'updated_by')::uuid END,
    CASE WHEN v_old ? 'created_by' THEN (v_old ->> 'created_by')::uuid END
  );

  INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    v_actor,
    v_action,
    v_entity,
    COALESCE(NEW.id, OLD.id),
    v_old,
    v_new
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;