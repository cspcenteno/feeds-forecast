begin;

-- Anchor every requested scope to a row the viewer is authorized to see.
create or replace function public.get_sales_team_monthly_reference(p_ids bigint[], p_weekly boolean)
returns table (forecast_id bigint, team_level text, budget_volume numeric,
  actual_volume numeric, previous_actual_volume numeric, forecast_volume numeric)
language sql stable security definer set search_path = '' as $$
  with queue as materialized (
    select q.id, q.year, q.week, q.region_id, q.subregion_id, q.submitted_by, q.endorsed_by
    from public.get_weekly_sales_reporting() q where p_weekly and q.id = any(p_ids)
    union all
    select q.id, q.year, q.week, q.region_id, q.subregion_id, q.submitted_by, q.endorsed_by
    from public.get_forecast_review_queue() q where not p_weekly and q.id = any(p_ids)
  ), scopes as (
    select q.*, level.team_level,
      make_date(q.year, extract(month from (date_trunc('week', make_date(q.year, 1, 4)::timestamp)::date
        + (q.week - 1) * 7 + 3))::int, 1) as month_start,
      case when level.team_level = 'asm' then null else coalesce(rsm.subregion_id, q.subregion_id) end as area_id,
      kam.full_name as kam_name, kam.email as kam_email
    from queue q cross join (values ('kam'), ('rsm'), ('asm')) level(team_level)
    left join public.users kam on kam.id = q.submitted_by
    left join public.users rsm on rsm.id = q.endorsed_by
    where public.can_access_sales_reporting_scope(q.region_id,
      case when level.team_level = 'asm' then null else coalesce(rsm.subregion_id, q.subregion_id) end,
      case when level.team_level = 'kam' then q.submitted_by else null end)
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
      select distinct b.customer_id, b.product_id from public.budgets b
      where b.region_id = s.region_id and b.year = s.year
        and (b.month = extract(month from s.month_start) or b.month is null)
        and (s.team_level = 'asm' or b.subregion_id = s.area_id or b.subregion_id is null)
        and (s.team_level <> 'kam' or b.customer_id = any(customers.ids))
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
  ) a on true
  left join lateral (
    select sum(f.volume) as volume from public.forecasts f
    where f.status = 'Approved' and f.year = s.year and f.region_id = s.region_id
      and extract(month from (date_trunc('week', make_date(f.year, 1, 4)::timestamp)::date
        + (f.week - 1) * 7 + 3)) = extract(month from s.month_start)
      and (s.team_level = 'asm' or f.subregion_id = s.area_id)
      and (s.team_level <> 'kam' or f.submitted_by = s.submitted_by)
  ) f on true;
$$;
revoke all on function public.get_sales_team_monthly_reference(bigint[],boolean) from public;
grant execute on function public.get_sales_team_monthly_reference(bigint[],boolean) to authenticated;
notify pgrst, 'reload schema';
commit;

