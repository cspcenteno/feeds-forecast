begin;

-- Extend the existing module check before migrating saved grants.
do $$
declare existing_check text;
begin
  select pg_get_expr(conbin, conrelid) into strict existing_check
  from pg_constraint
  where conrelid = 'public.user_permissions'::regclass
    and conname = 'user_permissions_module_check' and contype = 'c';
  alter table public.user_permissions drop constraint user_permissions_module_check;
  execute format('alter table public.user_permissions add constraint user_permissions_module_check check ((%s) or module::text = %L)', existing_check, 'Forecast');
end;
$$;

insert into public.user_permissions
  (user_id, module, can_view, can_add, can_edit, can_delete, is_default, updated_at)
select user_id, 'Forecast', can_view, can_add, can_edit, can_delete, is_default, now()
from public.user_permissions where module = 'Forecast Input'
on conflict (user_id, module) do nothing;
delete from public.user_permissions where module = 'Forecast Input';

-- Update installed workflow functions and default-permission triggers without
-- replaying historical migrations or changing their current behavior.
do $$
declare definition text;
begin
  for definition in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and position('Forecast Input' in p.prosrc) > 0
  loop
    execute replace(definition, 'Forecast Input', 'Forecast');
  end loop;
end;
$$;

-- Audit module names are also stored in trigger arguments and existing logs.
do $$
declare definition text;
begin
  for definition in
    select pg_get_triggerdef(t.oid)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and position('Forecast Input' in pg_get_triggerdef(t.oid)) > 0
  loop
    execute replace(replace(definition, 'CREATE TRIGGER', 'CREATE OR REPLACE TRIGGER'), 'Forecast Input', 'Forecast');
  end loop;
end;
$$;
update public.audit_logs set module = 'Forecast' where module = 'Forecast Input';

-- Historical RLS policies may still pass a former module name.
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
      and p.module::text = case when p_module in ('Sales Input', 'Forecast Input') then 'Forecast' else p_module end
      and not (
        (p_module in ('Dashboard', 'Weekly Sales', 'Audit Logs') and p_action <> 'view')
        or (p_module = 'Approvals' and p_action in ('add', 'delete'))
      )
  ), false);
$$;

revoke all on function public.has_module_permission(text, text) from public;
grant execute on function public.has_module_permission(text, text) to authenticated;

commit;
