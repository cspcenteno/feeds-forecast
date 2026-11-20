begin;

-- Remove existing Week Locks grants as well as the application's role defaults.
update public.user_permissions p
set can_view = false,
    can_add = false,
    can_edit = false,
    can_import = false,
    can_export = false,
    can_delete = false,
    updated_at = now()
from public.users u
where u.id = p.user_id
  and u.role = 'Superuser'
  and p.module = 'Week Locks';

commit;
