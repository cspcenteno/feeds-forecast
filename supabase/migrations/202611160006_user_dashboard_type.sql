begin;

alter table public.users add column if not exists dashboard_type text not null default 'system';
alter table public.users drop constraint if exists users_dashboard_type_check;
alter table public.users add constraint users_dashboard_type_check
  check (dashboard_type in ('system', 'powerbi', 'both'));

-- Dashboard selection is administered together with the user's permissions.
create or replace function public.guard_user_dashboard_type()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.dashboard_type is distinct from old.dashboard_type
    and not public.has_module_permission('Users', 'edit') then
    raise exception 'Users edit permission is required to change dashboard type.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_user_dashboard_type_update on public.users;
create trigger guard_user_dashboard_type_update before update of dashboard_type on public.users
for each row execute function public.guard_user_dashboard_type();

commit;
