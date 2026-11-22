import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('salesman reassignment spans customers atomically and preserves periods, areas and volumes', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated;
      create table users(full_name text, is_active boolean, region_id bigint);
      insert into users values ('New Salesman',true,1),('Other Region',true,2),('Inactive',false,1);
      create table customers(id bigint primary key, region_id bigint);
      insert into customers values(3,1),(6,1);
      create table products(id bigint primary key,category_id bigint);
      create table budgets(id bigint primary key, volume numeric, year integer, month integer,region_id bigint,subregion_id bigint,customer_id bigint,product_id bigint,category_id bigint,kam text);
      create table actuals(like budgets including all);
      alter table actuals add column actual_date date;
      insert into budgets values(1,-25.5,2026,11,1,9,3,null,null,'Old Salesman'),(2,30,2026,11,1,9,6,null,null,'Old Salesman');
      insert into actuals select *, '2026-11-08'::date from budgets;`)
    const original = (await readFile(new URL('../supabase/migrations/202611100006_customer_volume_all_fields.sql', import.meta.url),'utf8'))
      .replaceAll("'Budget'","'Budgets'").replaceAll("'Actual'","'Actuals'")
    await db.exec(original)
    await db.exec(await readFile(new URL('../supabase/migrations/202611220001_remove_legacy_volume_snapshot_fields.sql', import.meta.url),'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/202611220003_salesman_volume_edit.sql', import.meta.url),'utf8'))
    const signedMigration = await readFile(new URL('../supabase/migrations/202611220005_allow_signed_saved_volumes.sql', import.meta.url),'utf8')
    await db.exec(signedMigration)
    await db.exec(signedMigration)
    for (const [module, table] of [['Budgets','budgets'],['Actuals','actuals']]) {
      const snapshots = (await db.query(`select to_jsonb(t) as record from ${table} t order by id`)).rows.map(row=>row.record)
      const payload = snapshots.map(({id,...original}) => ({id, original: module === 'Actuals' ? Object.fromEntries(Object.entries(original).filter(([key])=>!['year','month'].includes(key))) : original,
        kam:'New Salesman',volume:original.volume,...(module==='Actuals'?{actual_date:original.actual_date}:{year:original.year,month:original.month}) }))
      const save = records => db.query('select update_salesman_volume_records($1,$2::jsonb) as count',[module,JSON.stringify(records)])
      await assert.rejects(save(payload.map(row=>({...row,kam:'Other Region'}))),/same region/)
      await assert.rejects(save(payload.map(row=>({...row,kam:'Inactive'}))),/active user/)
      await assert.rejects(save(payload.map(row=>({...row,volume:99}))),/Only Salesman/)
      const stale = structuredClone(payload); stale[1].original.volume=99; stale[1].volume=99
      await assert.rejects(save(stale),/record changed/)
      assert.equal((await db.query(`select kam from ${table} where id=1`)).rows[0].kam,'Old Salesman')
      assert.equal((await save(payload)).rows[0].count,2)
      const after = (await db.query(`select to_jsonb(t) as record from ${table} t order by id`)).rows.map(row=>row.record)
      assert.deepEqual(after,snapshots.map(row=>({...row,kam:'New Salesman'})))
      const customerSave = row => db.query('select update_customer_volume_records($1,$2::jsonb)',[module,JSON.stringify([row])])
      const signed = {...payload[0],original:{...payload[0].original,kam:'New Salesman'},volume:-99.25}
      await customerSave(signed)
      assert.equal(Number((await db.query(`select volume from ${table} where id=1`)).rows[0].volume),-99.25)
      await assert.rejects(customerSave({...signed,original:{...signed.original,volume:-99.25},volume:null}),/valid numeric volume/)
    }
  } finally { await db.close() }
})
