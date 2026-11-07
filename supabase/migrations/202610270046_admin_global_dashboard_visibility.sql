begin;

create or replace function public.get_monthly_sales_dashboard(p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select u.id, u.role, u.region_id, u.subregion_id,
      case
        when u.role = 'Admin' then 'global'
        when u.role = 'User' then 'kam'
        when u.role = 'Manager' and u.position = 'ASM' then 'global'
        when u.position = 'RSM' then 'rsm'
        when u.role = 'Superuser' and u.position = 'Supervisor' then 'supervisor'
        when u.position = 'KAM' then 'kam'
        when u.role = 'Superuser' then 'global'
        when u.subregion_id is not null then 'rsm'
        else 'asm'
      end as scope
    from public.users u
    where u.id = auth.uid() and u.is_active is true
      and u.role in ('Admin', 'Superuser', 'Manager', 'User')
      and coalesce((
        select p.can_view from public.user_permissions p
        where p.user_id = u.id and p.module::text = 'Dashboard'
      ), true)
  ), period as (
    select date_trunc('month', p_month)::date as first_day,
      (date_trunc('month', p_month) + interval '1 month')::date as next_month,
      extract(year from p_month)::integer as year,
      extract(month from p_month)::integer as month
  ), monthly_forecasts as (
    select f.region_id, f.subregion_id, f.customer_id, f.product_id,
      f.endorsed_by, coalesce(f.submitted_by, f.user_id) as submitted_by,
      sum(coalesce(f.forecast, 0)) as quantity,
      sum(coalesce(f.volume, 0)) as volume
    from public.sales_forecasts f
    cross join viewer v
    cross join period p
    where f.status = 'Approved' and f.year = p.year
      and extract(month from (
        date_trunc('week', make_date(f.year, 1, 4)::timestamp)::date + (f.week - 1) * 7 + 3
      )) = p.month
      and case v.scope
        when 'global' then true
        when 'asm' then f.region_id = v.region_id
        when 'rsm' then f.region_id = v.region_id
        when 'supervisor' then f.region_id = v.region_id and f.subregion_id = v.subregion_id
        else f.user_id = v.id
      end
    group by f.region_id, f.subregion_id, f.customer_id, f.product_id,
      f.endorsed_by, coalesce(f.submitted_by, f.user_id)
  ), monthly_budgets as (
    select min(b.id) as id, b.region_id, b.subregion_id, b.customer_id, b.product_id,
      case when count(*) filter (where b.month is not null) > 0
        then sum(coalesce(b.volume, 0)) filter (where b.month is not null)
        else sum(coalesce(b.volume, 0))::numeric / 12
      end as volume
    from public.budgets b
    cross join period p
    cross join viewer v
    where (v.scope <> 'supervisor' or b.subregion_id = v.subregion_id)
      and b.year = p.year and (b.month = p.month or b.month is null)
      and (v.scope in ('global', 'kam') or b.region_id = v.region_id)
    group by b.region_id, b.subregion_id, b.customer_id, b.product_id
  ), forecast_keys as (
    select distinct region_id, subregion_id, customer_id, product_id from monthly_forecasts
  ), matched_budgets as (
    select k.*, b.id as budget_id, b.volume as budget
    from forecast_keys k
    left join lateral (
      select b.id, b.volume from monthly_budgets b
      where b.region_id = k.region_id and b.product_id = k.product_id
        and (b.customer_id = k.customer_id or b.customer_id is null)
        and (b.subregion_id = k.subregion_id or b.subregion_id is null)
      order by (b.customer_id is not null) desc, (b.subregion_id is not null) desc
      limit 1
    ) b on true
  ), actual_keys as (
    select distinct region_id, customer_id, product_id from forecast_keys
  ), actual_totals as (
    select k.region_id, k.customer_id, k.product_id,
      sum(a.volume) filter (where a.actual_date >= p.first_day) as actual,
      sum(a.volume) filter (where a.actual_date < p.first_day) as prior_actual
    from actual_keys k
    cross join period p
    cross join viewer v
    join public.actuals a on a.region_id = k.region_id
      and a.customer_id = k.customer_id and a.product_id = k.product_id
      and (v.scope <> 'supervisor' or a.subregion_id = v.subregion_id)
      and ((a.actual_date >= p.first_day and a.actual_date < p.next_month)
        or (a.actual_date >= (p.first_day - interval '1 year')::date
          and a.actual_date < (p.next_month - interval '1 year')::date))
    group by k.region_id, k.customer_id, k.product_id
  ), regional_budgets as (
    select b.region_id, sum(b.volume) as budget
    from monthly_budgets b cross join viewer v
    where (v.scope in ('global', 'asm') or b.id in (select budget_id from matched_budgets))
      and (b.customer_id is not null or v.scope in ('kam', 'rsm', 'supervisor') or not exists (
        select 1 from monthly_budgets detail
        where detail.region_id = b.region_id and detail.product_id = b.product_id
          and detail.subregion_id is not distinct from b.subregion_id
          and detail.customer_id is not null
      ))
    group by b.region_id
  ), regional_forecasts as (
    select region_id, sum(volume) as forecast from monthly_forecasts group by region_id
  ), regional_totals as (
    select coalesce(r.name, 'Unassigned') as region,
      coalesce(b.budget, 0) as budget, coalesce(f.forecast, 0) as forecast
    from regional_budgets b full join regional_forecasts f on f.region_id = b.region_id
    left join public.regions r on r.id = coalesce(b.region_id, f.region_id)
  ), detail as (
    select f.region_id, f.subregion_id, f.customer_id, f.product_id,
      f.endorsed_by, f.submitted_by, f.quantity, f.volume,
      coalesce(nullif(trim(r.code), ''), r.name, 'Unassigned') as region,
      s.name as subregion, c.customer,
      concat_ws(' - ', product.code, product.name) as product,
      endorser.full_name as endorser, submitter.full_name as submitter,
      b.budget_id, coalesce(b.budget, 0) as budget,
      coalesce(a.actual, 0) as actual, coalesce(a.prior_actual, 0) as prior_actual
    from monthly_forecasts f
    left join public.regions r on r.id = f.region_id
    left join public.subregions s on s.id = f.subregion_id
    left join public.customers c on c.id = f.customer_id
    left join public.products product on product.id = f.product_id
    left join public.users endorser on endorser.id = f.endorsed_by
    left join public.users submitter on submitter.id = f.submitted_by
    left join matched_budgets b on b.region_id = f.region_id and b.product_id = f.product_id
      and b.customer_id is not distinct from f.customer_id
      and b.subregion_id is not distinct from f.subregion_id
    left join actual_totals a on a.region_id = f.region_id and a.product_id = f.product_id
      and a.customer_id = f.customer_id
  )
  select jsonb_build_object(
    'scope', case when v.scope = 'supervisor' then 'rsm' else v.scope end,
    'regions', coalesce((select jsonb_agg(to_jsonb(r) order by r.region) from regional_totals r), '[]'::jsonb),
    'details', coalesce((select jsonb_agg(to_jsonb(d)) from detail d), '[]'::jsonb)
  )
  from viewer v;
$$;

revoke all on function public.get_monthly_sales_dashboard(date) from public;
grant execute on function public.get_monthly_sales_dashboard(date) to authenticated;

notify pgrst, 'reload schema';

commit;

