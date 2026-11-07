-- Regional customer budgets uploaded from spreadsheets have no subregion.
alter policy app_budgets_select on public.budgets
  using (
    public.has_module_permission('Budget', 'view')
    and (
      public.can_access_data_scope(region_id, subregion_id, null)
      or (
        subregion_id is null
        and customer_id is not null
        and public.can_access_region(region_id)
      )
    )
  );
