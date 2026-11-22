-- Read-only verification; does NOT drop actual_import_staging.subregion.
begin transaction read only;

select count(*) as staging_rows,
       count(*) filter (where nullif(btrim(subregion), '') is not null) as populated_subregions
from public.actual_import_staging;

-- Exact PostgreSQL catalog dependencies on this column.
select pg_describe_object(d.classid, d.objid, d.objsubid) as dependency, d.deptype
from pg_depend d
join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
where d.refclassid = 'pg_class'::regclass
  and a.attrelid = 'public.actual_import_staging'::regclass
  and a.attname = 'subregion';

-- Text-body dependencies can be absent from pg_depend. Review each result.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and p.prosrc ilike '%actual_import_staging%';

select policyname, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'actual_import_staging';

select t.tgname, pg_get_triggerdef(t.oid) as definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
where t.tgrelid = 'public.actual_import_staging'::regclass and not t.tgisinternal;

-- Confirm the installed snapshot RPC after applying the cleanup migration.
select pg_get_functiondef('public.update_customer_volume_records(text,jsonb)'::regprocedure) as snapshot_rpc;

commit;
