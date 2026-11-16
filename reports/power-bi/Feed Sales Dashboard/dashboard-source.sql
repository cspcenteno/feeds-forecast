with months as (
  select distinct year, m as month from public.budgets cross join generate_series(1,12) m
), monthly_budgets as (
  select make_date(b.year, m.month, 1) as month_date,
    b.region_id, b.subregion_id, b.customer_id, b.product_id,
    case when count(*) filter (where b.month is not null) > 0
      then sum(coalesce(b.volume,0)) filter (where b.month is not null)
      else sum(coalesce(b.volume,0)) / 12.0 end as volume
  from public.budgets b join months m on m.year=b.year and (b.month=m.month or b.month is null)
  group by b.year,m.month,b.region_id,b.subregion_id,b.customer_id,b.product_id
), facts as (
  select b.month_date,b.region_id,b.subregion_id,b.customer_id,b.product_id,
    'Budget' as record_type,0::numeric as quantity,b.volume
  from monthly_budgets b where b.customer_id is not null or not exists (
    select 1 from monthly_budgets d where d.month_date=b.month_date
      and d.region_id=b.region_id and d.product_id=b.product_id
      and d.subregion_id is not distinct from b.subregion_id and d.customer_id is not null)
  union all
  select date_trunc('month',date_trunc('week',make_date(f.year,1,4)::timestamp)
      + (f.week-1)*interval '7 days'+interval '3 days')::date,
    f.region_id,f.subregion_id,f.customer_id,f.product_id,'Forecast',coalesce(f.forecast,0),coalesce(f.volume,0)
  from public.sales_forecasts f where f.status='Approved'
  union all
  select date_trunc('month',a.actual_date)::date,a.region_id,a.subregion_id,a.customer_id,a.product_id,
    'Actual',0::numeric,coalesce(a.volume,0) from public.actuals a where a.actual_date is not null
)
select f.month_date as "MonthDate",coalesce(r.name,'Unassigned') as "Region",
  coalesce(s.name,'Unassigned') as "Area",
  coalesce(asm.full_name,'Unassigned ASM') as "ASM",
  coalesce(rsm.full_name,'Unassigned RSM') as "RSM",
  coalesce(nullif(trim(c.salesman),''),'Unassigned KAM') as "KAM",
  coalesce(c.customer,'Area budget') as "Customer",
  coalesce(concat_ws(' - ',p.code,p.name),'Unassigned product') as "Product",
  f.record_type as "RecordType",f.quantity as "Quantity",f.volume as "Volume"
from facts f left join public.regions r on r.id=f.region_id
left join public.subregions s on s.id=f.subregion_id
left join public.customers c on c.id=f.customer_id left join public.products p on p.id=f.product_id
left join lateral (select min(u.full_name) as full_name from public.users u
  where u.is_active and u.role='Manager' and u.position='ASM' and u.region_id=f.region_id) asm on true
left join lateral (select min(u.full_name) as full_name from public.users u
  where u.is_active and u.role='Manager' and u.position='RSM' and u.region_id=f.region_id and u.subregion_id=f.subregion_id) rsm on true;
