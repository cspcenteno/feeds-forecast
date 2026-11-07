begin;

-- Upgrade existing Forecast staging installations without changing the
-- permissions for manual Forecast Input or the saved forecasts table.
create or replace function public.has_forecast_staging_permission(p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  if p_action is null or p_action not in ('view', 'add', 'edit', 'delete') then
    return false;
  end if;

  if not exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.is_active is true and u.role = 'Admin'
  ) then return false; end if;

  select case p_action
    when 'view' then p.can_view
    when 'add' then p.can_add
    when 'edit' then p.can_edit
    when 'delete' then p.can_delete
  end into v_allowed
  from public.user_permissions p
  where p.user_id = (select auth.uid())
    and p.module::text in ('Forecast Input', 'Sales Input')
  order by (p.module::text = 'Forecast Input') desc
  limit 1;
  if found then return coalesce(v_allowed, false); end if;

  return true;
end;
$$;

create or replace function public.can_access_forecast_staging(p_uploaded_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.is_active is true and u.role = 'Admin'
  );
$$;

revoke all on function public.has_forecast_staging_permission(text) from public;
revoke all on function public.can_access_forecast_staging(uuid) from public;
grant execute on function public.has_forecast_staging_permission(text) to authenticated;
grant execute on function public.can_access_forecast_staging(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
