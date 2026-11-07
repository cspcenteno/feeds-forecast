-- COMPLETE FORECAST IMPORT SETUP — run this entire file once in Supabase SQL Editor.
-- Includes the staging table, Volume support, text week ranges, and Admin-only
-- permissions. No earlier Forecast staging scripts or permission helpers are required.
-- Assumes the application's public.users and public.user_permissions tables exist.
begin;

-- Keep spreadsheet values as text so invalid rows can be stored, reviewed,
-- and corrected before creating Draft records in public.sales_forecasts.
create table if not exists public.forecast_import_staging (
  id bigint generated always as identity primary key,
  uploaded_by uuid not null default auth.uid()
    references public.users(id) on delete cascade,
  year text,
  week text,
  region text,
  subregion text,
  kam text,
  customer text,
  product_code text,
  product_name text,
  forecast text,
  volume text,
  created_at timestamptz not null default now()
);

-- Also update installations that already created the staging table.
alter table public.forecast_import_staging add column if not exists volume text;
alter table public.forecast_import_staging add column if not exists kam text;
alter table public.sales_forecasts add column if not exists kam text;

comment on table public.forecast_import_staging is
  'Raw Forecast Excel/CSV uploads retained for Valid/Invalid review, including after import.';
comment on column public.forecast_import_staging.forecast is
  'Optional forecast quantity. If omitted, calculate quantity as volume divided by product weight.';
comment on column public.forecast_import_staging.volume is
  'Optional volume from the file. Provide Volume or Forecast quantity; calculate the other using product weight.';
comment on column public.forecast_import_staging.week is
  'Week number or date range such as Jan 1 - Jan 4, resolved to an ISO week using the Year column.';

create index if not exists forecast_import_staging_uploader_idx
  on public.forecast_import_staging (uploaded_by, id);

alter table public.forecast_import_staging enable row level security;

revoke all on public.forecast_import_staging from anon;
grant select, insert, update, delete on public.forecast_import_staging to authenticated;
grant usage, select on sequence public.forecast_import_staging_id_seq to authenticated;

-- Self-contained permission lookup: some installations have not installed the
-- general has_module_permission helper. Keep this helper scoped to staging so
-- creating this table does not change authorization for other modules.
create or replace function public.has_forecast_staging_permission(p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_allowed boolean;
begin
  if p_action is null or p_action not in ('view', 'add', 'edit', 'delete') then
    return false;
  end if;

  select u.role::text into v_role
  from public.users u
  where u.id = (select auth.uid()) and u.is_active is true;
  if not found then return false; end if;
  if v_role <> 'Admin' then return false; end if;

  -- Explicit saved grants (including denials) override role defaults.
  -- Prefer the current module name over its legacy alias.
  select case p_action
    when 'view' then p.can_view
    when 'add' then p.can_add
    when 'edit' then p.can_edit
    when 'delete' then p.can_delete
  end into v_allowed
  from public.user_permissions p
  where p.user_id = (select auth.uid())
    and p.module::text in ('Forecast Input', 'Sales Input')
  order by (p.module::text = 'Forecast Input') desc
  limit 1;
  if found then return coalesce(v_allowed, false); end if;

  return true;
end;
$$;

revoke all on function public.has_forecast_staging_permission(text) from public;
grant execute on function public.has_forecast_staging_permission(text) to authenticated;

-- Only active Admins may access Forecast Excel staging, across uploaders.
-- Module action permissions are checked separately by each policy.
create or replace function public.can_access_forecast_staging(p_uploaded_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active is true
      and u.role = 'Admin'
  );
$$;

revoke all on function public.can_access_forecast_staging(uuid) from public;
grant execute on function public.can_access_forecast_staging(uuid) to authenticated;

drop policy if exists forecast_staging_select on public.forecast_import_staging;
create policy forecast_staging_select on public.forecast_import_staging
  for select to authenticated
  using (
    public.can_access_forecast_staging(uploaded_by)
    and public.has_forecast_staging_permission('view')
  );

drop policy if exists forecast_staging_insert on public.forecast_import_staging;
create policy forecast_staging_insert on public.forecast_import_staging
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and public.can_access_forecast_staging(uploaded_by)
    and public.has_forecast_staging_permission('add')
  );

drop policy if exists forecast_staging_update on public.forecast_import_staging;
create policy forecast_staging_update on public.forecast_import_staging
  for update to authenticated
  using (
    public.can_access_forecast_staging(uploaded_by)
    and public.has_forecast_staging_permission('edit')
  )
  with check (
    public.can_access_forecast_staging(uploaded_by)
    and public.has_forecast_staging_permission('edit')
  );

drop policy if exists forecast_staging_delete on public.forecast_import_staging;
create policy forecast_staging_delete on public.forecast_import_staging
  for delete to authenticated
  using (
    public.can_access_forecast_staging(uploaded_by)
    and public.has_forecast_staging_permission('delete')
  );

notify pgrst, 'reload schema';

commit;
