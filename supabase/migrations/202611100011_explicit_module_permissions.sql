begin;

-- Saved grants are the authority. A missing row never grants access by role.
create or replace function public.has_module_permission(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_action
      when 'view' then p.can_view
      when 'add' then p.can_add
      when 'edit' then p.can_edit
      when 'delete' then p.can_delete
      else false end
    from public.user_permissions p
    join public.users u on u.id = p.user_id
    where u.id = auth.uid() and u.is_active is true
      and p.module::text = case when p_module = 'Sales Input' then 'Forecast Input' else p_module end
      and not (
        (p_module in ('Dashboard', 'Weekly Sales', 'Audit Logs') and p_action <> 'view')
        or (p_module = 'Approvals' and p_action in ('add', 'delete'))
      )
  ), false);
$$;

create or replace function public.customers_actual_permission(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_module_permission(p_module, p_action);
$$;

create or replace function public.forecast_workflow_permission(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_module_permission(p_module, p_action);
$$;

revoke all on function public.has_module_permission(text, text) from public;
revoke all on function public.customers_actual_permission(text, text) from public;
revoke all on function public.forecast_workflow_permission(text, text) from public;
grant execute on function public.has_module_permission(text, text) to authenticated;
grant execute on function public.customers_actual_permission(text, text) to authenticated;
grant execute on function public.forecast_workflow_permission(text, text) to authenticated;

commit;
