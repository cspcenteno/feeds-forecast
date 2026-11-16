begin;

alter table public.user_permissions
  add column if not exists can_export boolean not null default false;

-- Preserve the downloads previously available to Weekly Sales viewers.
update public.user_permissions
set can_export = can_view, updated_at = now()
where module = 'Weekly Sales';

alter table public.user_permissions
  add constraint user_permissions_export_scope_check
  check (not can_export or (module = 'Weekly Sales' and can_view));

-- Existing role-default writers remain authoritative for the other actions.
-- Explicit/custom permissions (is_default=false) keep their saved Export choice.
create or replace function public.initialize_export_permission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_default is true then
    new.can_export := new.module = 'Weekly Sales' and new.can_view;
  end if;
  return new;
end;
$$;
create trigger initialize_export_permission_before_write
before insert or update on public.user_permissions
for each row execute function public.initialize_export_permission();

create or replace function public.has_module_permission(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_action
      when 'view' then p.can_view when 'add' then p.can_add
      when 'edit' then p.can_edit when 'delete' then p.can_delete
      when 'export' then p.module = 'Weekly Sales' and p.can_view and p.can_export
      else false end
    from public.user_permissions p join public.users u on u.id = p.user_id
    where u.id = auth.uid() and u.is_active is true
      and p.module::text = case
        when p_module in ('Sales Input', 'Forecast Input', 'Forecast') then 'Forecasts'
        when p_module = 'Budget' then 'Budgets'
        when p_module = 'Actual' then 'Actuals' else p_module end
      and not (
        (p_module in ('Dashboard', 'Audit Logs') and p_action <> 'view')
        or (p_module = 'Weekly Sales' and p_action not in ('view', 'export'))
        or (p_module = 'Approvals' and p_action in ('add', 'delete'))
      )
  ), false);
$$;
revoke all on function public.has_module_permission(text, text) from public;
grant execute on function public.has_module_permission(text, text) to authenticated;

commit;
