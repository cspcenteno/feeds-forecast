begin;

-- Anchor every requested scope to a row the viewer is authorized to see.
create or replace function public.get_sales_monthly_reference(p_ids bigint[], p_source text)
returns table (forecast_id bigint, team_level text, budget_volume numeric,
  actual_volume numeric, previous_actual_volume numeric, forecast_volume numeric)
language sql stable security definer set search_path = '' as $$
  with queue as materialized (
    select q.id, q.year, q.week, q.region_id, q.subregion_id, coalesce(q.submitted_by, q.user_id) as submitted_by, q.endorsed_by, q.customer_id, q.product_id
    from public.get_weekly_sales_reporting() q where p_source = 'weekly' and q.id = any(p_ids)
    union all
    select q.id, q.year, q.week, q.region_id, q.subregion_id, coalesce(q.submitted_by, q.user_id), q.endorsed_by, q.customer_id, q.product_id
    from public.get_forecast_review_queue() q where p_source = 'approvals' and q.id = any(p_ids)
    union all
    select q.id, q.year, q.week, q.region_id, q.subregion_id, coalesce(q.submitted_by, q.user_id), q.endorsed_by, q.customer_id, q.product_id
    from public.forecasts q
    join public.users viewer on viewer.id = auth.uid()
    where p_source = 'approvals' and q.id = any(p_ids)
      and viewer.role = 'Admin' and viewer.is_active is true
      and public.has_module_permission('Approvals', 'view')
      and q.status::text in ('Pending', 'Endorsed')
    union all
    select q.id, q.year, q.week, q.region_id, q.subregion_id, q.user_id, q.endorsed_by, q.customer_id, q.product_id
    from public.get_saved_forecasts() q where p_source = 'saved' and q.id = any(p_ids)
    union all
    select q.id, q.year, q.week, q.region_id, q.subregion_id, coalesce(q.submitted_by, q.user_id), q.endorsed_by, q.customer_id, q.product_id
    from public.forecasts q
    where p_source = 'dashboard' and q.id = any(p_ids) and q.status::text = 'Approved'
      and public.has_module_permission('Dashboard', 'view')
      and public.can_access_sales_reporting_scope(q.region_id, q.subregion_id, q.user_id)
  ), scopes as (
    select q.*, level.team_level,
      make_date(q.year, extract(month from (date_trunc('week', make_date(q.year, 1, 4)::timestamp)::date
        + (q.week - 1) * 7 + 3))::int, 1) as month_start,
      case when level.team_level = 'asm' then null
        when level.team_level = 'rsm' then coalesce(rsm.subregion_id, q.subregion_id)
        else q.subregion_id end as area_id,
      kam.full_name as kam_name, kam.email as kam_email
    from queue q cross join (values ('kam'), ('rsm'), ('asm'), ('customer'), ('product')) level(team_level)
    left join public.users kam on kam.id = q.submitted_by
    left join public.users rsm on rsm.id = q.endorsed_by
    where public.can_access_sales_reporting_scope(q.region_id,
      case when level.team_level = 'asm' then null
        when level.team_level = 'rsm' then coalesce(rsm.subregion_id, q.subregion_id)
        else q.subregion_id end,
      case when level.team_level in ('kam', 'customer', 'product') then q.submitted_by else null end)
  )
  select s.id::bigint, s.team_level, coalesce(b.volume, 0), coalesce(a.current_volume, 0),
    coalesce(a.previous_volume, 0), coalesce(f.volume, 0)
  from scopes s
  left join lateral (
    select array_agg(c.id) as ids from public.customers c
    where c.region_id = s.region_id and nullif(trim(c.salesman), '') is not null
      and lower(regexp_replace(trim(c.salesman), '\s+', ' ', 'g')) in
        (lower(regexp_replace(trim(s.kam_name), '\s+', ' ', 'g')), lower(trim(s.kam_email)))
  ) customers on true
  left join lateral (
    select sum(ref.volume) as volume from (
      select distinct case when s.team_level = 'product' then s.customer_id else b.customer_id end as customer_id,
        b.product_id from public.budgets b
      where b.region_id = s.region_id and b.year = s.year
        and (b.month = extract(month from s.month_start) or b.month is null)
        and (s.team_level = 'asm' or b.subregion_id = s.area_id or b.subregion_id is null)
        and (s.team_level <> 'kam' or b.customer_id = any(customers.ids))
        and (s.team_level <> 'customer' or b.customer_id = s.customer_id)
        and (s.team_level <> 'product' or b.customer_id = s.customer_id or b.customer_id is null)
        and (s.team_level <> 'product' or b.product_id = s.product_id)
        and (s.team_level = 'product' or b.customer_id is not null or not exists (
          select 1 from public.budgets detail where detail.region_id = b.region_id
            and detail.year = b.year and detail.product_id = b.product_id
            and detail.customer_id is not null
            and (detail.month = extract(month from s.month_start) or detail.month is null)
            and (s.team_level = 'asm' or detail.subregion_id = s.area_id or detail.subregion_id is null)
        ))
    ) products
    cross join lateral public.monthly_budget_reference(s.year::int, extract(month from s.month_start)::int,
      s.region_id, s.area_id, products.customer_id, products.product_id) ref
  ) b on true
  left join lateral (
    select sum(a.volume) filter (where a.actual_date >= s.month_start) as current_volume,
      sum(a.volume) filter (where a.actual_date < s.month_start) as previous_volume
    from public.actuals a where a.region_id = s.region_id
      and a.actual_date >= s.month_start - interval '1 month'
      and a.actual_date < s.month_start + interval '1 month'
      and (s.team_level = 'asm' or a.subregion_id = s.area_id)
      and (s.team_level <> 'kam' or a.customer_id = any(customers.ids))
      and (s.team_level not in ('customer', 'product') or a.customer_id = s.customer_id)
      and (s.team_level <> 'product' or a.product_id = s.product_id)
  ) a on true
  left join lateral (
    select sum(f.volume) as volume from public.forecasts f
    where f.status = 'Approved' and f.year = s.year and f.region_id = s.region_id
      and extract(month from (date_trunc('week', make_date(f.year, 1, 4)::timestamp)::date
        + (f.week - 1) * 7 + 3)) = extract(month from s.month_start)
      and (s.team_level = 'asm' or f.subregion_id = s.area_id)
      and (s.team_level <> 'kam' or coalesce(f.submitted_by, f.user_id) = s.submitted_by)
      and (s.team_level not in ('customer', 'product') or f.customer_id = s.customer_id)
      and (s.team_level <> 'product' or f.product_id = s.product_id)
  ) f on true;
$$;
revoke all on function public.get_sales_monthly_reference(bigint[],text) from public;
grant execute on function public.get_sales_monthly_reference(bigint[],text) to authenticated;
-- One authorized anchor per row in Dashboard Monthly Sales.
create or replace function public.get_dashboard_monthly_reference_keys(p_month date)
returns table (id bigint, region_id bigint, subregion_id bigint, customer_id bigint,
  product_id bigint, submitted_by uuid, endorsed_by uuid)
language sql stable security definer set search_path = '' as $keys$
  select min(f.id)::bigint, f.region_id::bigint, f.subregion_id::bigint, f.customer_id::bigint,
    f.product_id::bigint, coalesce(f.submitted_by, f.user_id), f.endorsed_by
  from public.forecasts f
  where public.has_module_permission('Dashboard', 'view')
    and public.can_access_sales_reporting_scope(f.region_id, f.subregion_id, f.user_id)
    and f.status::text = 'Approved' and f.year = extract(year from p_month)
    and extract(month from (date_trunc('week', make_date(f.year, 1, 4)::timestamp)::date
      + (f.week - 1) * 7 + 3)) = extract(month from p_month)
  group by f.region_id, f.subregion_id, f.customer_id, f.product_id,
    coalesce(f.submitted_by, f.user_id), f.endorsed_by;
$keys$;
revoke all on function public.get_dashboard_monthly_reference_keys(date) from public;
grant execute on function public.get_dashboard_monthly_reference_keys(date) to authenticated;
notify pgrst, 'reload schema';
commit;

