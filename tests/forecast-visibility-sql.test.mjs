import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

let PGlite
// Install the optional engine under node_modules/.cache/forecast-visibility-sql,
// or point PGLITE_MODULE at an existing isolated installation.
for (const location of [process.env.PGLITE_MODULE, new URL('../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href,
  pathToFileURL(join(tmpdir(), 'feed-forecast-week-lock-sql-test/node_modules/@electric-sql/pglite/dist/index.js')).href].filter(Boolean)) {
  try { PGlite = (await import(location)).PGlite; break } catch { /* Optional isolated SQL engine. */ }
}

test('operational access and dashboard reporting use independent scopes', { skip: !PGlite }, async (t) => {
  const db = new PGlite()
  const uid = (id) => `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`
  const migration = async (name) => db.exec(await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'))
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
      create table users(id uuid primary key, role text, position text, is_active boolean default true,
        full_name text, region_id bigint, subregion_id bigint);
      insert into users(id, role, position, region_id, subregion_id) values
        ('${uid(1)}', 'Admin', null, null, null),
        ('${uid(2)}', 'Manager', 'ASM', 1, null),
        ('${uid(3)}', 'Manager', 'RSM', 1, 11),
        ('${uid(4)}', 'Superuser', 'Supervisor', 1, 11),
        ('${uid(5)}', 'User', 'KAM', 1, 11),
        ('${uid(6)}', 'Manager', 'RSM', 1, 12),
        ('${uid(7)}', 'Manager', 'RSM', 1, null),
        ('${uid(8)}', 'Manager', 'ASM', null, null);
      update users set full_name = 'Person ' || right(id::text, 1);
      create table user_permissions(user_id uuid, module text, can_view boolean);
      create table sales_forecasts(id bigint primary key, year integer, week integer,
        region_id bigint, subregion_id bigint, customer_id bigint, category_id bigint, product_id bigint,
        forecast numeric, volume numeric, status text, user_id uuid, submitted_by uuid, endorsed_by uuid,
        submitted_at timestamptz, endorsed_at timestamptz, approved_by uuid, approved_at timestamptz,
        returned_by uuid, returned_at timestamptz, remarks text);
      insert into sales_forecasts(id, year, week, region_id, subregion_id, customer_id, product_id,
        forecast, volume, status, user_id, submitted_by, endorsed_by)
      values
        (1,2026,45,1,11,1,1,10,10,'Pending','${uid(5)}','${uid(5)}',null),
        (2,2026,45,1,12,2,1,20,20,'Pending','${uid(9)}','${uid(9)}',null),
        (3,2026,45,2,21,3,1,30,30,'Pending','${uid(9)}','${uid(9)}',null),
        (4,2026,45,1,11,1,1,10,10,'Approved','${uid(5)}','${uid(5)}','${uid(3)}'),
        (5,2026,45,1,12,2,1,20,20,'Approved','${uid(9)}','${uid(9)}','${uid(6)}'),
        (6,2026,45,2,21,3,1,30,30,'Approved','${uid(9)}','${uid(9)}','${uid(9)}'),
        (7,2026,45,1,11,1,1,10,10,'Endorsed','${uid(5)}','${uid(5)}','${uid(3)}');
      create table regions(id bigint primary key, name text, code text);
      insert into regions(id,name) values (1,'LUZON'),(2,'VISAYAS');
      create table subregions(id bigint primary key, name text);
      insert into subregions values (11,'CENTRAL LUZON'),(12,'NORTH LUZON'),(21,'CEBU');
      create table customers(id bigint primary key, customer text);
      insert into customers values (1,'Customer A'),(2,'Customer B'),(3,'Customer C');
      create table products(id bigint primary key, code text, name text);
      insert into products values (1,'P1','Product A');
      create table budgets(id bigint primary key, year integer, month integer, region_id bigint,
        subregion_id bigint, customer_id bigint, product_id bigint, volume numeric);
      insert into budgets values (1,2026,11,1,11,1,1,100),(2,2026,11,1,12,2,1,200),(3,2026,11,2,21,3,1,300);
      create table actuals(id bigint primary key, actual_date date, region_id bigint, subregion_id bigint,
        customer_id bigint, product_id bigint, volume numeric);
      insert into actuals values (1,'2026-11-03',1,11,1,1,15),(2,'2026-11-03',1,12,2,1,25),(3,'2026-11-03',2,21,3,1,35);
      create table week_locks(year integer, week integer, status text);
      create function forecast_workflow_permission(text,text) returns boolean language sql as $$select true$$;
      create function customers_actual_permission(text,text) returns boolean language sql as $$select true$$;
      alter table sales_forecasts enable row level security;
      create policy base_read on sales_forecasts for select to authenticated using (true);
      grant select on all tables in schema public to authenticated;
      insert into user_permissions select id, 'Weekly Sales', true from users;
    `)
    await migration('202611080005_restore_admin_submission_review.sql')
    await migration('202611080008_operational_forecast_visibility.sql')
    await migration('202611080009_dashboard_reporting_scope.sql')
    await migration('202611090001_consistent_monthly_budget_references.sql')
    const as = async (id) => {
      await db.exec('reset role; set role authenticated;')
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid(id)])
    }
    const ids = async () => (await db.query('select id from sales_forecasts order by id')).rows.map((r) => r.id)
    const queue = async () => (await db.query('select id from get_forecast_review_queue() order by id')).rows.map((r) => r.id)
    const dashboard = async () => (await db.query("select get_monthly_sales_dashboard('2026-11-01') as value")).rows[0].value

    await t.test('RSM and Supervisor read only their operational subregion', async () => {
      for (const id of [3,4]) { await as(id); assert.deepEqual(await ids(), [1,4,7]) }
      await as(3); assert.deepEqual(await queue(), [1,7])
      await as(6); assert.deepEqual(await queue(), [2])
    })
    await t.test('ASM reads its region and its queue contains only endorsed records', async () => {
      await as(2); assert.deepEqual(await ids(), [1,2,4,5,7]); assert.deepEqual(await queue(), [7])
    })
    await t.test('unassigned or inactive managers receive no operational records', async () => {
      for (const id of [7,8]) { await as(id); assert.deepEqual(await ids(), []); assert.deepEqual(await queue(), []) }
      await db.exec(`reset role; update users set is_active=false where id='${uid(6)}';`)
      await as(6); assert.deepEqual(await ids(), [])
    })
    await t.test('KAM sees own forecasts and Admin keeps global access', async () => {
      await as(5); assert.deepEqual(await ids(), [1,4,7])
      await as(1); assert.deepEqual(await ids(), [1,2,3,4,5,6,7])
    })
    await t.test('reference RPCs cannot expose other assignments by guessing forecast IDs', async () => {
      await as(3)
      assert.deepEqual((await db.query('select forecast_id from get_weekly_sales_monthly_budgets(array[4,5,6]::bigint[])')).rows.map((r) => r.forecast_id), [4])
      const names = (await db.query('select user_id from get_weekly_sales_reviewer_names(array[5,6]::bigint[])')).rows
      assert.deepEqual(names, [])
      assert.deepEqual((await db.query('select get_weekly_sales_monthly_actuals(array[5,6]::bigint[]) as value')).rows[0].value, [])
    })
    await t.test('dashboard remains global for ASM, regional for RSM/Supervisor, and owned for KAM', async () => {
      await as(2); assert.equal((await dashboard()).details.length, 3)
      for (const id of [3,4]) {
        await as(id); const result = await dashboard()
        assert.deepEqual(result.details.map((r) => r.subregion_id).sort(), [11,12])
        assert.equal(result.details.reduce((sum,r) => sum + r.volume,0), 30)
      }
      await as(5); assert.equal((await dashboard()).details.length, 1)
    })
    await t.test('all monthly reference RPCs return 40 for detailed imports and a region-only forecast', async () => {
      await db.exec(`reset role;
        insert into products values (2,'P2','Product B');
        insert into budgets values (4,2026,11,1,11,1,2,15),(5,2026,11,1,11,1,2,25),(6,2026,null,1,11,1,2,1200);
        insert into sales_forecasts(id,year,week,region_id,subregion_id,customer_id,product_id,forecast,volume,status,user_id,submitted_by)
          values (8,2026,45,1,null,1,2,10,10,'Approved','${uid(1)}','${uid(1)}'),
            (9,2026,45,1,11,1,2,10,10,'Pending','${uid(5)}','${uid(5)}');`)
      await as(3)
      assert.equal(Number((await db.query('select budget_volume from get_forecast_review_reference(array[9]::bigint[])')).rows[0].budget_volume), 40)
      await as(2)
      assert.equal(Number((await db.query('select budget_volume from get_weekly_sales_monthly_budgets(array[8]::bigint[])')).rows[0].budget_volume), 40)
      await as(1)
      const detail = (await dashboard()).details.find((row) => row.product_id === 2 && row.subregion_id === null)
      assert.equal(Number(detail.budget), 40)
      await assert.rejects(db.query('select * from monthly_budget_reference(2026,11,1,null,1,2)'), /permission denied/)
    })
    await t.test('transition RPC rejects cross-subregion endorsements and cross-region approvals', async () => {
      await as(3)
      await assert.rejects(db.query("select transition_forecast_review(array[2]::bigint[],'endorse')"), /outside your assignment/)
      assert.equal((await db.query("select transition_forecast_review(array[1]::bigint[],'endorse') as count")).rows[0].count, 1)
      await as(2)
      await db.exec('reset role; update sales_forecasts set status=\'Endorsed\' where id=3; set role authenticated;')
      await assert.rejects(db.query("select transition_forecast_review(array[3]::bigint[],'approve')"), /outside your assignment/)
      assert.equal((await db.query("select transition_forecast_review(array[1]::bigint[],'approve') as count")).rows[0].count, 1)
    })
  } finally { await db.close() }
})
