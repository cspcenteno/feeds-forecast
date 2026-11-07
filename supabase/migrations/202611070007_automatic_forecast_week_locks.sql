begin;

-- One-time setup. Budget and Actual tables are intentionally outside this policy.
create table if not exists public.forecast_week_policy (
  id boolean primary key default true check (id),
  open_ahead_weeks integer not null default 4 check (open_ahead_weeks between 0 and 52),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);
insert into public.forecast_week_policy(id) values (true) on conflict do nothing;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'week_locks' and column_name = 'is_override') then
    alter table public.week_locks add column is_override boolean not null default false;
    -- Preserve explicit existing locks. Existing Open entries become automatic,
    -- so historical weeks are closed when this migration takes effect.
    update public.week_locks set is_override = true where status = 'Locked';
  end if;
end;
$$;
alter table public.week_locks
  add column if not exists override_reason text,
  add column if not exists override_by uuid references public.users(id),
  add column if not exists override_expires_at timestamptz;
create unique index if not exists week_locks_year_week_uidx on public.week_locks(year, week);

create table if not exists public.forecast_week_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id),
  action text not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.forecast_week_start(p_year integer, p_week integer)
returns date language plpgsql immutable set search_path = '' as $$
begin
  if p_year is null or p_week is null or p_year < 2020 or p_year > 2100 or p_week < 1
    or p_week > extract(week from make_date(p_year, 12, 28))::integer then
    raise exception 'Invalid ISO forecast year/week: % / %', p_year, p_week;
  end if;
  return date_trunc('week', make_date(p_year, 1, 4)::timestamp)::date + (p_week - 1) * 7;
end;
$$;

create or replace function public.forecast_week_is_open(p_year integer, p_week integer)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  start_day date := public.forecast_week_start(p_year, p_week);
  current_monday date := date_trunc('week', now() at time zone 'Asia/Manila')::date;
  ahead integer;
  lock_row public.week_locks%rowtype;
begin
  select * into lock_row from public.week_locks where year = p_year and week = p_week;
  if found and lock_row.is_override and (lock_row.override_expires_at is null or lock_row.override_expires_at > now()) then
    return coalesce(lock_row.status = 'Open', false);
  end if;
  select open_ahead_weeks into ahead from public.forecast_week_policy where id;
  if not found then return false; end if;
  return start_day >= current_monday and start_day <= current_monday + ahead * 7;
end;
$$;

create or replace function public.get_forecast_week_states(p_periods jsonb)
returns table(year integer, week integer, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_active) then raise exception 'An active account is required.'; end if;
  if jsonb_typeof(p_periods) is distinct from 'array' or jsonb_array_length(p_periods) > 250 then raise exception 'Select at most 250 weeks.'; end if;
  return query select p.year, p.week, case when public.forecast_week_is_open(p.year, p.week) then 'Open' else 'Locked' end
    from jsonb_to_recordset(p_periods) as p(year integer, week integer);
end;
$$;

create or replace function public.require_forecast_week_admin(p_action text)
returns void language plpgsql stable security definer set search_path = '' as $$
declare allowed boolean;
begin
  if p_action not in ('view', 'add', 'edit', 'delete') or p_action is null then raise exception 'Invalid permission action.'; end if;
  if not exists (select 1 from public.users where id = auth.uid() and is_active and role = 'Admin') then raise exception 'Only active Admin accounts can manage forecast week locks.'; end if;
  select case p_action when 'view' then can_view when 'add' then can_add when 'edit' then can_edit when 'delete' then can_delete end
    into allowed from public.user_permissions where user_id = auth.uid() and module::text = 'Week Locks';
  if found and not coalesce(allowed, false) then raise exception 'Week Locks % permission is required.', p_action; end if;
end;
$$;

create or replace function public.get_forecast_week_calendar(p_year integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_active) then raise exception 'An active account is required.'; end if;
  perform public.forecast_week_start(p_year, 1);
  select jsonb_build_object(
    'open_ahead_weeks', (select open_ahead_weeks from public.forecast_week_policy where id),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object(
      'year', p_year, 'week', n, 'start_date', public.forecast_week_start(p_year, n), 'end_date', public.forecast_week_start(p_year, n) + 6,
      'status', case when public.forecast_week_is_open(p_year, n) then 'Open' else 'Locked' end,
      'generated', l.id is not null,
      'is_override', coalesce(l.is_override and (l.override_expires_at is null or l.override_expires_at > now()), false),
      'reason', l.override_reason, 'expires_at', l.override_expires_at,
      'changed_by', coalesce(u.full_name, u.email), 'changed_at', l.locked_at
    ) order by n) from generate_series(1, extract(week from make_date(p_year, 12, 28))::integer) n
      left join public.week_locks l on l.year = p_year and l.week = n
      left join public.users u on u.id = coalesce(l.override_by, l.locked_by)), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

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
  if p_action <> 'generate' and reason is null then raise exception 'Enter a reason for this change.'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'The override expiry must be in the future.'; end if;
  if p_action = 'policy' then
    if p_ahead is null or p_ahead < 0 or p_ahead > 52 then raise exception 'Future weeks must be between 0 and 52.'; end if;
    select to_jsonb(p) into before_state from public.forecast_week_policy p where id;
    update public.forecast_week_policy set open_ahead_weeks = p_ahead, updated_by = auth.uid(), updated_at = now() where id;
    if not found then raise exception 'Forecast week policy is unavailable.'; end if;
    insert into public.forecast_week_audit(actor_id, action, reason, details) values (auth.uid(), p_action, reason,
      jsonb_build_object('before', before_state, 'open_ahead_weeks', p_ahead));
    return 1;
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
    status = case when p_action = 'reset' then case when public.forecast_week_start(year, week) between date_trunc('week', now() at time zone 'Asia/Manila')::date
      and date_trunc('week', now() at time zone 'Asia/Manila')::date + (select open_ahead_weeks * 7 from public.forecast_week_policy where id) then 'Open' else 'Locked' end
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

-- Enforce effective locks for manual entry, API imports (including service-role
-- inserts), edits, deletes, and submission. Managers may finish reviewing old
-- submissions without changing their forecast data.
create or replace function public.enforce_forecast_week_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare check_new boolean := false; check_old boolean := false;
begin
  perform pg_advisory_xact_lock_shared(17007, 1);
  if tg_op = 'INSERT' then check_new := true;
  elsif tg_op = 'DELETE' then check_old := true;
  else
    if row(new.year, new.week, new.region_id, new.subregion_id, new.customer_id, new.category_id, new.product_id, new.forecast, new.volume, new.user_id, to_jsonb(new)->'kam')
      is distinct from row(old.year, old.week, old.region_id, old.subregion_id, old.customer_id, old.category_id, old.product_id, old.forecast, old.volume, old.user_id, to_jsonb(old)->'kam')
      or (old.status::text in ('Draft', 'Rejected') and new.status::text in ('Draft', 'Pending')) then
      check_old := true; check_new := true;
    end if;
  end if;
  if check_old and not public.forecast_week_is_open(old.year, old.week) then raise exception 'Forecast week % / % is locked. Ask an Admin for an audited exception.', old.year, old.week; end if;
  if check_new and not public.forecast_week_is_open(new.year, new.week) then raise exception 'Forecast week % / % is locked. Ask an Admin for an audited exception.', new.year, new.week; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists enforce_forecast_week_lock_before_write on public.sales_forecasts;
create trigger enforce_forecast_week_lock_before_write before insert or update or delete on public.sales_forecasts
  for each row execute function public.enforce_forecast_week_lock();

-- Replace the legacy submission-only static status test, leaving the rest of
-- the installed review workflow and its permission checks unchanged.
do $$
declare definition text; revised text;
begin
  if to_regprocedure('public.transition_forecast_review(bigint[],text,text)') is not null then
    select pg_get_functiondef('public.transition_forecast_review(bigint[],text,text)'::regprocedure) into definition;
    revised := regexp_replace(definition,
      'not exists\s*\(\s*select 1 from public\.week_locks l\s*where l\.year = f\.year and l\.week = f\.week and l\.status = ''Locked''\s*\)',
      'public.forecast_week_is_open(f.year, f.week)', 'gi');
    if revised = definition and position('public.week_locks' in definition) > 0 then raise exception 'The installed review workflow has an unrecognized week-lock check; no changes were applied.'; end if;
    if revised <> definition then execute revised; end if;
  end if;
end;
$$;

alter table public.forecast_week_policy enable row level security;
alter table public.forecast_week_audit enable row level security;
revoke all on public.forecast_week_policy, public.forecast_week_audit from anon, authenticated;
grant select on public.forecast_week_policy, public.forecast_week_audit to authenticated;
drop policy if exists forecast_week_policy_read on public.forecast_week_policy;
create policy forecast_week_policy_read on public.forecast_week_policy for select to authenticated using (exists (select 1 from public.users where id = auth.uid() and is_active));
drop policy if exists forecast_week_audit_read on public.forecast_week_audit;
create policy forecast_week_audit_read on public.forecast_week_audit for select to authenticated using (exists (select 1 from public.users where id = auth.uid() and is_active and role = 'Admin'));
-- All schedule mutations go through the audited RPC, never direct browser writes.
revoke insert, update, delete on public.week_locks from authenticated, anon;

revoke all on function public.forecast_week_start(integer, integer), public.forecast_week_is_open(integer, integer),
  public.get_forecast_week_states(jsonb), public.require_forecast_week_admin(text), public.get_forecast_week_calendar(integer),
  public.manage_forecast_weeks(text, integer, date, date, text, text, timestamptz, integer), public.enforce_forecast_week_lock() from public;
grant execute on function public.forecast_week_start(integer, integer), public.forecast_week_is_open(integer, integer), public.get_forecast_week_states(jsonb),
  public.get_forecast_week_calendar(integer), public.manage_forecast_weeks(text, integer, date, date, text, text, timestamptz, integer) to authenticated;
grant execute on function public.forecast_week_is_open(integer, integer) to service_role;

-- Populate years represented in saved forecasts plus this year and next year.
-- Missing years are still evaluated by the rolling rule; generation is for visibility.
insert into public.week_locks(year, week, status, is_override)
select y, n, case when public.forecast_week_is_open(y, n) then 'Open' else 'Locked' end, false
from (select distinct year as y from public.sales_forecasts where year between 2020 and 2100
  union select extract(isoyear from now() at time zone 'Asia/Manila')::integer
  union select extract(isoyear from now() at time zone 'Asia/Manila')::integer + 1) years
cross join lateral generate_series(1, extract(week from make_date(y, 12, 28))::integer) n
on conflict (year, week) do nothing;
insert into public.forecast_week_audit(action, reason, details) values ('initialize', 'Enable automatic current week plus four future weeks; historical weeks locked.', jsonb_build_object('timezone', 'Asia/Manila'));
notify pgrst, 'reload schema';
commit;
