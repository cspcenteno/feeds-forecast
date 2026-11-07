-- Supports the Saved Actuals ordering and date/ID pagination.
create index if not exists actuals_saved_date_id_idx
  on public.actuals (actual_date desc, id desc)
  where actual_date is not null;
