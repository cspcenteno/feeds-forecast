begin;

create or replace function public.apply_superuser_permission_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default is true
     and new.module::text in ('Forecast Input', 'Sales Input', 'Regions', 'Subregions', 'Categories', 'Approvals')
     and exists (
       select 1 from public.users
       where id = new.user_id and role = 'Superuser'
     ) then
    new.can_view := false;
    if new.module::text in ('Forecast Input', 'Sales Input') then
      new.can_add := false;
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
    can_add = case when p.module::text in ('Forecast Input', 'Sales Input') then false else p.can_add end,
    can_edit = case when p.module::text in ('Forecast Input', 'Sales Input') then false else p.can_edit end,
    can_delete = case when p.module::text in ('Forecast Input', 'Sales Input') then false else p.can_delete end,
    updated_at = now()
from public.users u
where u.id = p.user_id
  and u.role = 'Superuser'
  and p.is_default is true
  and p.module::text in ('Forecast Input', 'Sales Input', 'Regions', 'Subregions', 'Categories', 'Approvals');

commit;
