import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('Weekly Sales export references obey view/export permission and role area scopes',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`
      create role authenticated;
      create table viewer(scope text,region_id bigint,subregion_id bigint,customer_ids bigint[]);
      insert into viewer values ('global',1,11,array[10]::bigint[]);
      create function monthly_reference_viewer(text) returns setof viewer language sql as $$
        select * from public.viewer where current_setting('test.view',true)='yes' $$;
      create function has_module_permission(text,text) returns boolean language sql as $$
        select current_setting('test.export',true)='yes' $$;
      create table budgets(id bigint,year int,month int,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,volume numeric);
      create table actuals(id bigint,actual_date date,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,volume numeric);
      insert into budgets values (1,2026,null,1,11,10,1,1200),(2,2026,11,1,12,20,1,50),(3,2026,11,2,21,30,1,90),(4,2026,11,1,null,10,2,20),(5,2026,12,1,11,10,1,999);
      insert into actuals values (10,'2026-11-16',1,11,10,1,10),(11,'2026-11-22',1,12,20,1,20),
        (12,'2026-11-16',2,21,30,1,30),(13,'2026-11-30',1,11,10,1,999),(14,'2026-11-16',1,null,10,2,5);
      select set_config('test.view','yes',false),set_config('test.export','yes',false);
    `)
    const sql=await readFile(new URL('../supabase/migrations/202611200001_weekly_export_volume_references.sql',import.meta.url),'utf8')
    await db.exec(sql);await db.exec(sql)
    const ids=async()=> (await db.query("select id::int from get_weekly_sales_export_volume_rows('2026-11-16','2026-11-22') order by id")).rows.map(row=>row.id)
    assert.deepEqual(await ids(),[1,2,3,4,10,11,12,14])
    await db.exec("update viewer set scope='region'")
    assert.deepEqual(await ids(),[1,2,4,10,11,14])
    await db.exec("update viewer set scope='subregion'")
    assert.deepEqual(await ids(),[1,4,10])
    await db.exec("update viewer set subregion_id=null")
    assert.deepEqual(await ids(),[])
    await db.exec("update viewer set scope='customer'")
    assert.deepEqual(await ids(),[1,4,10,14])
    await db.exec("select set_config('test.export','no',false)")
    assert.deepEqual(await ids(),[])
    await db.exec("select set_config('test.export','yes',false),set_config('test.view','no',false)")
    assert.deepEqual(await ids(),[])
    await db.exec("select set_config('test.view','yes',false);update viewer set scope='global'")
    await db.exec(await readFile(new URL('../supabase/migrations/202611200002_weekly_export_budget_month_selector.sql',import.meta.url),'utf8'))
    assert.deepEqual(await ids(),[1,2,3,4,5,10,11,12,14])
  }finally{await db.close()}
})
