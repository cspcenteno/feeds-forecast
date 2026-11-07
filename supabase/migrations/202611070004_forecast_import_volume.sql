-- Safe to run if the Forecast staging migration was applied before Volume support.
alter table public.forecast_import_staging add column if not exists volume text;

comment on column public.forecast_import_staging.volume is
  'Optional volume from the file. Provide Volume or Forecast quantity; calculate the other using product weight.';
comment on column public.forecast_import_staging.week is
  'Week number or date range such as Jan 1 - Jan 4, resolved to an ISO week using the Year column.';

notify pgrst, 'reload schema';
