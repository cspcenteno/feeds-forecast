import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('weekly and approval references use the previous calendar month for product and full-customer totals', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth;
      create function auth.uid() returns text language sql stable as $$ select 'viewer'::text $$;
      create table users(id text,position text);
      insert into users values ('viewer','RSM');
      create table budgets(year int,month int,customer_id bigint,region_id bigint,product_id bigint);
      create function monthly_budget_reference(int,int,bigint,bigint,bigint,bigint)
        returns table(volume numeric) language sql as $$ select 0::numeric $$;
      create table sales_forecasts(id bigint,year int,week int,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,user_id text,status text,volume numeric);
      insert into sales_forecasts values
        (1,2026,48,1,11,10,100,'kam','Endorsed',10), (2,2026,48,1,11,10,100,'kam','Approved',10),
        (3,2027,1,1,11,10,100,'kam','Endorsed',10), (4,2027,1,1,11,10,100,'kam','Approved',10);
      create function get_forecast_review_queue() returns setof sales_forecasts language sql as $$ select * from public.sales_forecasts where status='Endorsed' $$;
      create function get_weekly_sales_reporting() returns setof sales_forecasts language sql as $$ select * from public.sales_forecasts where status='Approved' $$;
      create function forecast_workflow_permission(text,text) returns boolean language sql as $$ select true $$;
      create function can_access_sales_reporting_scope(bigint,bigint,text) returns boolean language sql as $$ select true $$;
      create function can_view_monthly_reference(text,bigint,bigint,bigint) returns boolean language sql as $$ select true $$;
      create table actuals(region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,actual_date date,volume numeric);
      insert into actuals values
        (1,11,10,100,'2026-10-01',40),(1,11,10,200,'2026-10-31',490),
        (1,11,10,100,'2025-11-01',60),(1,11,10,200,'2025-11-01',531.5),
        (1,11,10,100,'2026-11-01',3),
        (1,11,99,100,'2026-10-01',999),(2,11,10,100,'2026-10-01',999),
        (1,11,10,100,'2026-09-30',999),(1,11,10,100,'2026-12-01',12.5),
        (1,11,10,200,'2026-12-31',7.5),(1,11,10,100,'2027-01-01',5),
        (1,11,10,100,'2026-01-01',999);
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611120004_previous_month_actual_references.sql',import.meta.url),'utf8'))
    await db.exec(`insert into sales_forecasts values
      (5,2026,48,1,11,10,200,'kam','Approved',143),
      (6,2026,48,1,11,99,200,'kam','Approved',999)`)
    const review = (await db.query('select * from get_forecast_review_reference(array[1,3]::bigint[]) order by forecast_id')).rows
    assert.deepEqual(review.map(row => Number(row.prior_year_actual_volume)),[40,12.5])
    assert.deepEqual(review.map(row => Number(row.actual_volume)),[3,5])
    assert.equal(Number(review[0].approved_forecast_volume),10)
    assert.equal(Number(review[0].customer_approved_forecast_volume),153)
    for (const [name, ids] of [['get_forecast_review_customer_reference',[1,3]],['get_weekly_sales_customer_reference',[2,4]]]) {
      const rows = (await db.query(`select * from ${name}($1::bigint[]) order by forecast_id`,[ids])).rows
      assert.deepEqual(rows.map(row => Number(row.customer_prior_year_actual_volume)),[530,20])
      assert.deepEqual(rows.map(row => Number(row.customer_actual_volume)),[3,5])
      assert.equal((await db.query(`select * from ${name}(array[99]::bigint[])`)).rows.length,0)
    }
    const productActuals = (await db.query('select get_weekly_sales_monthly_actuals(array[2,4]::bigint[]) value')).rows[0].value
    const find = (year,month) => Number(productActuals.find(row => row.year === year && row.month === month)?.volume)
    assert.equal(find(2026,10),40)
    assert.equal(find(2026,12),12.5)
    assert.equal(productActuals.some(row => row.year === 2025),false)
    assert.equal(productActuals.some(row => row.product_id === 200),false)
  } finally { await db.close() }
})
