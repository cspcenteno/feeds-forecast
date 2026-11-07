begin;

alter table public.actuals
  add column if not exists subregion_id bigint references public.subregions(id),
  add column if not exists asm text,
  add column if not exists rsm text,
  add column if not exists kam text;

create unique index if not exists actuals_date_customer_product_idx
  on public.actuals (actual_date, region_id, customer_id, product_id)
  where actual_date is not null;

create table if not exists public.actual_import_staging (
  id bigint generated always as identity primary key,
  uploaded_by uuid not null default auth.uid() references public.users(id) on delete cascade,
  year text,
  month text,
  region text,
  asm text,
  rsm text,
  kam text,
  customer text,
  product_code text,
  product_name text,
  volume text
);

do $
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'actual_import_staging' and column_name = 'date'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'actual_import_staging' and column_name = 'actual_date'
  ) then
    alter table public.actual_import_staging rename column "date" to actual_date;
  end if;
end;
$;

alter table public.actual_import_staging add column if not exists actual_date text;

create index if not exists actual_import_staging_uploader_idx
  on public.actual_import_staging (uploaded_by, id);

create or replace function public.has_actual_permission(p_action text, p_region_id bigint default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    left join public.user_permissions p on p.user_id = u.id and p.module = 'Actual'
    where u.id = auth.uid()
      and u.is_active is true
      and (p_region_id is null or u.role in ('Admin', 'Superuser') or u.region_id = p_region_id)
      and case
        when p_action not in ('view', 'add', 'edit', 'delete') then false
        when p.user_id is not null then case p_action
          when 'view' then p.can_view
          when 'add' then p.can_add
          when 'edit' then p.can_edit
          when 'delete' then p.can_delete
        end
        when u.role = 'Admin' then true
        when u.role = 'Superuser' then p_action in ('view', 'add', 'edit')
        when u.role = 'Manager' then p_action = 'view'
        else false
      end
  );
$$;

revoke all on function public.has_actual_permission(text, bigint) from public;
grant execute on function public.has_actual_permission(text, bigint) to authenticated;

alter table public.actuals enable row level security;
alter table public.actual_import_staging enable row level security;

grant select, insert, delete on public.actuals to authenticated;
grant select, insert, update, delete on public.actual_import_staging to authenticated;

drop policy if exists daily_actuals_select on public.actuals;
create policy daily_actuals_select on public.actuals
  for select to authenticated
  using (actual_date is not null and public.has_actual_permission('view', region_id));

drop policy if exists daily_actuals_insert on public.actuals;
create policy daily_actuals_insert on public.actuals
  for insert to authenticated
  with check (actual_date is not null and public.has_actual_permission('add', region_id));

drop policy if exists daily_actuals_insert_guard on public.actuals;
create policy daily_actuals_insert_guard on public.actuals as restrictive
  for insert to authenticated
  with check (actual_date is null or (region_id is not null and public.has_actual_permission('add', region_id)));

drop policy if exists daily_actuals_delete on public.actuals;
create policy daily_actuals_delete on public.actuals
  for delete to authenticated
  using (actual_date is not null and public.has_actual_permission('delete', region_id));

drop policy if exists daily_actuals_delete_guard on public.actuals;
create policy daily_actuals_delete_guard on public.actuals as restrictive
  for delete to authenticated
  using (actual_date is null or (region_id is not null and public.has_actual_permission('delete', region_id)));

drop policy if exists actual_staging_select on public.actual_import_staging;
create policy actual_staging_select on public.actual_import_staging
  for select to authenticated using (uploaded_by = auth.uid() and public.has_actual_permission('view'));
drop policy if exists actual_staging_insert on public.actual_import_staging;
create policy actual_staging_insert on public.actual_import_staging
  for insert to authenticated with check (uploaded_by = auth.uid() and public.has_actual_permission('add'));
drop policy if exists actual_staging_update on public.actual_import_staging;
create policy actual_staging_update on public.actual_import_staging
  for update to authenticated using (uploaded_by = auth.uid() and public.has_actual_permission('edit'))
  with check (uploaded_by = auth.uid() and public.has_actual_permission('edit'));
drop policy if exists actual_staging_delete on public.actual_import_staging;
create policy actual_staging_delete on public.actual_import_staging
  for delete to authenticated using (uploaded_by = auth.uid() and public.has_actual_permission('delete'));

commit;
