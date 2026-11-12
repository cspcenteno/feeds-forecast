import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('plural module migration preserves grants and legacy policy access and can be rerun', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns integer language sql as $$ select 1 $$;
      create table users(id integer primary key, is_active boolean);
      insert into users values (1,true);
      create table user_permissions(user_id integer, module text,
        can_view boolean, can_add boolean, can_edit boolean, can_delete boolean,
        is_default boolean, updated_at timestamptz,
        unique(user_id,module), constraint user_permissions_module_check
        check(module in ('Forecast Input','Forecast','Budget','Actual')));
      insert into user_permissions values
        (1,'Forecast Input',true,false,true,false,false,now()),
        (1,'Budget',false,false,false,false,false,now()),
        (1,'Actual',true,true,false,false,true,now());
      create table audit_logs(module text);
      insert into audit_logs values ('Forecast Input'),('Budget'),('Actual');
      create function module_default() returns text language sql as $$ select 'Forecast Input'::text $$;
      create function audit_change() returns trigger language plpgsql as $$ begin
        insert into audit_logs values (tg_argv[0]); return new; end $$;
      create trigger capture_audit_change after insert on users
        for each row execute function audit_change('Actual');
    `)
    const sql = await readFile(new URL('../supabase/migrations/202611120011_plural_module_names.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    assert.deepEqual((await db.query('select module,can_view,can_add,is_default from user_permissions order by module')).rows, [
      {module:'Actuals',can_view:true,can_add:true,is_default:true},
      {module:'Budgets',can_view:false,can_add:false,is_default:false},
      {module:'Forecasts',can_view:true,can_add:false,is_default:false},
    ])
    for (const name of ['Forecasts','Forecast','Forecast Input','Sales Input']) {
      assert.equal((await db.query('select has_module_permission($1, $2) as allowed',[name,'view'])).rows[0].allowed,true)
      assert.equal((await db.query('select has_module_permission($1, $2) as allowed',[name,'add'])).rows[0].allowed,false)
    }
    assert.equal((await db.query("select has_module_permission('Budget','view') as allowed")).rows[0].allowed,false)
    assert.equal((await db.query('select module_default() as module')).rows[0].module,'Forecasts')
    await db.exec('insert into users values (2,true)')
    assert.equal((await db.query("select count(*)::integer as count from audit_logs where module = 'Actuals'")).rows[0].count,2)
  } finally { await db.close() }
})
