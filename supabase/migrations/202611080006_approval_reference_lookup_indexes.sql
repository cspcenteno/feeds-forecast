-- Support customer-scoped actual references in Admin Approvals.
create index if not exists actuals_customer_period_idx
  on public.actuals (region_id, customer_id, actual_date, id);

-- Support approved forecast references in both the browser and review RPC.
create index if not exists sales_forecasts_approved_reference_idx
  on public.sales_forecasts (year, region_id, customer_id, subregion_id, product_id)
  where status = 'Approved';

create index if not exists budgets_year_reference_idx
  on public.budgets (year, region_id, product_id, customer_id, subregion_id, month);
