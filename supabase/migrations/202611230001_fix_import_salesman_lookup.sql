begin;

-- Validate salesman assignments independently of Users table read permissions.
-- All record writes retain their original invoker security and RLS checks.
create or replace function public.resolve_volume_import_salesman(p_module text, p_name text)
returns table(full_name text, region_id bigint)
language plpgsql security definer set search_path = '' as $$
declare viewer public.users%rowtype; all_regions boolean; scoped_subregion boolean;
begin
  if p_module is null or p_module not in ('Budgets','Actuals') then raise exception 'Invalid module.'; end if;
  select * into viewer from public.users where id = auth.uid();
  if not found or not coalesce(viewer.is_active,false)
    or not public.has_module_permission(p_module,'view')
    or not public.has_module_permission(p_module,'import')
    or not (public.has_module_permission(p_module,'add') or public.has_module_permission(p_module,'edit')) then
    raise exception 'Import access denied.' using errcode = '42501';
  end if;
  all_regions := viewer.role = 'Admin'
    or (viewer.role = 'Manager' and upper(trim(coalesce(viewer.position,''))) = 'NSM')
    or (viewer.role = 'Superuser' and upper(trim(coalesce(viewer.position,''))) not in ('SUPERVISOR','SV'));
  scoped_subregion := viewer.role <> 'Admin' and upper(trim(coalesce(viewer.position,''))) in ('RSM','KAM');
  if (not all_regions and viewer.region_id is null) or (scoped_subregion and viewer.subregion_id is null) then
    raise exception 'Your account needs an assigned region/subregion.' using errcode = '42501';
  end if;
  return query select u.full_name::text, u.region_id::bigint from public.users u
    where u.is_active and u.position in ('KAM','RSM','ASM') and u.region_id is not null
      and lower(regexp_replace(trim(u.full_name),'\s+',' ','g')) = lower(regexp_replace(trim(p_name),'\s+',' ','g'))
      and (all_regions or u.region_id = viewer.region_id)
      and (not scoped_subregion or u.subregion_id = viewer.subregion_id or u.position = 'ASM')
      and (coalesce(viewer.position,'') <> 'KAM' or u.id = viewer.id or u.position in ('RSM','ASM'));
end;
$$;
revoke all on function public.resolve_volume_import_salesman(text,text) from public;
grant execute on function public.resolve_volume_import_salesman(text,text) to authenticated;


-- Change only the salesman in a selected staging group, all-or-nothing.
create or replace function public.update_import_salesman_records(p_module text, p_salesman text, p_records jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare entry jsonb; current_row jsonb; target_name text; matches integer;
  source_name text; changed integer := 0; affected integer;
begin
  if p_module is null or p_module not in ('Budgets','Actuals') then raise exception 'Invalid module.'; end if;
  if not public.has_module_permission(p_module,'edit') or not public.has_module_permission(p_module,'import') then
    raise exception 'Import and Edit permissions are required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Select uploaded records.'; end if;
  if jsonb_array_length(p_records) not between 1 and 5000 then raise exception 'Select between 1 and 5000 uploaded records.'; end if;
  if exists (select 1 from jsonb_array_elements(p_records) r group by r->>'id' having count(*) > 1) then raise exception 'Duplicate uploaded record.'; end if;
  select count(*), min(u.full_name) into matches, target_name from public.resolve_volume_import_salesman(p_module, p_salesman) u;
  if matches <> 1 then raise exception 'Select a unique active salesman with an assigned region.'; end if;
  source_name := lower(regexp_replace(trim(coalesce(p_records->0->>'kam','')),'\s+',' ','g'));
  for entry in select r from jsonb_array_elements(p_records) r order by (r->>'id')::bigint loop
    if not (entry ? 'kam' and entry ? 'region') or lower(regexp_replace(trim(coalesce(entry->>'kam','')),'\s+',' ','g')) is distinct from source_name then
      raise exception 'Edit one uploaded salesman group at a time.';
    end if;
    current_row := null;
    if p_module = 'Budgets' then
      select to_jsonb(s) into current_row from public.budget_import_staging s where s.id = (entry->>'id')::bigint for update;
    else
      select to_jsonb(s) into current_row from public.actual_import_staging s where s.id = (entry->>'id')::bigint for update;
    end if;
    if current_row is null then raise exception 'An uploaded record is unavailable or you lack permission. Refresh and retry.'; end if;
    if current_row->'kam' is distinct from entry->'kam' or current_row->'region' is distinct from entry->'region' then
      raise exception 'An uploaded record changed. Refresh and retry.';
    end if;
    if p_module = 'Budgets' then
      update public.budget_import_staging set kam = trim(target_name) where id = (entry->>'id')::bigint;
    else
      update public.actual_import_staging set kam = trim(target_name) where id = (entry->>'id')::bigint;
    end if;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'An uploaded record could not be updated.'; end if;
    changed := changed + affected;
  end loop;
  return changed;
end;
$$;
revoke all on function public.update_import_salesman_records(text,text,jsonb) from public;
grant execute on function public.update_import_salesman_records(text,text,jsonb) to authenticated;

-- The database also checks names at import time, including Budget uploads.
-- SECURITY INVOKER preserves existing insert RLS and geographic permissions.
create or replace function public.import_volume_records(p_module text, p_records jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare entry jsonb; matches integer;
begin
  if p_module is null or p_module not in ('Actuals','Budgets') or not public.has_module_permission(p_module,'import')
    or not public.has_module_permission(p_module,'add') then
    raise exception 'Import permission denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Select valid uploaded records.'; end if;
  for entry in select r from jsonb_array_elements(p_records) r loop
    select count(*) into matches from public.resolve_volume_import_salesman(p_module, entry->>'kam') u where u.region_id = (entry->>'region_id')::bigint;
    if matches <> 1 then raise exception 'Salesman assignment not found, ambiguous or assigned to a different region. Correct the uploaded records before importing.'; end if;
  end loop;
  if p_module = 'Actuals' then
    insert into public.actuals (actual_date, region_id, subregion_id, customer_id, category_id, product_id, kam, volume)
    select actual_date, region_id, subregion_id, customer_id, category_id, product_id, kam, volume
      from jsonb_populate_recordset(null::public.actuals,p_records);
  else
    insert into public.budgets (year, month, region_id, subregion_id, customer_id, category_id, product_id, kam, volume)
    select year, month, region_id, subregion_id, customer_id, category_id, product_id, kam, volume
      from jsonb_populate_recordset(null::public.budgets,p_records);
  end if;
end;
$$;
revoke all on function public.import_volume_records(text,jsonb) from public;
grant execute on function public.import_volume_records(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
