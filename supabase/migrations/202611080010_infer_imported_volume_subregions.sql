begin;

-- Resolve missing import geography without changing historical, explicit assignments.
-- Prefer the row's KAM; use Customer -> Salesman only when that KAM is not found.
create or replace function public.resolve_volume_subregion(
  p_region_id bigint, p_customer_id bigint, p_kam text
)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare
  names text[];
  candidate text;
  customer_kam text;
  matched bigint;
  assigned bigint;
  subregions bigint;
  resolved bigint;
begin
  if p_region_id is null then return null; end if;

  select c.salesman into customer_kam from public.customers c
  where c.id = p_customer_id and c.region_id = p_region_id;
  names := array[p_kam, customer_kam];

  foreach candidate in array names loop
    candidate := lower(regexp_replace(btrim(coalesce(candidate, '')), '\s+', ' ', 'g'));
    if candidate = '' then continue; end if;

    select count(*), count(s.id), count(distinct s.id), min(s.id)
    into matched, assigned, subregions, resolved
    from public.users u
    left join public.subregions s on s.id = u.subregion_id and s.region_id = p_region_id
    where u.is_active is true and upper(btrim(coalesce(u.position, ''))) = 'KAM'
      and u.region_id = p_region_id
      and (
        lower(regexp_replace(btrim(coalesce(u.full_name, '')), '\s+', ' ', 'g')) = candidate
        or lower(btrim(coalesce(u.email, ''))) = candidate
      );

    if matched > 0 then
      -- A duplicate name is safe only if every match has the same valid assignment.
      if assigned = matched and subregions = 1 then return resolved; end if;
      return null;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.resolve_volume_subregion(bigint,bigint,text) from public;

create or replace function public.fill_volume_subregion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.subregion_id is null then
    new.subregion_id := public.resolve_volume_subregion(new.region_id, new.customer_id, new.kam);
  end if;
  return new;
end;
$$;

revoke all on function public.fill_volume_subregion() from public;

drop trigger if exists fill_budget_subregion on public.budgets;
create trigger fill_budget_subregion
before insert or update of region_id, customer_id, kam, subregion_id on public.budgets
for each row execute function public.fill_volume_subregion();

drop trigger if exists fill_actual_subregion on public.actuals;
create trigger fill_actual_subregion
before insert or update of region_id, customer_id, kam, subregion_id on public.actuals
for each row execute function public.fill_volume_subregion();

-- Repair already imported rows using exactly the same rules as future writes.
with resolved as materialized (
  select id, public.resolve_volume_subregion(region_id, customer_id, kam) as subregion_id
  from public.budgets where subregion_id is null
)
update public.budgets b set subregion_id = r.subregion_id
from resolved r where b.id = r.id and r.subregion_id is not null;

with resolved as materialized (
  select id, public.resolve_volume_subregion(region_id, customer_id, kam) as subregion_id
  from public.actuals where subregion_id is null
)
update public.actuals a set subregion_id = r.subregion_id
from resolved r where a.id = r.id and r.subregion_id is not null;

notify pgrst, 'reload schema';
commit;
