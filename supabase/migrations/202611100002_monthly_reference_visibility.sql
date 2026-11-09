-- Reference-only reads use the consuming page's view permission, not access
-- to the standalone Budget/Actual modules. No write policies are changed.
begin;

create or replace function public.can_view_monthly_reference(
  p_module text, p_region bigint, p_subregion bigint, p_customer bigint
) returns boolean language sql stable security definer set search_path = '' as $$
  select p_module in ('Forecast Input', 'Weekly Sales', 'Approvals')
    and public.customers_actual_permission(p_module, 'view')
    and coalesce((select case
      when u.role = 'Admin' or upper(trim(u.position)) = 'NSM' then true
      when upper(trim(u.position)) = 'ASM' then u.region_id = p_region
      when upper(trim(u.position)) in ('RSM', 'SUPERVISOR', 'SV') then
        u.region_id = p_region and u.subregion_id is not null
        and (p_subregion is null or u.subregion_id = p_subregion)
      when upper(trim(u.position)) = 'KAM' or u.role = 'User' then
        u.region_id = p_region and (
          -- Generic area budgets are legitimate fallback references.
          (p_customer is null and (p_subregion is null or u.subregion_id = p_subregion))
          or exists (
            select 1 from public.customers c where c.id = p_customer and c.region_id = p_region
              and nullif(trim(c.salesman), '') is not null
              and lower(regexp_replace(trim(c.salesman), '\s+', ' ', 'g'))
                in (lower(regexp_replace(trim(u.full_name), '\s+', ' ', 'g')), lower(trim(u.email)))
          )
          or exists (
            select 1 from public.sales_forecasts f where f.user_id = u.id
              and f.region_id = p_region and f.customer_id = p_customer
          )
        )
      when u.role = 'Superuser' then true
      when u.role = 'Manager' then u.region_id = p_region
        and (u.subregion_id is null or p_subregion is null or u.subregion_id = p_subregion)
      else false end
    from public.users u where u.id = auth.uid() and u.is_active is true
      and u.role in ('Admin', 'Superuser', 'Manager', 'User')), false);
$$;
revoke all on function public.can_view_monthly_reference(text,bigint,bigint,bigint) from public;
grant execute on function public.can_view_monthly_reference(text,bigint,bigint,bigint) to authenticated;

create or replace function public.get_monthly_reference_budgets(p_module text)
returns table (
  id bigint, year integer, month integer, region_id bigint, subregion_id bigint,
  customer_id bigint, product_id bigint, volume numeric
) language sql stable security definer set search_path = '' as $$
  select b.id::bigint, b.year::integer, b.month::integer, b.region_id::bigint,
    b.subregion_id::bigint, b.customer_id::bigint, b.product_id::bigint, b.volume::numeric
  from public.budgets b
  where public.can_view_monthly_reference(p_module, b.region_id, b.subregion_id, b.customer_id);
$$;
revoke all on function public.get_monthly_reference_budgets(text) from public;
grant execute on function public.get_monthly_reference_budgets(text) to authenticated;

create or replace function public.get_monthly_reference_actuals(p_module text)
returns table (
  id bigint, actual_date date, region_id bigint, category_id bigint,
  product_id bigint, customer_id bigint, volume numeric
) language sql stable security definer set search_path = '' as $$
  select a.id::bigint, a.actual_date::date, a.region_id::bigint, a.category_id::bigint,
    a.product_id::bigint, a.customer_id::bigint, a.volume::numeric
  from public.actuals a
  where a.actual_date is not null and a.customer_id is not null
    and public.can_view_monthly_reference(p_module, a.region_id, a.subregion_id, a.customer_id);
$$;
revoke all on function public.get_monthly_reference_actuals(text) from public;
grant execute on function public.get_monthly_reference_actuals(text) to authenticated;

create or replace function public.get_weekly_sales_monthly_actuals(p_ids bigint[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with sales_months as (
    select distinct f.region_id, f.customer_id, f.product_id,
      date_trunc('month', (
        date_trunc('week', make_date(f.year, 1, 4)::timestamp)::date + (f.week - 1) * 7 + 3
      )::timestamp)::date as month_start
    from public.sales_forecasts f
    where f.id = any(p_ids)
      and f.status = 'Approved'
      and public.forecast_workflow_permission('Weekly Sales', 'view')
      and public.can_access_sales_reporting_scope(f.region_id, f.subregion_id, f.user_id)
  ), reference_months as (
    select region_id, customer_id, product_id, month_start from sales_months
    union
    select region_id, customer_id, product_id, (month_start - interval '1 year')::date from sales_months
  ), monthly_totals as (
    select m.month_start as actual_date, m.region_id, m.customer_id, m.product_id,
      extract(year from m.month_start)::integer as year,
      extract(month from m.month_start)::integer as month,
      sum(a.volume) as volume
    from reference_months m
    join public.actuals a on a.region_id = m.region_id
      and public.can_view_monthly_reference('Weekly Sales', a.region_id, a.subregion_id, a.customer_id)
      and a.customer_id = m.customer_id and a.product_id = m.product_id
      and a.actual_date >= m.month_start
      and a.actual_date < (m.month_start + interval '1 month')::date
    group by m.month_start, m.region_id, m.customer_id, m.product_id
  )
  select coalesce(jsonb_agg(to_jsonb(monthly_totals)), '[]'::jsonb)
  from monthly_totals;
$$;



-- Dashboard detail references need the same legacy regional fallback. Exact
-- subregion rows still remain scoped by the reporting hierarchy.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.get_monthly_sales_dashboard(date)'::regprocedure) into definition;
  definition := replace(definition,
    'v.scope <> ''supervisor'' or b.subregion_id = v.subregion_id',
    'v.scope <> ''supervisor'' or b.subregion_id = v.subregion_id or b.subregion_id is null');
  definition := replace(definition,
    'v.scope <> ''supervisor'' or a.subregion_id = v.subregion_id',
    'v.scope <> ''supervisor'' or a.subregion_id = v.subregion_id or a.subregion_id is null');
  execute definition;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
