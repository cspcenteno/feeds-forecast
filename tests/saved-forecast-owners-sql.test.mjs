import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('KAM names include only owners of accessible saved forecasts', async () => {
  const db = new PGlite()
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select current_setting('test.viewer',true)::uuid $$;
      create table users(id uuid, full_name text, role text, position text, region_id bigint, subregion_id bigint, is_active boolean);
      insert into users values ('${id(1)}','RSM','Manager','RSM',1,11,true),
        ('${id(2)}','KAM A','User','KAM',1,11,true), ('${id(3)}','KAM B','User','KAM',1,12,true),
        ('${id(4)}','KAM C','User','KAM',1,11,true);
      create table sales_forecasts(id bigint,user_id uuid,region_id bigint,subregion_id bigint,status text,returned_at timestamptz);
      insert into sales_forecasts values (1,'${id(2)}',1,11,'Rejected',now()),(2,'${id(2)}',1,11,'Draft',now()),
        (3,'${id(3)}',1,12,'Rejected',now()),(4,'${id(4)}',1,11,'Pending',null);
      create function has_module_permission(text,text) returns boolean language sql stable as $$ select current_setting('test.allowed',true) = 'yes' $$;
      select set_config('test.viewer','${id(1)}',false),set_config('test.allowed','yes',false);
    `)
    for (const file of ['202611110003_rsm_returned_saved_forecasts.sql','202611120002_saved_forecast_kam_names.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'))
    }
    assert.deepEqual((await db.query('select * from get_saved_forecast_owners()')).rows,[{ id:id(2),full_name:'KAM A' }])
    await db.exec("select set_config('test.allowed','no',false)")
    assert.deepEqual((await db.query('select * from get_saved_forecast_owners()')).rows,[])
    await db.exec(`select set_config('test.allowed','yes',false),set_config('test.viewer','${id(3)}',false)`)
    assert.deepEqual((await db.query('select * from get_saved_forecast_owners()')).rows,[{ id:id(3),full_name:'KAM B' }])
    await db.exec(`select set_config('test.viewer','${id(1)}',false);update users set is_active=false where id='${id(1)}'`)
    assert.deepEqual((await db.query('select * from get_saved_forecast_owners()')).rows,[])
    await db.exec(`update users set is_active=true where id='${id(1)}'; alter table sales_forecasts rename to forecasts`)
    await db.exec(await readFile(new URL('../supabase/migrations/202611190002_rsm_subregion_saved_forecasts.sql',import.meta.url),'utf8'))
    assert.deepEqual((await db.query('select * from get_saved_forecast_owners() order by full_name')).rows,
      [{ id:id(2),full_name:'KAM A' },{ id:id(4),full_name:'KAM C' }])
  } finally { await db.close() }
})
