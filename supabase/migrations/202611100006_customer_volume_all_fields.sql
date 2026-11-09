-- Shared customer/KAM fields and editable product rows.
begin;

-- SECURITY INVOKER retains each table's update permissions, RLS and audit
-- triggers. Any validation or concurrency failure rolls back the entire batch.
create or replace function public.update_customer_volume_records(p_module text, p_records jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare entry jsonb; current_row jsonb; field text; first_customer bigint;
  first_kam text; first_row boolean := true; changed integer := 0; affected integer;
  new_volume numeric; new_year integer; new_month integer; new_date date;
  new_kam text; new_customer bigint; new_region bigint; new_product bigint; new_category bigint;
begin
  if p_module not in ('Budget', 'Actual') or p_module is null then raise exception 'Invalid module.'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Select customer records to edit.'; end if;
  if jsonb_array_length(p_records) not between 1 and 5000 then raise exception 'Select between 1 and 5000 records.'; end if;
  if exists (select 1 from jsonb_array_elements(p_records) r group by r->>'id' having count(*) > 1) then
    raise exception 'Duplicate record in customer edit.';
  end if;
  for entry in select r from jsonb_array_elements(p_records) r order by (r->>'id')::bigint loop
    current_row := null;
    if p_module = 'Budget' then
      select to_jsonb(b) into current_row from public.budgets b where b.id = (entry->>'id')::bigint for update;
    else
      select to_jsonb(a) into current_row from public.actuals a where a.id = (entry->>'id')::bigint and a.actual_date is not null for update;
    end if;
    if current_row is null then raise exception 'A record is unavailable or you no longer have permission. Refresh and try again.'; end if;
    if first_row then
      first_customer := (current_row->>'customer_id')::bigint;
      first_kam := lower(trim(coalesce(current_row->>'kam', '')));
      first_row := false;
    elsif (current_row->>'customer_id')::bigint is distinct from first_customer
      or lower(trim(coalesce(current_row->>'kam', ''))) is distinct from first_kam then
      raise exception 'Edit one customer and KAM group at a time.';
    end if;
    if jsonb_typeof(entry->'original') is distinct from 'object' then raise exception 'Missing original record details.'; end if;
    foreach field in array array['volume','region_id','subregion_id','customer_id','product_id','category_id','asm','rsm','kam'] loop
      if not (entry->'original' ? field) or current_row->field is distinct from entry->'original'->field then
        raise exception 'A record changed while you were editing. Refresh and try again.';
      end if;
    end loop;
    new_kam := case when entry ? 'kam' then nullif(trim(entry->>'kam'), '') else current_row->>'kam' end;
    new_customer := case when entry ? 'customer_id' then (entry->>'customer_id')::bigint else (current_row->>'customer_id')::bigint end;
    new_region := case when entry ? 'region_id' then (entry->>'region_id')::bigint else (current_row->>'region_id')::bigint end;
    new_product := case when entry ? 'product_id' then (entry->>'product_id')::bigint else (current_row->>'product_id')::bigint end;
    new_category := (current_row->>'category_id')::bigint;
    if new_region is null then raise exception 'Choose a valid region.'; end if;
    if new_customer is distinct from (current_row->>'customer_id')::bigint or new_region is distinct from (current_row->>'region_id')::bigint then
      if new_customer is not null and not exists (select 1 from public.customers c where c.id = new_customer and c.region_id = new_region) then
        raise exception 'Choose a customer in the selected region.';
      end if;
    end if;
    if new_product is distinct from (current_row->>'product_id')::bigint then
      if new_product is null then raise exception 'Choose a valid product.'; end if;
      select p.category_id into new_category from public.products p where p.id = new_product;
      if not found then raise exception 'Choose a valid product.'; end if;
    end if;
    new_volume := (entry->>'volume')::numeric;
    if new_volume is null or new_volume < 0 or new_volume::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid volume of zero or more.'; end if;
    if p_module = 'Budget' then
      if current_row->'year' is distinct from entry->'original'->'year' or current_row->'month' is distinct from entry->'original'->'month' then
        raise exception 'A record changed while you were editing. Refresh and try again.';
      end if;
      new_year := (entry->>'year')::integer; new_month := (entry->>'month')::integer;
      if new_year is null or new_year not between 2020 and 2100 or (new_month is not null and new_month not between 1 and 12) then raise exception 'Enter a valid year and month.'; end if;
      update public.budgets set volume = new_volume, year = new_year, month = new_month,
        kam = new_kam, customer_id = new_customer, region_id = new_region,
        subregion_id = case when region_id is distinct from new_region then null else subregion_id end,
        product_id = new_product, category_id = new_category where id = (entry->>'id')::bigint;
    else
      if current_row->'actual_date' is distinct from entry->'original'->'actual_date' then raise exception 'A record changed while you were editing. Refresh and try again.'; end if;
      new_date := (entry->>'actual_date')::date;
      if new_date is null then raise exception 'Enter a valid Actual date.'; end if;
      update public.actuals set volume = new_volume, actual_date = new_date,
        kam = new_kam, customer_id = new_customer, region_id = new_region,
        subregion_id = case when region_id is distinct from new_region then null else subregion_id end,
        product_id = new_product, category_id = new_category where id = (entry->>'id')::bigint and actual_date is not null;
    end if;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'A record could not be updated. Refresh and try again.'; end if;
    changed := changed + affected;
  end loop;
  return changed;
end;
$$;
revoke all on function public.update_customer_volume_records(text,jsonb) from public;
grant execute on function public.update_customer_volume_records(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
