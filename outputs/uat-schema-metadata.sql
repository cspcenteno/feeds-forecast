-- Read-only metadata export. Run in the UAT Supabase SQL Editor.
-- Export all result rows as CSV; select No limit before running.
select 'constraints' as section, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as metadata
from (
  select n.nspname as schema_name, c.relname as table_name,
    k.conname as name, pg_get_constraintdef(k.oid, true) as definition
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
) x
union all
select 'indexes', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (select * from pg_indexes where schemaname = 'public') x
union all
select 'policies', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (select * from pg_policies where schemaname = 'public') x
union all
select 'row_security', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (
  select c.relname as table_name, c.relrowsecurity as enabled,
    c.relforcerowsecurity as forced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
) x
union all
select 'functions', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (
  select n.nspname as schema_name, p.proname as name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_functiondef(p.oid) as definition, p.proacl::text as privileges
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
) x
union all
select 'triggers', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (
  select n.nspname as schema_name, c.relname as table_name,
    t.tgname as name, pg_get_triggerdef(t.oid, true) as definition,
    t.tgenabled as enabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname in ('public', 'auth')
) x
union all
select 'table_grants', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (select * from information_schema.table_privileges where table_schema = 'public') x
union all
select 'relations', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (
  select c.relname as name, c.relkind::text as kind, c.relacl::text as privileges,
    c.reloptions,
    case when c.relkind in ('v', 'm') then pg_get_viewdef(c.oid, true) end as view_definition
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
) x
union all
select 'extensions', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
from (
  select e.extname as name, n.nspname as schema_name, e.extversion as version
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
) x;
