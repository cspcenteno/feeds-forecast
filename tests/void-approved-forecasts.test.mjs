import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

for (const enumStatus of [false,true]) test(`Admin void preserves audit, data and permissions (${enumStatus ? 'enum' : 'text'} status)`, async () => {
  const db = new PGlite()
  const actor='11111111-1111-1111-1111-111111111111'
  try {
    await db.exec(`create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
      create table users(id uuid primary key,role text,is_active boolean);
      insert into users values('${actor}','Admin',true);
      create function public.has_module_permission(text,text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'yes') <> 'no'$$;
      ${enumStatus ? "create type public.forecast_status as enum ('Approved','Draft','Pending');" : ''}
      create table forecasts(id bigint primary key,status ${enumStatus ? 'public.forecast_status' : 'text'} check(status in ('Approved','Draft','Pending')),forecast numeric,volume numeric,
        year integer,week integer,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,category_id bigint,user_id uuid,
        approved_by uuid,approved_at timestamptz,remarks text);
      insert into forecasts values(1,'Approved',10,500,2026,47,1,2,3,4,5,'${actor}','${actor}',now(),'Original approval'),
        (2,'Approved',20,1000,2026,47,1,2,3,4,5,'${actor}','${actor}',now(),'Original approval');
      create table audit_test(id bigint,status text,actor uuid);
      create function capture_test_audit() returns trigger language plpgsql as $$begin insert into public.audit_test values(new.id,new.status::text,auth.uid()); return new; end;$$;
      create trigger capture_test_audit after update on forecasts for each row execute function capture_test_audit();`)
    const migration=await readFile(new URL('../supabase/migrations/202611220007_void_approved_forecasts.sql',import.meta.url),'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const snapshots=(await db.query('select to_jsonb(f) as row from forecasts f order by id')).rows.map(item=>item.row)
    const payload=snapshots.map(row=>({id:row.id,original:row}))
    const save=(records,reason='Duplicate approved forecast')=>db.query('select void_approved_forecasts($1::jsonb,$2) as count',[JSON.stringify(records),reason])
    await assert.rejects(save(payload,''),/reason/)
    await db.exec(`update users set role='Manager'`)
    await assert.rejects(save(payload),/active Admin/)
    await db.exec(`update users set role='Admin'; set test.allowed='no'`)
    await assert.rejects(save(payload),/View and Delete/)
    await db.exec(`set test.allowed='yes'`)
    const stale=structuredClone(payload); stale[1].original.forecast=99
    await assert.rejects(save(stale),/forecast changed/)
    assert.equal((await db.query(`select count(*)::int as count from forecasts where status='Approved'`)).rows[0].count,2)
    assert.equal((await db.query('select count(*)::int as count from audit_test')).rows[0].count,0)
    await assert.rejects(db.exec(`update forecasts set status='Voided',forecast=999,voided_by='${actor}',voided_at=now(),void_reason='Bad edit' where id=1`),/cannot edit/)
    assert.equal((await save(payload)).rows[0].count,2)
    const after=(await db.query('select to_jsonb(f) as row from forecasts f order by id')).rows.map(item=>item.row)
    for(let i=0;i<after.length;i++) {
      const {status,voided_by,voided_at,void_reason,...unchanged}=after[i]
      const {status:oldStatus,voided_by:oldActor,voided_at:oldTime,void_reason:oldReason,...original}=snapshots[i]
      assert.deepEqual(unchanged,original)
      assert.equal(status,'Voided'); assert.equal(voided_by,actor); assert.ok(voided_at); assert.equal(void_reason,'Duplicate approved forecast')
    }
    assert.equal((await db.query(`select coalesce(sum(volume),0)::int as total from forecasts where status='Approved'`)).rows[0].total,0)
    assert.equal((await db.query(`select count(*)::int as count from audit_test where status='Voided' and actor='${actor}'`)).rows[0].count,2)
    await assert.rejects(save(payload),/Only approved/)
    await assert.rejects(db.exec('update forecasts set forecast=123 where id=1'),/read-only/)
    await assert.rejects(db.exec('delete from forecasts where id=1'),/cannot be deleted/)
    await db.exec(`create function public.enforce_forecast_week_lock() returns trigger language plpgsql security definer set search_path='' as $$begin if tg_op='DELETE' then raise exception 'Week locked'; end if; return new; end;$$;
      create trigger enforce_forecast_week_lock_before_write before delete on public.forecasts for each row execute function public.enforce_forecast_week_lock();
      grant select,delete,update on forecasts to authenticated;`)
    const cleanup=await readFile(new URL('../supabase/migrations/202611220008_privileged_void_cleanup.sql',import.meta.url),'utf8')
    await db.exec(cleanup)
    await db.exec(cleanup)
    await db.exec('set role authenticated')
    await assert.rejects(db.exec('delete from public.forecasts where id=1'))
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as count from forecasts')).rows[0].count,2)
    await assert.rejects(db.exec('update forecasts set forecast=123 where id=1'),/read-only/)
    await db.exec('delete from forecasts where id=1')
    assert.deepEqual((await db.query('select id from forecasts')).rows.map(row=>row.id),[2])
  } finally { await db.close() }
})
