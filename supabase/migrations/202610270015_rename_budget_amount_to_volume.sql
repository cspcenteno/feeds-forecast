begin;

alter table public.budget_import_staging
  rename column budget to volume;

alter table public.budgets
  rename column budget to volume;

commit;
