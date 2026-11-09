begin;

-- Existing unknown dates remain null; new records receive their creation time.
alter table public.categories add column if not exists created_at timestamptz;
alter table public.categories alter column created_at set default now();
alter table public.regions add column if not exists created_at timestamptz;
alter table public.regions alter column created_at set default now();
alter table public.subregions add column if not exists created_at timestamptz;
alter table public.subregions alter column created_at set default now();

notify pgrst, 'reload schema';
commit;
