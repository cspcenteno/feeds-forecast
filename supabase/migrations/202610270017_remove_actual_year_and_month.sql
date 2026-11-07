begin;

lock table public.actuals in access exclusive mode;

do $$
begin
  if exists (select 1 from public.actuals where actual_date is null) then
    raise exception 'Populate actual_date on existing actual records before dropping year and month.';
  end if;
end;
$$;

alter table public.actuals
  drop column if exists year,
  drop column if exists month;

alter table public.actual_import_staging
  drop column if exists year,
  drop column if exists month;

commit;
