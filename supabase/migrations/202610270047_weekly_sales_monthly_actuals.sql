begin;

create index if not exists actuals_sales_reference_idx
  on public.actuals (region_id, customer_id, product_id, actual_date);

create or replace function public.get_weekly_sales_monthly_actuals(p_ids bigint[])
returns jsonb
language sql
stable
security invoker
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
      and (select public.customers_actual_permission('Weekly Sales', 'view'))
      and public.can_access_data_scope(f.region_id, f.subregion_id, f.user_id)
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
      and a.customer_id = m.customer_id and a.product_id = m.product_id
      and a.actual_date >= m.month_start
      and a.actual_date < (m.month_start + interval '1 month')::date
    group by m.month_start, m.region_id, m.customer_id, m.product_id
  )
  select coalesce(jsonb_agg(to_jsonb(monthly_totals)), '[]'::jsonb)
  from monthly_totals;
$$;

revoke all on function public.get_weekly_sales_monthly_actuals(bigint[]) from public;
grant execute on function public.get_weekly_sales_monthly_actuals(bigint[]) to authenticated;
notify pgrst, 'reload schema';

commit;
