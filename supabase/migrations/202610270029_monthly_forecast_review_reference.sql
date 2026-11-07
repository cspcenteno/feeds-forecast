begin;

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
      make_date(q.year - 1, q.reference_month, 1) as prior_month_start
    from queue q
    join public.users u on u.id = auth.uid()
  )
  select
    q.id,
    coalesce(budget.total, 0),
    coalesce(actual.current_volume, 0),
    coalesce(actual.prior_volume, 0),
    coalesce(approved.product_volume, 0),
    coalesce(approved.customer_volume, 0)
  from scoped q
  left join lateral (
    select case when b.month is null then b.volume::numeric / 12.0 else b.volume::numeric end as total
    from public.budgets b
    where b.year = q.year and b.region_id = q.region_id and b.product_id = q.product_id
      and (b.customer_id = q.customer_id or b.customer_id is null)
      and (b.subregion_id = q.subregion_id or b.subregion_id is null)
      and (b.month = q.reference_month or b.month is null)
    order by (b.customer_id is not null) desc,
      (b.subregion_id is not null) desc,
      (b.month is not null) desc,
      b.id
    limit 1
  ) budget on true
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

revoke all on function public.get_forecast_review_reference(bigint[]) from public;
grant execute on function public.get_forecast_review_reference(bigint[]) to authenticated;

notify pgrst, 'reload schema';

commit;
