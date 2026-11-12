begin;

-- Previous-month actuals must use the preceding calendar month, not the prior year.
-- Keep legacy output column names so existing clients remain compatible.

create or replace function public.get_forecast_review_reference(p_ids bigint[])
returns table (
  forecast_id bigint,
  budget_volume numeric,
  actual_volume numeric,
  prior_year_actual_volume numeric,
  approved_forecast_volume numeric,
  customer_approved_forecast_volume numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with queue as (
    select q.*,
      extract(month from (
        date_trunc('week', make_date(q.year, 1, 4)::timestamp)::date + (q.week - 1) * 7 + 3
      ))::integer as reference_month
    from public.get_forecast_review_queue() q
    where q.id = any(p_ids)
  ),
  scoped as (
    select q.*, u.position,
      make_date(q.year, q.reference_month, 1) as month_start,
      (make_date(q.year, q.reference_month, 1) - interval '1 month')::date as prior_month_start
    from queue q
    join public.users u on u.id = auth.uid()
  )
  select
    q.id,
    coalesce(budget.volume, 0),
    coalesce(actual.current_volume, 0),
    coalesce(actual.prior_volume, 0),
    coalesce(approved.product_volume, 0),
    coalesce(approved.customer_volume, 0)
  from scoped q
  left join lateral public.monthly_budget_reference(q.year::integer, q.reference_month,
    q.region_id, q.subregion_id, q.customer_id, q.product_id) budget on true
  left join lateral (
    select
      sum(a.volume::numeric) filter (where a.actual_date >= q.month_start) as current_volume,
      sum(a.volume::numeric) filter (where a.actual_date < q.month_start) as prior_volume
    from public.actuals a
    where a.region_id = q.region_id and a.customer_id = q.customer_id and a.product_id = q.product_id
      and (
        (a.actual_date >= q.month_start and a.actual_date < q.month_start + interval '1 month')
        or (a.actual_date >= q.prior_month_start and a.actual_date < q.prior_month_start + interval '1 month')
      )
  ) actual on true
  left join lateral (
    select
      sum(f.volume::numeric) filter (where f.product_id = q.product_id) as product_volume,
      sum(f.volume::numeric) as customer_volume
    from public.sales_forecasts f
    where f.status = 'Approved'
      and f.year = q.year and f.region_id = q.region_id and f.customer_id = q.customer_id
      and (q.position = 'ASM' or f.subregion_id = q.subregion_id or f.subregion_id is null)
      and extract(month from (
        date_trunc('week', make_date(f.year, 1, 4)::timestamp)::date + (f.week - 1) * 7 + 3
      )) = q.reference_month
  ) approved on true;
$$;



create or replace function public.get_forecast_review_customer_reference(p_ids bigint[])
returns table (forecast_id bigint, customer_budget_volume numeric,
  customer_actual_volume numeric, customer_prior_year_actual_volume numeric)
language sql stable security definer set search_path = '' as $$
  with queue as (
    select q.*, extract(month from (date_trunc('week', make_date(q.year, 1, 4)::timestamp)::date
      + (q.week - 1) * 7 + 3))::integer as reference_month
    from public.get_forecast_review_queue() q where q.id = any(p_ids)
  )
  select q.id::bigint, coalesce(b.volume, 0), coalesce(a.current_volume, 0), coalesce(a.prior_volume, 0)
  from queue q
  left join lateral (
    select sum(reference.volume) as volume
    from (select distinct product_id from public.budgets
      where customer_id = q.customer_id and region_id = q.region_id and year = q.year
        and (month = q.reference_month or month is null) and product_id is not null) products
    cross join lateral public.monthly_budget_reference(q.year::integer, q.reference_month,
      q.region_id, null::bigint, q.customer_id, products.product_id) reference
  ) b on true
  left join lateral (
    select sum(volume::numeric) filter (
        where actual_date >= make_date(q.year, q.reference_month, 1)
          and actual_date < make_date(q.year, q.reference_month, 1) + interval '1 month') as current_volume,
      sum(volume::numeric) filter (
        where actual_date >= make_date(q.year, q.reference_month, 1) - interval '1 month'
          and actual_date < make_date(q.year, q.reference_month, 1)) as prior_volume
    from public.actuals where customer_id = q.customer_id and region_id = q.region_id
      and actual_date >= make_date(q.year, q.reference_month, 1) - interval '1 month'
      and actual_date < make_date(q.year, q.reference_month, 1) + interval '1 month'
  ) a on true;
$$;


create or replace function public.get_weekly_sales_customer_reference(p_ids bigint[])
returns table (forecast_id bigint, customer_budget_volume numeric,
  customer_actual_volume numeric, customer_prior_year_actual_volume numeric)
language sql stable security definer set search_path = '' as $$
  with queue as (
    select q.*, extract(month from (date_trunc('week', make_date(q.year, 1, 4)::timestamp)::date
      + (q.week - 1) * 7 + 3))::integer as reference_month
    from public.get_weekly_sales_reporting() q where q.id = any(p_ids)
  )
  select q.id::bigint, coalesce(b.volume, 0), coalesce(a.current_volume, 0), coalesce(a.prior_volume, 0)
  from queue q
  left join lateral (
    select sum(reference.volume) as volume
    from (select distinct product_id from public.budgets
      where customer_id = q.customer_id and region_id = q.region_id and year = q.year
        and (month = q.reference_month or month is null) and product_id is not null) products
    cross join lateral public.monthly_budget_reference(q.year::integer, q.reference_month,
      q.region_id, null::bigint, q.customer_id, products.product_id) reference
  ) b on true
  left join lateral (
    select sum(volume::numeric) filter (
        where actual_date >= make_date(q.year, q.reference_month, 1)
          and actual_date < make_date(q.year, q.reference_month, 1) + interval '1 month') as current_volume,
      sum(volume::numeric) filter (
        where actual_date >= make_date(q.year, q.reference_month, 1) - interval '1 month'
          and actual_date < make_date(q.year, q.reference_month, 1)) as prior_volume
    from public.actuals where customer_id = q.customer_id and region_id = q.region_id
      and actual_date >= make_date(q.year, q.reference_month, 1) - interval '1 month'
      and actual_date < make_date(q.year, q.reference_month, 1) + interval '1 month'
  ) a on true;
$$;


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
    select region_id, customer_id, product_id, (month_start - interval '1 month')::date from sales_months
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

notify pgrst, 'reload schema';
commit;