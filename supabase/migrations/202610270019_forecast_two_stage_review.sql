begin;

alter table public.sales_forecasts
  add column if not exists endorsed_by uuid references public.users(id) on delete set null,
  add column if not exists endorsed_at timestamptz,
  add column if not exists returned_by uuid references public.users(id) on delete set null,
  add column if not exists returned_at timestamptz;

-- Keep existing allowed statuses and add the intermediate endorsement stage.
do $$
declare
  status_column record;
  status_check record;
begin
  select a.attnum, t.typtype, t.oid::regtype as type_name into strict status_column
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.sales_forecasts'::regclass and a.attname = 'status';

  if status_column.typtype = 'e' then
    execute format('alter type %s add value if not exists %L', status_column.type_name, 'Endorsed');
  end if;

  for status_check in
    select conname, pg_get_expr(conbin, conrelid) as expression
    from pg_constraint
    where conrelid = 'public.sales_forecasts'::regclass
      and contype = 'c' and conkey = array[status_column.attnum]::smallint[]
  loop
    execute format('alter table public.sales_forecasts drop constraint %I', status_check.conname);
    execute format(
      'alter table public.sales_forecasts add constraint %I check ((%s) or status::text = %L)',
      status_check.conname, status_check.expression, 'Endorsed'
    );
  end loop;
end;
$$;

create function public.forecast_workflow_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select coalesce((
      select case p_action when 'view' then p.can_view when 'edit' then p.can_edit end
      from public.user_permissions p
      where p.user_id = u.id
        and (p.module::text = p_module or (p_module = 'Forecast Input' and p.module::text = 'Sales Input'))
      order by (p.module::text = p_module) desc
      limit 1
    ), case
      when p_module = 'Approvals' then u.role = 'Manager' and p_action in ('view', 'edit')
      when p_module = 'Forecast Input' then u.role in ('User', 'Superuser', 'Admin') and p_action = 'edit'
      else false
    end)
    from public.users u where u.id = auth.uid() and u.is_active is true
  ), false);
$$;

revoke all on function public.forecast_workflow_permission(text, text) from public;
grant execute on function public.forecast_workflow_permission(text, text) to authenticated;

-- The existing table policies can limit a manager to their subregion. This
-- read-only queue uses the position-specific scope, including region-wide ASM review.
create function public.get_forecast_review_queue()
returns table (
  id bigint, year integer, week integer, region_id bigint, subregion_id bigint,
  customer_id bigint, category_id bigint, product_id bigint,
  forecast numeric, volume numeric, status text, user_id uuid,
  submitted_by uuid, endorsed_by uuid, submitter_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id::bigint, f.year::integer, f.week::integer, f.region_id::bigint,
    f.subregion_id::bigint, f.customer_id::bigint, f.category_id::bigint,
    f.product_id::bigint, f.forecast::numeric, f.volume::numeric, f.status::text,
    f.user_id, f.submitted_by, f.endorsed_by, submitter.full_name::text
  from public.sales_forecasts f
  join public.users u on u.id = auth.uid()
  left join public.users submitter on submitter.id = f.submitted_by
  where u.is_active is true and u.role = 'Manager'
    and public.forecast_workflow_permission('Approvals', 'view')
    and f.region_id = u.region_id
    and (
      (u.position = 'RSM' and f.subregion_id = u.subregion_id and f.status::text in ('Pending', 'Endorsed'))
      or (u.position = 'ASM' and f.status::text = 'Endorsed')
    );
$$;

revoke all on function public.get_forecast_review_queue() from public;
grant execute on function public.get_forecast_review_queue() to authenticated;

create function public.transition_forecast_review(p_ids bigint[], p_action text, p_remarks text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.users%rowtype;
  next_status public.sales_forecasts.status%type;
  previous_status text;
  changed_count integer;
  reason text := nullif(btrim(p_remarks), '');
begin
  select * into actor from public.users
  where id = auth.uid() and is_active is true;

  if not found then raise exception 'An active account is required.'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Select at least one forecast.'; end if;

  if p_action = 'submit' then
    if actor.position is distinct from 'KAM'
       or actor.region_id is null or actor.subregion_id is null
       or not public.forecast_workflow_permission('Forecast Input', 'edit') then
      raise exception 'Only a KAM assigned to a region and subregion can submit forecasts.';
    end if;
    previous_status := 'Draft';
    next_status := 'Pending';
  else
    if actor.role is distinct from 'Manager' or actor.region_id is null
       or not public.forecast_workflow_permission('Approvals', 'edit') then
      raise exception 'Only an assigned manager with Approvals Edit permission can review forecasts.';
    end if;

    case p_action
      when 'endorse' then
        if actor.position is distinct from 'RSM' then raise exception 'Only the assigned RSM can endorse.'; end if;
        previous_status := 'Pending';
        next_status := 'Endorsed';
      when 'undo' then
        if actor.position is distinct from 'RSM' then raise exception 'Only the endorsing RSM can undo endorsement.'; end if;
        previous_status := 'Endorsed';
        next_status := 'Pending';
      when 'approve' then
        if actor.position is distinct from 'ASM' then raise exception 'Only the assigned ASM can give final approval.'; end if;
        previous_status := 'Endorsed';
        next_status := 'Approved';
      when 'return' then
        if actor.position is null or actor.position not in ('RSM', 'ASM') then
          raise exception 'Only the assigned RSM or ASM can return a forecast.';
        end if;
        if reason is null then raise exception 'Enter a reason for returning the forecast.'; end if;
        previous_status := case when actor.position = 'RSM' then 'Pending' else 'Endorsed' end;
        next_status := 'Rejected';
      else
        raise exception 'Unknown forecast review action.';
    end case;
  end if;

  update public.sales_forecasts f
  set status = next_status,
      submitted_by = case when p_action = 'submit' then actor.id else f.submitted_by end,
      submitted_at = case when p_action = 'submit' then now() else f.submitted_at end,
      endorsed_by = case when p_action = 'endorse' then actor.id when p_action in ('submit', 'undo') then null else f.endorsed_by end,
      endorsed_at = case when p_action = 'endorse' then now() when p_action in ('submit', 'undo') then null else f.endorsed_at end,
      approved_by = case when p_action = 'approve' then actor.id else null end,
      approved_at = case when p_action = 'approve' then now() else null end,
      returned_by = case when p_action = 'return' then actor.id else null end,
      returned_at = case when p_action = 'return' then now() else null end,
      remarks = case when p_action in ('submit', 'undo') then null else reason end
  where f.id = any(p_ids)
    and f.status::text = previous_status
    and f.region_id = actor.region_id
    and (actor.position = 'ASM' or f.subregion_id = actor.subregion_id)
    and (p_action <> 'undo' or f.endorsed_by = actor.id)
    and (
      p_action <> 'submit' or (
        f.user_id = actor.id
        and not exists (
          select 1 from public.week_locks l
          where l.year = f.year and l.week = f.week and l.status = 'Locked'
        )
      )
    );

  get diagnostics changed_count = row_count;
  if changed_count <> cardinality(p_ids) then
    raise exception 'Some forecasts are outside your assignment, locked, or have changed status. Refresh and try again.';
  end if;
  return changed_count;
end;
$$;

revoke all on function public.transition_forecast_review(bigint[], text, text) from public;
grant execute on function public.transition_forecast_review(bigint[], text, text) to authenticated;

-- The old single-stage approval trigger is superseded by this guard and the RPC.
drop trigger if exists guard_approval_only_forecast_updates_before_write on public.sales_forecasts;

create function public.guard_forecast_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The review RPC runs as its owner. Browser writes run as authenticated.
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status::text not in ('Draft', 'Rejected') then
      raise exception 'Only draft or returned forecasts can be deleted.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status::text is distinct from 'Draft'
       or coalesce(to_jsonb(new)->>'submitted_by', to_jsonb(new)->>'submitted_at',
                   to_jsonb(new)->>'endorsed_by', to_jsonb(new)->>'endorsed_at',
                   to_jsonb(new)->>'approved_by', to_jsonb(new)->>'approved_at',
                   to_jsonb(new)->>'returned_by', to_jsonb(new)->>'returned_at',
                   nullif(btrim(new.remarks), '')) is not null then
      raise exception 'New forecasts must start as drafts without review metadata.';
    end if;
    return new;
  end if;

  if not public.forecast_workflow_permission('Forecast Input', 'edit')
     or old.status::text not in ('Draft', 'Rejected')
     or (new.status::text is distinct from old.status::text and new.status::text is distinct from 'Draft')
     or (to_jsonb(new) - array['id','year','week','region_id','subregion_id','customer_id','category_id','product_id','forecast','volume','status','user_id','updated_at'])
        is distinct from
        (to_jsonb(old) - array['id','year','week','region_id','subregion_id','customer_id','category_id','product_id','forecast','volume','status','user_id','updated_at']) then
    raise exception 'Use the forecast review workflow to change review status or metadata.';
  end if;

  return new;
end;
$$;

create trigger guard_forecast_workflow_before_write
before insert or update or delete on public.sales_forecasts
for each row execute function public.guard_forecast_workflow();

commit;
