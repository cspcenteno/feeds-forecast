-- Superusers can add and edit Sales Input forecasts by default.
-- Only update system default rows; manually customized user grants are preserved.
update public.user_permissions p
set can_view = true,
    can_add = true,
    can_edit = true,
    updated_at = now()
from public.users u
where p.user_id = u.id
  and u.role = 'Superuser'
  and p.module = 'Sales Input'
  and p.is_default = true;

-- Keep new accounts and role changes aligned with the Superuser defaults.
create or replace function public.apply_superuser_sales_input_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'Superuser' then
    update public.user_permissions
    set can_view = true,
        can_add = true,
        can_edit = true,
        updated_at = now()
    where user_id = new.id
      and module = 'Sales Input'
      and is_default = true;
  end if;
  return new;
end;
$$;

drop trigger if exists apply_superuser_sales_input_defaults_after_profile_write on public.users;
create trigger apply_superuser_sales_input_defaults_after_profile_write
after insert or update of role on public.users
for each row execute function public.apply_superuser_sales_input_defaults();

-- Keep SQL role fallback behavior consistent with the client-side defaults.
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
      or (p_module = 'Sales Input' and p_action in ('add','edit'))
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
