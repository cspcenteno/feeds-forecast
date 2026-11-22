begin;
alter table public.forecasts
  add column if not exists voided_by uuid references public.users(id) on delete restrict,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

-- Preserve existing statuses and support either a text CHECK or enum column.
do $$
declare status_column record; status_check record;
begin
  select a.attnum,t.typtype,t.oid::regtype as type_name into strict status_column
    from pg_attribute a join pg_type t on t.oid=a.atttypid
    where a.attrelid='public.forecasts'::regclass and a.attname='status';
  if status_column.typtype='e' then execute format('alter type %s add value if not exists %L',status_column.type_name,'Voided'); end if;
  for status_check in select conname,pg_get_expr(conbin,conrelid) as expression from pg_constraint
    where conrelid='public.forecasts'::regclass and contype='c' and conkey=array[status_column.attnum]::smallint[]
      and strpos(pg_get_expr(conbin,conrelid),quote_literal('Voided'))=0 loop
    execute format('alter table public.forecasts drop constraint %I',status_check.conname);
    execute format('alter table public.forecasts add constraint %I check ((%s) or status::text=%L)',status_check.conname,status_check.expression,'Voided');
  end loop;
end;
$$;

-- Guard direct table calls as well as the RPC. Voided history is immutable.
create or replace function public.guard_forecast_void()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op <> 'INSERT' and old.status::text='Voided' then raise exception 'Voided forecasts are read-only and cannot be deleted.'; end if;
  if tg_op='DELETE' then return old; end if;
  if new.status::text='Voided' then
    if tg_op <> 'UPDATE' then raise exception 'Only approved forecasts can be voided.'; end if;
    if old.status::text is distinct from 'Approved' then raise exception 'Only approved forecasts can be voided.'; end if;
    if not exists(select 1 from public.users u where u.id=auth.uid() and u.is_active and u.role='Admin')
      or not public.has_module_permission('Forecasts','view') or not public.has_module_permission('Forecasts','delete') then
      raise exception 'An active Admin with Forecasts View and Delete permissions is required.' using errcode='42501';
    end if;
    if new.voided_by is distinct from auth.uid() or new.voided_at is null
      or length(trim(coalesce(new.void_reason,''))) not between 3 and 1000 then raise exception 'A valid void reason and actor are required.'; end if;
    if (to_jsonb(new)-array['status','voided_by','voided_at','void_reason','updated_at'])
      is distinct from (to_jsonb(old)-array['status','voided_by','voided_at','void_reason','updated_at']) then
      raise exception 'Voiding cannot edit forecast data or approval history.';
    end if;
  elsif new.voided_by is not null or new.voided_at is not null or new.void_reason is not null then
    raise exception 'Void metadata is only allowed on voided forecasts.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_forecast_void() from public;
drop trigger if exists guard_forecast_void_write on public.forecasts;
create trigger guard_forecast_void_write before insert or update or delete on public.forecasts
  for each row execute function public.guard_forecast_void();

create or replace function public.void_approved_forecasts(p_records jsonb,p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare entry jsonb; current_row public.forecasts%rowtype; field text; changed integer:=0;
begin
  if not exists(select 1 from public.users u where u.id=auth.uid() and u.is_active and u.role='Admin')
    or not public.has_module_permission('Forecasts','view') or not public.has_module_permission('Forecasts','delete') then
    raise exception 'An active Admin with Forecasts View and Delete permissions is required.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Enter a reason from 3 to 1000 characters.'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Select approved forecasts.'; end if;
  if jsonb_array_length(p_records) not between 1 and 5000 then raise exception 'Select between 1 and 5000 approved forecasts.'; end if;
  if exists(select 1 from jsonb_array_elements(p_records) r group by r->>'id' having count(*)>1) then raise exception 'Duplicate forecast.'; end if;
  perform pg_advisory_xact_lock_shared(17007,1);
  for entry in select r from jsonb_array_elements(p_records) r order by (r->>'id')::bigint loop
    select * into current_row from public.forecasts where id=(entry->>'id')::bigint for update;
    if not found or current_row.status::text is distinct from 'Approved' then raise exception 'Only approved forecasts can be voided. Refresh and retry.'; end if;
    if jsonb_typeof(entry->'original') is distinct from 'object' then raise exception 'Missing original forecast details.'; end if;
    foreach field in array array['status','forecast','volume','year','week','region_id','subregion_id','customer_id','product_id','category_id','user_id'] loop
      if not (entry->'original' ? field) or to_jsonb(current_row)->field is distinct from entry->'original'->field then
        raise exception 'A forecast changed. Refresh and retry.';
      end if;
    end loop;
    -- Approved quantities and approval metadata remain available for history.
    -- Existing audit and week-lock triggers still execute for this status change.
    update public.forecasts set status='Voided',voided_by=auth.uid(),voided_at=clock_timestamp(),void_reason=trim(p_reason) where id=current_row.id;
    changed:=changed+1;
  end loop;
  return changed;
end;
$$;
revoke all on function public.void_approved_forecasts(jsonb,text) from public;
grant execute on function public.void_approved_forecasts(jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
