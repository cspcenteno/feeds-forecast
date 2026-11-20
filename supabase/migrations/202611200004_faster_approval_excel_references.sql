begin;

create index if not exists approval_excel_actuals_region_date_idx
  on public.actuals (region_id, actual_date);

-- Resolve KAM ownership once per request instead of rescanning users for every budget/actual row.
-- Existing Approvals View and assigned-area restrictions remain in force.
create or replace function public.get_approval_excel_volume_rows(p_from date, p_to date)
returns table (record_type text, id bigint, year integer, month integer, region_id bigint,
  subregion_id bigint, customer_id bigint, product_id bigint, actual_date date, volume numeric, kam_id uuid)
language sql stable security definer set search_path = '' as $$
  with viewer as materialized (
    select * from public.monthly_reference_viewer('Approvals')
    where p_to >= p_from and p_to - p_from <= 57330
  ), owner_labels as materialized (
    select k.id, k.region_id, lower(regexp_replace(trim(k.full_name), '\s+', ' ', 'g')) as label
    from public.users k where upper(trim(k.position)) = 'KAM'
    union
    select k.id, k.region_id, lower(trim(k.email))
    from public.users k where upper(trim(k.position)) = 'KAM'
  ), owners as materialized (
    select region_id, label, case when count(distinct id) = 1 then min(id::text)::uuid else null end as kam_id
    from owner_labels where nullif(label, '') is not null group by region_id, label
  ), records as (
    select 'budget'::text as record_type, b.id::bigint, b.year::integer, b.month::integer,
      b.region_id::bigint, b.subregion_id::bigint, b.customer_id::bigint, b.product_id::bigint,
      null::date as actual_date, b.volume::numeric, b.kam::text as kam
    from public.budgets b join viewer v on (v.scope = 'global' or (b.region_id = v.region_id and (
      v.scope = 'region' or (v.scope = 'subregion' and v.subregion_id is not null
        and (b.subregion_id = v.subregion_id or b.subregion_id is null))
      or (v.scope = 'customer' and b.customer_id = any(v.customer_ids)))))
    where b.year = extract(year from p_from + 3) and (b.month between 1 and 12 or b.month is null)
    union all
    select 'actual'::text, a.id::bigint, extract(year from a.actual_date)::integer,
      extract(month from a.actual_date)::integer, a.region_id::bigint, a.subregion_id::bigint,
      a.customer_id::bigint, a.product_id::bigint, a.actual_date::date, a.volume::numeric, a.kam::text
    from public.actuals a join viewer v on (v.scope = 'global' or (a.region_id = v.region_id and (
      v.scope = 'region' or (v.scope = 'subregion' and v.subregion_id is not null and a.subregion_id = v.subregion_id)
      or (v.scope = 'customer' and a.customer_id = any(v.customer_ids)))))
    where a.actual_date >= p_from and a.actual_date <= p_to
  )
  select r.record_type, r.id, r.year, r.month, r.region_id, r.subregion_id, r.customer_id,
    r.product_id, r.actual_date, r.volume,
    owners.kam_id
  from records r
  left join public.customers c on c.id = r.customer_id
  left join owners on owners.region_id = r.region_id
    and owners.label = lower(regexp_replace(trim(coalesce(nullif(trim(r.kam), ''), c.salesman)), '\s+', ' ', 'g'));
$$;
revoke all on function public.get_approval_excel_volume_rows(date,date) from public;
grant execute on function public.get_approval_excel_volume_rows(date,date) to authenticated;
notify pgrst, 'reload schema';
commit;
