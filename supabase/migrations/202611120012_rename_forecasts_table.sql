begin;

-- Renaming retains rows, foreign keys, RLS policies, indexes, triggers and grants.
-- Refuse ambiguous states instead of overwriting another table.
do $$
begin
  if to_regclass('public.sales_forecasts') is not null then
    if to_regclass('public.forecasts') is not null then
      raise exception 'Both public.sales_forecasts and public.forecasts exist; resolve before renaming.';
    end if;
    alter table public.sales_forecasts rename to forecasts;
  elsif to_regclass('public.forecasts') is null then
    raise exception 'Neither public.sales_forecasts nor public.forecasts exists.';
  end if;
end;
$$;

-- PostgreSQL tracks views, policies and return types by object identity, but
-- SQL/PLpgSQL function bodies can still contain the former table name.
do $$
declare definition text;
begin
  for definition in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and position('sales_forecasts' in p.prosrc) > 0
  loop
    execute replace(definition, 'sales_forecasts', 'forecasts');
  end loop;
end;
$$;

-- Keep audit filtering consistent with the renamed table.
update public.audit_logs set table_name = 'forecasts' where table_name = 'sales_forecasts';

notify pgrst, 'reload schema';
commit;
