begin;

-- Only expose active KAM display names to authorized Budget / Actual editors.
create or replace function public.list_volume_editor_kams(p_module text)
returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_module is null or p_module not in ('Budget', 'Actual') then
    raise exception 'Invalid module.';
  end if;
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.is_active is true)
     or not coalesce(case when p_module = 'Actual'
       then public.has_actual_permission('edit', null)
       else public.has_module_permission('Budget', 'edit') end, false) then
    raise exception 'Edit permission is required.';
  end if;
  return query
    select u.id, btrim(u.full_name)::text
    from public.users u
    where u.is_active is true
      and upper(btrim(coalesce(u.position, ''))) = 'KAM'
      and nullif(btrim(u.full_name), '') is not null
    order by btrim(u.full_name), u.id;
end;
$$;

revoke all on function public.list_volume_editor_kams(text) from public;
grant execute on function public.list_volume_editor_kams(text) to authenticated;
notify pgrst, 'reload schema';

commit;
