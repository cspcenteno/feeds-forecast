begin;

create or replace function public.apply_manager_permission_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default is true
     and new.module::text in ('Categories', 'Products', 'Customers', 'Regions', 'Subregions', 'Week Locks')
     and exists (
       select 1 from public.users
       where id = new.user_id and role = 'Manager'
     ) then
    new.can_view := false;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_manager_permission_defaults on public.user_permissions;
create trigger apply_manager_permission_defaults
before insert or update on public.user_permissions
for each row execute function public.apply_manager_permission_defaults();

update public.user_permissions p
set can_view = false,
    updated_at = now()
from public.users u
where u.id = p.user_id
  and u.role = 'Manager'
  and p.is_default is true
  and p.can_view is true
  and p.module::text in ('Categories', 'Products', 'Customers', 'Regions', 'Subregions', 'Week Locks');

commit;
