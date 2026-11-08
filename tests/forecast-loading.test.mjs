import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../app/(authenticated)/forecast-input/page.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function loadFunction(name, dependencies, sourceTree = tree) {
  let text
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) text = node.getText(sourceTree)
    ts.forEachChild(node, visit)
  }
  visit(sourceTree)
  assert.ok(text, name)
  const compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return Function(...Object.keys(dependencies), compiled + ';return ' + name)(...Object.values(dependencies))
}
const noop = () => {}
const pending = new Promise(() => {})
async function promptly(promise) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Loader waited for background references')), 1000) })]) }
  finally { clearTimeout(timer) }
}

test('saved forecast rows render without waiting for Actual references', async () => {
  const rows = [{ id: 1, year: 2026, customer_id: 2, region_id: 1 }]
  let loaded, busy, referencesStarted = false
  const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: rows, error: null }) }
  const load = loadFunction('loadForecasts', {
    supabase: { from: () => query }, PAGE_SIZE: 1000, setSavedError: noop,
    setSavedTableLoading: (value) => { busy = value }, setForecasts: (value) => { loaded = value },
    window: { dispatchEvent: noop }, Event,
    loadSavedActualReferences: () => { referencesStarted = true; return pending },
  })
  await promptly(load('owner'))
  assert.deepEqual(loaded, rows)
  assert.equal(busy, false)
  assert.equal(referencesStarted, true)
})

test('basic lookups start together and do not wait for Budget references', async () => {
  const started = new Set(), releases = []
  const supabase = { from: (table) => {
    started.add(table)
    const query = { select: () => query, eq: () => query, order: () => query,
      then: (resolve) => new Promise((release) => releases.push(() => release({ data: [], error: null }))).then(resolve) }
    return query
  } }
  let budgetStarted = false
  const load = loadFunction('loadInitialData', {
    supabase, loadBudgetReferences: () => { budgetStarted = true; return pending },
    fetch: async () => ({ ok: true, json: async () => ({ customers: [], restricted: true }) }),
    setError: noop, setRegions: noop, setSubregions: noop, setCategories: noop,
    setCustomers: noop, setCustomerAssignmentRestricted: noop, setProducts: noop,
  })
  const result = load()
  await new Promise(setImmediate)
  assert.deepEqual([...started].sort(), ['categories','products','regions','subregions'])
  assert.equal(releases.length, 4)
  assert.equal(budgetStarted, true)
  releases.forEach((release) => release())
  await promptly(result)
})

test('older Actual reference responses cannot replace the latest data', async () => {
  const releases = []
  const savedActualRequest = { current: 0 }
  let result
  const load = loadFunction('loadSavedActualReferences', {
    supabase: {}, savedActualRequest, setSavedActualsLoading: noop, setSavedActualsError: noop,
    setSavedActualRecords: (value) => { result = value }, setSavedError: noop,
    loadActualRecords: () => new Promise((resolve) => releases.push(resolve)),
  })
  const records = [{ year: 2026, region_id: 1, customer_id: 1 }]
  const first = load(records), second = load(records)
  releases[1]({ data: ['latest'], error: null }); await second
  releases[0]({ data: ['outdated'], error: null }); await first
  assert.deepEqual(result, ['latest'])
})

test('saved forecast week checks do not change the Add Forecast lock notice', async () => {
  const formChanges = []
  const check = loadFunction('checkWeekLock', {
    year: 2026, week: 46, supabase: {},
    setCheckingWeekLock: (value) => formChanges.push(value),
    setWeekStatus: (value) => formChanges.push(value),
    setError: noop, setSavedError: noop,
    loadForecastWeekStates: async () => [{ status: 'Locked' }],
  })
  assert.equal(await check(2026,45,'saved'), true)
  assert.deepEqual(formChanges, [])
  assert.equal(await check(2026,46), true)
  assert.deepEqual(formChanges, [true,'Locked',false])
})

test('Approvals and Weekly Sales rows do not wait for monthly reference RPCs', async () => {
  const salesSource = await readFile(new URL('../components/sales-submissions-page.tsx', import.meta.url), 'utf8')
  const salesTree = ts.createSourceFile('sales.tsx', salesSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  for (const weekly of [false,true]) {
    let records, referenceLoading
    const profile = { role: 'Manager', position: 'RSM', is_active: true, region_id: 1, subregion_id: 2 }
    const record = { id: 1, year: 2026, week: 45, region_id: 1, subregion_id: 2, customer_id: 3, submitted_by: 'kam' }
    function query(data, deferred = false) {
      const q = { select: () => q, eq: () => q, in: () => q, order: () => q, range: () => q, abortSignal: () => q,
        single: async () => ({ data: profile, error: null }),
        then: (resolve) => deferred ? pending.then(resolve) : Promise.resolve({ data, error: null }).then(resolve) }
      return q
    }
    const setters = Object.fromEntries([...new Set(salesSource.match(/\bset[A-Z]\w+/g))].map((name) => [name,noop]))
    const load = loadFunction('fetchSalesData', {
      ...setters, weekly, referenceRequest: { current: 0 },
      setSales: (value) => { records = value }, setReferencesLoading: (value) => { referenceLoading = value },
      window: { dispatchEvent: noop }, Event, AbortSignal,
      supabase: {
        auth: { getUser: async () => ({ data: { user: { id: 'manager' } } }) },
        from: (table) => query(table === 'sales_forecasts' ? [record] : []),
        rpc: (name) => name === 'get_forecast_review_queue' ? query([record]) : query([], name !== 'get_weekly_sales_reviewer_names'),
      },
    }, salesTree)
    await promptly(load())
    assert.deepEqual(records, [record])
    assert.equal(referenceLoading, true)
  }
})
