import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

const ids = { kam: '00000000-0000-0000-0000-000000000001', rsm: '00000000-0000-0000-0000-000000000002', asm: '00000000-0000-0000-0000-000000000003', nsm: '00000000-0000-0000-0000-000000000004', admin: '00000000-0000-0000-0000-000000000005', supervisor: '00000000-0000-0000-0000-000000000006' }

test('monthly references are complete and scoped across Saved Forecasts, Approvals and Weekly Sales roles', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select current_setting('app.viewer')::uuid $$;
      create table users(id uuid, full_name text, email text, subregion_id bigint, region_id bigint, role text, position text);
      create table customers(id bigint, region_id bigint, salesman text);
      create table budgets(id bigint, year int, month int, region_id bigint, subregion_id bigint, customer_id bigint, product_id bigint, volume numeric);
      create table actuals(region_id bigint, subregion_id bigint, customer_id bigint, product_id bigint, actual_date date, volume numeric);
      create table forecasts(id bigint, year int, week int, region_id bigint, subregion_id bigint, submitted_by uuid, endorsed_by uuid, status text, volume numeric, user_id uuid, customer_id bigint, product_id bigint);
      insert into users values
        ('${ids.kam}','KAM A','a@example.com',10,1,'User','KAM'),
        ('${ids.rsm}','RSM A',null,10,1,'Manager','RSM'),
        ('${ids.asm}','ASM A',null,null,1,'Manager','ASM'),
        ('${ids.nsm}','NSM A',null,null,null,'Manager','NSM'),
        ('${ids.admin}','Admin',null,null,null,'Admin',null),
        ('${ids.supervisor}','Supervisor',null,null,1,'Superuser','Supervisor');
      insert into customers values (1,1,'KAM A'),(2,1,' KAM   A '),(3,1,'KAM B'),(4,1,'KAM C');
      insert into budgets values (1,2026,11,1,10,1,1,10),(2,2026,11,1,10,2,1,20),(3,2026,11,1,10,3,1,40),(4,2026,11,1,20,4,1,80),(5,2026,11,1,10,1,2,15);
      insert into actuals values (1,10,1,1,'2026-11-01',1),(1,10,2,1,'2026-11-02',2),(1,10,3,1,'2026-11-02',4),(1,20,4,1,'2026-11-02',8),(1,10,2,1,'2026-10-02',3),(1,10,1,2,'2026-11-02',10);
      insert into forecasts values
        (1,2026,46,1,10,'${ids.kam}','${ids.rsm}','Approved',5,'${ids.kam}',1,1),
        (2,2026,47,1,10,'${ids.kam}','${ids.rsm}','Approved',6,'${ids.kam}',2,1),
        (3,2026,46,1,10,null,null,'Draft',999,'${ids.kam}',1,1),
        (4,2026,47,1,10,'${ids.kam}','${ids.rsm}','Approved',7,'${ids.kam}',1,2),
        (5,2026,46,2,20,'${ids.kam}','${ids.rsm}','Approved',888,'${ids.kam}',4,1);
      alter table users add column is_active boolean default true;
      create function has_module_permission(text,text) returns boolean language sql as $$
        select current_setting('app.module',true) is distinct from 'denied' $$;
      insert into forecasts values
        (7,2026,46,1,10,'${ids.kam}','${ids.rsm}','Endorsed',90,'${ids.kam}',1,1),
        (8,2026,46,1,10,'${ids.kam}',null,'Pending',90,'${ids.kam}',1,1);
      create function can_access_sales_reporting_scope(bigint,bigint,uuid) returns boolean language sql as $$
        select coalesce((select case
          when role='Admin' or position='NSM' then true
          when position in ('ASM','Supervisor') then region_id=$1
          when position='RSM' then region_id=$1 and subregion_id=$2
          when position='KAM' then id=$3 and region_id=$1
          else false end from public.users where id=auth.uid()),false) $$;
      create function get_weekly_sales_reporting() returns setof forecasts language sql as $$
        select * from public.forecasts where status='Approved'
          and current_setting('app.module',true) is distinct from 'denied'
          and public.can_access_sales_reporting_scope(region_id,subregion_id,user_id) $$;
      create function get_forecast_review_queue() returns setof forecasts language sql as $$
        select f.* from public.forecasts f join public.users u on u.id=auth.uid()
        where ((u.position='ASM' and f.status='Endorsed') or (u.position='RSM' and f.id in (3,7,8)))
          and current_setting('app.module',true) is distinct from 'denied'
          and public.can_access_sales_reporting_scope(f.region_id,f.subregion_id,f.user_id) $$;
      create function get_saved_forecasts() returns setof forecasts language sql as $$
        select f.* from public.forecasts f join public.users u on u.id=auth.uid()
        where (u.role='Admin' or f.user_id=u.id or (u.position='RSM' and f.id=3 and f.subregion_id=u.subregion_id and f.region_id=u.region_id))
          and current_setting('app.module',true) is distinct from 'denied' $$;
    `)
    const budget = await readFile(new URL('../supabase/migrations/202611090001_consistent_monthly_budget_references.sql', import.meta.url), 'utf8')
    await db.exec(budget.slice(budget.indexOf('create or replace function public.monthly_budget_reference'), budget.indexOf('revoke all on function public.monthly_budget_reference')))
    const migration = await readFile(new URL('../supabase/migrations/202611180003_saved_and_team_monthly_references.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const adminFix = await readFile(new URL('../supabase/migrations/202611180004_admin_approval_monthly_references.sql', import.meta.url), 'utf8')
    await db.exec(adminFix)
    await db.exec(adminFix)
    const dashboardFix = await readFile(new URL('../supabase/migrations/202611190001_dashboard_group_monthly_references.sql', import.meta.url), 'utf8')
    await db.exec(dashboardFix)
    await db.exec(dashboardFix)
    const query = async (role, source, anchor) => {
      await db.query("select set_config('app.viewer',$1,false)", [ids[role]])
      return (await db.query('select * from get_sales_monthly_reference($1::bigint[], $2)', [[anchor,99], source])).rows
    }
    for (const role of Object.keys(ids)) {
      for(const source of ['weekly','dashboard']) {
      const rows = await query(role, source, 1)
      const levels = Object.fromEntries(rows.map(row => [row.team_level,row]))
      assert.equal(Number(levels.kam.budget_volume),45,role)
      assert.equal(Number(levels.kam.actual_volume),13,role)
      assert.equal(Number(levels.kam.previous_actual_volume),3,role)
      assert.equal(Number(levels.kam.forecast_volume),18,role)
      assert.equal(Number(levels.customer.budget_volume),25,role)
      assert.equal(Number(levels.customer.forecast_volume),12,role)
      assert.equal(Number(levels.product.forecast_volume),5,role)
      if(role==='kam') assert.equal(levels.rsm,undefined)
      else assert.equal(Number(levels.rsm.budget_volume),85,role)
      if(['admin','nsm','asm','supervisor'].includes(role)) assert.equal(Number(levels.asm.budget_volume),165,role)
      else assert.equal(levels.asm,undefined)
      }
    }
    for(const role of ['kam','rsm','admin']) {
      const rows=await query(role,'saved',3)
      const levels=Object.fromEntries(rows.map(row=>[row.team_level,row]))
      assert.equal(Number(levels.kam.forecast_volume),18,role)
      assert.equal(Number(levels.customer.budget_volume),25,role)
      assert.equal(Number(levels.customer.actual_volume),11,role)
    }
    for(const role of ['rsm','asm','admin']) {
      const anchor = role === 'rsm' ? 3 : 7
      const rows=await query(role,'approvals',anchor)
      const levels=Object.fromEntries(rows.map(row=>[row.team_level,row]))
      assert.equal(Number(levels.customer.forecast_volume),12,role)
      assert.equal(Number(levels.kam.budget_volume),45,role)
      assert.equal(Number(levels.rsm.budget_volume),85,role)
      assert.equal(Number(levels.product.budget_volume),10,role)
      assert.equal(Number(levels.customer.actual_volume),11,role)
    }
    assert.equal((await query('admin','approvals',8)).length,5)
    assert.deepEqual(await query('admin','approvals',3),[])
    assert.deepEqual(await query('admin','approvals',1),[])
    assert.deepEqual(await query('asm','approvals',8),[])
    await db.exec(`insert into forecasts values
      (9,2026,46,2,20,'${ids.kam}','${ids.rsm}','Endorsed',90,'${ids.kam}',4,1)`)
    assert.deepEqual(await query('asm','approvals',9),[])
    await db.exec(`
      insert into budgets values (10,2026,11,1,10,null,3,120);
      insert into forecasts values (10,2026,46,1,10,'${ids.kam}','${ids.rsm}','Endorsed',1,'${ids.kam}',1,3);
    `)
    const genericProduct = (await query('asm','approvals',10)).find(row=>row.team_level==='product')
    assert.equal(Number(genericProduct.budget_volume),120)
    await db.exec('delete from budgets where id=10')
    await db.exec(`insert into budgets values
      (6,2026,11,1,10,null,1,999),(7,2026,null,1,10,1,2,1200)`)
    const fallbackRows = await query('admin','weekly',1)
    assert.equal(Number(fallbackRows.find(row => row.team_level==='rsm').budget_volume),85)
    assert.equal(Number(fallbackRows.find(row => row.team_level==='asm').budget_volume),165)
    await db.exec(`
      update forecasts set year=2027,week=1 where id=3;
      insert into actuals values (1,10,1,1,'2026-12-15',9),(1,10,1,1,'2027-01-03',5);
      insert into forecasts values (6,2027,1,1,10,'${ids.kam}','${ids.rsm}','Approved',17,'${ids.kam}',1,1);
    `)
    const january = await query('kam','saved',3)
    const januaryCustomer = january.find(row=>row.team_level==='customer')
    assert.equal(Number(januaryCustomer.previous_actual_volume),9)
    assert.equal(Number(januaryCustomer.actual_volume),5)
    assert.equal(Number(januaryCustomer.forecast_volume),17)
    assert.deepEqual(await query('rsm','weekly',5),[])
    assert.deepEqual(await query('kam','saved',99),[])
    assert.deepEqual(await query('admin','invalid',1),[])
    await db.query("select set_config('app.viewer',$1,false)",[ids.rsm])
    const keys=(await db.query("select * from get_dashboard_monthly_reference_keys('2026-11-01')")).rows
    assert.ok(keys.length>0)
    assert.ok(keys.every(row=>Number(row.region_id)===1 && Number(row.subregion_id)===10))
    assert.equal((await db.query("select * from get_dashboard_monthly_reference_keys('2026-09-01')")).rows.length,0)
    // Dashboard access must not depend on the Weekly Sales module being available.
    await db.exec(`create or replace function get_weekly_sales_reporting() returns setof forecasts
      language sql as $$ select * from public.forecasts where false $$`)
    assert.deepEqual(await query('admin','weekly',1),[])
    assert.equal((await query('admin','dashboard',1)).length,5)
    await db.exec("select set_config('app.module','denied',false)")
    for(const source of ['weekly','saved','approvals','dashboard']) assert.deepEqual(await query('admin',source,1),[])
    assert.equal((await db.query("select * from get_dashboard_monthly_reference_keys('2026-11-01')")).rows.length,0)
  } finally { await db.close() }
})
