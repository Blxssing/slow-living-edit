revoke execute on function public.has_role(uuid, public.app_role) from anon;

revoke execute on function public.reserve_inventory(uuid, int) from anon, authenticated;
grant execute on function public.reserve_inventory(uuid, int) to service_role;

revoke execute on function public.release_inventory(uuid, int) from anon, authenticated;
grant execute on function public.release_inventory(uuid, int) to service_role;

revoke execute on function public.commit_inventory(uuid, int) from anon, authenticated;
grant execute on function public.commit_inventory(uuid, int) to service_role;

revoke execute on function public.get_available_inventory(uuid) from anon, authenticated;
grant execute on function public.get_available_inventory(uuid) to service_role;

revoke execute on function public.update_updated_at_column() from anon, authenticated;
grant execute on function public.update_updated_at_column() to service_role;