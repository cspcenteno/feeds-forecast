import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(await readFile(new URL('../app/api/admin/forecast-import/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function run(rows) {
  const module = { exports: {} }
  vm.runInNewContext(source, { exports: module.exports, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } }
    if (name === '@/lib/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) } }) }
    if (name === '@/lib/admin') return { supabaseAdmin: { from(table) {
      const result = { data: table === 'users' ? { role: 'Admin', is_active: true } : rows, error: null }
      return { select() { return this }, eq(field, id) {
        assert.equal(id, 'viewer')
        return table === 'users' ? { maybeSingle: async () => result } : Promise.resolve(result)
      } }
    } } }
    return {}
  } })
  return module.exports.POST({ json: async () => ({}) })
}

test('forecast imports require explicit saved view, add and import grants even for Admin', async () => {
  for (const rows of [[], [{ module: 'Sales Input', can_view: true, can_add: true }],
    [{ module: 'Forecasts', can_view: false, can_add: true }],
    [{ module: 'Forecasts', can_view: true, can_add: false, can_import: true }],
    [{ module: 'Forecasts', can_view: true, can_add: true }],
    [{ module: 'Forecasts', can_view: true, can_add: true, can_import: false }]]) {
    assert.equal((await run(rows)).status, 403)
  }
  // A granted request proceeds to payload validation.
  assert.equal((await run([{ module: 'Forecasts', can_view: true, can_add: true, can_import: true }])).status, 400)
})
