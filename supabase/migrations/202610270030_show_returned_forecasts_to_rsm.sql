begin;

create or replace function public.get_forecast_review_queue()
returns table (
  id bigint, year integer, week integer, region_id bigint, subregion_id bigint,
  customer_id bigint, category_id bigint, product_id bigint,
  forecast numeric, volume numeric, status text, user_id uuid,
  submitted_by uuid, endorsed_by uuid, submitter_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id::bigint, f.year::integer, f.week::integer, f.region_id::bigint,
    f.subregion_id::bigint, f.customer_id::bigint, f.category_id::bigint,
    f.product_id::bigint, f.forecast::numeric, f.volume::numeric, f.status::text,
    f.user_id, f.submitted_by, f.endorsed_by, submitter.full_name::text
  from public.sales_forecasts f
  join public.users u on u.id = auth.uid()
  left join public.users submitter on submitter.id = f.submitted_by
  where u.is_active is true and u.role = 'Manager'
    and public.forecast_workflow_permission('Approvals', 'view')
    and f.region_id = u.region_id
    and (
      (u.position = 'RSM' and f.subregion_id = u.subregion_id and (
        f.status::text in ('Pending', 'Endorsed')
        or (f.status::text = 'Rejected' and f.endorsed_at is not null)
      ))
      or (u.position = 'ASM' and f.status::text = 'Endorsed')
    );
$$;

revoke all on function public.get_forecast_review_queue() from public;
grant execute on function public.get_forecast_review_queue() to authenticated;

notify pgrst, 'reload schema';

commit;
