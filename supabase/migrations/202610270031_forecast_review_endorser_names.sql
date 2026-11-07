begin;

create or replace function public.get_forecast_review_endorser_names(p_ids bigint[])
returns table (endorser_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct endorser.id, endorser.full_name::text
  from public.get_forecast_review_queue() q
  join public.users endorser on endorser.id = q.endorsed_by
  where q.id = any(p_ids) and q.status = 'Endorsed';
$$;

revoke all on function public.get_forecast_review_endorser_names(bigint[]) from public;
grant execute on function public.get_forecast_review_endorser_names(bigint[]) to authenticated;

notify pgrst, 'reload schema';

commit;
