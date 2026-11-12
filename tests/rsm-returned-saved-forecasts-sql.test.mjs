import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('saved forecasts expose only owned rows or returned KAM rows in the RSM area', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns text language sql stable as $$ select current_setting('test.viewer',true) $$;
      create table users(id text, role text, position text, region_id bigint, subregion_id bigint, is_active boolean);
      insert into users values ('rsm','Manager','RSM',1,11,true),('kam','User','KAM',1,11,true),
        ('kam2','User','KAM',1,11,true),('asm','Manager','ASM',1,null,true),('missing','Manager','RSM',1,null,true);
      create table sales_forecasts(id bigint, user_id text, region_id bigint, subregion_id bigint, status text, returned_at timestamptz);
      insert into sales_forecasts values
        (1,'kam',1,11,'Rejected',now()),(2,'kam2',1,11,'Rejected',now()),
        (3,'kam',1,12,'Rejected',now()),(4,'kam',2,11,'Rejected',now()),
        (5,'kam',1,11,'Draft',now()),(6,'kam',1,11,'Draft',null),
        (7,'kam',1,11,'Pending',null),(8,'kam',1,11,'Approved',null),
        (9,'asm',1,11,'Rejected',now());
      create function has_module_permission(text,text) returns boolean language sql stable as $$
        select current_setting('test.allowed',true) = 'yes' $$;
      select set_config('test.allowed','yes',false);
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611110003_rsm_returned_saved_forecasts.sql',import.meta.url),'utf8'))
    const ids = async viewer => {
      await db.query("select set_config('test.viewer',$1,false)",[viewer])
      return (await db.query('select id::int from get_saved_forecasts() order by id')).rows.map(r=>r.id)
    }
    assert.deepEqual(await ids('rsm'),[1,2,5])
    assert.deepEqual(await ids('kam'),[1,3,4,5,6,7,8])
    assert.deepEqual(await ids('kam2'),[2])
    assert.deepEqual(await ids('missing'),[])
    assert.deepEqual(await ids('asm'),[9])
    await db.exec("select set_config('test.allowed','no',false)")
    assert.deepEqual(await ids('rsm'),[])
    await db.exec("select set_config('test.allowed','yes',false); insert into users values ('admin','Admin',null,null,null,true); update users set is_active=true where id='rsm';")
    await db.exec(await readFile(new URL('../supabase/migrations/202611120005_admin_saved_forecast_visibility.sql',import.meta.url),'utf8'))
    assert.deepEqual(await ids('admin'),[1,2,3,4,5,6,7,8,9])
    assert.deepEqual(await ids('rsm'),[1,2,5])
    assert.deepEqual(await ids('kam2'),[2])
    await db.exec("select set_config('test.allowed','no',false)")
    assert.deepEqual(await ids('admin'),[])
    await db.exec("select set_config('test.allowed','yes',false); update users set is_active=false where id='admin'")
    assert.deepEqual(await ids('admin'),[])
    await db.exec("select set_config('test.allowed','yes',false); update users set is_active=false where id='rsm'")
    assert.deepEqual(await ids('rsm'),[])
  } finally { await db.close() }
})
