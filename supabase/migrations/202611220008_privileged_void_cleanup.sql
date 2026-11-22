-- Permit intentional Table/SQL Editor cleanup by privileged database roles.
-- Browser authenticated/anon roles remain blocked, even for an app Admin.
-- This migration does not delete any records. Existing audit triggers stay active.
begin;
do $migration$
declare target text; function_oid regprocedure; definition text; cleanup_guard text;
begin
  cleanup_guard := $guard$
  -- Privileged manual cleanup of Voided forecasts.
  if tg_op = 'DELETE' and old.status::text = 'Voided' and (
    current_setting('role', true) in ('postgres','supabase_admin')
    or (coalesce(current_setting('role', true),'none') in ('none','')
      and session_user in ('postgres','supabase_admin'))
  ) then return old; end if;
  $guard$;
  foreach target in array array['public.guard_forecast_void()','public.enforce_forecast_week_lock()'] loop
    function_oid := to_regprocedure(target);
    if function_oid is null then raise exception 'Required trigger function % is missing. Apply the forecast workflow migrations first.',target; end if;
    definition := pg_get_functiondef(function_oid);
    if strpos(definition,'Privileged manual cleanup of Voided forecasts.') > 0 then continue; end if;
    if definition !~* '\mbegin\M' then raise exception 'Unrecognized trigger function %. Review before applying.',target; end if;
    -- current_user is deliberately not used: these triggers are SECURITY DEFINER.
    -- The active connection role/session identity distinguishes manual access.
    definition := regexp_replace(definition,'\mbegin\M','begin' || cleanup_guard,'i');
    execute definition;
  end loop;
end;
$migration$;
notify pgrst,'reload schema';
commit;
