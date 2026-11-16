begin;

-- Safe after either version of the original Import permission migration.
create or replace function public.initialize_import_permission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_default is true then
    new.can_import := new.can_view and new.module in ('Forecasts', 'Actuals', 'Budgets', 'Users')
      and exists (select 1 from public.users u where u.id = new.user_id
        and (u.role = 'Admin' or (u.role = 'Superuser' and new.module = 'Actuals')));
  end if;
  return new;
end;
$$;

-- Update role defaults while preserving manually saved permission choices.
update public.user_permissions p
set can_import = p.can_view, updated_at = now()
from public.users u
where u.id = p.user_id and u.role = 'Superuser'
  and p.module = 'Actuals' and p.is_default is true;

commit;
