begin;

create or replace function public.can_access_data_scope(
  p_region_id bigint, p_subregion_id bigint, p_owner_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when u.role = 'Admin' or (u.role = 'Manager' and u.position = 'ASM') then true
      when u.role = 'Manager' and u.position = 'RSM' then u.region_id = p_region_id
      when u.role = 'Superuser' and u.position = 'Supervisor' then
        u.region_id = p_region_id and u.subregion_id = p_subregion_id
      when u.role = 'Superuser' then true
      when u.role = 'User' and p_owner_id is not null then p_owner_id = u.id
      else u.region_id = p_region_id
        and (u.subregion_id is null or u.subregion_id = p_subregion_id
          or (u.role = 'User' and p_subregion_id is null))
    end
    from public.users u
    where u.id = auth.uid() and u.is_active is true
  ), false);
$$;

create or replace function public.can_access_region(p_region_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active is true
      and (
        u.role = 'Admin'
        or (u.role = 'Superuser' and u.position is distinct from 'Supervisor')
        or (u.role = 'Manager' and u.position = 'ASM')
        or u.region_id = p_region_id
      )
  );
$$;

revoke all on function public.can_access_data_scope(bigint,bigint,uuid) from public;
grant execute on function public.can_access_data_scope(bigint,bigint,uuid) to authenticated;
revoke all on function public.can_access_region(bigint) from public;
grant execute on function public.can_access_region(bigint) to authenticated;

-- Apply the scope even on databases that also have legacy permissive policies.
alter table public.sales_forecasts enable row level security;
alter table public.budgets enable row level security;
alter table public.actuals enable row level security;

drop policy if exists sales_position_forecast_read on public.sales_forecasts;
create policy sales_position_forecast_read on public.sales_forecasts
  as restrictive for select to authenticated
  using (public.can_access_data_scope(
    region_id, subregion_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ));

drop policy if exists sales_position_budget_read on public.budgets;
create policy sales_position_budget_read on public.budgets
  as restrictive for select to authenticated
  using (public.can_access_data_scope(region_id, subregion_id, null));

drop policy if exists sales_position_actual_read on public.actuals;
create policy sales_position_actual_read on public.actuals
  as restrictive for select to authenticated
  using (public.can_access_data_scope(region_id, subregion_id, null));


-- Wider read access does not extend geographic write access.
create or replace function public.can_write_sales_volume_scope(p_region_id bigint, p_subregion_id bigint, p_budget boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when u.role = 'Superuser' and u.position = 'Supervisor' then
        u.region_id = p_region_id and u.subregion_id = p_subregion_id
      when u.role = 'Manager' then
        u.region_id = p_region_id and (not p_budget or u.subregion_id is null or u.subregion_id = p_subregion_id)
      else true
    end
    from public.users u
    where u.id = auth.uid() and u.is_active is true
  ), false);
$$;

revoke all on function public.can_write_sales_volume_scope(bigint,bigint,boolean) from public;
grant execute on function public.can_write_sales_volume_scope(bigint,bigint,boolean) to authenticated;

drop policy if exists sales_position_budgets_insert on public.budgets;
create policy sales_position_budgets_insert on public.budgets
  as restrictive for insert to authenticated
  with check (public.can_write_sales_volume_scope(region_id, subregion_id, true));

drop policy if exists sales_position_budgets_update on public.budgets;
create policy sales_position_budgets_update on public.budgets
  as restrictive for update to authenticated
  using (public.can_write_sales_volume_scope(region_id, subregion_id, true))
  with check (public.can_write_sales_volume_scope(region_id, subregion_id, true));

drop policy if exists sales_position_budgets_delete on public.budgets;
create policy sales_position_budgets_delete on public.budgets
  as restrictive for delete to authenticated
  using (public.can_write_sales_volume_scope(region_id, subregion_id, true));

drop policy if exists sales_position_actuals_insert on public.actuals;
create policy sales_position_actuals_insert on public.actuals
  as restrictive for insert to authenticated
  with check (public.can_write_sales_volume_scope(region_id, subregion_id, false));

drop policy if exists sales_position_actuals_update on public.actuals;
create policy sales_position_actuals_update on public.actuals
  as restrictive for update to authenticated
  using (public.can_write_sales_volume_scope(region_id, subregion_id, false))
  with check (public.can_write_sales_volume_scope(region_id, subregion_id, false));

drop policy if exists sales_position_actuals_delete on public.actuals;
create policy sales_position_actuals_delete on public.actuals
  as restrictive for delete to authenticated
  using (public.can_write_sales_volume_scope(region_id, subregion_id, false));

create or replace function public.has_actual_permission(p_action text, p_region_id bigint default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.customers_actual_permission('Actual', p_action)
    and (p_region_id is null or public.can_access_region(p_region_id));
$$;

revoke all on function public.has_actual_permission(text, bigint) from public;
grant execute on function public.has_actual_permission(text, bigint) to authenticated;

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
    and public.can_access_data_scope(f.region_id, f.subregion_id, f.user_id)
    and (
      (u.position = 'RSM' and (
        f.status::text in ('Pending', 'Endorsed')
        or (f.status::text = 'Rejected' and f.endorsed_at is not null)
      ))
      or (u.position = 'ASM' and f.status::text = 'Endorsed')
    );
$$;

revoke all on function public.get_forecast_review_queue() from public;
grant execute on function public.get_forecast_review_queue() to authenticated;

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
    and public.can_access_data_scope(forecast.region_id, forecast.subregion_id, forecast.user_id)
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

revoke all on function public.get_weekly_sales_reviewer_names(bigint[]) from public;
grant execute on function public.get_weekly_sales_reviewer_names(bigint[]) to authenticated;

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
      and public.can_access_data_scope(f.region_id, f.subregion_id, f.user_id)
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

revoke all on function public.get_weekly_sales_monthly_budgets(bigint[]) from public;
grant execute on function public.get_weekly_sales_monthly_budgets(bigint[]) to authenticated;

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
        when u.role = 'User' then 'kam'
        when u.role = 'Manager' and u.position = 'ASM' then 'global'
        when u.position = 'RSM' then 'rsm'
        when u.role = 'Superuser' and u.position = 'Supervisor' then 'supervisor'
        when u.position = 'KAM' then 'kam'
        when u.role in ('Admin', 'Superuser') then 'global'
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
