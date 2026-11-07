begin;

create or replace function public.transition_forecast_review(p_ids bigint[], p_action text, p_remarks text default null)
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
  admin_submission boolean;
  reason text := nullif(btrim(p_remarks), '');
begin
  select * into actor from public.users
  where id = auth.uid() and is_active is true;

  if not found then raise exception 'An active account is required.'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Select at least one forecast.'; end if;

  admin_submission := p_action = 'submit' and actor.role is not distinct from 'Admin';

  if p_action = 'submit' then
    if not public.forecast_workflow_permission('Forecast Input', 'edit') then
      raise exception 'Forecast Input Edit permission is required to submit forecasts.';
    end if;
    if not admin_submission and (
      actor.position is null or actor.position not in ('KAM', 'Supervisor')
      or actor.region_id is null or actor.subregion_id is null
    ) then
      raise exception 'Only a KAM or Supervisor assigned to a region and subregion can submit for review.';
    end if;
    previous_status := 'Draft';
    if admin_submission then
      next_status := 'Approved';
    else
      next_status := 'Pending';
    end if;
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
      approved_by = case when p_action = 'approve' or admin_submission then actor.id else null end,
      approved_at = case when p_action = 'approve' or admin_submission then now() else null end,
      returned_by = case when p_action = 'return' then actor.id else null end,
      returned_at = case when p_action = 'return' then now() else null end,
      remarks = case when p_action in ('submit', 'undo') then null else reason end
  where f.id = any(p_ids)
    and f.status::text = previous_status
    and (
      (admin_submission and f.region_id is not null)
      or (f.region_id = actor.region_id and (actor.position = 'ASM' or f.subregion_id = actor.subregion_id))
    )
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

commit;
