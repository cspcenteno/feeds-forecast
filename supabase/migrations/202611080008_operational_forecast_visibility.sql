begin;

-- Operational forecast access is deliberately narrower than dashboard reporting.
-- Dashboard aggregation remains a separately scoped SECURITY DEFINER RPC.
create or replace function public.can_access_forecast_scope(
  p_region_id bigint, p_subregion_id bigint, p_owner_id uuid default null
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when u.role = 'Admin' then true
      when u.role = 'Manager' and u.position = 'ASM' then
        u.region_id is not null and u.region_id = p_region_id
      when (u.role = 'Manager' and u.position = 'RSM')
        or (u.role = 'Superuser' and u.position = 'Supervisor') then
        u.region_id is not null and u.subregion_id is not null
        and u.region_id = p_region_id and u.subregion_id = p_subregion_id
      when u.role = 'Superuser' then true
      when u.role = 'User' then p_owner_id = u.id
      else false
    end
    from public.users u where u.id = auth.uid() and u.is_active is true
  ), false);
$$;

revoke all on function public.can_access_forecast_scope(bigint,bigint,uuid) from public;
grant execute on function public.can_access_forecast_scope(bigint,bigint,uuid) to authenticated;

drop policy if exists sales_position_forecast_read on public.sales_forecasts;
create policy sales_position_forecast_read on public.sales_forecasts
  as restrictive for select to authenticated
  using (public.can_access_forecast_scope(region_id, subregion_id, user_id));

create or replace function public.get_forecast_review_queue()
returns table (
  id bigint, year integer, week integer, region_id bigint, subregion_id bigint,
  customer_id bigint, category_id bigint, product_id bigint,
  forecast numeric, volume numeric, status text, user_id uuid,
  submitted_by uuid, endorsed_by uuid, submitter_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id::bigint, f.year::integer, f.week::integer, f.region_id::bigint,
    f.subregion_id::bigint, f.customer_id::bigint, f.category_id::bigint,
    f.product_id::bigint, f.forecast::numeric, f.volume::numeric, f.status::text,
    f.user_id, f.submitted_by, f.endorsed_by, submitter.full_name::text
  from public.sales_forecasts f
  join public.users u on u.id = auth.uid()
  left join public.users submitter on submitter.id = f.submitted_by
  where u.is_active is true and u.role = 'Manager'
    and public.forecast_workflow_permission('Approvals', 'view')
    and public.can_access_forecast_scope(f.region_id, f.subregion_id, f.user_id)
    and (
      (u.position = 'RSM' and (
        f.status::text in ('Pending', 'Endorsed')
        or (f.status::text = 'Rejected' and f.endorsed_at is not null)
      ))
      or (u.position = 'ASM' and f.status::text = 'Endorsed')
    );
$$;

create or replace function public.get_weekly_sales_reviewer_names(p_ids bigint[])
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct person.id, person.full_name::text
  from public.users viewer
  join public.sales_forecasts forecast on forecast.id = any(p_ids)
  join public.users person
    on person.id in (coalesce(forecast.submitted_by, forecast.user_id), forecast.endorsed_by)
  where viewer.id = auth.uid()
    and viewer.is_active is true
    and (
      viewer.role in ('Manager', 'Superuser')
      or (viewer.role = 'User' and forecast.user_id = viewer.id)
    )
    and public.can_access_forecast_scope(forecast.region_id, forecast.subregion_id, forecast.user_id)
    and forecast.status = 'Approved'
    and coalesce((
      select permission.can_view
      from public.user_permissions permission
      where permission.user_id = viewer.id and permission.module::text = 'Weekly Sales'
    ), not exists (
      select 1 from public.user_permissions permission
      where permission.user_id = viewer.id
    ));
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
  left join lateral (
    select case when b.month is null then b.volume::numeric / 12.0 else b.volume::numeric end as volume
    from public.budgets b
    where b.year = f.year and b.region_id = f.region_id and b.product_id = f.product_id
      and (b.customer_id = f.customer_id or b.customer_id is null)
      and (b.subregion_id = f.subregion_id or b.subregion_id is null)
      and (b.month = f.reference_month or b.month is null)
    order by (b.customer_id is not null) desc, (b.subregion_id is not null) desc,
      (b.month is not null) desc, b.id
    limit 1
  ) budget on true;
$$;

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
      and public.can_access_forecast_scope(f.region_id, f.subregion_id, f.user_id)
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

commit;
