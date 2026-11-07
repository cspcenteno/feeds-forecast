begin;

create or replace function public.forecast_workflow_permission(p_module text, p_action text)
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
      when p_module = 'Approvals' then u.role in ('Admin', 'Manager') and p_action in ('view', 'edit')
      when p_module = 'Forecast Input' then u.role in ('User', 'Superuser', 'Admin') and p_action = 'edit'
      else false
    end)
    from public.users u where u.id = auth.uid() and u.is_active is true
  ), false);
$$;

revoke all on function public.forecast_workflow_permission(text, text) from public;
grant execute on function public.forecast_workflow_permission(text, text) to authenticated;

commit;
