begin;
alter table public.forecast_import_staging add column if not exists kam text;
alter table public.sales_forecasts add column if not exists kam text;
notify pgrst, 'reload schema';
commit;
