begin;

-- Accept the exact module keys sent by the Users API and keep legacy keys valid.
do $$
declare
  existing_check text;
begin
  select pg_get_expr(conbin, conrelid)
  into strict existing_check
  from pg_constraint
  where conrelid = 'public.user_permissions'::regclass
    and conname = 'user_permissions_module_check'
    and contype = 'c';

  alter table public.user_permissions
    drop constraint user_permissions_module_check;

  execute format(
    $check$
      alter table public.user_permissions
      add constraint user_permissions_module_check
      check ((%s) or module::text in (
        'Dashboard', 'Forecast Input', 'Weekly Sales', 'Approvals',
        'Budget', 'Actual', 'Categories', 'Products', 'Customers',
        'Regions', 'Subregions', 'Users', 'Week Locks'
      ))
    $check$,
    existing_check
  );
end;
$$;

commit;
