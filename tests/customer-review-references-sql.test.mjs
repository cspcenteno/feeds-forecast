import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('customer review references include missing products and exclude other customers', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create table budgets(id bigint, year int, month int, region_id bigint, subregion_id bigint, customer_id bigint, product_id bigint, volume numeric);
      create table actuals(customer_id bigint, region_id bigint, product_id bigint, actual_date date, volume numeric);
      create table queue(id bigint, year int, week int, customer_id bigint, region_id bigint);
      insert into queue values (1,2026,46,10,1),(2,2026,46,10,1);
      create function get_forecast_review_queue() returns setof queue language sql as $$ select * from public.queue $$;
      create function get_weekly_sales_reporting() returns setof queue language sql as $$ select * from public.queue where id = 1 $$;
      insert into budgets values (1,2026,11,1,null,10,1,70),(2,2026,11,1,null,10,2,100),
        (3,2026,11,1,null,99,2,999),(4,2026,11,2,null,10,2,999);
      insert into actuals values (10,1,1,'2026-11-01',20),(10,1,2,'2026-11-02',30),
        (10,1,2,'2025-11-02',40),(99,1,2,'2026-11-02',999),(10,2,2,'2026-11-02',999);
    `)
    const source = await readFile(new URL('../supabase/migrations/202611090001_consistent_monthly_budget_references.sql', import.meta.url),'utf8')
    await db.exec(source.slice(source.indexOf('create or replace function public.monthly_budget_reference'), source.indexOf('revoke all on function public.monthly_budget_reference')))
    await db.exec(await readFile(new URL('../supabase/migrations/202611110002_customer_review_references.sql',import.meta.url),'utf8'))
    const { rows } = await db.query('select * from get_forecast_review_customer_reference(array[1]::bigint[])')
    assert.equal(rows.length, 1)
    assert.equal(Number(rows[0].customer_budget_volume), 170)
    assert.equal(Number(rows[0].customer_actual_volume), 50)
    assert.equal(Number(rows[0].customer_prior_year_actual_volume), 40)
    assert.equal((await db.query('select * from get_forecast_review_customer_reference(array[99]::bigint[])')).rows.length, 0)
    await db.exec(await readFile(new URL('../supabase/migrations/202611120003_weekly_customer_references.sql',import.meta.url),'utf8'))
    const weekly = (await db.query('select * from get_weekly_sales_customer_reference(array[1,2,99]::bigint[])')).rows
    assert.equal(weekly.length, 1)
    assert.equal(Number(weekly[0].customer_budget_volume), 170)
    assert.equal(Number(weekly[0].customer_actual_volume), 50)
    assert.equal(Number(weekly[0].customer_prior_year_actual_volume), 40)
    assert.equal((await db.query('select * from get_weekly_sales_customer_reference(array[2]::bigint[])')).rows.length, 0)
  } finally { await db.close() }
})

