begin;

create or replace function public.save_admin_customer_forecast(p_records jsonb, p_new_records jsonb default '[]'::jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  anchor public.sales_forecasts%rowtype;
  product public.products%rowtype;
  entry jsonb;
  quantity numeric;
  changed integer;
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_active is true and role = 'Admin')
     or not public.has_module_permission('Forecast Input','view')
     or not public.has_module_permission('Forecast Input','edit') then
    raise exception 'An active Admin with Forecast Input View and Edit permissions is required.';
  end if;
  if jsonb_typeof(p_records) is distinct from 'array' or jsonb_typeof(p_new_records) is distinct from 'array' then
    raise exception 'Provide existing and new forecast rows.';
  end if;
  if jsonb_array_length(p_records) < 1 or jsonb_array_length(p_records) + jsonb_array_length(p_new_records) > 5000 then
    raise exception 'Select an existing forecast and at most 5000 total rows.';
  end if;
  if jsonb_array_length(p_new_records) > 0 and not public.has_module_permission('Forecast Input','add') then
    raise exception 'Forecast Input Add permission is required to add products.';
  end if;
  select * into anchor from public.sales_forecasts where id = (p_records->0->>'id')::bigint;
  if not found or anchor.user_id is null then raise exception 'The original forecast is unavailable.'; end if;
  perform pg_advisory_xact_lock_shared(17007,1);
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(anchor.user_id,anchor.year,anchor.week,
    anchor.region_id,anchor.subregion_id,anchor.customer_id)::text,0));
  -- Locks and validates existing rows, their status, original values and week.
  changed := public.revise_admin_saved_forecasts(p_records,false);
  if exists (select 1 from public.sales_forecasts f where f.id in
      (select (r->>'id')::bigint from jsonb_array_elements(p_records) r)
      and f.user_id is distinct from anchor.user_id) then
    raise exception 'Edit one original forecast owner at a time.';
  end if;
  -- Re-read the locked anchor so new rows inherit its authoritative scope.
  select * into anchor from public.sales_forecasts where id = anchor.id;
  for entry in select r from jsonb_array_elements(p_new_records) r loop
    quantity := (entry->>'forecast')::numeric;
    if quantity is null or quantity < 0 or quantity::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Enter a valid nonnegative forecast quantity.';
    end if;
    select * into product from public.products where id = (entry->>'product_id')::bigint and is_active is true;
    if not found then raise exception 'Select an active product.'; end if;
    if exists (select 1 from public.sales_forecasts f where f.user_id = anchor.user_id
      and f.year = anchor.year and f.week = anchor.week
      and f.region_id is not distinct from anchor.region_id and f.subregion_id is not distinct from anchor.subregion_id
      and f.customer_id is not distinct from anchor.customer_id and f.product_id = product.id) then
      raise exception 'This product already has a forecast for this customer, owner and week.';
    end if;
    -- Existing audit triggers record auth.uid() as the Admin actor, while
    -- user_id remains the original owner. Client ownership fields are ignored.
    insert into public.sales_forecasts(year,week,region_id,subregion_id,customer_id,category_id,product_id,
      forecast,volume,status,user_id,submitted_by,returned_by,returned_at,remarks)
    values (anchor.year,anchor.week,anchor.region_id,anchor.subregion_id,anchor.customer_id,product.category_id,product.id,
      quantity,quantity * product.weight,'Draft',anchor.user_id,anchor.submitted_by,anchor.returned_by,anchor.returned_at,anchor.remarks);
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;
revoke all on function public.save_admin_customer_forecast(jsonb,jsonb) from public;
grant execute on function public.save_admin_customer_forecast(jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
