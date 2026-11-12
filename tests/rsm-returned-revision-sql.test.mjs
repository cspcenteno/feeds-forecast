import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('RSM returned corrections retain ownership, scope and the two-stage approval workflow', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns text language sql stable as $$ select current_setting('test.viewer',true) $$;
      create table users(id text primary key, role text, position text, region_id bigint, subregion_id bigint, is_active boolean);
      insert into users values ('rsm','Manager','RSM',1,11,true), ('kam','User','KAM',1,11,true),
        ('kam2','User','KAM',1,11,true), ('asm','Manager','ASM',1,null,true), ('missing','Manager','RSM',1,null,true);
      create type forecast_status as enum ('Draft','Pending','Endorsed','Rejected','Approved');
      create table products(id bigint primary key, category_id bigint, weight numeric, is_active boolean);
      insert into products values (10,1,1,true),(20,2,0.5,true),(30,3,2,false),(40,4,2,true);
      create table sales_forecasts(id bigint primary key, user_id text, region_id bigint, subregion_id bigint,
        customer_id bigint, year int, week int, product_id bigint, category_id bigint, forecast numeric, volume numeric,
        status forecast_status, submitted_by text, submitted_at timestamptz, endorsed_by text, endorsed_at timestamptz,
        approved_by text, approved_at timestamptz, returned_by text, returned_at timestamptz, remarks text);
      create function has_module_permission(text,text) returns boolean language sql stable as $$ select current_setting('test.allowed',true) = 'yes' $$;
      create function forecast_week_is_open(int,int) returns boolean language sql stable as $$ select current_setting('test.open',true) = 'yes' $$;
      select set_config('test.viewer','rsm',false),set_config('test.allowed','yes',false),set_config('test.open','yes',false);
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611120001_rsm_returned_forecast_revision.sql', import.meta.url), 'utf8'))
    async function reset() {
      await db.exec(`truncate sales_forecasts;
        select set_config('test.viewer','rsm',false),set_config('test.allowed','yes',false),set_config('test.open','yes',false);
        insert into sales_forecasts(id,user_id,region_id,subregion_id,customer_id,year,week,product_id,category_id,forecast,volume,status,submitted_by,returned_by,returned_at,remarks)
        values (1,'kam',1,11,100,2026,46,10,1,10,10,'Rejected','kam','asm',now(),'Correct quantity'),
          (2,'kam',1,11,100,2026,46,20,2,20,10,'Rejected','kam','asm',now(),'Correct quantity');`)
    }
    const entry = (id = 1, overrides = {}) => ({ id, product_id: id === 1 ? 10 : 20, forecast: 15,
      original: { product_id: id === 1 ? 10 : 20, forecast: id === 1 ? 10 : 20, status: 'Rejected' }, ...overrides })
    const revise = (entries, submit = false) => db.query('select revise_rsm_returned_forecasts($1::jsonb,$2) changed', [JSON.stringify(entries),submit])

    await t.test('saving keeps KAM ownership and the return reason; resubmission enters Pending', async () => {
      await reset()
      assert.equal((await revise([entry(),entry(2)])).rows[0].changed,2)
      const saved = (await db.query('select * from sales_forecasts where id=1')).rows[0]
      assert.equal(saved.user_id,'kam')
      assert.equal(saved.status,'Draft')
      assert.equal(saved.returned_by,'asm')
      assert.equal(saved.remarks,'Correct quantity')
      assert.equal(Number(saved.forecast),15)
      const entries = (await db.query('select * from sales_forecasts order by id')).rows.map(row => entry(Number(row.id), {
        forecast: Number(row.forecast), original: { product_id: Number(row.product_id), forecast: Number(row.forecast), status: row.status },
      }))
      assert.equal((await revise(entries,true)).rows[0].changed,2)
      const rows = (await db.query('select * from sales_forecasts')).rows
      for (const row of rows) {
        assert.equal(row.status,'Pending')
        assert.equal(row.user_id,'kam')
        assert.equal(row.submitted_by,'kam')
        assert.equal(row.endorsed_by,null)
        assert.equal(row.returned_at,null)
        assert.equal(row.remarks,null)
      }
    })
    await t.test('product edits recalculate category and volume on the server', async () => {
      await reset()
      await revise([entry(1,{ product_id:40,forecast:12 })])
      const row = (await db.query('select * from sales_forecasts where id=1')).rows[0]
      assert.equal(Number(row.product_id),40)
      assert.equal(Number(row.category_id),4)
      assert.equal(Number(row.volume),24)
    })
    await t.test('other roles, missing assignments, inactive actors and denied permissions are blocked', async () => {
      for (const actor of ['kam','asm','missing']) {
        await reset()
        await db.query("select set_config('test.viewer',$1,false)",[actor])
        await assert.rejects(revise([entry()]),/assigned RSM/)
      }
      await reset()
      await db.exec("select set_config('test.allowed','no',false)")
      await assert.rejects(revise([entry()]),/permissions/)
      await reset()
      await db.exec("update users set is_active=false where id='rsm'")
      await assert.rejects(revise([entry()]),/assigned RSM/)
      await db.exec("update users set is_active=true where id='rsm'")
    })
    await t.test('both area fields, KAM ownership and returned state are required', async () => {
      for (const change of ["region_id=2","subregion_id=12","user_id='asm'","status='Draft',returned_at=null","status='Pending'","status='Approved'"]) {
        await reset()
        await db.exec(`update sales_forecasts set ${change} where id=1`)
        await assert.rejects(revise([entry()]),/Only returned KAM/)
      }
    })
    await t.test('locked weeks, stale edits, invalid products and quantities cannot be saved or resubmitted', async () => {
      await reset()
      await db.exec("select set_config('test.open','no',false)")
      await assert.rejects(revise([entry()],true),/locked/)
      await reset()
      await assert.rejects(revise([entry(1,{ original:{product_id:10,forecast:11,status:'Rejected'} })]),/changed/)
      for (const product_id of [30,999]) await assert.rejects(revise([entry(1,{product_id})]),/active product/)
      for (const forecast of [-1,null,'NaN','Infinity']) await assert.rejects(revise([entry(1,{forecast})]),/valid nonnegative/)
    })
    await t.test('batches are atomic, reject duplicate IDs and products, and cannot cross customers or weeks', async () => {
      await reset()
      await assert.rejects(revise([entry(),entry()]),/Duplicate/)
      await assert.rejects(revise([entry(1,{ product_id:20 })]),/already has/)
      for (const change of ['customer_id=200','week=47']) {
        await reset()
        await db.exec(`update sales_forecasts set ${change} where id=2`)
        await assert.rejects(revise([entry(),entry(2)]),/one customer and week/)
        assert.equal(Number((await db.query('select forecast from sales_forecasts where id=1')).rows[0].forecast),10)
      }
      await reset()
      await assert.rejects(revise([entry(),entry(999)]),/Only returned KAM/)
      assert.equal(Number((await db.query('select forecast from sales_forecasts where id=1')).rows[0].forecast),10)
      assert.equal((await db.query('select count(*)::int total from sales_forecasts')).rows[0].total,2)
    })
    await t.test('Admin actions apply across owners and areas while preserving ownership and status guards', async () => {
      await db.exec("insert into users values ('admin','Admin',null,null,null,true)")
      await db.exec(await readFile(new URL('../supabase/migrations/202611120006_admin_saved_forecast_actions.sql',import.meta.url),'utf8'))
      const admin = async () => {
        await reset()
        await db.exec("select set_config('test.viewer','admin',false); update sales_forecasts set region_id=2,subregion_id=22")
      }
      const reviseAdmin = (entries,submit=false) => db.query('select revise_admin_saved_forecasts($1::jsonb,$2) changed',[JSON.stringify(entries),submit])
      await admin()
      await reviseAdmin([entry()])
      const saved = (await db.query('select * from sales_forecasts where id=1')).rows[0]
      assert.equal(saved.user_id,'kam')
      assert.equal(Number(saved.region_id),2)
      assert.equal(saved.status,'Draft')
      await reviseAdmin([entry(1,{original:{product_id:10,forecast:15,status:'Draft'}})],true)
      const submitted = (await db.query('select * from sales_forecasts where id=1')).rows[0]
      assert.equal(submitted.status,'Pending')
      assert.equal(submitted.user_id,'kam')
      assert.equal(submitted.submitted_by,'kam')
      for (const status of ['Pending','Endorsed','Approved']) {
        await admin()
        await db.query('update sales_forecasts set status=$1 where id=1',[status])
        await assert.rejects(reviseAdmin([entry()]),/Only draft or returned/)
        await assert.rejects(db.query('select delete_admin_saved_forecasts(array[1]::bigint[])'),/Only draft or returned/)
      }
      await admin()
      await db.exec("select set_config('test.open','no',false)")
      await assert.rejects(reviseAdmin([entry()]),/locked/)
      await assert.rejects(db.query('select delete_admin_saved_forecasts(array[1]::bigint[])'),/locked/)
      await admin()
      await db.exec("select set_config('test.allowed','no',false)")
      await assert.rejects(reviseAdmin([entry()]),/permissions/)
      await assert.rejects(db.query('select delete_admin_saved_forecasts(array[1]::bigint[])'),/permissions/)
      await reset()
      await assert.rejects(reviseAdmin([entry()]),/active Admin/)
      await assert.rejects(db.query('select delete_admin_saved_forecasts(array[1]::bigint[])'),/active Admin/)
      await admin()
      await assert.rejects(db.query('select delete_admin_saved_forecasts(array[1,999]::bigint[])'),/unavailable/)
      assert.equal((await db.query('select count(*)::int count from sales_forecasts')).rows[0].count,2)
      assert.equal((await db.query('select delete_admin_saved_forecasts(array[1,2]::bigint[]) changed')).rows[0].changed,2)
    })
  } finally { await db.close() }
})
