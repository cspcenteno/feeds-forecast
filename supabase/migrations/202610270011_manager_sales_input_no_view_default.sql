-- Manager defaults no longer include Sales Input view or actions.
-- Update only system-default permission rows and preserve manual overrides.
update public.user_permissions p
set can_view = false,
    can_add = false,
    can_edit = false,
    can_delete = false,
    updated_at = now()
from public.users u
where p.user_id = u.id
  and p.module = 'Sales Input'
  and p.is_default = true
  and u.role = 'Manager';

-- Ensure every existing profile has an authoritative Sales Input default row.
insert into public.user_permissions(user_id,module,can_view,can_add,can_edit,can_delete,is_default)
select u.id,
       'Sales Input',
       u.role in ('User','Superuser','Admin'),
       u.role in ('User','Superuser','Admin'),
       u.role in ('User','Superuser','Admin'),
       u.role = 'Admin',
       true
from public.users u
where not exists (
  select 1 from public.user_permissions p
  where p.user_id = u.id and p.module = 'Sales Input'
);

-- This supplemental trigger runs after the legacy default initializer and
-- updates only the Sales Input default row when a profile is created or its
-- role changes. Explicit per-user overrides remain unchanged.
create or replace function public.initialize_sales_input_permission_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_permissions(user_id,module,can_view,can_add,can_edit,can_delete,is_default)
  values(
    new.id,
    'Sales Input',
    new.role in ('User','Superuser','Admin'),
    new.role in ('User','Superuser','Admin'),
    new.role in ('User','Superuser','Admin'),
    new.role = 'Admin',
    true
  )
  on conflict (user_id,module) do update set
    can_view = excluded.can_view,
    can_add = excluded.can_add,
    can_edit = excluded.can_edit,
    can_delete = excluded.can_delete,
    is_default = true,
    updated_at = now()
  where public.user_permissions.is_default = true;
  return new;
end;
$$;

drop trigger if exists zz_sales_input_default_after_profile_write on public.users;
create trigger zz_sales_input_default_after_profile_write
after insert or update of role on public.users
for each row execute function public.initialize_sales_input_permission_default();
