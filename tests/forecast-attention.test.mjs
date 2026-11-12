import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { savedPermissions } from '../lib/authorization-rules.ts'

const source = ts.transpileModule(await readFile(new URL('../app/api/forecast-attention/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function run({ role = 'User', position = 'KAM', region = 1, subregion = 11, active = true, signedIn = true, permitted = true, profileError = false, noSavedPermissions = false, extra = [] } = {}) {
  const profile = { id: 'viewer', role, position, region_id: region, subregion_id: subregion, is_active: active }
  const records = [
    { id: 1, customer_id: 1, user_id: 'viewer', region_id: 1, subregion_id: 11, status: 'Rejected', remarks: 'Correct quantity', returned_by: 'reviewer', returned_at: '2026-11-08T01:00:00Z' },
    { id: 2, user_id: 'other', status: 'Rejected', remarks: 'Private', returned_by: 'other-reviewer' },
    { id: 3, user_id: 'viewer', status: 'Draft' },
    { id: 4, submitted_by: 'kam-a', status: 'Pending', region_id: 1, subregion_id: 11 },
    { id: 5, submitted_by: 'kam-b', status: 'Pending', region_id: 1, subregion_id: 12 },
    { id: 6, endorsed_by: 'rsm-a', status: 'Endorsed', region_id: 1, subregion_id: 12 },
    { id: 7, endorsed_by: 'rsm-b', status: 'Endorsed', region_id: 2, subregion_id: 21 }, ...extra,
  ]
  function from(table, admin = false) {
    let rows = table === 'user_permissions' ? noSavedPermissions ? [] : ['Forecasts','Approvals'].map((module) => ({ user_id: 'viewer', module, can_view: permitted }))
      : table === 'users' ? admin ? [profile, { id: 'reviewer', full_name: 'Assigned RSM' }] : [profile] : records
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
  const client = { from: () => { throw new Error('Notification reads must use explicit server-side account scopes') }, auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'viewer' } : null } }) }, rpc: async () => { throw new Error('RPC not installed') } }
  const routeModule = { exports: {} }
  vm.runInNewContext(source, { exports: routeModule.exports, require: (name) => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } }
    if (name === '@/lib/server') return { createClient: async () => client }
    if (name === '@/lib/admin') return { supabaseAdmin: { from: (table) => from(table, true) } }
    if (name === '@/lib/authorization-rules') return { savedPermissions }
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

test('RSM receives returned forecasts from other owners only in the exact assigned area', async () => {
  const extra = [
    { id: 80, customer_id: 2, user_id: 'kam-a', region_id: 1, subregion_id: 11, status: 'Rejected', returned_by: 'reviewer', remarks: 'Revise volumes' },
    { id: 81, customer_id: 2, user_id: 'kam-a', region_id: 1, subregion_id: 11, status: 'Draft', returned_at: '2026-11-08T01:00:00Z' },
    { id: 82, user_id: 'viewer', region_id: 1, subregion_id: 12, status: 'Rejected' },
    { id: 83, user_id: 'kam-b', region_id: 2, subregion_id: 11, status: 'Rejected' },
    { id: 84, user_id: 'kam-a', region_id: 1, subregion_id: 11, status: 'Draft' },
    { id: 85, user_id: 'kam-a', region_id: 1, subregion_id: 11, status: 'Pending', returned_at: '2026-11-08T01:00:00Z' },
  ]
  const result = (await run({ role: 'Manager', position: ' rsm ', extra })).body
  assert.deepEqual(result.returned.map((row) => row.id), [1,80,81])
  assert.equal(result.returnedCustomers, 2)
  assert.equal(result.returned[1].reviewer, 'Assigned RSM')
  assert.equal(result.returned[1].remarks, 'Revise volumes')
  assert.deepEqual((await run({ extra })).body.returned.map((row) => row.id), [1,82])
})

test('RSM returned notifications require permissions and both assignment fields', async () => {
  for (const overrides of [{ region: null }, { subregion: null }, { permitted: false }, { noSavedPermissions: true }]) {
    const result = await run({ role: 'Manager', position: 'RSM', ...overrides })
    assert.deepEqual(result.body.returned, [])
    assert.equal(result.body.returnedCustomers, 0)
  }
})

test('RSM returned notifications paginate and count customers across all matching owners', async () => {
  const extra = Array.from({ length: 501 }, (_, index) => ({
    id: 100 + index, customer_id: 2, user_id: 'kam-a', region_id: 1, subregion_id: 11, status: 'Rejected',
  }))
  const result = (await run({ role: 'Manager', position: 'RSM', extra })).body
  assert.equal(result.returned.length, 502)
  assert.equal(result.returnedCustomers, 2)
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
  assert.deepEqual((await run({ permitted: false })).body, { returned: [], returnedCustomers: 0, pending: 0, endorsed: 0 })
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
      assert.equal(result.returned.length, role === 'Admin' ? 2 : 1)
    }
  }
})
test('Admin counts require saved permission rows', async () => {
  const response = await run({ role: 'Admin', noSavedPermissions: true })
  assert.equal(response.status, 200)
  assert.deepEqual([response.body.pending, response.body.endorsed], [0,0])
})

test('Admin returned badges include all owners and areas, deduplicate customers and persist until resubmission', async () => {
  const extra = [
    { id: 90, customer_id: 1, user_id: 'kam-a', region_id: 2, subregion_id: 21, status: 'Rejected' },
    { id: 91, customer_id: 2, user_id: 'kam-b', region_id: 3, subregion_id: 31, status: 'Draft', returned_at: '2026-11-11T01:00:00Z' },
    { id: 92, customer_id: 3, user_id: 'kam-c', region_id: 3, subregion_id: 31, status: 'Pending' },
    { id: 93, customer_id: 4, user_id: 'kam-c', region_id: 3, subregion_id: 31, status: 'Draft' },
  ]
  const result = (await run({ role:'Admin', region:null, subregion:null, extra })).body
  assert.deepEqual(result.returned.map(row => row.id),[1,2,90,91])
  assert.equal(result.returnedCustomers,3)
  assert.equal((await run({ role:'Admin', permitted:false, extra })).body.returnedCustomers,0)
  assert.equal((await run({ role:'Admin', active:false, extra })).status,403)
})
test('all roles receive no notification access when saved rows are absent', async () => {
  for (const [role, position, pending, endorsed, returned] of [
    ['Admin',null,0,0,0], ['Manager','RSM',0,0,0], ['Manager','ASM',0,0,0], ['Manager','NSM',0,0,0],
    ['Superuser','Supervisor',0,0,0], ['User','KAM',0,0,0],
  ]) {
    const { body, status } = await run({ role, position, noSavedPermissions: true })
    assert.equal(status, 200)
    assert.deepEqual([body.pending, body.endorsed, body.returned.length], [pending,endorsed,returned])
  }
})

test('RSM count tolerates position casing and stays inside the assigned area', async () => {
  const result = await run({ role: 'Manager', position: ' rsm ', extra: [
    { id: 90, status: 'Pending', region_id: 2, subregion_id: 11 },
    { id: 91, status: 'Pending', region_id: 1, subregion_id: 11 },
  ] })
  assert.equal(result.status, 200)
  assert.equal(result.body.pending, 2)
  assert.equal(result.body.endorsed, 0)
  assert.equal((await run({ role: 'Manager', position: 'RSM', permitted: false })).body.pending, 0)
})

test('badges count distinct people and customers across products, weeks and pages', async () => {
  const extra = Array.from({ length: 510 }, (_, i) => ({
    id: 100 + i, status: 'Pending', submitted_by: 'kam-a', region_id: 1, subregion_id: 11,
  }))
  assert.equal((await run({ role: 'Manager', position: 'RSM', extra })).body.pending, 1)
  assert.equal((await run({ role: 'Manager', position: 'ASM', extra: [
    { id: 80, status: 'Endorsed', endorsed_by: 'rsm-a', region_id: 1, subregion_id: 11 },
  ] })).body.endorsed, 1)
  const returned = (await run({ extra: [
    { id: 81, user_id: 'viewer', customer_id: 1, status: 'Rejected' },
    { id: 82, user_id: 'viewer', customer_id: 2, status: 'Rejected' },
    { id: 83, user_id: 'other', customer_id: 3, status: 'Rejected' },
  ] })).body
  assert.equal(returned.returned.length, 3)
  assert.equal(returned.returnedCustomers, 2)
})
