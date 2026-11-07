-- Expose only KAM display fields to authorized Customers users. This avoids
-- relying on broad users-table read access or the caller's user-row scope.
drop function if exists public.list_kam_salesmen();

create or replace function public.list_kam_salesmen()
returns table (
  id uuid,
  full_name text,
  email text,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.full_name, u.email, u.is_active
  from public.users u
  where upper(trim(coalesce(u.position, ''))) = 'KAM'
    and exists (
      select 1
      from public.users current_user_profile
      where current_user_profile.id = auth.uid()
        and current_user_profile.is_active is true
        and (
          exists (
            select 1
            from public.user_permissions permission
            where permission.user_id = current_user_profile.id
              and permission.module = 'Customers'
              and (permission.can_view or permission.can_add or permission.can_edit)
          )
          or (
            not exists (
              select 1
              from public.user_permissions permission
              where permission.user_id = current_user_profile.id
                and permission.module = 'Customers'
            )
            and current_user_profile.role in ('Admin','Superuser','Manager')
          )
        )
    )
  order by u.full_name nulls last, u.email;
$$;

revoke all on function public.list_kam_salesmen() from public;
grant execute on function public.list_kam_salesmen() to authenticated;
