begin;

-- Additional SELECT guard; module grants and existing write rules are retained.
create or replace function public.can_read_volume_subregion(p_region_id bigint, p_subregion_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case
    when u.role = 'Admin' then true
    when upper(trim(u.position)) in ('RSM', 'KAM') then
      u.region_id is not null and u.subregion_id is not null
      and u.region_id = p_region_id and u.subregion_id = p_subregion_id
    else true end
  from public.users u where u.id = auth.uid() and u.is_active is true), false);
$$;
revoke all on function public.can_read_volume_subregion(bigint,bigint) from public;
grant execute on function public.can_read_volume_subregion(bigint,bigint) to authenticated;

drop policy if exists volume_subregion_visibility on public.budgets;
create policy volume_subregion_visibility on public.budgets as restrictive for select to authenticated
using (public.can_read_volume_subregion(region_id, subregion_id));

drop policy if exists volume_subregion_visibility on public.actuals;
create policy volume_subregion_visibility on public.actuals as restrictive for select to authenticated
using (public.can_read_volume_subregion(region_id, subregion_id));

notify pgrst, 'reload schema';
commit;
