import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

let PGlite
for (const path of [process.env.PGLITE_MODULE,
  new URL('../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href,
  pathToFileURL(join(tmpdir(), 'feed-forecast-week-lock-sql-test/node_modules/@electric-sql/pglite/dist/index.js')).href].filter(Boolean)) {
  try { PGlite = (await import(path)).PGlite; break } catch { /* Optional isolated SQL engine. */ }
}

test('Budget and Actual infer missing subregions from KAM or customer', { skip: !PGlite }, async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create table users(full_name text, email text, position text, is_active boolean, region_id bigint, subregion_id bigint);
      create table subregions(id bigint primary key, region_id bigint);
      insert into subregions values (11,1),(12,1),(21,2);
      insert into users values
        ('Alice Smith','alice@example.com','KAM',true,1,11),
        ('Bob Jones','bob@example.com','KAM',true,1,12),
        ('Alice Smith','alice2@example.com','KAM',true,2,21),
        ('Duplicate Name','dup1@example.com','KAM',true,1,11),
        ('Duplicate Name','dup2@example.com','KAM',true,1,12),
        ('Inactive KAM','old@example.com','KAM',false,1,11),
        ('Manager A','manager@example.com','RSM',true,1,11),
        ('Wrong Area','wrong@example.com','KAM',true,1,21),
        ('No Area','none@example.com','KAM',true,1,null);
      create table customers(id bigint primary key, region_id bigint, salesman text);
      insert into customers values (1,1,'Alice Smith'),(2,1,'Bob Jones'),(3,2,'Alice Smith'),
        (4,1,'Vacant'),(5,1,'Duplicate Name');
      create table budgets(id bigint primary key, region_id bigint, customer_id bigint, kam text,
        subregion_id bigint references subregions(id), volume numeric);
      create table actuals(like budgets including all);
      insert into budgets values (1,1,1,null,null,100),(2,1,2,'Alice Smith',null,200),
        (3,1,4,'Vacant',null,300),(4,1,1,'Bob Jones',11,400);
      insert into actuals values (1,1,1,'  ALICE   SMITH  ',null,10),(2,1,2,null,null,20),
        (3,1,5,null,null,30),(4,1,1,'Unknown',12,40);
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611080010_infer_imported_volume_subregions.sql', import.meta.url), 'utf8'))
    const resolve = async (region, customer, kam) => (await db.query(
      'select resolve_volume_subregion($1,$2,$3) as value', [region, customer, kam])).rows[0].value
    const areas = async (table) => (await db.query(`select subregion_id from ${table} order by id`)).rows.map((r) => r.subregion_id)

    await t.test('backfills both tables and preserves existing assignments and totals', async () => {
      assert.deepEqual(await areas('budgets'), [11,11,null,11])
      assert.deepEqual(await areas('actuals'), [11,12,null,12])
      assert.equal((await db.query('select sum(volume) as total from budgets')).rows[0].total, '1000')
      assert.equal((await db.query('select sum(volume) as total from actuals')).rows[0].total, '100')
    })
    await t.test('matches normalized names or email within the row region', async () => {
      assert.equal(await resolve(1,null,'  ALICE   smith  '), 11)
      assert.equal(await resolve(1,null,'ALICE@EXAMPLE.COM'), 11)
      assert.equal(await resolve(2,null,'Alice Smith'), 21)
      assert.equal(await resolve(null,1,'Alice Smith'), null)
    })
    await t.test('uses customer salesman only when the imported KAM is blank or unknown', async () => {
      assert.equal(await resolve(1,1,null), 11)
      assert.equal(await resolve(1,1,'Unrecognized label'), 11)
      assert.equal(await resolve(1,1,'Bob Jones'), 12)
      assert.equal(await resolve(1,3,null), null)
    })
    await t.test('never guesses ambiguous or invalid KAM assignments', async () => {
      for (const kam of ['Duplicate Name','Inactive KAM','Manager A','Wrong Area','No Area','Vacant']) {
        assert.equal(await resolve(1,null,kam), null)
      }
      assert.equal(await resolve(1,1,'Duplicate Name'), null)
      assert.equal(await resolve(1,1,'No Area'), null)
    })
    await t.test('future inserts and corrections persist the resolved subregion in both tables', async () => {
      for (const table of ['budgets','actuals']) {
        await db.query(`insert into ${table}(id,region_id,customer_id,kam,volume) values (5,1,1,'Alice Smith',50),(6,1,4,'Vacant',60)`)
        assert.deepEqual((await areas(table)).slice(-2), [11,null])
        await db.query(`update ${table} set kam='Bob Jones' where id=6`)
        assert.equal((await areas(table)).at(-1), 12)
        await db.query(`update ${table} set kam='Alice Smith' where id=6`)
        assert.equal((await areas(table)).at(-1), 12)
      }
    })
    await t.test('internal KAM lookup is not exposed as an unrestricted user-directory RPC', async () => {
      await db.exec('set role authenticated')
      await assert.rejects(db.query("select resolve_volume_subregion(1,1,'Alice Smith')"), /permission denied/)
      await db.exec('reset role')
    })
    await t.test('automatic inference still respects the importing user row-level scope', async () => {
      for (const table of ['budgets','actuals']) {
        await db.exec(`alter table ${table} enable row level security;
          grant insert on ${table} to authenticated;
          create policy scoped_insert on ${table} for insert to authenticated with check (subregion_id=11);
          set role authenticated;`)
        await db.query(`insert into ${table}(id,region_id,customer_id,kam,volume) values (7,1,1,'Alice Smith',70)`)
        await assert.rejects(db.query(`insert into ${table}(id,region_id,customer_id,kam,volume) values (8,1,2,'Bob Jones',80)`), /row-level security/)
        await db.exec('reset role')
        assert.equal((await areas(table)).at(-1), 11)
      }
    })
  } finally { await db.close() }
})
