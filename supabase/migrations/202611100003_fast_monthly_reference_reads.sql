begin;

-- Resolve permission, area and customer ownership once per reference query.
create or replace function public.monthly_reference_viewer(p_module text)
returns table (scope text, region_id bigint, subregion_id bigint, customer_ids bigint[])
language sql stable security definer set search_path = '' as $$
  with viewer as materialized (
    select u.* from public.users u
    where u.id = auth.uid() and u.is_active is true
      and p_module in ('Forecast Input', 'Weekly Sales', 'Approvals')
      and public.customers_actual_permission(p_module, 'view')
  )
  select case
    when u.role = 'Admin' or upper(trim(u.position)) = 'NSM' then 'global'
    when upper(trim(u.position)) = 'ASM' then 'region'
    when upper(trim(u.position)) in ('RSM', 'SUPERVISOR', 'SV') then 'subregion'
    when upper(trim(u.position)) = 'KAM' or u.role = 'User' then 'customer'
    when u.role = 'Superuser' then 'global'
    when u.role = 'Manager' then case when u.subregion_id is null then 'region' else 'subregion' end
    else 'none' end,
    u.region_id::bigint, u.subregion_id::bigint,
    case when upper(trim(u.position)) = 'KAM' or u.role = 'User' then array(
      select c.id::bigint from public.customers c
      where c.region_id = u.region_id and nullif(trim(c.salesman), '') is not null
        and lower(regexp_replace(trim(c.salesman), '\s+', ' ', 'g')) in (
          lower(regexp_replace(trim(u.full_name), '\s+', ' ', 'g')), lower(trim(u.email)))
      union
      select f.customer_id::bigint from public.sales_forecasts f
      where f.user_id = u.id and f.region_id = u.region_id and f.customer_id is not null
    ) else '{}'::bigint[] end
  from viewer u;
$$;
revoke all on function public.monthly_reference_viewer(text) from public;
grant execute on function public.monthly_reference_viewer(text) to authenticated;

create or replace function public.get_monthly_reference_budget_rows(
  p_module text, p_years integer[] default null,
  p_region_ids bigint[] default null, p_customer_ids bigint[] default null
) returns table (
  id bigint, year integer, month integer, region_id bigint, subregion_id bigint,
  customer_id bigint, product_id bigint, volume numeric
) language sql stable security definer set search_path = '' as $$
  with viewer as materialized (select * from public.monthly_reference_viewer(p_module))
  select b.id::bigint, b.year::integer, b.month::integer, b.region_id::bigint,
    b.subregion_id::bigint, b.customer_id::bigint, b.product_id::bigint, b.volume::numeric
  from viewer v join public.budgets b on (
    v.scope = 'global' or (b.region_id = v.region_id and (
      v.scope = 'region'
      or (v.scope = 'subregion' and v.subregion_id is not null
        and (b.subregion_id = v.subregion_id or b.subregion_id is null))
      or (v.scope = 'customer' and (b.customer_id = any(v.customer_ids)
        or (b.customer_id is null and (b.subregion_id is null or b.subregion_id = v.subregion_id))))
    ))
  )
  where (p_years is null or b.year = any(p_years))
    and (p_region_ids is null or b.region_id = any(p_region_ids))
    and (p_customer_ids is null or b.customer_id is null or b.customer_id = any(p_customer_ids));
$$;
revoke all on function public.get_monthly_reference_budget_rows(text,integer[],bigint[],bigint[]) from public;
grant execute on function public.get_monthly_reference_budget_rows(text,integer[],bigint[],bigint[]) to authenticated;

create or replace function public.get_monthly_reference_actual_rows(
  p_module text, p_year integer,
  p_region_ids bigint[] default null, p_customer_ids bigint[] default null
) returns table (
  id bigint, actual_date date, region_id bigint, category_id bigint,
  product_id bigint, customer_id bigint, volume numeric
) language sql stable security definer set search_path = '' as $$
  with viewer as materialized (select * from public.monthly_reference_viewer(p_module))
  select a.id::bigint, a.actual_date::date, a.region_id::bigint, a.category_id::bigint,
    a.product_id::bigint, a.customer_id::bigint, a.volume::numeric
  from viewer v join public.actuals a on (
    v.scope = 'global' or (a.region_id = v.region_id and (
      v.scope = 'region'
      or (v.scope = 'subregion' and v.subregion_id is not null
        and (a.subregion_id = v.subregion_id or a.subregion_id is null))
      or (v.scope = 'customer' and a.customer_id = any(v.customer_ids))
    ))
  )
  where p_year between 2020 and 2100
    and a.actual_date >= make_date(p_year, 1, 1) and a.actual_date < make_date(p_year + 1, 1, 1)
    and a.customer_id is not null
    and (p_region_ids is null or a.region_id = any(p_region_ids))
    and (p_customer_ids is null or a.customer_id = any(p_customer_ids));
$$;
revoke all on function public.get_monthly_reference_actual_rows(text,integer,bigint[],bigint[]) from public;
grant execute on function public.get_monthly_reference_actual_rows(text,integer,bigint[],bigint[]) to authenticated;

notify pgrst, 'reload schema';
commit;
