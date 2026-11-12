begin;
-- Direct client deletes retain ownership/permission policies and require Draft.
drop policy if exists forecast_draft_delete_guard on public.sales_forecasts;
create policy forecast_draft_delete_guard on public.sales_forecasts
  as restrictive for delete to authenticated
  using (status::text = 'Draft');
notify pgrst, 'reload schema';
commit;
