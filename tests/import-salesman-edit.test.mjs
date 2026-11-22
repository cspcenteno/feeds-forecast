import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('Budget and Actual import correct salesman groups atomically and block unmatched names', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated;
      create table users(full_name text,is_active boolean,position text,region_id bigint);
      insert into users values('Matched Salesman',true,'KAM',1),('Inactive',false,'KAM',1);
      create function public.has_module_permission(text,text) returns boolean language sql as 'select true';
      create table budget_import_staging(id bigint primary key,kam text,region text,volume numeric,customer text);
      create table actual_import_staging(like budget_import_staging including all);
      insert into budget_import_staging values(1,'Old Name','LUZON',-2.5,'Customer A'),(2,'Old Name','LUZON',3,'Customer B');
      insert into actual_import_staging select * from budget_import_staging;
      create table budgets(year integer,month integer,region_id bigint,subregion_id bigint,customer_id bigint,category_id bigint,product_id bigint,kam text,volume numeric);
      create table actuals(actual_date date,region_id bigint,subregion_id bigint,customer_id bigint,category_id bigint,product_id bigint,kam text,volume numeric);`)
    const migration = await readFile(new URL('../supabase/migrations/202611220006_import_salesman_validation.sql',import.meta.url),'utf8')
    await db.exec(migration)
    await db.exec(migration)
    for (const [moduleName,staging,saved] of [['Budgets','budget_import_staging','budgets'],['Actuals','actual_import_staging','actuals']]) {
      const records = [{id:1,kam:'Old Name',region:'LUZON'},{id:2,kam:'Old Name',region:'LUZON'}]
      const edit = (target,rows) => db.query('select update_import_salesman_records($1,$2,$3::jsonb) as count',[moduleName,target,JSON.stringify(rows)])
      await assert.rejects(edit('Unknown',records),/active salesman/)
      await assert.rejects(edit('Inactive',records),/active salesman/)
      await assert.rejects(edit('Matched Salesman',[records[0],{...records[1],region:'Changed'}]),/record changed/)
      assert.equal((await db.query(`select kam from ${staging} where id=1`)).rows[0].kam,'Old Name')
      assert.equal((await edit('Matched Salesman',records)).rows[0].count,2)
      assert.deepEqual((await db.query(`select kam,volume::text,customer from ${staging} order by id`)).rows,[
        {kam:'Matched Salesman',volume:'-2.5',customer:'Customer A'},{kam:'Matched Salesman',volume:'3',customer:'Customer B'},
      ])
      const payload = {kam:'Matched Salesman',region_id:1,volume:-2.5,year:2026,month:11,actual_date:'2026-11-08'}
      const importRows = rows => db.query('select import_volume_records($1,$2::jsonb)',[moduleName,JSON.stringify(rows)])
      await assert.rejects(importRows([payload,{...payload,kam:'Unknown'}]),/Salesman assignment/)
      assert.equal((await db.query(`select count(*)::int as count from ${saved}`)).rows[0].count,0)
      await assert.rejects(importRows([{...payload,region_id:2}]),/Salesman assignment/)
      await importRows([payload])
      assert.equal((await db.query(`select volume::text from ${saved}`)).rows[0].volume,'-2.5')
    }
    await db.exec(`create or replace function public.has_module_permission(text,text) returns boolean language sql as 'select false'`)
    await assert.rejects(db.query(`select update_import_salesman_records('Budgets','Matched Salesman','[]')`),/permissions/)
    await assert.rejects(db.query(`select import_volume_records('Budgets','[]')`),/permission denied/)
  } finally { await db.close() }
})
