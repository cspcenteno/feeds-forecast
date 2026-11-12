begin;

-- Admin corrections retain the original owner and respect forecast status and week locks.
create or replace function public.revise_admin_saved_forecasts(p_records jsonb, p_submit boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor public.users%rowtype;
  current_row public.sales_forecasts%rowtype;
  first_row public.sales_forecasts%rowtype;
  entry jsonb;
  product public.products%rowtype;
  quantity numeric;
  next_status public.sales_forecasts.status%type;
  changed integer := 0;
begin
  select * into actor from public.users where id = auth.uid() and is_active is true;
  if not found or actor.role is distinct from 'Admin'
     or not public.has_module_permission('Forecast Input', 'view')
     or not public.has_module_permission('Forecast Input', 'edit') then
    raise exception 'An active Admin with Forecast Input View and Edit permissions is required.';
  end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Select returned forecasts.'; end if;
  if jsonb_array_length(p_records) not between 1 and 5000 then raise exception 'Select between 1 and 5000 records.'; end if;
  if p_submit is null then raise exception 'Choose save or resubmit.'; end if;
  if exists (select 1 from jsonb_array_elements(p_records) r group by r->>'id' having count(*) > 1) then
    raise exception 'Duplicate forecast record.';
  end if;
  perform pg_advisory_xact_lock_shared(17007, 1);
  for entry in select r from jsonb_array_elements(p_records) r order by (r->>'id')::bigint loop
    select * into current_row from public.sales_forecasts where id = (entry->>'id')::bigint for update;
    if not found or current_row.status::text not in ('Draft','Rejected') then
      raise exception 'Only draft or returned forecasts can be edited or submitted from Saved Forecasts.';
    end if;
    if p_submit and current_row.status::text <> 'Draft' then
      raise exception 'Save corrections as Draft before submitting.';
    end if;
    if changed = 0 then first_row := current_row;
    elsif row(current_row.year, current_row.week, current_row.customer_id, current_row.region_id, current_row.subregion_id) is distinct from
          row(first_row.year, first_row.week, first_row.customer_id, first_row.region_id, first_row.subregion_id) then
      raise exception 'Revise one customer and week at a time.';
    end if;
    if not public.forecast_week_is_open(current_row.year, current_row.week) then
      raise exception 'This forecast week is locked.';
    end if;
    if jsonb_typeof(entry->'original') is distinct from 'object'
       or not (entry->'original' ?& array['forecast','product_id','status'])
       or current_row.forecast is distinct from (entry->'original'->>'forecast')::numeric
       or current_row.product_id is distinct from (entry->'original'->>'product_id')::bigint
       or current_row.status::text is distinct from entry->'original'->>'status' then
      raise exception 'A forecast changed while you were editing. Refresh and try again.';
    end if;
    quantity := (entry->>'forecast')::numeric;
    if quantity is null or quantity < 0 or quantity::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Enter a valid nonnegative forecast quantity.';
    end if;
    select * into product from public.products where id = (entry->>'product_id')::bigint and is_active is true;
    if not found then raise exception 'Select an active product.'; end if;
    next_status := case when p_submit then 'Pending' else 'Draft' end;
    update public.sales_forecasts set
      product_id = product.id, category_id = product.category_id,
      forecast = quantity, volume = quantity * product.weight,
      status = next_status,
      submitted_by = case when p_submit then coalesce(current_row.submitted_by, current_row.user_id) else current_row.submitted_by end,
      submitted_at = case when p_submit then now() else current_row.submitted_at end,
      endorsed_by = case when p_submit then null else current_row.endorsed_by end,
      endorsed_at = case when p_submit then null else current_row.endorsed_at end,
      approved_by = case when p_submit then null else current_row.approved_by end,
      approved_at = case when p_submit then null else current_row.approved_at end,
      returned_by = case when p_submit then null else current_row.returned_by end,
      returned_at = case when p_submit then null else current_row.returned_at end,
      remarks = case when p_submit then null else current_row.remarks end
    where id = current_row.id;
    changed := changed + 1;
  end loop;
  if exists (select 1 from public.sales_forecasts f
    where f.region_id is not distinct from first_row.region_id and f.subregion_id is not distinct from first_row.subregion_id
      and f.year = first_row.year and f.week = first_row.week and f.customer_id is not distinct from first_row.customer_id
      and f.user_id in (select owner.user_id from public.sales_forecasts owner where owner.id in
        (select (r->>'id')::bigint from jsonb_array_elements(p_records) r))
    group by f.user_id, f.product_id having count(*) > 1) then
    raise exception 'This product already has a forecast for this customer, owner and week.';
  end if;
  return changed;
end;
$$;
revoke all on function public.revise_admin_saved_forecasts(jsonb,boolean) from public;
grant execute on function public.revise_admin_saved_forecasts(jsonb,boolean) to authenticated;
create or replace function public.delete_admin_saved_forecasts(p_ids bigint[])
returns integer language plpgsql security definer set search_path = '' as $$
declare item public.sales_forecasts%rowtype; changed integer := 0;
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_active is true and role = 'Admin')
     or not public.has_module_permission('Forecast Input', 'view')
     or not public.has_module_permission('Forecast Input', 'delete') then
    raise exception 'An active Admin with Forecast Input View and Delete permissions is required.';
  end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 5000
     or exists (select 1 from unnest(p_ids) id group by id having count(*) > 1) then
    raise exception 'Select between 1 and 5000 distinct forecasts.';
  end if;
  perform pg_advisory_xact_lock_shared(17007,1);
  for item in select * from public.sales_forecasts where id = any(p_ids) order by id for update loop
    if item.status::text not in ('Draft','Rejected') then raise exception 'Only draft or returned forecasts can be deleted.'; end if;
    if not public.forecast_week_is_open(item.year,item.week) then raise exception 'This forecast week is locked.'; end if;
    changed := changed + 1;
  end loop;
  if changed <> cardinality(p_ids) then raise exception 'Some forecasts are unavailable. Refresh and try again.'; end if;
  delete from public.sales_forecasts where id = any(p_ids);
  return changed;
end;
$$;
revoke all on function public.delete_admin_saved_forecasts(bigint[]) from public;
grant execute on function public.delete_admin_saved_forecasts(bigint[]) to authenticated;

notify pgrst, 'reload schema';
commit;
