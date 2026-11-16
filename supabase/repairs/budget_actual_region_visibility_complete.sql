begin;

create or replace function public.can_read_volume_region(
  p_region_id bigint, p_subregion_id bigint default null, p_owner_id uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case
    when u.role = 'Admin' then true
    when u.role = 'Manager' and upper(trim(u.position)) = 'NSM' then true
    when u.role = 'Manager' and upper(trim(u.position)) in ('RSM', 'ASM') then
      u.region_id is not null and u.region_id = p_region_id
    when u.role = 'Superuser' and upper(trim(u.position)) in ('SUPERVISOR', 'SV') then
      u.region_id is not null and u.region_id = p_region_id
    else public.can_access_data_scope(p_region_id, p_subregion_id, p_owner_id)
    end from public.users u where u.id = auth.uid() and u.is_active), false);
$$;
revoke all on function public.can_read_volume_region(bigint,bigint,uuid) from public;
grant execute on function public.can_read_volume_region(bigint,bigint,uuid) to authenticated;

-- Change only SELECT policies for saved volumes; preserve all write policies.
do $migration$
declare policy record; expression text;
begin
  for policy in select * from pg_policies
    where schemaname = 'public' and tablename in ('budgets', 'actuals') and cmd = 'SELECT'
  loop
    expression := replace(policy.qual, 'can_access_data_scope(', 'can_read_volume_region(');
    if expression is distinct from policy.qual then
      execute format('alter policy %I on public.%I using (%s)', policy.policyname, policy.tablename, expression);
    end if;
  end loop;
end;
$migration$;

create or replace function public.has_actual_permission(p_action text, p_region_id bigint default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.customers_actual_permission('Actuals', p_action)
    and (p_region_id is null or case when p_action = 'view'
      then public.can_read_volume_region(p_region_id)
      else public.can_access_region(p_region_id) end);
$$;

-- Guard against older permissive policies granting broader reads.
drop policy if exists volume_region_visibility on public.budgets;
create policy volume_region_visibility on public.budgets as restrictive for select to authenticated
using (public.can_read_volume_region(region_id, subregion_id));
drop policy if exists volume_region_visibility on public.actuals;
create policy volume_region_visibility on public.actuals as restrictive for select to authenticated
using (public.can_read_volume_region(region_id, subregion_id));

-- Add scoped lookup access without assuming an older policy was installed.
drop policy if exists volume_regions_lookup on public.regions;
create policy volume_regions_lookup on public.regions for select to authenticated using (
  (public.has_module_permission('Budgets', 'view') or public.has_module_permission('Actuals', 'view'))
  and public.can_read_volume_region(id)
);
drop policy if exists volume_subregions_lookup on public.subregions;
create policy volume_subregions_lookup on public.subregions for select to authenticated using (
  (public.has_module_permission('Budgets', 'view') or public.has_module_permission('Actuals', 'view'))
  and public.can_read_volume_region(region_id, id)
);

-- If legacy restrictive lookup guards exist, allow the scoped volume reads
-- through them while retaining each guard's original expression.
do $migration$
declare target record; existing_expression text;
begin
  for target in select * from (values
    ('regions', 'app_regions_select', 'public.can_read_volume_region(id)'),
    ('subregions', 'app_subregions_select', 'public.can_read_volume_region(region_id, id)')
  ) as policies(table_name, policy_name, scope_expression) loop
    select qual into existing_expression from pg_policies
    where schemaname = 'public' and tablename = target.table_name and policyname = target.policy_name;
    if found and strpos(existing_expression, 'can_read_volume_region(') = 0 then
      execute format(
        'alter policy %I on public.%I using ((%s) or ((public.has_module_permission(''Budgets'', ''view'') or public.has_module_permission(''Actuals'', ''view'')) and %s))',
        target.policy_name, target.table_name, coalesce(existing_expression, 'true'), target.scope_expression
      );
    end if;
  end loop;
end;
$migration$;

commit;
