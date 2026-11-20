import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('team references include customers absent from the weekly queue and isolate KAM and RSM totals', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create table users(id uuid, full_name text, email text, subregion_id bigint);
      create table customers(id bigint, region_id bigint, salesman text);
      create table budgets(id bigint, year int, month int, region_id bigint, subregion_id bigint, customer_id bigint, product_id bigint, volume numeric);
      create table actuals(region_id bigint, subregion_id bigint, customer_id bigint, actual_date date, volume numeric);
      create table forecasts(id bigint, year int, week int, region_id bigint, subregion_id bigint, submitted_by uuid, endorsed_by uuid, status text, volume numeric);
      insert into users values ('00000000-0000-0000-0000-000000000001','KAM A','a@example.com',10),('00000000-0000-0000-0000-000000000002','RSM A',null,10);
      insert into customers values (1,1,'KAM A'),(2,1,' KAM   A '),(3,1,'KAM B'),(4,1,'KAM C');
      insert into budgets values (1,2026,11,1,10,1,1,10),(2,2026,11,1,10,2,1,20),(3,2026,11,1,10,3,1,40),(4,2026,11,1,20,4,1,80);
      insert into actuals values (1,10,1,'2026-11-01',1),(1,10,2,'2026-11-02',2),(1,10,3,'2026-11-02',4),(1,20,4,'2026-11-02',8),(1,10,2,'2026-10-02',3);
      insert into forecasts values (1,2026,46,1,10,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Approved',5),
        (2,2026,47,1,10,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Approved',6);
      create function get_weekly_sales_reporting() returns setof forecasts language sql as $$ select * from public.forecasts where id=1 $$;
      create function get_forecast_review_queue() returns setof forecasts language sql as $$ select * from public.forecasts where id=1 $$;
      create function can_access_sales_reporting_scope(bigint,bigint,uuid) returns boolean language sql as $$ select true $$;
    `)
    const budget = await readFile(new URL('../supabase/migrations/202611090001_consistent_monthly_budget_references.sql', import.meta.url), 'utf8')
    await db.exec(budget.slice(budget.indexOf('create or replace function public.monthly_budget_reference'), budget.indexOf('revoke all on function public.monthly_budget_reference')))
    const migration = await readFile(new URL('../supabase/migrations/202611180001_sales_team_monthly_references.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    for (const weekly of [true, false]) {
      const { rows } = await db.query('select * from get_sales_team_monthly_reference(array[1,99]::bigint[], $1)', [weekly])
      assert.equal(rows.length, 3)
      const byLevel = Object.fromEntries(rows.map(row => [row.team_level, row]))
      assert.equal(Number(byLevel.kam.budget_volume), 30)
      assert.equal(Number(byLevel.rsm.budget_volume), 70)
      assert.equal(Number(byLevel.asm.budget_volume), 150)
      assert.equal(Number(byLevel.kam.actual_volume), 3)
      assert.equal(Number(byLevel.rsm.actual_volume), 7)
      assert.equal(Number(byLevel.kam.previous_actual_volume), 3)
      assert.equal(Number(byLevel.kam.forecast_volume), 11)
    }
    await db.exec(`create or replace function can_access_sales_reporting_scope(bigint,bigint,uuid)
      returns boolean language sql as $$ select $3 is not null $$`)
    const restricted = await db.query('select team_level from get_sales_team_monthly_reference(array[1]::bigint[], true)')
    assert.deepEqual(restricted.rows, [{ team_level: 'kam' }])
  } finally { await db.close() }
})


