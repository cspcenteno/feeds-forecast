// Optional isolated PostgreSQL integration tests. Install @electric-sql/pglite
// under the temp directory feed-forecast-week-lock-sql-test, or set PGLITE_MODULE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

let PGlite
try {
  const modulePath = process.env.PGLITE_MODULE ?? pathToFileURL(join(tmpdir(), 'feed-forecast-week-lock-sql-test/node_modules/@electric-sql/pglite/dist/index.js')).href
  PGlite = (await import(modulePath)).PGlite
} catch { /* The SQL suite is optional when the isolated engine is unavailable. */ }

test('automatic week-lock migration and database enforcement', { skip: !PGlite }, async (t) => {
  const db = new PGlite()
  const admin = '00000000-0000-0000-0000-000000000001'
  const user = '00000000-0000-0000-0000-000000000002'
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.users(id uuid primary key, role text, position text, is_active boolean, full_name text, email text, region_id bigint, subregion_id bigint);
    insert into public.users values ('${admin}', 'Admin', null, true, 'Admin A', 'admin@example.com', null, null), ('${user}', 'User', 'KAM', true, 'KAM A', 'kam@example.com', 1, 2);
    create table public.user_permissions(user_id uuid, module text, can_view boolean, can_add boolean, can_edit boolean, can_delete boolean);
    create table public.week_locks(id bigint generated always as identity primary key, year integer, week integer, status text, locked_by uuid references public.users(id), locked_at timestamptz, created_at timestamptz default now());
    insert into public.week_locks(year, week, status) values (2020, 1, 'Open'), (2020, 2, 'Locked');
    create table public.sales_forecasts(id bigint generated always as identity primary key, year integer, week integer, region_id bigint, subregion_id bigint, customer_id bigint, category_id bigint, product_id bigint, forecast numeric, volume numeric, status text, user_id uuid, kam text, remarks text, updated_at timestamptz, submitted_by uuid, submitted_at timestamptz, endorsed_by uuid, endorsed_at timestamptz, approved_by uuid, approved_at timestamptz, returned_by uuid, returned_at timestamptz);
    insert into public.sales_forecasts(year, week, status, user_id, volume) values (2020, 1, 'Draft', '${admin}', 10), (2020, 3, 'Pending', '${admin}', 20);
    create function public.forecast_workflow_permission(text, text) returns boolean language sql as $$ select true $$;
    grant insert, update, delete, select on public.week_locks to authenticated;
    grant insert, update, delete, select on public.sales_forecasts to service_role;
    grant usage, select on sequence public.sales_forecasts_id_seq to service_role;
    select set_config('request.jwt.claim.sub', '${admin}', false);
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/202610270034_admin_standard_forecast_review.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/202611070007_automatic_forecast_week_locks.sql', import.meta.url), 'utf8'))
  const period = async (offset) => (await db.query(`select extract(isoyear from d)::int as year, extract(week from d)::int as week from (select date_trunc('week', now() at time zone 'Asia/Manila')::date + $1::int * 7 as d) x`, [offset])).rows[0]
  const isOpen = async (offset) => { const p = await period(offset); return (await db.query('select public.forecast_week_is_open($1, $2) value', [p.year, p.week])).rows[0].value }
  try {
    await t.test('generates valid ISO calendars and automatically closes old or distant weeks', async () => {
      assert.equal(await isOpen(0), true)
      assert.equal(await isOpen(4), true)
      assert.equal(await isOpen(-1), false)
      assert.equal(await isOpen(5), false)
      assert.equal((await db.query('select public.forecast_week_is_open(2020,1) value')).rows[0].value, false)
      const calendar = (await db.query('select public.get_forecast_week_calendar(2026) value')).rows[0].value
      assert.equal(calendar.weeks.length, 53)
      assert.equal(calendar.weeks[0].start_date, '2025-12-29')
      assert.equal((await db.query('select public.get_forecast_week_calendar(2025) value')).rows[0].value.weeks.length, 52)
      await assert.rejects(db.query('select public.forecast_week_start(2025,53)'), /Invalid ISO/)
    })
    await t.test('requires a reason, audits reopening, and honors expired exceptions', async () => {
      await assert.rejects(db.query("select public.manage_forecast_weeks('range', p_from := '2019-12-30', p_to := '2019-12-30', p_status := 'Open', p_reason := '')"), /reason/)
      await db.query("select public.manage_forecast_weeks('range', p_from := '2019-12-30', p_to := '2019-12-30', p_status := 'Open', p_reason := 'Historical correction', p_expires_at := now() + interval '1 day')")
      assert.equal((await db.query('select public.forecast_week_is_open(2020,1) value')).rows[0].value, true)
      const audit = (await db.query("select actor_id, reason from public.forecast_week_audit where action='range' order by id desc limit 1")).rows[0]
      assert.equal(audit.actor_id, admin)
      assert.equal(audit.reason, 'Historical correction')
      await db.query("update public.week_locks set override_expires_at = now() - interval '1 second' where year=2020 and week=1")
      assert.equal((await db.query('select public.forecast_week_is_open(2020,1) value')).rows[0].value, false)
    })
    await t.test('non-Admins and direct authenticated writes cannot change locks', async () => {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user])
      await assert.rejects(db.query("select public.manage_forecast_weeks('generate', p_year := 2025)"), /Only active Admin/)
      await db.exec('set role authenticated')
      await assert.rejects(db.query("insert into public.week_locks(year,week,status) values (2025,1,'Open')"), /permission denied/)
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin])
    })
    await t.test('blocks locked imports even for service_role and protects existing data', async () => {
      await db.exec('set role service_role')
      try {
      await assert.rejects(db.query("insert into public.sales_forecasts(year,week,status,user_id) values (2020,1,'Draft',$1)", [admin]), /locked/)
      await assert.rejects(db.query('update public.sales_forecasts set volume=99 where id=1'), /locked/)
      await assert.rejects(db.query('delete from public.sales_forecasts where id=1'), /locked/)
      const p = await period(0)
      await db.query("insert into public.sales_forecasts(year,week,status,user_id) values ($1,$2,'Draft',$3)", [p.year, p.week, admin])
      } finally { await db.exec('reset role') }
      assert.equal((await db.query('select volume from public.sales_forecasts where id=1')).rows[0].volume, '10')
    })
    await t.test('submission uses effective locks while reviews can finish after closure', async () => {
      const definition = (await db.query("select pg_get_functiondef('public.transition_forecast_review(bigint[],text,text)'::regprocedure) value")).rows[0].value
      assert.match(definition, /forecast_week_is_open/)
      await assert.rejects(db.query("select public.transition_forecast_review(array[1]::bigint[], 'submit')"), /locked|outside/)
      assert.equal((await db.query("select public.transition_forecast_review(array[2]::bigint[], 'endorse') value")).rows[0].value, 1)
    })
    await t.test('policy changes, bulk historical closing, reset and generation are audited', async () => {
      await db.query("select public.manage_forecast_weeks('policy', p_reason := 'Shorter horizon', p_ahead := 2)")
      assert.equal(await isOpen(2), true)
      assert.equal(await isOpen(3), false)
      await db.query("select public.manage_forecast_weeks('range', p_from := '2019-12-30', p_to := '2019-12-30', p_status := 'Open', p_reason := 'One correction')")
      await db.query("select public.manage_forecast_weeks('lock_before', p_from := current_date, p_reason := 'Close history')")
      assert.equal((await db.query('select public.forecast_week_is_open(2020,1) value')).rows[0].value, false)
      await db.query("select public.manage_forecast_weeks('reset', p_from := '2019-12-30', p_to := '2019-12-30', p_reason := 'Use automatic policy')")
      assert.equal((await db.query('select is_override from public.week_locks where year=2020 and week=1')).rows[0].is_override, false)
      await db.query("select public.manage_forecast_weeks('generate', p_year := 2025)")
      assert.equal((await db.query('select count(*)::int count from public.week_locks where year=2025')).rows[0].count, 52)
      assert.ok((await db.query('select count(*)::int count from public.forecast_week_audit')).rows[0].count >= 7)
    })
  } finally { await db.close() }
})
