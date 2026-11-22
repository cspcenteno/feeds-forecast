-- Saved Budget/Actual volumes may be negative (for example, adjustments).
-- Preserve the installed editor's snapshot checks, RLS, grants and row locks.
begin;
do $migration$
declare function_oid regprocedure := to_regprocedure('public.update_customer_volume_records(text,jsonb)');
  definition text;
begin
  if function_oid is null then raise exception 'Apply the customer-volume editor migrations first.'; end if;
  definition := pg_get_functiondef(function_oid);
  if position('new_volume < 0' in definition) > 0 then
    definition := replace(definition, 'or new_volume < 0 ', '');
    if position('new_volume < 0' in definition) > 0 then raise exception 'Unrecognized volume validation. Review the installed editor.'; end if;
  elsif position('Enter a valid numeric volume.' in definition) = 0 then
    raise exception 'Unrecognized volume validation. Review the installed editor.';
  end if;
  definition := replace(definition, 'Enter a valid volume of zero or more.', 'Enter a valid numeric volume.');
  execute definition;
end;
$migration$;
notify pgrst, 'reload schema';
commit;
