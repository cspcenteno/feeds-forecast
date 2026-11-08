import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { defaultPermissions } from '../lib/authorization-rules.ts'

const source = ts.transpileModule(await readFile(new URL('../app/api/forecast-attention/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function run({ role = 'User', position = 'KAM', region = 1, subregion = 11, active = true, signedIn = true, permitted = true, profileError = false, noSavedPermissions = false, extra = [] } = {}) {
  const profile = { id: 'viewer', role, position, region_id: region, subregion_id: subregion, is_active: active }
  const records = [
    { id: 1, user_id: 'viewer', status: 'Rejected', remarks: 'Correct quantity', returned_by: 'reviewer', returned_at: '2026-11-08T01:00:00Z' },
    { id: 2, user_id: 'other', status: 'Rejected', remarks: 'Private', returned_by: 'other-reviewer' },
    { id: 3, user_id: 'viewer', status: 'Draft' },
    { id: 4, status: 'Pending', region_id: 1, subregion_id: 11 },
    { id: 5, status: 'Pending', region_id: 1, subregion_id: 12 },
    { id: 6, status: 'Endorsed', region_id: 1, subregion_id: 12 },
    { id: 7, status: 'Endorsed', region_id: 2, subregion_id: 21 }, ...extra,
  ]
  function from(table, admin = false) {
    let rows = table === 'user_permissions' ? noSavedPermissions ? [] : ['Forecast Input','Approvals'].map((module) => ({ user_id: 'viewer', module, can_view: permitted }))
      : table === 'users' ? admin ? [{ id: 'reviewer', full_name: 'Assigned RSM' }] : [profile] : records
    let head = false, cap = Infinity
    const q = {
      select: (_columns, options) => { head = options?.head; return q },
      eq: (field, value) => { rows = rows.filter((r) => r[field] === value); return q },
      or: () => { rows = rows.filter((r) => r.status === 'Rejected' || (r.status === 'Draft' && r.returned_at != null)); return q },
      gt: (field, value) => { rows = rows.filter((r) => r[field] > value); return q },
      in: (field, values) => { rows = rows.filter((r) => values.includes(r[field])); return q },
      order: (field) => { rows = [...rows].sort((a,b) => a[field] > b[field] ? 1 : -1); return q },
      limit: (value) => { cap = value; return q },
      abortSignal: () => q,
      single: async () => ({ data: profileError ? null : rows[0], error: profileError ? { message: 'Temporary database failure' } : null }),
      then: (resolve) => Promise.resolve({ data: head ? null : rows.slice(0, cap), count: rows.length, error: null }).then(resolve),
    }
    return q
  }
  const client = { from, auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'viewer' } : null } }) }, rpc: async () => { throw new Error('RPC not installed') } }
  const routeModule = { exports: {} }
  vm.runInNewContext(source, { exports: routeModule.exports, require: (name) => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } }
    if (name === '@/lib/server') return { createClient: async () => client }
    if (name === '@/lib/admin') return { supabaseAdmin: { from: (table) => from(table, true) } }
    if (name === '@/lib/authorization-rules') return { defaultPermissions }
    throw new Error(name)
  }, AbortSignal, Map, Set })
  return JSON.parse(JSON.stringify(await routeModule.exports.GET()))
}

test('returned notifications contain only the signed-in owner records and reviewer details', async () => {
  const { body } = await run()
  assert.equal(body.returned.length, 1)
  assert.equal(body.returned[0].reviewer, 'Assigned RSM')
  assert.equal(body.returned[0].remarks, 'Correct quantity')
  assert.equal(body.pending + body.endorsed, 0)
})
test('RSM pending and ASM endorsed badges follow their assignments', async () => {
  const rsm = (await run({ role: 'Manager', position: 'RSM' })).body
  assert.deepEqual([rsm.pending, rsm.endorsed], [1,0])
  const asm = (await run({ role: 'Manager', position: 'ASM' })).body
  assert.deepEqual([asm.pending, asm.endorsed], [0,1])
  const admin = (await run({ role: 'Admin' })).body
  assert.deepEqual([admin.pending, admin.endorsed], [2,2])
})
test('permissions and missing assignments do not produce actionable badges', async () => {
  assert.deepEqual((await run({ permitted: false })).body, { returned: [], pending: 0, endorsed: 0 })
  assert.equal((await run({ role: 'Manager', position: 'RSM', subregion: null })).body.pending, 0)
  assert.equal((await run({ role: 'Manager', position: 'ASM', region: null })).body.endorsed, 0)
  assert.equal((await run({ signedIn: false })).status, 401)
  assert.equal((await run({ active: false })).status, 403)
})
test('returned counts include every page and exclude new Drafts', async () => {
  const extra = Array.from({ length: 501 }, (_,i) => ({ id: i+10, user_id: 'viewer', status: 'Rejected', returned_by: null }))
  assert.equal((await run({ extra })).body.returned.length, 502)
})
test('opening a notice does not clear it; revised drafts remain until resubmission', async () => {
  const extra = [
    { id: 10, user_id: 'viewer', status: 'Draft', returned_at: '2026-11-08T01:00:00Z' },
    { id: 11, user_id: 'viewer', status: 'Pending', returned_at: null },
    { id: 12, user_id: 'viewer', status: 'Approved', returned_at: null },
  ]
  for (let navigation = 0; navigation < 2; navigation++) {
    assert.deepEqual((await run({ extra })).body.returned.map((r) => r.id), [1,10])
  }
})
test('temporary profile failures are retryable for every role', async () => {
  for (const [role, position] of [['Admin', null], ['Manager','RSM'], ['Manager','ASM'], ['Superuser','Supervisor'], ['User','KAM']]) {
    assert.equal((await run({ role, position, profileError: true })).status, 500)
    assert.equal((await run({ role, position })).status, 200)
  }
})
test('all roles retain only their applicable badges across repeated navigation requests', async () => {
  for (const [role, position, pending, endorsed] of [['Admin',null,2,2], ['Manager','RSM',1,0], ['Manager','ASM',0,1], ['Superuser','Supervisor',0,0], ['User','KAM',0,0]]) {
    for (let navigation = 0; navigation < 2; navigation++) {
      const result = (await run({ role, position })).body
      assert.deepEqual([result.pending, result.endorsed], [pending,endorsed])
      assert.equal(result.returned.length, 1)
    }
  }
})
test('Admin counts work without a permission RPC or saved permission rows', async () => {
  const response = await run({ role: 'Admin', noSavedPermissions: true })
  assert.equal(response.status, 200)
  assert.deepEqual([response.body.pending, response.body.endorsed], [2,2])
})
test('all roles use their default permissions when saved rows are absent', async () => {
  for (const [role, position, pending, endorsed, returned] of [
    ['Admin',null,2,2,1], ['Manager','RSM',1,0,0], ['Manager','ASM',0,1,0],
    ['Superuser','Supervisor',0,0,0], ['User','KAM',0,0,1],
  ]) {
    const { body, status } = await run({ role, position, noSavedPermissions: true })
    assert.equal(status, 200)
    assert.deepEqual([body.pending, body.endorsed, body.returned.length], [pending,endorsed,returned])
  }
})
