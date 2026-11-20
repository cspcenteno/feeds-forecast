begin;

-- Older databases also enforce daily uniqueness with this separate name.
-- Handle both a table constraint and a standalone unique index.
alter table public.actuals drop constraint if exists actuals_unique_entry;
drop index if exists public.actuals_unique_entry;
drop index if exists public.actuals_date_customer_product_idx;

create index if not exists actuals_date_customer_product_lookup_idx
  on public.actuals (actual_date, region_id, customer_id, product_id)
  where actual_date is not null;

notify pgrst, 'reload schema';
commit;
