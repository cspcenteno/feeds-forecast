begin;

create or replace function public.get_weekly_sales_reviewer_names(p_ids bigint[])
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct person.id, person.full_name::text
  from public.users viewer
  join public.sales_forecasts forecast
    on viewer.role = 'Superuser'
    or (
      forecast.region_id = viewer.region_id
      and (viewer.subregion_id is null or forecast.subregion_id = viewer.subregion_id)
    )
  join public.users person
    on person.id in (coalesce(forecast.submitted_by, forecast.user_id), forecast.endorsed_by)
  where viewer.id = auth.uid()
    and viewer.is_active is true
    and (
      viewer.role in ('Manager', 'Superuser')
      or (viewer.role = 'User' and forecast.user_id = viewer.id)
    )
    and forecast.id = any(p_ids)
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

notify pgrst, 'reload schema';

commit;
