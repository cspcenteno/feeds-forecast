import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

for (const legacyRule of ['constraint', 'index']) test(`Actuals accepts sales lines after removing legacy uniqueness (${legacyRule})`, async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create table actuals(id bigint generated always as identity primary key, actual_date date, region_id bigint, subregion_id bigint, customer_id bigint, category_id bigint, product_id bigint, kam text, volume numeric);
      create unique index actuals_date_customer_product_idx on actuals(actual_date,region_id,customer_id,product_id) where actual_date is not null;
      create function has_module_permission(text,text) returns boolean language sql as $$ select coalesce(current_setting('test.allowed',true),'yes') = 'yes' $$;
      insert into actuals(actual_date,region_id,customer_id,product_id,volume) values ('2026-11-04',1,2,3,10);
    `)
    await db.exec(legacyRule === 'constraint'
      ? 'alter table actuals add constraint actuals_unique_entry unique(actual_date,region_id,customer_id,product_id)'
      : 'create unique index actuals_unique_entry on actuals(actual_date,region_id,customer_id,product_id)')
    const migration = await readFile(new URL('../supabase/migrations/202611200005_allow_actual_sales_lines.sql', import.meta.url), 'utf8')
    await db.exec(migration); await db.exec(migration)
    // Reproduce the reported failure: the previous migration leaves this rule.
    await assert.rejects(db.exec("insert into actuals(actual_date,region_id,customer_id,product_id,volume) values ('2026-11-04',1,2,3,15)"), /actuals_unique_entry/)
    const legacyFix = await readFile(new URL('../supabase/migrations/202611200006_remove_legacy_actual_uniqueness.sql', import.meta.url), 'utf8')
    await db.exec(legacyFix); await db.exec(legacyFix)
    const imports = await readFile(new URL('../supabase/migrations/202611160001_import_permissions.sql', import.meta.url), 'utf8')
    await db.exec(imports.slice(imports.indexOf('create or replace function public.import_volume_records'), imports.lastIndexOf('commit;')))
    const rows = [15,20].map(volume => ({ actual_date:'2026-11-04',region_id:1,customer_id:2,product_id:3,category_id:4,kam:'KAM A',volume }))
    await db.query("select import_volume_records('Actuals',$1::jsonb)", [JSON.stringify(rows)])
    const result = await db.query('select count(*)::int as lines, sum(volume)::float8 as total from actuals')
    assert.deepEqual(result.rows, [{ lines:3,total:45 }])
    await db.exec("select set_config('test.allowed','no',false)")
    await assert.rejects(db.query("select import_volume_records('Actuals',$1::jsonb)", [JSON.stringify(rows)]), /permission denied/i)
    assert.equal((await db.query('select count(*)::int as lines from actuals')).rows[0].lines, 3)
  } finally { await db.close() }
})
