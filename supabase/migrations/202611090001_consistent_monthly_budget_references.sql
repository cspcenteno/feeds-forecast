begin;

-- Shared reference rule: exact customer before generic, assigned subregion
-- before region fallback, and monthly before annual within each chosen area.
create or replace function public.monthly_budget_reference(
  p_year integer, p_month integer, p_region bigint, p_subregion bigint,
  p_customer bigint, p_product bigint
)
returns table (budget_id bigint, volume numeric)
language sql stable security invoker set search_path = ''
as $$
  with matching as (
    select b.* from public.budgets b
    where b.year = p_year and b.region_id = p_region and b.product_id = p_product
      and (b.month = p_month or b.month is null)
      and (b.customer_id = p_customer or b.customer_id is null)
      and (p_subregion is null or b.subregion_id = p_subregion or b.subregion_id is null)
  ), customer_scope as (
    select b.* from matching b
    where case when exists (select 1 from matching m where m.customer_id is not distinct from p_customer)
      then b.customer_id is not distinct from p_customer else b.customer_id is null end
  ), area_scope as (
    select b.* from customer_scope b
    where case when p_subregion is null
      then (not exists (select 1 from customer_scope m where m.subregion_id is not null) or b.subregion_id is not null)
      else (not exists (select 1 from customer_scope m where m.subregion_id = p_subregion) or b.subregion_id = p_subregion) end
  ), totals as (
    select min(b.id)::bigint as budget_id,
      case when count(*) filter (where b.month = p_month) > 0
        then coalesce(sum(b.volume) filter (where b.month = p_month), 0)::numeric
        else coalesce(sum(b.volume), 0)::numeric / 12 end as volume
    from area_scope b group by b.subregion_id
  )
  select min(t.budget_id), coalesce(sum(t.volume), 0)::numeric from totals t;
$$;

revoke all on function public.monthly_budget_reference(integer,integer,bigint,bigint,bigint,bigint) from public;

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

create or replace function public.get_weekly_sales_monthly_budgets(p_ids bigint[])
returns table (forecast_id bigint, budget_volume numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with scoped_forecasts as (
    select f.id, f.year, f.region_id, f.subregion_id, f.customer_id, f.product_id,
      extract(month from (
        date_trunc('week', make_date(f.year, 1, 4)::timestamp)::date + (f.week - 1) * 7 + 3
      ))::integer as reference_month
    from public.users manager
    join public.sales_forecasts f on f.id = any(p_ids)
    where manager.id = auth.uid()
      and manager.is_active is true
      and manager.role = 'Manager'
      and public.can_access_forecast_scope(f.region_id, f.subregion_id, f.user_id)
      and f.status = 'Approved'
      and coalesce((
        select permission.can_view
        from public.user_permissions permission
        where permission.user_id = manager.id and permission.module::text = 'Weekly Sales'
      ), true)
  )
  select f.id::bigint, coalesce(budget.volume, 0)
  from scoped_forecasts f
  left join lateral public.monthly_budget_reference(f.year::integer, f.reference_month,
    f.region_id, f.subregion_id, f.customer_id, f.product_id) budget on true;
$$;

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
        when u.role = 'Superuser' and u.position = 'Supervisor' then 'rsm'
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
    select k.*, b.budget_id, b.volume as budget
    from forecast_keys k cross join period p
    left join lateral public.monthly_budget_reference(p.year, p.month,
      k.region_id, k.subregion_id, k.customer_id, k.product_id) b on true
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

notify pgrst, 'reload schema';
commit;
