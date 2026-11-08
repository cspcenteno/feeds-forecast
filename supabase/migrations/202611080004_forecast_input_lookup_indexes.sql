-- Match Forecast Input's owner filter and saved-record ordering.
create index if not exists sales_forecasts_owner_period_idx
  on public.sales_forecasts (user_id, year desc, week desc, id desc);

-- Match customer actual lookups, date range and deterministic pagination.
create index if not exists actuals_customer_period_idx
  on public.actuals (region_id, customer_id, actual_date, id);
