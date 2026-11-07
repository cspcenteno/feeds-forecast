begin;

-- Saved permission rows override the defaults for every role.
create or replace function public.customers_actual_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select coalesce((
      select case p_action
        when 'view' then p.can_view
        when 'add' then p.can_add
        when 'edit' then p.can_edit
        when 'delete' then p.can_delete
      end
      from public.user_permissions p
      where p.user_id = u.id
        and (p.module::text = p_module or (p_module = 'Forecast Input' and p.module::text = 'Sales Input'))
      order by (p.module::text = p_module) desc
      limit 1
    ), case
      when u.role = 'Admin' then true
      when p_module in ('Customers', 'Actual') then
        (u.role = 'Superuser' and p_action in ('view', 'add', 'edit'))
        or (p_module = 'Actual' and u.role = 'Manager' and p_action = 'view')
      when p_module = 'Forecast Input' then u.role = 'User'
      when p_module = 'Weekly Sales' then u.role in ('User', 'Superuser', 'Manager')
      when p_module = 'Approvals' then u.role = 'Manager'
      when p_module = 'Budget' then u.role in ('Superuser', 'Manager')
      else false
    end)
    from public.users u
    where u.id = auth.uid() and u.is_active is true
      and (
        (p_module in ('Customers', 'Actual') and p_action in ('view', 'add', 'edit', 'delete'))
        or (p_module in ('Forecast Input', 'Weekly Sales', 'Approvals', 'Budget') and p_action = 'view')
      )
  ), false);
$$;

revoke all on function public.customers_actual_permission(text, text) from public;
grant execute on function public.customers_actual_permission(text, text) to authenticated;

create or replace function public.has_actual_permission(p_action text, p_region_id bigint default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.customers_actual_permission('Actual', p_action)
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.is_active is true
        and (p_region_id is null or u.role in ('Admin', 'Superuser') or u.region_id = p_region_id)
    );
$$;

revoke all on function public.has_actual_permission(text, bigint) from public;
grant execute on function public.has_actual_permission(text, bigint) to authenticated;

alter table public.customers enable row level security;
alter table public.actuals enable row level security;
-- Some existing installations created staging before uploader ownership was added.
-- Set the default separately so existing rows are never assigned to the migration runner.
alter table public.actual_import_staging
  add column if not exists uploaded_by uuid references public.users(id) on delete cascade;

alter table public.actual_import_staging
  alter column uploaded_by set default auth.uid();

create index if not exists actual_import_staging_uploader_idx
  on public.actual_import_staging (uploaded_by, id);

alter table public.actual_import_staging enable row level security;

grant select, insert, update, delete on public.customers, public.actuals, public.actual_import_staging to authenticated;

drop policy if exists app_customers_authenticated_base on public.customers;
create policy app_customers_authenticated_base on public.customers
  for all to authenticated using (true) with check (true);

-- Customer names are also needed for validation and display in these modules.
drop policy if exists app_customers_action_select on public.customers;
create policy app_customers_action_select on public.customers
  as restrictive for select to authenticated
  using (public.customers_actual_permission('Customers', 'view')
    or public.customers_actual_permission('Forecast Input', 'view')
    or public.customers_actual_permission('Weekly Sales', 'view')
    or public.customers_actual_permission('Approvals', 'view')
    or public.customers_actual_permission('Budget', 'view')
    or public.customers_actual_permission('Actual', 'view'));

drop policy if exists app_customers_action_insert on public.customers;
create policy app_customers_action_insert on public.customers
  as restrictive for insert to authenticated
  with check (public.customers_actual_permission('Customers', 'add'));

drop policy if exists app_customers_action_update on public.customers;
create policy app_customers_action_update on public.customers
  as restrictive for update to authenticated
  using (public.customers_actual_permission('Customers', 'edit'))
  with check (public.customers_actual_permission('Customers', 'edit'));

drop policy if exists app_customers_action_delete on public.customers;
create policy app_customers_action_delete on public.customers
  as restrictive for delete to authenticated
  using (public.customers_actual_permission('Customers', 'delete'));

drop policy if exists daily_actuals_select on public.actuals;
create policy daily_actuals_select on public.actuals
  for select to authenticated
  using (actual_date is not null and public.has_actual_permission('view', region_id));

drop policy if exists daily_actuals_select_guard on public.actuals;
create policy daily_actuals_select_guard on public.actuals
  as restrictive for select to authenticated
  using (actual_date is null or public.has_actual_permission('view', region_id));

drop policy if exists actual_staging_select on public.actual_import_staging;
create policy actual_staging_select on public.actual_import_staging
  for select to authenticated
  using (uploaded_by = (select auth.uid()) and public.has_actual_permission('view'));

drop policy if exists actual_staging_select_guard on public.actual_import_staging;
create policy actual_staging_select_guard on public.actual_import_staging
  as restrictive for select to authenticated
  using (uploaded_by = (select auth.uid()) and public.has_actual_permission('view'));

drop policy if exists daily_actuals_insert on public.actuals;
create policy daily_actuals_insert on public.actuals
  for insert to authenticated
  with check (actual_date is not null and region_id is not null and public.has_actual_permission('add', region_id));

drop policy if exists daily_actuals_insert_guard on public.actuals;
create policy daily_actuals_insert_guard on public.actuals
  as restrictive for insert to authenticated
  with check (actual_date is null or (region_id is not null and public.has_actual_permission('add', region_id)));

drop policy if exists actual_staging_insert on public.actual_import_staging;
create policy actual_staging_insert on public.actual_import_staging
  for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.has_actual_permission('add'));

drop policy if exists actual_staging_insert_guard on public.actual_import_staging;
create policy actual_staging_insert_guard on public.actual_import_staging
  as restrictive for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.has_actual_permission('add'));

drop policy if exists daily_actuals_update on public.actuals;
create policy daily_actuals_update on public.actuals
  for update to authenticated
  using (actual_date is not null and region_id is not null and public.has_actual_permission('edit', region_id))
  with check (actual_date is not null and region_id is not null and public.has_actual_permission('edit', region_id));

drop policy if exists daily_actuals_update_guard on public.actuals;
create policy daily_actuals_update_guard on public.actuals
  as restrictive for update to authenticated
  using (actual_date is null or (region_id is not null and public.has_actual_permission('edit', region_id)))
  with check (actual_date is null or (region_id is not null and public.has_actual_permission('edit', region_id)));

drop policy if exists actual_staging_update on public.actual_import_staging;
create policy actual_staging_update on public.actual_import_staging
  for update to authenticated
  using (uploaded_by = (select auth.uid()) and public.has_actual_permission('edit'))
  with check (uploaded_by = (select auth.uid()) and public.has_actual_permission('edit'));

drop policy if exists actual_staging_update_guard on public.actual_import_staging;
create policy actual_staging_update_guard on public.actual_import_staging
  as restrictive for update to authenticated
  using (uploaded_by = (select auth.uid()) and public.has_actual_permission('edit'))
  with check (uploaded_by = (select auth.uid()) and public.has_actual_permission('edit'));

drop policy if exists daily_actuals_delete on public.actuals;
create policy daily_actuals_delete on public.actuals
  for delete to authenticated
  using (actual_date is not null and region_id is not null and public.has_actual_permission('delete', region_id));

drop policy if exists daily_actuals_delete_guard on public.actuals;
create policy daily_actuals_delete_guard on public.actuals
  as restrictive for delete to authenticated
  using (actual_date is null or (region_id is not null and public.has_actual_permission('delete', region_id)));

drop policy if exists actual_staging_delete on public.actual_import_staging;
create policy actual_staging_delete on public.actual_import_staging
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) and public.has_actual_permission('delete'));

drop policy if exists actual_staging_delete_guard on public.actual_import_staging;
create policy actual_staging_delete_guard on public.actual_import_staging
  as restrictive for delete to authenticated
  using (uploaded_by = (select auth.uid()) and public.has_actual_permission('delete'));

notify pgrst, 'reload schema';

commit;
