begin;

-- No role automatically receives Export. Explicit grants are configured by an
-- administrator through Users, with View still required.
create or replace function public.initialize_export_permission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_default is true then
    new.can_export := false;
  end if;
  return new;
end;
$$;

-- One-time reset requested by the administrator, including custom grants.
update public.user_permissions
set can_export = false, updated_at = now()
where module = 'Weekly Sales' and can_export is true;

commit;
