-- Keep role defaults for modules without custom permission rows, while treating
-- existing rows as explicit per-module overrides. This mirrors the app UI.
create or replace function public.has_module_permission(p_module text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_saved boolean;
begin
  select u.role into v_role
  from public.users u
  where u.id = auth.uid() and u.is_active is true;

  if v_role is null then return false; end if;

  if (p_module = 'Dashboard' and p_action in ('add','edit','delete'))
     or (p_module = 'Weekly Sales' and p_action in ('add','edit','delete'))
     or (p_module = 'Approvals' and p_action in ('add','delete')) then
    return false;
  end if;

  select case p_action
    when 'view' then (p.can_view or p.can_add or p.can_edit or p.can_delete)
    when 'add' then p.can_add
    when 'edit' then p.can_edit
    when 'delete' then p.can_delete
    else false
  end into v_saved
  from public.user_permissions p
  where p.user_id = auth.uid() and p.module = p_module;

  if found then return coalesce(v_saved, false); end if;

  if v_role = 'Admin' then return true; end if;
  if v_role = 'User' then
    return (p_module in ('Dashboard','Weekly Sales') and p_action = 'view')
      or (p_module = 'Sales Input' and p_action in ('view','add','edit'));
  elsif v_role = 'Superuser' then
    return (p_module in ('Dashboard','Sales Input','Weekly Sales','Approvals','Categories','Products','Regions','Subregions') and p_action = 'view')
      or (p_module in ('Budget','Week Locks') and p_action in ('view','add','edit'));
  elsif v_role = 'Manager' then
    return (p_module in ('Dashboard','Sales Input','Weekly Sales','Approvals','Categories','Products','Regions','Subregions','Budget','Week Locks') and p_action = 'view')
      or (p_module = 'Approvals' and p_action = 'edit');
  end if;

  return false;
end;
$$;

revoke all on function public.has_module_permission(text,text) from public;
grant execute on function public.has_module_permission(text,text) to authenticated;

-- Recreate the authoritative action gates as restrictive policies. These
-- intersect with all existing permissive policies, including older broad ones.
do $$
declare
  x record;
begin
  for x in select * from (values
    ('categories','Categories'),('products','Products'),('regions','Regions'),
    ('subregions','Subregions'),('week_locks','Week Locks'),('budgets','Budget')
  ) as m(tbl,mod) loop
    execute format('alter table public.%I enable row level security', x.tbl);
    execute format('drop policy if exists app_%I_action_insert on public.%I', x.tbl, x.tbl);
    execute format('create policy app_%I_action_insert on public.%I as restrictive for insert to authenticated with check (public.has_module_permission(%L,''add''))', x.tbl, x.tbl, x.mod);
    execute format('drop policy if exists app_%I_action_update on public.%I', x.tbl, x.tbl);
    execute format('create policy app_%I_action_update on public.%I as restrictive for update to authenticated using (public.has_module_permission(%L,''edit'')) with check (public.has_module_permission(%L,''edit''))', x.tbl, x.tbl, x.mod, x.mod);
    execute format('drop policy if exists app_%I_action_delete on public.%I', x.tbl, x.tbl);
    execute format('create policy app_%I_action_delete on public.%I as restrictive for delete to authenticated using (public.has_module_permission(%L,''delete''))', x.tbl, x.tbl, x.mod);
  end loop;
end;
$$;

-- Forecast edits include the approval workflow, while deletes require Sales Input delete.
alter table public.sales_forecasts enable row level security;
drop policy if exists app_forecasts_action_insert on public.sales_forecasts;
create policy app_forecasts_action_insert on public.sales_forecasts as restrictive
  for insert to authenticated with check (public.has_module_permission('Sales Input','add'));
drop policy if exists app_forecasts_action_update on public.sales_forecasts;
create policy app_forecasts_action_update on public.sales_forecasts as restrictive
  for update to authenticated
  using (public.has_module_permission('Sales Input','edit') or public.has_module_permission('Approvals','edit'))
  with check (public.has_module_permission('Sales Input','edit') or public.has_module_permission('Approvals','edit'));
drop policy if exists app_forecasts_action_delete on public.sales_forecasts;
create policy app_forecasts_action_delete on public.sales_forecasts as restrictive
  for delete to authenticated using (public.has_module_permission('Sales Input','delete'));

-- User profile and permission administration requires the Users module action.
alter table public.users enable row level security;
drop policy if exists app_users_action_insert on public.users;
create policy app_users_action_insert on public.users as restrictive
  for insert to authenticated with check (public.has_module_permission('Users','add'));
drop policy if exists app_users_action_update on public.users;
create policy app_users_action_update on public.users as restrictive
  for update to authenticated using (id = auth.uid() or public.has_module_permission('Users','edit'))
  with check (id = auth.uid() or public.has_module_permission('Users','edit'));
drop policy if exists app_users_action_delete on public.users;
create policy app_users_action_delete on public.users as restrictive
  for delete to authenticated using (public.has_module_permission('Users','delete'));

alter table public.user_permissions enable row level security;
drop policy if exists app_permissions_action_insert on public.user_permissions;
create policy app_permissions_action_insert on public.user_permissions as restrictive
  for insert to authenticated with check (public.has_module_permission('Users','edit'));
drop policy if exists app_permissions_action_update on public.user_permissions;
create policy app_permissions_action_update on public.user_permissions as restrictive
  for update to authenticated using (public.has_module_permission('Users','edit'))
  with check (public.has_module_permission('Users','edit'));
drop policy if exists app_permissions_action_delete on public.user_permissions;
create policy app_permissions_action_delete on public.user_permissions as restrictive
  for delete to authenticated using (public.has_module_permission('Users','edit'));
