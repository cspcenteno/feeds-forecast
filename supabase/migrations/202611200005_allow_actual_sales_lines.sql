begin;

-- Oracle can contain separate valid sales lines for the same daily customer /
-- product. Preserve every imported line; reporting sums their 50kg volumes.
-- Keep the existing import RPC, permissions, RLS and geography restrictions.
drop index if exists public.actuals_date_customer_product_idx;
create index if not exists actuals_date_customer_product_lookup_idx
  on public.actuals (actual_date, region_id, customer_id, product_id)
  where actual_date is not null;

notify pgrst, 'reload schema';
commit;
