begin;

alter table public.user_permissions add column if not exists can_import boolean not null default false;
update public.user_permissions p set can_import = p.can_view and (
  (u.role = 'Admin' and p.module in ('Forecasts', 'Actuals', 'Budgets', 'Users'))
  or (u.role = 'Superuser' and p.module = 'Actuals')), updated_at = now()
from public.users u where u.id = p.user_id;
alter table public.user_permissions add constraint user_permissions_import_scope_check
  check (not can_import or (can_view and module in ('Forecasts', 'Actuals', 'Budgets', 'Users')));

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
create trigger initialize_import_permission_before_write before insert or update on public.user_permissions
for each row execute function public.initialize_import_permission();

create or replace function public.has_module_permission(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_action
      when 'view' then p.can_view when 'add' then p.can_add
      when 'edit' then p.can_edit when 'delete' then p.can_delete
      when 'import' then p.module in ('Forecasts', 'Actuals', 'Budgets', 'Users') and p.can_view and p.can_import
      when 'export' then p.module = 'Weekly Sales' and p.can_view and p.can_export
      else false end
    from public.user_permissions p join public.users u on u.id = p.user_id
    where u.id = auth.uid() and u.is_active is true
      and p.module::text = case
        when p_module in ('Sales Input', 'Forecast Input', 'Forecast') then 'Forecasts'
        when p_module = 'Budget' then 'Budgets'
        when p_module = 'Actual' then 'Actuals' else p_module end
      and not (
        (p_module in ('Dashboard', 'Audit Logs') and p_action <> 'view')
        or (p_module = 'Weekly Sales' and p_action not in ('view', 'export'))
        or (p_module = 'Approvals' and p_action in ('add', 'delete'))
      )
  ), false);
$$;
revoke all on function public.has_module_permission(text, text) from public;
grant execute on function public.has_module_permission(text, text) to authenticated;


-- Restrictive policies add the Import check to existing staging scope/action checks.
create policy forecast_staging_import_guard on public.forecast_import_staging
as restrictive for all to authenticated
using (public.has_module_permission('Forecasts', 'import'))
with check (public.has_module_permission('Forecasts', 'import'));
create policy actual_staging_import_guard on public.actual_import_staging
as restrictive for all to authenticated
using (public.has_module_permission('Actuals', 'import'))
with check (public.has_module_permission('Actuals', 'import'));
create policy budget_staging_import_guard on public.budget_import_staging
as restrictive for all to authenticated
using (public.has_module_permission('Budgets', 'import'))
with check (public.has_module_permission('Budgets', 'import'));

-- Keep the caller's normal table RLS and geography checks for the final import.
create or replace function public.import_volume_records(p_module text, p_records jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_module not in ('Actuals', 'Budgets') or not public.has_module_permission(p_module, 'import')
    or not public.has_module_permission(p_module, 'add') then
    raise exception 'Import permission denied' using errcode = '42501';
  end if;
  if p_module = 'Actuals' then
    insert into public.actuals (actual_date, region_id, subregion_id, customer_id, category_id, product_id, kam, volume)
    select actual_date, region_id, subregion_id, customer_id, category_id, product_id, kam, volume
    from jsonb_populate_recordset(null::public.actuals, p_records);
  else
    insert into public.budgets (year, month, region_id, subregion_id, customer_id, category_id, product_id, kam, volume)
    select year, month, region_id, subregion_id, customer_id, category_id, product_id, kam, volume
    from jsonb_populate_recordset(null::public.budgets, p_records);
  end if;
end;
$$;
revoke all on function public.import_volume_records(text, jsonb) from public;
grant execute on function public.import_volume_records(text, jsonb) to authenticated;

commit;
