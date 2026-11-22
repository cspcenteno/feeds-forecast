-- Atomic salesman-only reassignment across the currently selected customer rows.
-- Apply the legacy snapshot cleanup migration before this migration.
begin;
create or replace function public.update_salesman_volume_records(p_module text, p_records jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare entry jsonb; batch jsonb; target_name text; source_name text;
  assigned_region bigint; matches integer; changed integer := 0;
begin
  if p_module is null or p_module not in ('Budgets','Actuals') then raise exception 'Invalid module.'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Select salesman records to edit.'; end if;
  if jsonb_array_length(p_records) not between 1 and 5000 then raise exception 'Select between 1 and 5000 records.'; end if;
  if exists (select 1 from jsonb_array_elements(p_records) r group by r->>'id' having count(*) > 1) then raise exception 'Duplicate record.'; end if;
  target_name := nullif(trim(p_records->0->>'kam'), '');
  source_name := lower(trim(coalesce(p_records->0->'original'->>'kam','')));
  select count(*) into matches from public.users u where u.is_active
    and lower(trim(u.full_name)) = lower(target_name);
  if matches <> 1 then raise exception 'Choose a unique active user full name.'; end if;
  select u.full_name, u.region_id into target_name, assigned_region from public.users u
    where u.is_active and lower(trim(u.full_name)) = lower(target_name);
  for entry in select r from jsonb_array_elements(p_records) r loop
    if lower(trim(entry->>'kam')) is distinct from lower(trim(target_name))
      or lower(trim(coalesce(entry->'original'->>'kam',''))) is distinct from source_name then
      raise exception 'Edit one salesman group at a time.';
    end if;
    if assigned_region is null or (entry->'original'->>'region_id')::bigint is distinct from assigned_region then
      raise exception 'Choose a salesman assigned to the same region. Region and Subregion remain unchanged.';
    end if;
    if exists (select 1 from jsonb_object_keys(entry) k where k not in ('id','original','kam','volume','year','month','actual_date'))
      or entry->'volume' is distinct from entry->'original'->'volume'
      or (p_module = 'Budgets' and (entry->'year' is distinct from entry->'original'->'year' or entry->'month' is distinct from entry->'original'->'month'))
      or (p_module = 'Actuals' and entry->'actual_date' is distinct from entry->'original'->'actual_date') then
      raise exception 'Only Salesman can be changed in this editor.';
    end if;
  end loop;
  -- Existing editor provides row locks, stale-snapshot checks, RLS and validation.
  -- All customer batches share this transaction, including rollback on failure.
  for batch in select jsonb_agg(r || jsonb_build_object('kam',target_name) order by (r->>'id')::bigint)
    from jsonb_array_elements(p_records) r group by r->'original'->'customer_id'
    order by min((r->>'id')::bigint) loop
    changed := changed + public.update_customer_volume_records(p_module, batch);
  end loop;
  return changed;
end;
$$;
revoke all on function public.update_salesman_volume_records(text,jsonb) from public;
grant execute on function public.update_salesman_volume_records(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
