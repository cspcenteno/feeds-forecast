-- Budget staging is shared and has no uploaded_by column.
-- SELECT FOR UPDATE also needs an applicable UPDATE policy.
-- Existing restrictive policies remain in force.
begin;

grant update on public.budget_import_staging to authenticated;

drop policy if exists budget_staging_owner_edit on public.budget_import_staging;
drop policy if exists budget_staging_permission_edit on public.budget_import_staging;
create policy budget_staging_permission_edit on public.budget_import_staging
for update to authenticated
using (
  public.has_module_permission('Budgets', 'view')
  and public.has_module_permission('Budgets', 'edit')
  and public.has_module_permission('Budgets', 'import')
)
with check (
  public.has_module_permission('Budgets', 'view')
  and public.has_module_permission('Budgets', 'edit')
  and public.has_module_permission('Budgets', 'import')
);

notify pgrst, 'reload schema';
commit;