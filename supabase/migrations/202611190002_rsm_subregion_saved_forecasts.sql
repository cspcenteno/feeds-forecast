begin;

-- Saved Forecasts is an area overview for RSMs, independent of workflow status.
create or replace function public.get_saved_forecasts()
returns setof public.forecasts
language sql stable security definer set search_path = '' as $$
  select f.* from public.users viewer
  join public.forecasts f on case
    when viewer.role = 'Admin' then true
    when viewer.role = 'Manager' and upper(btrim(viewer.position)) = 'RSM' then
      viewer.region_id is not null and viewer.subregion_id is not null
      and f.region_id = viewer.region_id and f.subregion_id = viewer.subregion_id
    else f.user_id = viewer.id end
  where viewer.id = auth.uid() and viewer.is_active is true
    and public.has_module_permission('Forecasts', 'view');
$$;
revoke all on function public.get_saved_forecasts() from public;
grant execute on function public.get_saved_forecasts() to authenticated;
notify pgrst, 'reload schema';
commit;
