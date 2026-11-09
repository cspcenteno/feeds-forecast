import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('audit triggers capture changes and enforce read-only Admin access', async () => {
  const db = new PGlite()
  const admin = '00000000-0000-0000-0000-000000000001'
  const user = '00000000-0000-0000-0000-000000000002'
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.users(id uuid primary key, full_name text, role text, is_active boolean);
      insert into users values ('${admin}', 'Admin Person', 'Admin', true), ('${user}', 'Normal User', 'User', true);
      grant select on users to authenticated;
      create table public.user_permissions(user_id uuid, module text check (module in ('Users')), can_view boolean default true);
      grant select on user_permissions to authenticated;
      create table public.actual_import_staging(id bigint primary key, volume text, password text);
      select set_config('request.jwt.claim.sub', '${admin}', false);
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611090003_audit_logs.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into actual_import_staging values (1, '10', 'sensitive'); update actual_import_staging set volume = '20' where id = 1; update actual_import_staging set volume = '20' where id = 1; delete from actual_import_staging where id = 1;`)
    const { rows } = await db.query('select * from audit_logs order by id')
    assert.deepEqual(rows.map((row) => row.action), ['INSERT', 'UPDATE', 'DELETE'])
    assert.equal(rows[0].actor_name, 'Admin Person')
    assert.equal(rows[0].module, 'Actual')
    assert.equal(rows[0].record_id, '1')
    assert.deepEqual(rows[1].changed_fields, ['volume'])
    assert.ok(!JSON.stringify(rows).includes('sensitive'))
    assert.ok(!rows[0].changed_fields.includes('password'))
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from audit_logs')).rows.length, 3)
    await assert.rejects(db.exec('delete from audit_logs'), /permission denied/)
    await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false)`)
    assert.equal((await db.query('select * from audit_logs')).rows.length, 0)
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); insert into actual_import_staging values (2, '30', null)`)
    assert.equal((await db.query('select actor_name from audit_logs order by id desc limit 1')).rows[0].actor_name, 'System / service')
    await db.exec(`insert into user_permissions(user_id, module, can_view) values ('${admin}', 'Audit Logs', false)`)
    await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false); set role authenticated`)
    assert.equal((await db.query('select * from audit_logs')).rows.length, 0)
  } finally { await db.close() }
})
