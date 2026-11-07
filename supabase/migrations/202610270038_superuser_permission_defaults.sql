begin;

create or replace function public.apply_superuser_permission_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default is true
     and new.module::text in ('Forecast Input', 'Sales Input', 'Regions', 'Subregions', 'Categories')
     and exists (
       select 1 from public.users
       where id = new.user_id and role = 'Superuser'
     ) then
    new.can_view := false;
    if new.module::text in ('Forecast Input', 'Sales Input') then
      new.can_edit := false;
      new.can_delete := false;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_superuser_permission_defaults on public.user_permissions;
create trigger apply_superuser_permission_defaults
before insert or update on public.user_permissions
for each row execute function public.apply_superuser_permission_defaults();

update public.user_permissions p
set can_view = false,
    can_edit = case when p.module::text in ('Forecast Input', 'Sales Input') then false else p.can_edit end,
    can_delete = case when p.module::text in ('Forecast Input', 'Sales Input') then false else p.can_delete end,
    updated_at = now()
from public.users u
where u.id = p.user_id
  and u.role = 'Superuser'
  and p.is_default is true
  and p.module::text in ('Forecast Input', 'Sales Input', 'Regions', 'Subregions', 'Categories');

create or replace function public.forecast_workflow_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select coalesce((
      select case p_action when 'view' then p.can_view when 'edit' then p.can_edit end
      from public.user_permissions p
      where p.user_id = u.id
        and (p.module::text = p_module or (p_module = 'Forecast Input' and p.module::text = 'Sales Input'))
      order by (p.module::text = p_module) desc
      limit 1
    ), case
      when p_module = 'Approvals' then u.role in ('Admin', 'Manager') and p_action in ('view', 'edit')
      when p_module = 'Forecast Input' then u.role in ('User', 'Admin') and p_action = 'edit'
      else false
    end)
    from public.users u where u.id = auth.uid() and u.is_active is true
  ), false);
$$;

revoke all on function public.forecast_workflow_permission(text, text) from public;
grant execute on function public.forecast_workflow_permission(text, text) to authenticated;

commit;
