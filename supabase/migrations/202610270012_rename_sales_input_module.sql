-- Rename the permission module while retaining existing per-user grants.
insert into public.user_permissions(
  user_id, module, can_view, can_add, can_edit, can_delete, is_default, updated_at
)
select user_id, 'Forecast Input', can_view, can_add, can_edit, can_delete, is_default, now()
from public.user_permissions
where module = 'Sales Input'
on conflict (user_id, module) do update set
  can_view = excluded.can_view,
  can_add = excluded.can_add,
  can_edit = excluded.can_edit,
  can_delete = excluded.can_delete,
  is_default = excluded.is_default,
  updated_at = now();

delete from public.user_permissions where module = 'Sales Input';

-- Keep old database policies functional during/after the rename by accepting
-- the former module key as an alias, while storing and returning new grants.
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
  v_module text;
begin
  v_module := case when p_module = 'Sales Input' then 'Forecast Input' else p_module end;

  select u.role into v_role
  from public.users u
  where u.id = auth.uid() and u.is_active is true;

  if v_role is null then return false; end if;

  if (v_module = 'Dashboard' and p_action in ('add','edit','delete'))
     or (v_module = 'Weekly Sales' and p_action in ('add','edit','delete'))
     or (v_module = 'Approvals' and p_action in ('add','delete')) then
    return false;
  end if;

  select case p_action
    when 'view' then p.can_view
    when 'add' then p.can_add
    when 'edit' then p.can_edit
    when 'delete' then p.can_delete
    else false
  end into v_saved
  from public.user_permissions p
  where p.user_id = auth.uid() and p.module = v_module;

  if found then return coalesce(v_saved, false); end if;
  if v_role = 'Admin' then return true; end if;
  if v_role = 'User' then
    return (v_module in ('Dashboard','Weekly Sales') and p_action = 'view')
      or (v_module = 'Forecast Input' and p_action in ('view','add','edit'));
  elsif v_role = 'Superuser' then
    return (v_module in ('Dashboard','Forecast Input','Weekly Sales','Approvals','Categories','Products','Customers','Regions','Subregions') and p_action = 'view')
      or (v_module = 'Forecast Input' and p_action in ('add','edit'))
      or (v_module = 'Customers' and p_action in ('add','edit'))
      or (v_module in ('Budget','Week Locks') and p_action in ('view','add','edit'));
  elsif v_role = 'Manager' then
    return (v_module in ('Dashboard','Weekly Sales','Approvals','Categories','Products','Customers','Regions','Subregions','Budget','Week Locks') and p_action = 'view')
      or (v_module = 'Approvals' and p_action = 'edit');
  end if;
  return false;
end;
$$;
revoke all on function public.has_module_permission(text,text) from public;
grant execute on function public.has_module_permission(text,text) to authenticated;

-- Ensure the renamed module is created for future profiles and role changes.
create or replace function public.initialize_sales_input_permission_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_permissions(user_id,module,can_view,can_add,can_edit,can_delete,is_default)
  values(
    new.id,
    'Forecast Input',
    new.role in ('User','Superuser','Admin'),
    new.role in ('User','Superuser','Admin'),
    new.role in ('User','Superuser','Admin'),
    new.role = 'Admin',
    true
  )
  on conflict (user_id,module) do update set
    can_view = excluded.can_view,
    can_add = excluded.can_add,
    can_edit = excluded.can_edit,
    can_delete = excluded.can_delete,
    is_default = true,
    updated_at = now()
  where public.user_permissions.is_default = true;

  delete from public.user_permissions
  where user_id = new.id and module = 'Sales Input';
  return new;
end;
$$;

drop trigger if exists zz_sales_input_default_after_profile_write on public.users;
create trigger zz_sales_input_default_after_profile_write
after insert or update of role on public.users
for each row execute function public.initialize_sales_input_permission_default();
