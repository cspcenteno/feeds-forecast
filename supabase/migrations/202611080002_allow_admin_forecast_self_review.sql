begin;

-- Admins may review their own entries, following the normal two stages.
do $$
declare
  definition text;
  revised text;
begin
  select pg_get_functiondef('public.transition_forecast_review(bigint[],text,text)'::regprocedure)
    into definition;
  revised := replace(definition,
    'if not is_submission and exists (',
    'if not is_submission and not is_admin and exists (');
  if revised = definition
     and position('if not is_submission and not is_admin and exists (' in definition) = 0 then
    raise exception 'Unable to update the forecast self-review guard. Apply migration 202611080001 first.';
  end if;
  execute revised;
end;
$$;

notify pgrst, 'reload schema';

commit;
