begin;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_name text not null,
  module text not null,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[] not null default '{}',
  summary text not null
);
create index audit_logs_created_idx on public.audit_logs (created_at desc, id desc);
create index audit_logs_module_created_idx on public.audit_logs (module, created_at desc, id desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated
using (exists (select 1 from public.users where id = auth.uid() and is_active and role = 'Admin')
  and coalesce((select can_view from public.user_permissions
    where user_id = auth.uid() and module = 'Audit Logs'), true));

-- Keep only record identifiers, changed field names and a short description.
-- Do not copy user credentials or complete customer/forecast records into logs.
create function public.capture_audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb := '{}'::jsonb;
  after_row jsonb := '{}'::jsonb;
  row_data jsonb;
  fields text[];
  actor text;
begin
  if TG_OP <> 'INSERT' then before_row := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then after_row := to_jsonb(new); end if;
  if TG_OP = 'UPDATE' and before_row = after_row then return new; end if;
  row_data := case when TG_OP = 'DELETE' then before_row else after_row end;
  select array_agg(key order by key) into fields
  from jsonb_object_keys(before_row || after_row) as keys(key)
  where before_row -> key is distinct from after_row -> key
    and key not ilike '%password%' and key not ilike '%token%' and key not ilike '%secret%';
  select full_name into actor from public.users where id = auth.uid();
  insert into public.audit_logs(actor_id, actor_name, module, table_name, record_id, action, changed_fields, summary)
  values (auth.uid(), coalesce(nullif(actor, ''), case when auth.uid() is null then 'System / service' else auth.uid()::text end),
    TG_ARGV[0], TG_TABLE_NAME, row_data ->> 'id', TG_OP, coalesce(fields, '{}'),
    case TG_OP when 'INSERT' then 'Created record' when 'UPDATE' then 'Updated record' else 'Deleted record' end
      || case when TG_TABLE_NAME like '%import_staging' then ' in upload staging' else '' end);
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.capture_audit_change() from public;

do $$
declare target record; existing_check text;
begin
  select pg_get_expr(conbin, conrelid) into existing_check from pg_constraint
  where conrelid = 'public.user_permissions'::regclass and conname = 'user_permissions_module_check';
  if existing_check is not null then
    alter table public.user_permissions drop constraint user_permissions_module_check;
    execute format('alter table public.user_permissions add constraint user_permissions_module_check check ((%s) or module = %L)', existing_check, 'Audit Logs');
  end if;
  for target in select * from (values
    ('sales_forecasts','Forecast Input'), ('budgets','Budget'), ('actuals','Actual'),
    ('forecast_import_staging','Forecast Input'), ('budget_import_staging','Budget'), ('actual_import_staging','Actual'),
    ('customers','Customers'), ('products','Products'), ('categories','Categories'),
    ('regions','Regions'), ('subregions','Subregions'), ('users','Users'),
    ('user_permissions','Users'), ('week_locks','Week Locks'), ('forecast_week_policy','Week Locks')
  ) as targets(tbl, module) loop
    if to_regclass('public.' || target.tbl) is not null then
      execute format('create trigger capture_audit_change after insert or update or delete on public.%I for each row execute function public.capture_audit_change(%L)', target.tbl, target.module);
    end if;
  end loop;
end;
$$;

commit;
