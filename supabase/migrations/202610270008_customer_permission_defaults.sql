-- Customer module defaults:
-- User: no access; Superuser: view/add/edit; Manager: view; Admin: all.
-- Only rows still marked as defaults are changed; user overrides are retained.
update public.user_permissions p
set can_view = u.role in ('Superuser','Manager','Admin'),
    can_add = u.role in ('Superuser','Admin'),
    can_edit = u.role in ('Superuser','Admin'),
    can_delete = u.role = 'Admin',
    updated_at = now()
from public.users u
where p.user_id = u.id
  and p.module = 'Customers'
  and p.is_default = true;

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
    when 'view' then p.can_view
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
    return (p_module in ('Dashboard','Sales Input','Weekly Sales','Approvals','Categories','Products','Customers','Regions','Subregions') and p_action = 'view')
      or (p_module = 'Sales Input' and p_action in ('add','edit'))
      or (p_module = 'Customers' and p_action in ('add','edit'))
      or (p_module in ('Budget','Week Locks') and p_action in ('view','add','edit'));
  elsif v_role = 'Manager' then
    return (p_module in ('Dashboard','Sales Input','Weekly Sales','Approvals','Categories','Products','Customers','Regions','Subregions','Budget','Week Locks') and p_action = 'view')
      or (p_module = 'Approvals' and p_action = 'edit');
  end if;
  return false;
end;
$$;
revoke all on function public.has_module_permission(text,text) from public;
grant execute on function public.has_module_permission(text,text) to authenticated;

create or replace function public.initialize_customer_permission_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_permissions(user_id,module,can_view,can_add,can_edit,can_delete,is_default)
  values(
    new.id,
    'Customers',
    new.role in ('Superuser','Manager','Admin'),
    new.role in ('Superuser','Admin'),
    new.role in ('Superuser','Admin'),
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
  return new;
end;
$$;
