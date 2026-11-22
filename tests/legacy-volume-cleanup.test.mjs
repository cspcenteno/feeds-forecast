import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('legacy volume cleanup preserves data, conflicts and grants while accepting snapshots without legacy fields', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create table public.customers (id bigint primary key, region_id bigint);
      create table public.products (id bigint primary key, category_id bigint);
      create table public.budgets (
        id bigint primary key, volume numeric, year integer, month integer,
        region_id bigint, subregion_id bigint, customer_id bigint,
        product_id bigint, category_id bigint, kam text, asm text, rsm text
      );
      create table public.actuals (like public.budgets including all);
      alter table public.actuals add column actual_date date;
      insert into public.customers values (3, 1);
      insert into public.products values (4, 5);
      insert into public.budgets values (12, 25, 2026, null, 1, null, 3, 4, 5, 'KAM', 'Stored ASM', 'Stored RSM');
      insert into public.actuals values (13, 25, 2026, 11, 1, null, 3, 4, 5, 'KAM', 'Stored ASM', 'Stored RSM', '2026-11-08');
    `)
    const original = (await readFile(new URL('../supabase/migrations/202611100006_customer_volume_all_fields.sql', import.meta.url), 'utf8'))
      .replaceAll("'Budget'", "'Budgets'").replaceAll("'Actual'", "'Actuals'")
    await db.exec(original)
    const snapshot = { volume: 25, region_id: 1, subregion_id: null, customer_id: 3, product_id: 4, category_id: 5, kam: 'KAM' }
    const budget = { id: 12, original: { ...snapshot, year: 2026, month: null }, volume: 30, year: 2026, month: null }
    const update = (module, records) => db.query('select public.update_customer_volume_records($1, $2::jsonb) as changed', [module, JSON.stringify(records)])
    await assert.rejects(update('Budgets', [budget]), /record changed/)

    const migration = await readFile(new URL('../supabase/migrations/202611220001_remove_legacy_volume_snapshot_fields.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration) // Repeat applications are safe.
    assert.equal((await update('Budgets', [budget])).rows[0].changed, 1)
    assert.deepEqual((await db.query('select asm, rsm from public.budgets where id = 12')).rows[0], { asm: 'Stored ASM', rsm: 'Stored RSM' })
    await assert.rejects(update('Budgets', [budget]), /record changed/)
    const actual = { id: 13, original: { ...snapshot, actual_date: '2026-11-08' }, volume: 0, actual_date: '2026-11-08' }
    assert.equal((await update('Actuals', [actual])).rows[0].changed, 1)
    await assert.rejects(update('Actuals', [{ ...actual, original: { ...actual.original, volume: 0 }, volume: -1 }]), /valid volume/)
    const access = await db.query(`select prosecdef, has_function_privilege('authenticated', oid, 'EXECUTE') as can_execute from pg_proc where oid = 'public.update_customer_volume_records(text,jsonb)'::regprocedure`)
    assert.deepEqual(access.rows[0], { prosecdef: false, can_execute: true })

    await db.exec(`
      create table public.budget_import_staging (id bigint primary key, asm text, rsm text, kam text);
      create table public.actual_import_staging (id bigint primary key, asm text, rsm text, subregion text, subregion_id bigint, kam text);
      insert into public.budget_import_staging values (1, 'Old ASM', 'Old RSM', 'Budget KAM');
      insert into public.actual_import_staging values (2, 'Old ASM', 'Old RSM', 'Legacy area', 9, 'Actual KAM');
    `)
    const deletion = await readFile(new URL('../supabase/migrations/202611220002_drop_legacy_volume_columns.sql', import.meta.url), 'utf8')
    // An unexpected view blocks deletion and rolls back earlier drops in the transaction.
    await db.exec('create view public.keep_legacy_rsm as select rsm from public.actuals')
    await assert.rejects(db.exec(deletion), /depend/)
    await db.exec('rollback')
    assert.equal((await db.query('select asm from public.budgets where id = 12')).rows[0].asm, 'Stored ASM')
    await db.exec('drop view public.keep_legacy_rsm')
    await db.exec(deletion)
    await db.exec(deletion)
    const remaining = await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('budgets', 'actuals', 'budget_import_staging', 'actual_import_staging') and (column_name in ('asm', 'rsm') or (table_name = 'actual_import_staging' and column_name = 'subregion'))`)
    assert.equal(remaining.rows.length, 0)
    assert.deepEqual((await db.query('select * from public.actual_import_staging')).rows[0], { id: 2, subregion_id: 9, kam: 'Actual KAM' })
    assert.deepEqual((await db.query('select * from public.budget_import_staging')).rows[0], { id: 1, kam: 'Budget KAM' })
    assert.equal((await update('Budgets', [{ ...budget, original: { ...budget.original, volume: 30 }, volume: 31 }])).rows[0].changed, 1)
    assert.equal((await update('Actuals', [{ ...actual, original: { ...actual.original, volume: 0 }, volume: 1 }])).rows[0].changed, 1)
  } finally {
    await db.close()
  }
})
