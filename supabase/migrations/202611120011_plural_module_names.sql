begin;

-- Preserve the existing module constraint and accept the plural names.
do $$
declare existing_check text;
begin
  select pg_get_expr(conbin, conrelid) into strict existing_check
  from pg_constraint where conrelid = 'public.user_permissions'::regclass
    and conname = 'user_permissions_module_check' and contype = 'c';
  alter table public.user_permissions drop constraint user_permissions_module_check;
  execute format('alter table public.user_permissions add constraint user_permissions_module_check check ((%s) or module::text in (%L, %L, %L))', existing_check, 'Forecasts', 'Budgets', 'Actuals');
end;
$$;

-- Keep explicit grants, denials and default flags. Existing plural grants win.
insert into public.user_permissions
  (user_id, module, can_view, can_add, can_edit, can_delete, is_default, updated_at)
select distinct on (user_id, new_module)
  user_id, new_module, can_view, can_add, can_edit, can_delete, is_default, now()
from (
  select p.*, case module
    when 'Forecast Input' then 'Forecasts' when 'Forecast' then 'Forecasts'
    when 'Budget' then 'Budgets' when 'Actual' then 'Actuals' end as new_module
  from public.user_permissions p
  where module in ('Forecast Input', 'Forecast', 'Budget', 'Actual')
) grants
order by user_id, new_module, (module = 'Forecast') desc
on conflict (user_id, module) do nothing;
delete from public.user_permissions where module in ('Forecast Input', 'Forecast', 'Budget', 'Actual');

-- Update exact SQL string literals in current workflow and default functions.
-- This preserves their latest definitions, security settings and grants.
do $$
declare definition text;
begin
  for definition in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.prosrc ~ '(Forecast Input|Forecast|Budget|Actual)'
  loop
    definition := replace(definition, quote_literal('Forecast Input'), quote_literal('Forecasts'));
    definition := replace(definition, quote_literal('Forecast'), quote_literal('Forecasts'));
    definition := replace(definition, quote_literal('Budget'), quote_literal('Budgets'));
    definition := replace(definition, quote_literal('Actual'), quote_literal('Actuals'));
    execute definition;
  end loop;
end;
$$;

-- Audit triggers carry module names as arguments.
do $$
declare definition text;
begin
  for definition in
    select pg_get_triggerdef(t.oid) from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and pg_get_triggerdef(t.oid) ~ '(Forecast Input|Forecast|Budget|Actual)'
  loop
    definition := replace(definition, 'CREATE TRIGGER', 'CREATE OR REPLACE TRIGGER');
    definition := replace(definition, quote_literal('Forecast Input'), quote_literal('Forecasts'));
    definition := replace(definition, quote_literal('Forecast'), quote_literal('Forecasts'));
    definition := replace(definition, quote_literal('Budget'), quote_literal('Budgets'));
    definition := replace(definition, quote_literal('Actual'), quote_literal('Actuals'));
    execute definition;
  end loop;
end;
$$;
update public.audit_logs set module = case module
  when 'Forecast Input' then 'Forecasts' when 'Forecast' then 'Forecasts'
  when 'Budget' then 'Budgets' when 'Actual' then 'Actuals' end
where module in ('Forecast Input', 'Forecast', 'Budget', 'Actual');

-- Keep historical RLS policies working with former module keys.
create or replace function public.has_module_permission(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_action
      when 'view' then p.can_view when 'add' then p.can_add
      when 'edit' then p.can_edit when 'delete' then p.can_delete else false end
    from public.user_permissions p join public.users u on u.id = p.user_id
    where u.id = auth.uid() and u.is_active is true
      and p.module::text = case
        when p_module in ('Sales Input', 'Forecast Input', 'Forecast') then 'Forecasts'
        when p_module = 'Budget' then 'Budgets'
        when p_module = 'Actual' then 'Actuals' else p_module end
      and not (
        (p_module in ('Dashboard', 'Weekly Sales', 'Audit Logs') and p_action <> 'view')
        or (p_module = 'Approvals' and p_action in ('add', 'delete'))
      )
  ), false);
$$;
revoke all on function public.has_module_permission(text, text) from public;
grant execute on function public.has_module_permission(text, text) to authenticated;

commit;
