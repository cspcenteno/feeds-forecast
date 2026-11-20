import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('approval preview references require View and enforce assigned areas with unambiguous KAM ownership', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create table viewer(scope text, region_id bigint, subregion_id bigint, customer_ids bigint[]);
      insert into viewer values ('region',1,11,array[10]::bigint[]);
      create function monthly_reference_viewer(module text) returns setof viewer language sql as $$
        select * from public.viewer where module='Approvals' and current_setting('test.view',true)='yes' $$;
      create table users(id uuid, full_name text, email text, position text, region_id bigint);
      insert into users values ('00000000-0000-0000-0000-000000000001','Alex','alex@example.com','KAM',1);
      create table customers(id bigint, salesman text);
      insert into customers values (10,'Alex'),(20,'Alex');
      create table budgets(id bigint,year int,month int,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,volume numeric,kam text);
      create table actuals(id bigint,actual_date date,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,volume numeric,kam text);
      insert into budgets values (1,2026,11,1,11,10,1,100,null),(2,2026,12,1,12,20,1,90,'alex@example.com'),(3,2026,11,2,21,30,1,999,null);
      insert into actuals values (10,'2026-11-16',1,11,20,1,5,null),(11,'2026-11-16',1,12,10,1,7,'unknown'),(12,'2026-11-16',2,21,30,1,999,null);
      select set_config('test.view','yes',false);
    `)
    const sql = await readFile(new URL('../supabase/migrations/202611200003_approval_excel_references.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    const optimization = await readFile(new URL('../supabase/migrations/202611200004_faster_approval_excel_references.sql', import.meta.url), 'utf8')
    await db.exec(optimization); await db.exec(optimization)
    const rows = async () => (await db.query("select id::int, kam_id from get_approval_excel_volume_rows('2026-11-16','2026-11-22') order by id")).rows
    const regional = await rows()
    assert.deepEqual(regional.map(row => row.id), [1,2,10,11])
    assert.equal(regional[0].kam_id, '00000000-0000-0000-0000-000000000001')
    assert.equal(regional[1].kam_id, regional[0].kam_id)
    assert.equal(regional[3].kam_id, null)
    await db.exec("update viewer set scope='subregion'")
    assert.deepEqual((await rows()).map(row => row.id), [1,10])
    await db.exec("update viewer set subregion_id=null")
    assert.deepEqual(await rows(), [])
    await db.exec("update viewer set scope='global'; select set_config('test.view','no',false)")
    assert.deepEqual(await rows(), [])
    await db.exec("select set_config('test.view','yes',false); insert into users values ('00000000-0000-0000-0000-000000000002','Alex','other@example.com','KAM',1)")
    assert.equal((await rows())[0].kam_id, null)
  } finally { await db.close() }
})
