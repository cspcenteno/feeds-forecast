begin;

alter table public.sales_forecasts
  add column if not exists endorsed_by uuid references public.users(id) on delete set null,
  add column if not exists endorsed_at timestamptz,
  add column if not exists returned_by uuid references public.users(id) on delete set null,
  add column if not exists returned_at timestamptz;

commit;
