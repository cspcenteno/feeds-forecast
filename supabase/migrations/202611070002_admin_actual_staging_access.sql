begin;

-- Admins must be able to review other uploaders' rows and legacy rows whose
-- uploaded_by is null. Other users retain access only to their own uploads.
create or replace function public.can_access_actual_staging(p_uploaded_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.is_active is true
      and (u.role = 'Admin' or u.id = p_uploaded_by)
  );
$$;

revoke all on function public.can_access_actual_staging(uuid) from public;
grant execute on function public.can_access_actual_staging(uuid) to authenticated;

-- Both policy kinds must change: permissive access alone cannot override the
-- existing restrictive uploader guards.
drop policy if exists actual_staging_select on public.actual_import_staging;
create policy actual_staging_select on public.actual_import_staging
  for select to authenticated
  using (public.can_access_actual_staging(uploaded_by) and public.has_actual_permission('view'));

drop policy if exists actual_staging_select_guard on public.actual_import_staging;
create policy actual_staging_select_guard on public.actual_import_staging
  as restrictive for select to authenticated
  using (public.can_access_actual_staging(uploaded_by) and public.has_actual_permission('view'));

drop policy if exists actual_staging_update on public.actual_import_staging;
create policy actual_staging_update on public.actual_import_staging
  for update to authenticated
  using (public.can_access_actual_staging(uploaded_by) and public.has_actual_permission('edit'))
  with check (public.can_access_actual_staging(uploaded_by) and public.has_actual_permission('edit'));

drop policy if exists actual_staging_update_guard on public.actual_import_staging;
create policy actual_staging_update_guard on public.actual_import_staging
  as restrictive for update to authenticated
  using (public.can_access_actual_staging(uploaded_by) and public.has_actual_permission('edit'))
  with check (public.can_access_actual_staging(uploaded_by) and public.has_actual_permission('edit'));

drop policy if exists actual_staging_delete on public.actual_import_staging;
create policy actual_staging_delete on public.actual_import_staging
  for delete to authenticated
  using (public.can_access_actual_staging(uploaded_by) and public.has_actual_permission('delete'));

drop policy if exists actual_staging_delete_guard on public.actual_import_staging;
create policy actual_staging_delete_guard on public.actual_import_staging
  as restrictive for delete to authenticated
  using (public.can_access_actual_staging(uploaded_by) and public.has_actual_permission('delete'));

notify pgrst, 'reload schema';
commit;
