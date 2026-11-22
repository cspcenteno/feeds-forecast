-- Match Saved Actuals' date/id keyset pagination for region-scoped viewers.
-- Existing unscoped actuals_saved_date_id_idx serves Admin/NSM reads.
begin;
create index if not exists actuals_saved_region_date_id_idx
  on public.actuals (region_id, actual_date desc, id desc)
  where actual_date is not null;
create index if not exists actuals_saved_area_date_id_idx
  on public.actuals (region_id, subregion_id, actual_date desc, id desc)
  where actual_date is not null;
commit;
