-- Add an optional customer dimension to budget entries. Existing budgets remain
-- valid with a null customer_id; newly created budget entries require a customer
-- in the application form.
alter table public.budgets
  add column if not exists customer_id bigint null
  references public.customers(id) on delete restrict;

create index if not exists budgets_customer_id_idx
  on public.budgets(customer_id);

-- Budget viewers need to read customer names for the budget selector and list.
drop policy if exists app_customers_action_select on public.customers;
create policy app_customers_action_select on public.customers as restrictive
  for select to authenticated using (
    public.has_module_permission('Customers','view')
    or public.has_module_permission('Sales Input','view')
    or public.has_module_permission('Weekly Sales','view')
    or public.has_module_permission('Approvals','view')
    or public.has_module_permission('Budget','view')
  );
