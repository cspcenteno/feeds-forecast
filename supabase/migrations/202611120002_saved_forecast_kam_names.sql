begin;
-- Names are limited to owners of forecasts the viewer can already access.
create or replace function public.get_saved_forecast_owners()
returns table(id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select distinct owner.id, owner.full_name::text
  from public.get_saved_forecasts() f
  join public.users owner on owner.id = f.user_id;
$$;
revoke all on function public.get_saved_forecast_owners() from public;
grant execute on function public.get_saved_forecast_owners() to authenticated;
notify pgrst, 'reload schema';
commit;
