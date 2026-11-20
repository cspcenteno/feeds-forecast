import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('RSM and KAM read only their assigned subregion with module access', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns int language sql as $$ select 1 $$;
      create table users(id int, role text, position text, region_id bigint, subregion_id bigint, is_active boolean);
      insert into users values (1,'Manager','RSM',1,11,true);
      create table budgets(id int, region_id bigint, subregion_id bigint);
      create table actuals(like budgets);
      insert into budgets values (1,1,11),(2,1,12),(3,2,11),(4,1,null);
      insert into actuals select * from budgets;
      alter table budgets enable row level security;
      alter table actuals enable row level security;
      create policy module_grant on budgets for select to authenticated using (true);
      create policy module_grant on actuals for select to authenticated using (true);
      grant select on budgets,actuals to authenticated;
    `)
    const sql = await readFile(new URL('../supabase/migrations/202611180002_budget_actual_subregion_visibility.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const visible = async table => {
      await db.exec('set role authenticated')
      const rows = (await db.query(`select id from ${table} order by id`)).rows.map(row => row.id)
      await db.exec('reset role')
      return rows
    }
    for (const position of ['RSM', ' kam ']) {
      await db.query('update users set position=$1', [position])
      for (const table of ['budgets', 'actuals']) assert.deepEqual(await visible(table), [1])
    }
    await db.exec('update users set subregion_id=null')
    assert.deepEqual(await visible('budgets'), [])
    await db.exec("update users set role='Admin'")
    assert.deepEqual(await visible('actuals'), [1,2,3,4])
    await db.exec("update users set role='Manager',position='NSM'")
    assert.deepEqual(await visible('budgets'), [1,2,3,4])
    await db.exec('drop policy module_grant on budgets')
    assert.deepEqual(await visible('budgets'), [])
  } finally { await db.close() }
})
