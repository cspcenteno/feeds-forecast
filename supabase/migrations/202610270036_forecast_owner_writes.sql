begin;

-- Review actions use the existing security-definer workflow RPC.
drop policy if exists forecast_owner_update on public.sales_forecasts;
create policy forecast_owner_update on public.sales_forecasts
  as restrictive for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists forecast_owner_delete on public.sales_forecasts;
create policy forecast_owner_delete on public.sales_forecasts
  as restrictive for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
