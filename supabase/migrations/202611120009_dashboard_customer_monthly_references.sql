begin;

-- Add full-customer references without altering which forecasts the dashboard exposes.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.get_monthly_sales_dashboard(date)'::regprocedure) into definition;
  if position('customer_references as (' in definition) > 0 then return; end if;
  if position('), detail as (' in definition) = 0
     or position('coalesce(a.actual, 0) as actual, coalesce(a.prior_actual, 0) as prior_actual' in definition) = 0 then
    raise exception 'Unexpected dashboard definition. Apply the preceding reporting migrations first.';
  end if;
  definition := replace(definition, 'interval ''1 year''', 'interval ''1 month''');
  definition := replace(definition, '), detail as (', $cte$), customer_references as (
    select k.region_id, k.customer_id, coalesce(b.volume,0) as customer_budget,
      coalesce(a.actual,0) as customer_actual, coalesce(a.prior_actual,0) as customer_prior_actual,
      coalesce(f.volume,0) as customer_forecast
    from (select distinct region_id,customer_id from monthly_forecasts) k
    cross join period p cross join viewer v
    left join lateral (
      select sum(reference.volume) as volume
      from (select distinct product_id from public.budgets
        where region_id=k.region_id and customer_id=k.customer_id and year=p.year
          and (month=p.month or month is null) and product_id is not null) products
      cross join lateral public.monthly_budget_reference(p.year,p.month,k.region_id,
        case when v.scope='supervisor' then v.subregion_id else null::bigint end,k.customer_id,products.product_id) reference
    ) b on true
    left join lateral (
      select sum(volume) filter (where actual_date>=p.first_day) as actual,
        sum(volume) filter (where actual_date<p.first_day) as prior_actual
      from public.actuals where region_id=k.region_id and customer_id=k.customer_id
        and (v.scope<>'supervisor' or subregion_id=v.subregion_id or subregion_id is null)
        and actual_date>=p.first_day-interval '1 month' and actual_date<p.next_month
    ) a on true
    left join lateral (
      select sum(volume) as volume from monthly_forecasts
      where region_id=k.region_id and customer_id=k.customer_id
    ) f on true
  ), detail as ($cte$);
  definition := replace(definition,
    'coalesce(a.actual, 0) as actual, coalesce(a.prior_actual, 0) as prior_actual',
    'coalesce(a.actual, 0) as actual, coalesce(a.prior_actual, 0) as prior_actual,
      cr.customer_budget, cr.customer_actual, cr.customer_prior_actual, cr.customer_forecast');
  definition := replace(definition, 'from monthly_forecasts f',
    'from monthly_forecasts f
    left join customer_references cr on cr.region_id=f.region_id and cr.customer_id=f.customer_id');
  execute definition;
end;
$migration$;
notify pgrst, 'reload schema';
commit;
