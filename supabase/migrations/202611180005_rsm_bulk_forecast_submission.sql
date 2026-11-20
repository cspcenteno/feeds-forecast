begin;

-- Group drafts by customer/week while keeping the entire submission atomic.
create or replace function public.submit_rsm_returned_forecasts(p_records jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare batch jsonb; changed integer := 0;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Select returned draft forecasts.';
  end if;
  if jsonb_array_length(p_records) not between 1 and 5000 then
    raise exception 'Select between 1 and 5000 records.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_records) r group by r->>'id' having count(*) > 1) then
    raise exception 'Duplicate forecast record.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_records) r
    left join public.forecasts f on f.id = (r->>'id')::bigint
    where f.id is null or f.status::text <> 'Draft' or f.returned_at is null
  ) then
    raise exception 'Only revised returned drafts can be submitted.';
  end if;
  for batch in
    select jsonb_agg(r order by f.id)
    from jsonb_array_elements(p_records) r
    join public.forecasts f on f.id = (r->>'id')::bigint
    group by f.year, f.week, f.customer_id, f.user_id
    order by min(f.id)
  loop
    -- Existing action verifies RSM permission, ownership, area, locks and originals.
    changed := changed + public.revise_rsm_returned_forecasts(batch, true);
  end loop;
  return changed;
end;
$$;
revoke all on function public.submit_rsm_returned_forecasts(jsonb) from public;
grant execute on function public.submit_rsm_returned_forecasts(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
