begin;

-- Add Supervisor's regional branch before the existing position branches.
-- Retain every other role's scope, module permission checks, and RPC shape.
do $migration$
declare
  target record;
  definition text;
  branch text;
begin
  for target in select * from (values
    ('public.can_access_data_scope(bigint,bigint,uuid)', 'u.region_id is not null and u.region_id = p_region_id'),
    ('public.can_access_forecast_scope(bigint,bigint,uuid)', 'u.region_id is not null and u.region_id = p_region_id'),
    ('public.can_write_sales_volume_scope(bigint,bigint,boolean)', 'u.region_id is not null and u.region_id = p_region_id'),
    ('public.can_access_sales_reporting_scope(bigint,bigint,uuid)', 'u.region_id is not null and u.region_id = p_region_id'),
    ('public.can_view_monthly_reference(text,bigint,bigint,bigint)', 'u.region_id is not null and u.region_id = p_region'),
    ('public.monthly_reference_viewer(text)', '''region'''),
    ('public.get_monthly_sales_dashboard(date)', '''asm''')
  ) as functions(signature, result) loop
    select pg_get_functiondef(to_regprocedure(target.signature)) into definition;
    if definition is null then
      raise exception 'Missing required function: %', target.signature;
    end if;
    branch := 'when u.role = ''Superuser'' and upper(trim(u.position)) in (''SUPERVISOR'', ''SV'') then ' || target.result;
    if strpos(definition, branch) = 0 then
      if definition !~* '\mcase\M' then
        raise exception 'Expected scope CASE in %', target.signature;
      end if;
      definition := regexp_replace(definition, '\mcase\M', 'case ' || branch || E'\n', 'i');
      execute definition;
    end if;
  end loop;
end;
$migration$;

commit;
