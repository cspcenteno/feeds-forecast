-- Apply before deploying the matching application changes.
-- Remove legacy text-column dependencies from the customer-volume edit RPC.
-- No columns, stored values, roles, permissions or reporting levels are deleted.
begin;

do $migration$
declare
  function_oid regprocedure := to_regprocedure('public.update_customer_volume_records(text,jsonb)');
  definition text;
  snapshot_array text;
  replacement_array text;
begin
  if function_oid is null then
    raise exception 'update_customer_volume_records(text,jsonb) is missing. Apply the customer-volume editor migrations first.';
  end if;

  -- Preserve the installed version, including permissions, RLS behavior,
  -- period checks, row locks and any later application-specific fixes.
  definition := pg_get_functiondef(function_oid);
  snapshot_array := substring(definition from 'foreach[[:space:]]+field[[:space:]]+in[[:space:]]+array[[:space:]]+(array\[[^]]*\])[[:space:]]+loop');
  if snapshot_array is null
    or position(quote_literal('volume') in snapshot_array) = 0
    or position(quote_literal('kam') in snapshot_array) = 0
    or position(quote_literal('customer_id') in snapshot_array) = 0 then
    raise exception 'Unrecognized snapshot validation. Inspect the installed RPC before applying this migration.';
  end if;

  replacement_array := regexp_replace(snapshot_array, ',[[:space:]]*''(asm|rsm)''', '', 'g');
  definition := replace(definition, snapshot_array, replacement_array);
  if definition ~ '''(asm|rsm)''' then
    raise exception 'Additional legacy column references exist in this RPC. Review them before applying.';
  end if;
  execute definition;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
