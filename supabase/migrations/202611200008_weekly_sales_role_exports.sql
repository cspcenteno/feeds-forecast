begin;

create or replace function public.initialize_export_permission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_default is true then
    new.can_export := new.module = 'Weekly Sales' and new.can_view
      and exists (
        select 1 from public.users u where u.id = new.user_id
          and (u.role in ('User', 'Superuser', 'Admin')
            or (u.role = 'Manager' and upper(trim(u.position)) in ('RSM', 'ASM', 'NSM')))
      );
  end if;
  return new;
end;
$$;

-- Preserve explicit, manually saved permission choices.
update public.user_permissions p
set can_export = true, updated_at = now()
from public.users u
where p.user_id = u.id and p.module = 'Weekly Sales'
  and p.is_default is true and p.can_view is true
  and (u.role in ('User', 'Superuser', 'Admin')
    or (u.role = 'Manager' and upper(trim(u.position)) in ('RSM', 'ASM', 'NSM')));

-- Add owner identity for separate KAM sheets without changing the existing RPC name.
drop function if exists public.get_weekly_sales_export_volume_rows(date,date);
create function public.get_weekly_sales_export_volume_rows(p_from date, p_to date)
returns table (record_type text, id bigint, year integer, month integer, region_id bigint,
  subregion_id bigint, customer_id bigint, product_id bigint, actual_date date, volume numeric, kam_id uuid)
language sql stable security definer set search_path = '' as $$
  with viewer as materialized (
    select * from public.monthly_reference_viewer('Weekly Sales')
    where public.has_module_permission('Weekly Sales', 'export')
      and p_to >= p_from and p_to - p_from <= 57330
  ), owner_labels as materialized (
    select k.id, k.region_id, k.subregion_id,
      lower(regexp_replace(trim(k.full_name), '\s+', ' ', 'g')) as label
    from public.users k where upper(trim(k.position)) = 'KAM'
    union
    select k.id, k.region_id, k.subregion_id, lower(trim(k.email))
    from public.users k where upper(trim(k.position)) = 'KAM'
  ), owners as materialized (
    select region_id, label,
      case when count(distinct id) = 1 then min(id::text)::uuid end as kam_id,
      case when count(distinct id) = 1 then min(subregion_id) end as subregion_id
    from owner_labels where nullif(label, '') is not null group by region_id, label
  ), records as (
    select 'budget'::text as record_type, b.id::bigint, b.year::integer, b.month::integer,
      b.region_id::bigint, b.subregion_id::bigint, b.customer_id::bigint, b.product_id::bigint,
      null::date as actual_date, b.volume::numeric, b.kam::text as kam
    from public.budgets b
    where b.year = extract(year from p_from + 3) and (b.month between 1 and 12 or b.month is null)
    union all
    select 'actual'::text, a.id::bigint, extract(year from a.actual_date)::integer,
      extract(month from a.actual_date)::integer, a.region_id::bigint, a.subregion_id::bigint,
      a.customer_id::bigint, a.product_id::bigint, a.actual_date::date, a.volume::numeric, a.kam::text
    from public.actuals a where a.actual_date >= p_from and a.actual_date <= p_to
  ), resolved as (
    select r.record_type, r.id, r.year, r.month, r.region_id,
      coalesce(r.subregion_id, o.subregion_id) as subregion_id,
      r.customer_id, r.product_id, r.actual_date, r.volume, o.kam_id
    from records r
    left join public.customers c on c.id = r.customer_id
    left join owners o on o.region_id = r.region_id
      and o.label = lower(regexp_replace(trim(coalesce(nullif(trim(r.kam), ''), c.salesman)), '\s+', ' ', 'g'))
  )
  select r.* from resolved r join viewer v on
    v.scope = 'global' or (r.region_id = v.region_id and (
      v.scope = 'region'
      or (v.scope = 'subregion' and v.subregion_id is not null and r.subregion_id = v.subregion_id)
      or (v.scope = 'customer' and r.kam_id = auth.uid())
    ));
$$;
revoke all on function public.get_weekly_sales_export_volume_rows(date,date) from public;
grant execute on function public.get_weekly_sales_export_volume_rows(date,date) to authenticated;
notify pgrst, 'reload schema';

commit;
