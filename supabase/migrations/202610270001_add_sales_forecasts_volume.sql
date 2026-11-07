alter table public.sales_forecasts
  add column if not exists volume numeric null;
