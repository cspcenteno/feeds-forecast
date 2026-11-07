begin;

create or replace function public.get_weekly_sales_reviewer_names(p_ids bigint[])
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct person.id, person.full_name::text
  from public.users manager
  join public.sales_forecasts forecast
    on forecast.region_id = manager.region_id
    and (manager.subregion_id is null or forecast.subregion_id = manager.subregion_id)
  join public.users person
    on person.id in (coalesce(forecast.submitted_by, forecast.user_id), forecast.endorsed_by)
  where manager.id = auth.uid()
    and manager.is_active is true
    and manager.role = 'Manager'
    and forecast.id = any(p_ids)
    and forecast.status = 'Approved'
    and coalesce((
      select permission.can_view
      from public.user_permissions permission
      where permission.user_id = manager.id and permission.module::text = 'Weekly Sales'
    ), true);
$$;

revoke all on function public.get_weekly_sales_reviewer_names(bigint[]) from public;
grant execute on function public.get_weekly_sales_reviewer_names(bigint[]) to authenticated;

notify pgrst, 'reload schema';

commit;
