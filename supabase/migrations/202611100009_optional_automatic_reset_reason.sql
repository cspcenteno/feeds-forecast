begin;

-- Reset needs no typed reason; retain a meaningful audit entry.
create or replace function public.manage_forecast_weeks(
  p_action text, p_year integer default null, p_from date default null, p_to date default null,
  p_status text default null, p_reason text default null, p_expires_at timestamptz default null,
  p_ahead integer default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  changed integer := 0;
  first_year integer;
  last_year integer;
  y integer;
  before_state jsonb;
  reason text := nullif(btrim(p_reason), '');
begin
  perform public.require_forecast_week_admin(case when p_action = 'generate' then 'add' else 'edit' end);
  -- Serialize policy changes with forecast writes so a close cannot race an import.
  perform pg_advisory_xact_lock(17007, 1);
  if p_action not in ('generate', 'lock_before', 'range', 'reset', 'policy') or p_action is null then raise exception 'Invalid week lock action.'; end if;
  if p_action = 'reset' and reason is null then reason := 'Restore automatic rule.'; end if;
  if p_action <> 'generate' and reason is null then raise exception 'Enter a reason for this change.'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'The override expiry must be in the future.'; end if;
  if p_action = 'policy' then
    raise exception 'The automatic rule is fixed: the current week and next two weeks are locked; later weeks are open.';
  end if;
  if p_action = 'range' then
    p_expires_at := case when p_status = 'Open' then now() + interval '24 hours' else null end;
  end if;
  if p_action = 'generate' then
    perform public.forecast_week_start(p_year, 1);
    first_year := p_year; last_year := p_year;
  elsif p_action = 'lock_before' then
    if p_from is null then raise exception 'Select a cutoff date.'; end if;
    select least(coalesce(min(year), extract(isoyear from now() at time zone 'Asia/Manila')::integer), extract(isoyear from p_from)::integer)
      into first_year from public.sales_forecasts where year between 2020 and 2100;
    select least(first_year, coalesce(min(year), first_year)) into first_year from public.week_locks where year between 2020 and 2100;
    last_year := extract(isoyear from p_from)::integer;
  else
    if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 3660 then raise exception 'Select a valid week range of at most ten years.'; end if;
    if p_action = 'range' and (p_status is null or p_status not in ('Open', 'Locked')) then raise exception 'Select Open or Locked.'; end if;
    first_year := extract(isoyear from p_from)::integer; last_year := extract(isoyear from p_to)::integer;
  end if;
  if first_year < 2020 or last_year > 2100 then raise exception 'Supported years are 2020 through 2100.'; end if;
  for y in first_year..last_year loop
    insert into public.week_locks(year, week, status, is_override)
      select y, n, case when public.forecast_week_is_open(y, n) then 'Open' else 'Locked' end, false
      from generate_series(1, extract(week from make_date(y, 12, 28))::integer) n
      on conflict (year, week) do nothing;
    get diagnostics changed = row_count;
    if p_action = 'generate' then
      insert into public.forecast_week_audit(actor_id, action, reason, details) values (auth.uid(), p_action, 'Generate year schedule', jsonb_build_object('year', y, 'created', changed));
      return changed;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('year', year, 'week', week, 'status', status, 'is_override', is_override,
    'reason', override_reason, 'expires_at', override_expires_at)), '[]'::jsonb) into before_state
    from public.week_locks where case when p_action = 'lock_before' then public.forecast_week_start(year, week) + 6 < p_from
      else public.forecast_week_start(year, week) between date_trunc('week', p_from::timestamp)::date and date_trunc('week', p_to::timestamp)::date end;
  update public.week_locks set
    status = case when p_action = 'reset' then case when public.forecast_week_start(year, week) >= date_trunc('week', now() at time zone 'Asia/Manila')::date + 21 then 'Open' else 'Locked' end
      when p_action = 'lock_before' then 'Locked' else p_status end,
    is_override = p_action <> 'reset', override_reason = reason, override_by = auth.uid(), override_expires_at = case when p_action = 'range' then p_expires_at else null end,
    locked_by = case when p_action = 'lock_before' or p_status = 'Locked' then auth.uid() else null end, locked_at = now()
    where case when p_action = 'lock_before' then public.forecast_week_start(year, week) + 6 < p_from
      else public.forecast_week_start(year, week) between date_trunc('week', p_from::timestamp)::date and date_trunc('week', p_to::timestamp)::date end;
  get diagnostics changed = row_count;
  insert into public.forecast_week_audit(actor_id, action, reason, details) values (auth.uid(), p_action, reason,
    jsonb_build_object('from', p_from, 'to', p_to, 'status', p_status, 'expires_at', p_expires_at, 'affected', changed, 'before', before_state));
  return changed;
end;
$$;

notify pgrst, 'reload schema';
commit;
