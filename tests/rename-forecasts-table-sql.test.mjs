import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../node_modules/.cache/forecast-visibility-sql/node_modules/@electric-sql/pglite/dist/index.js'

test('table rename preserves data, dependencies, RLS and grants and repairs function bodies', async () => {
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
        is_default boolean, updated_at timestamptz, unique(user_id,module),
        constraint user_permissions_module_check check(module in ('Forecast Input','Budget','Actual')));
      insert into user_permissions values (1,'Forecast Input',true,false,true,false,false,now());
      create table sales_forecasts(id bigint primary key, volume numeric);
      insert into sales_forecasts values (1,42);
      alter table sales_forecasts enable row level security;
      create policy forecast_view on sales_forecasts for select using (true);
      grant select on sales_forecasts to authenticated;
      create table linked_forecasts(forecast_id bigint references sales_forecasts(id));
      insert into linked_forecasts values (1);
      create view forecast_report as select * from sales_forecasts;
      create function get_forecasts() returns setof public.sales_forecasts
        language sql as $$ select * from public.sales_forecasts $$;
      create function revise_forecast() returns numeric language plpgsql as $$
        declare item public.sales_forecasts%rowtype;
        begin select * into item from public.sales_forecasts where id = 1;
        return item.volume; end $$;
      create table audit_logs(table_name text, module text);
      insert into audit_logs values ('sales_forecasts','Forecast Input');
      create function has_module_permission(text,text) returns boolean language sql as $$ select false $$;
      create function can_read_forecasts() returns boolean language sql as $$
        select public.has_module_permission('Forecast Input','view') $$;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611120011_plural_module_names.sql', import.meta.url), 'utf8'))
    const sql = await readFile(new URL('../supabase/migrations/202611120012_rename_forecasts_table.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    assert.equal((await db.query("select to_regclass('public.sales_forecasts') as old")).rows[0].old,null)
    assert.equal((await db.query('select volume::integer from get_forecasts()')).rows[0].volume,42)
    assert.equal((await db.query('select revise_forecast()::integer as volume')).rows[0].volume,42)
    assert.equal((await db.query('select volume::integer from forecast_report')).rows[0].volume,42)
    assert.equal((await db.query('select table_name from audit_logs')).rows[0].table_name,'forecasts')
    assert.equal((await db.query('select can_read_forecasts() as allowed')).rows[0].allowed,true)
    assert.equal((await db.query('select module from audit_logs')).rows[0].module,'Forecasts')
    assert.equal((await db.query("select relrowsecurity from pg_class where oid = 'forecasts'::regclass")).rows[0].relrowsecurity,true)
    await db.exec('set role authenticated')
    assert.equal((await db.query('select volume::integer from forecasts')).rows[0].volume,42)
    await db.exec('reset role')
    await assert.rejects(db.exec('insert into linked_forecasts values (999)'),/foreign key/)
  } finally { await db.close() }
})
