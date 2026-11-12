begin;

-- Only customers attached to the authenticated manager's review queue qualify.
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
    select sum(volume::numeric) filter (where extract(year from actual_date) = q.year) as current_volume,
      sum(volume::numeric) filter (where extract(year from actual_date) = q.year - 1) as prior_volume
    from public.actuals where customer_id = q.customer_id and region_id = q.region_id
      and extract(month from actual_date) = q.reference_month
      and extract(year from actual_date) in (q.year, q.year - 1)
  ) a on true;
$$;
revoke all on function public.get_forecast_review_customer_reference(bigint[]) from public;
grant execute on function public.get_forecast_review_customer_reference(bigint[]) to authenticated;
notify pgrst, 'reload schema';
commit;
