begin;

-- Preserve the current workflow (including automatic week locks), while
-- requiring a different person to review every submitted forecast.
do $$
declare
  definition text;
  revised text;
begin
  select pg_get_functiondef('public.transition_forecast_review(bigint[],text,text)'::regprocedure)
    into definition;
  revised := replace(definition,
    '  update public.sales_forecasts f',
    $guard$  if not is_submission and exists (
    select 1 from public.sales_forecasts f
    where f.id = any(p_ids)
      and (f.user_id = actor.id or f.submitted_by = actor.id)
  ) then
    raise exception 'You cannot review your own forecasts. Another reviewer must review them.';
  end if;

  update public.sales_forecasts f$guard$);
  if revised = definition then
    raise exception 'Unable to install the forecast self-review guard.';
  end if;
  execute revised;
end;
$$;

notify pgrst, 'reload schema';

commit;
