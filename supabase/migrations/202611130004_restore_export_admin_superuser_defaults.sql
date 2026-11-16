begin;

create or replace function public.initialize_export_permission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_default is true then
    new.can_export := new.module = 'Weekly Sales' and new.can_view
      and exists (
        select 1 from public.users u
        where u.id = new.user_id and u.role in ('Superuser', 'Admin')
      );
  end if;
  return new;
end;
$$;

-- Restore only these roles after the requested bulk reset. Other grants stay off.
update public.user_permissions p
set can_export = true, updated_at = now()
from public.users u
where p.user_id = u.id and p.module = 'Weekly Sales'
  and u.role in ('Superuser', 'Admin') and p.can_view is true;

commit;
