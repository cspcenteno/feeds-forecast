begin;

-- Preserve RPC field names for compatibility; prior_actual and
-- prior_year_actual_volume now contain the previous calendar month's volume.
do $migration$
declare signature text; definition text; revised text;
begin
  foreach signature in array array[
    'public.get_monthly_sales_dashboard(date)',
    'public.get_forecast_review_reference(bigint[])',
    'public.get_weekly_sales_monthly_actuals(bigint[])'
  ] loop
    select pg_get_functiondef(to_regprocedure(signature)) into definition;
    if definition is null then raise exception 'Missing function: %', signature; end if;
    revised := replace(definition, 'interval ''1 year''', 'interval ''1 month''');
    revised := regexp_replace(revised,
      'make_date\(q.year\s*-\s*1,\s*q.reference_month,\s*1\)',
      '(make_date(q.year, q.reference_month, 1) - interval ''1 month'')::date', 'g');
    if revised = definition and position('interval ''1 month''' in definition) = 0 then
      raise exception 'Unrecognized previous-period calculation in %', signature;
    end if;
    execute revised;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
