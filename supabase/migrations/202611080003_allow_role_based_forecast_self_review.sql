begin;

-- Ownership does not restrict review. Existing role, stage and scope checks apply.
do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.transition_forecast_review(bigint[],text,text)'::regprocedure)
    into definition;
  definition := regexp_replace(definition,
    'if not is_submission and (not is_admin and )?exists \(\s*select 1 from public\.sales_forecasts f\s*where f\.id = any\(p_ids\)\s*and \(f\.user_id = actor\.id or f\.submitted_by = actor\.id\)\s*\) then\s*raise exception ''You cannot review your own forecasts\. Another reviewer must review them\.'';\s*end if;',
    '', 'g');
  execute definition;
end;
$$;

notify pgrst, 'reload schema';

commit;
