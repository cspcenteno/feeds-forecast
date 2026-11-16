begin;

-- Keep the existing RPC entry points, audit trail, and automatic lock rules.
create or replace function public.require_forecast_week_admin(p_action text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_action is null or p_action not in ('view', 'add', 'edit', 'delete') then
    raise exception 'Invalid permission action.';
  end if;
  if not exists (
    select 1 from public.users
    where id = auth.uid() and is_active and role in ('Admin', 'Superuser')
  ) then
    raise exception 'Only active Admin or Superuser accounts can manage forecast week locks.';
  end if;
  -- Schedule generation is part of editing; Add is disabled for Week Locks.
  if p_action = 'delete'
    or not public.has_module_permission('Week Locks', 'view')
    or (p_action in ('add', 'edit') and not public.has_module_permission('Week Locks', 'edit')) then
    raise exception 'Week Locks % permission is required.', case when p_action = 'add' then 'edit' else p_action end;
  end if;
end;
$$;

revoke all on function public.require_forecast_week_admin(text) from public;
grant execute on function public.require_forecast_week_admin(text) to authenticated;

commit;
