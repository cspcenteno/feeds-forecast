import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('KAM direct deletes allow only owned drafts and preserve returned records', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create table sales_forecasts(id int,user_id text,status text);
      insert into sales_forecasts values (1,'kam','Draft'),(2,'other','Draft'),(3,'kam','Rejected'),(4,'kam','Pending'),(5,'kam','Approved');
      alter table sales_forecasts enable row level security;
      grant select,delete on sales_forecasts to authenticated;
      create policy read_forecasts on sales_forecasts for select to authenticated using (true);
      create policy delete_owned_forecasts on sales_forecasts for delete to authenticated using (user_id='kam');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611120008_draft_only_forecast_delete.sql',import.meta.url),'utf8'))
    await db.exec('set role authenticated')
    assert.deepEqual((await db.query('delete from sales_forecasts returning id')).rows,[{id:1}])
    assert.deepEqual((await db.query('select id from sales_forecasts order by id')).rows,[{id:2},{id:3},{id:4},{id:5}])
  } finally { await db.close() }
})
