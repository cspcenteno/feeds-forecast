-- Preserve existing creation dates; historical rows without a date stay unknown.
alter table public.products add column if not exists created_at timestamptz;
alter table public.products alter column created_at set default now();

alter table public.customers add column if not exists created_at timestamptz;
alter table public.customers alter column created_at set default now();
