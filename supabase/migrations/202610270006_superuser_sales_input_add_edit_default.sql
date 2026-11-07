-- Give Superusers Sales Input Add/Edit by default, while preserving every
-- per-user override. Update only rows still marked as system defaults.
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
