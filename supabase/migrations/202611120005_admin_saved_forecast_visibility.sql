begin;

create or replace function public.get_saved_forecasts()
returns setof public.sales_forecasts
language sql stable security definer set search_path = '' as $$
  select f.*
  from public.users viewer
  join public.sales_forecasts f on (
    viewer.role = 'Admin'
    or f.user_id = viewer.id
    or (
      viewer.role = 'Manager' and upper(btrim(viewer.position)) = 'RSM'
      and viewer.region_id is not null and viewer.subregion_id is not null
      and f.region_id = viewer.region_id and f.subregion_id = viewer.subregion_id
      and (f.status::text = 'Rejected' or (f.status::text = 'Draft' and f.returned_at is not null))
      and exists (select 1 from public.users owner where owner.id = f.user_id
        and owner.role = 'User' and upper(btrim(owner.position)) = 'KAM')
    )
  )
  where viewer.id = auth.uid() and viewer.is_active is true
    and public.has_module_permission('Forecast Input', 'view');
$$;

revoke all on function public.get_saved_forecasts() from public;
grant execute on function public.get_saved_forecasts() to authenticated;
notify pgrst, 'reload schema';
commit;
