import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('role export migration preserves manual choices and resolves scoped KAM budgets and actuals', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
      create table viewer(scope text,region_id bigint,subregion_id bigint,customer_ids bigint[]);
      insert into viewer values ('global',1,11,array[10]::bigint[]);
      create function monthly_reference_viewer(text) returns setof viewer language sql as $$ select * from public.viewer where current_setting('test.view',true)='yes' $$;
      create function has_module_permission(text,text) returns boolean language sql as $$ select current_setting('test.export',true)='yes' $$;
      create table users(id uuid,role text,position text,full_name text,email text,region_id bigint,subregion_id bigint);
      insert into users values
        ('00000000-0000-0000-0000-000000000001','User','KAM','KAM A','a@example.com',1,11),
        ('00000000-0000-0000-0000-000000000002','User','KAM','KAM B','b@example.com',1,12),
        ('00000000-0000-0000-0000-000000000003','Manager','RSM','RSM','rsm@example.com',1,11),
        ('00000000-0000-0000-0000-000000000004','Manager','ASM','ASM','asm@example.com',1,null),
        ('00000000-0000-0000-0000-000000000005','Manager','NSM','NSM','nsm@example.com',null,null);
      create table user_permissions(user_id uuid,module text,can_view boolean,can_export boolean,is_default boolean,updated_at timestamptz);
      insert into user_permissions select id,'Weekly Sales',true,false,id <> '00000000-0000-0000-0000-000000000002'::uuid,null from users;
      create table customers(id bigint,salesman text);
      insert into customers values (10,'KAM A'),(20,'KAM B');
      create table budgets(id bigint,year int,month int,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,volume numeric,kam text);
      create table actuals(id bigint,actual_date date,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,volume numeric,kam text);
      insert into budgets values (1,2026,11,1,null,null,1,80,'KAM A'),(2,2026,11,1,null,null,1,20,'KAM B'),(3,2026,11,2,21,null,1,999,'Other');
      insert into actuals values (10,'2026-11-16',1,11,10,1,15,''),(11,'2026-11-16',1,12,20,1,10,'KAM B');
      select set_config('test.view','yes',false),set_config('test.export','yes',false);
    `)
    const sql = await readFile(new URL('../supabase/migrations/202611200008_weekly_sales_role_exports.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    const permissions = (await db.query('select user_id::text,can_export from user_permissions order by user_id')).rows
    assert.deepEqual(permissions.map(row => row.can_export), [true,false,true,true,true])
    await db.exec(`create trigger initialize_export before insert or update on user_permissions for each row execute function initialize_export_permission();
      insert into user_permissions values
        ('00000000-0000-0000-0000-000000000005','Weekly Sales',true,false,true,null),
        ('00000000-0000-0000-0000-000000000005','Dashboard',true,true,true,null);`)
    assert.equal((await db.query("select can_export from user_permissions where module='Dashboard'")).rows[0].can_export, false)
    assert.equal((await db.query("select can_export from user_permissions where module='Weekly Sales' and user_id='00000000-0000-0000-0000-000000000005'")).rows.every(row => row.can_export), true)
    const rows = async () => (await db.query("select id::int,subregion_id::int,kam_id::text from get_weekly_sales_export_volume_rows('2026-11-16','2026-11-22') order by id")).rows
    assert.deepEqual((await rows()).map(row => row.id), [1,2,3,10,11])
    await db.exec("update viewer set scope='region'")
    assert.deepEqual((await rows()).map(row => row.id), [1,2,10,11])
    await db.exec("update viewer set scope='subregion'")
    assert.deepEqual((await rows()).map(row => row.id), [1,10])
    assert.equal((await rows())[0].subregion_id, 11)
    await db.exec("update viewer set scope='customer'")
    assert.deepEqual((await rows()).map(row => row.id), [1,10])
    assert.ok((await rows()).every(row => row.kam_id === '00000000-0000-0000-0000-000000000001'))
    await db.exec("select set_config('test.export','no',false)")
    assert.deepEqual(await rows(), [])
    await db.exec("select set_config('test.export','yes',false),set_config('test.view','no',false)")
    assert.deepEqual(await rows(), [])
  } finally { await db.close() }
})

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
