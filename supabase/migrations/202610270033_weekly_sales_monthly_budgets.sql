begin;

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
    join public.sales_forecasts f
      on f.region_id = manager.region_id
      and (manager.subregion_id is null or f.subregion_id = manager.subregion_id)
    where manager.id = auth.uid()
      and manager.is_active is true
      and manager.role = 'Manager'
      and f.id = any(p_ids)
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

notify pgrst, 'reload schema';

commit;
