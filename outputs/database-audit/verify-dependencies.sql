-- Feeds Forecast cleanup audit: run in Supabase SQL Editor.
-- Metadata and aggregate counts only. No schema or row changes.
begin transaction read only;

-- 1. Full public column inventory, including objects hidden from the REST API.
select c.table_name, t.table_type, c.ordinal_position, c.column_name,
       c.data_type, c.udt_name, c.is_nullable, c.column_default
from information_schema.columns c
join information_schema.tables t using (table_catalog, table_schema, table_name)
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position;

-- 2. Foreign keys, checks, unique constraints and primary keys.
select cl.relname as table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class cl on cl.oid = con.conrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where ns.nspname = 'public'
order by cl.relname, con.conname;

-- 3. Indexes and row security must survive any cleanup.
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' order by tablename, indexname;
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;

-- 4. Active trigger definitions, including their function bodies.
select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as trigger_definition,
       pg_get_functiondef(p.oid) as function_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
order by c.relname, t.tgname;

-- 5. Catalog-recorded column dependencies (views, constraints, etc.).
-- PL/pgSQL source strings and external BI integrations may NOT appear here.
select distinct c.relname as table_name, a.attname as column_name,
       pg_describe_object(d.classid, d.objid, d.objsubid) as dependent_object,
       d.deptype
from pg_depend d
join pg_class c on d.refclassid = 'pg_class'::regclass and c.oid = d.refobjid
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum = d.refobjsubid
where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
order by table_name, column_name, dependent_object;

-- 6. Current database function bodies: do not rely on historical migrations alone.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname, arguments;

-- 7. Read-only data profiling for review candidates. Blank does NOT prove unused.
select 'actual_import_staging.subregion' as field, count(*) as total_rows,
       count(*) filter (where nullif(btrim(subregion), '') is not null) as populated_rows
from public.actual_import_staging
union all
select 'budgets.asm', count(*), count(*) filter (where nullif(btrim(asm), '') is not null) from public.budgets
union all
select 'budgets.rsm', count(*), count(*) filter (where nullif(btrim(rsm), '') is not null) from public.budgets
union all
select 'actuals.asm', count(*), count(*) filter (where nullif(btrim(asm), '') is not null) from public.actuals
union all
select 'actuals.rsm', count(*), count(*) filter (where nullif(btrim(rsm), '') is not null) from public.actuals
union all
select 'budget_import_staging.asm', count(*), count(*) filter (where nullif(btrim(asm), '') is not null) from public.budget_import_staging
union all
select 'budget_import_staging.rsm', count(*), count(*) filter (where nullif(btrim(rsm), '') is not null) from public.budget_import_staging
union all
select 'actual_import_staging.asm', count(*), count(*) filter (where nullif(btrim(asm), '') is not null) from public.actual_import_staging
union all
select 'actual_import_staging.rsm', count(*), count(*) filter (where nullif(btrim(rsm), '') is not null) from public.actual_import_staging;

commit;
