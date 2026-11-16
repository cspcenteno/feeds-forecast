import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { savedPermissions } from '../lib/authorization-rules.ts'

const source = ts.transpileModule(await readFile(new URL('../app/api/authorization/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function run({ role = 'User', active = true, signedIn = true, fail = false, rows = [] } = {}) {
  const reads = []
  const module = { exports: {} }
  vm.runInNewContext(source, { exports: module.exports, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, ...options, status: options?.status ?? 200 }) } }
    if (name === '@/lib/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'viewer' } : null } }) } }) }
    if (name === '@/lib/authorization-rules') return { savedPermissions }
    if (name === '@/lib/admin') return { supabaseAdmin: { from(table) {
      reads.push(table)
      const result = { data: table === 'users' ? { role, is_active: active, region_id: 1, subregion_id: 2 } : rows,
        error: fail && table === 'user_permissions' ? { message: 'Database unavailable' } : null }
      return { select() { return this }, eq(field, id) {
        assert.equal(field, table === 'users' ? 'id' : 'user_id')
        assert.equal(id, 'viewer')
        return table === 'users' ? { maybeSingle: async () => result } : Promise.resolve(result)
      } }
    } } }
    throw Error(name)
  } })
  return { response: JSON.parse(JSON.stringify(await module.exports.GET())), reads }
}

test('all reported roles load saved grants scoped to the verified account', async () => {
  for (const role of ['User', 'Manager', 'Superuser']) {
    const { response } = await run({ role, rows: [{ module: 'Dashboard', can_view: true }] })
    assert.equal(response.status, 200)
    assert.equal(response.body.permissions.Dashboard.view, true)
    assert.equal(response.body.permissions.Users.view, false)
    assert.equal(response.headers['Cache-Control'], 'private, no-store')
  }
})

test('missing and denied grants never become role defaults', async () => {
  for (const rows of [[], [{ module: 'Dashboard', can_view: false }]]) {
    assert.equal((await run({ role: 'Manager', rows })).response.body.permissions.Dashboard.view, false)
  }
})

test('unsigned and inactive accounts cannot read grants', async () => {
  const unsigned = await run({ signedIn: false })
  assert.equal(unsigned.response.status, 401)
  assert.deepEqual(unsigned.reads, [])
  const inactive = await run({ active: false })
  assert.equal(inactive.response.status, 403)
  assert.deepEqual(inactive.reads, ['users'])
})

test('permission lookup failures are errors, not empty grants', async () => {
  const { response } = await run({ fail: true })
  assert.equal(response.status, 500)
  assert.equal(response.body.permissions, undefined)
})

test('authorization returns the current explicit Export grant without granting Edit', async () => {
  for (const canExport of [true, false]) {
    const { response } = await run({ rows: [{ module: 'Weekly Sales', can_view: true, can_export: canExport, can_edit: false }] })
    assert.equal(response.status, 200)
    assert.equal(response.body.permissions['Weekly Sales'].export, canExport)
    assert.equal(response.body.permissions['Weekly Sales'].edit, false)
  }
})
