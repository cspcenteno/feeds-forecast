import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import * as CFB from 'cfb'
import { buildWeeklySalesExport, loadWeeklySalesExportReferences, weeklySalesExportFilename } from '../lib/weekly-sales-export.ts'

const input = {
  sales: [
    { year: 2026, week: 47, region_id: 1, subregion_id: 2, product_id: 3, forecast: 25, volume: 12.5, asm_name: 'ASM & Co', endorsed_by: 'rsm' },
    { year: 2026, week: 47, region_id: 1, subregion_id: 4, product_id: 3, forecast: 14, volume: 7 },
    { year: 2027, week: 1, region_id: 1, subregion_id: 2, product_id: 5, forecast: 4, volume: 2 },
    { year: 2027, week: 1, region_id: 1, subregion_id: null, product_id: null, forecast: 6, volume: 3 },
  ],
  regions: [{ id: 1, name: 'VISAYAS' }], subregions: [{ id: 2, name: 'ILOILO' }, { id: 4, name: 'NEGROS' }],
  products: [{ id: 3, code: '010AP203', name: 'Creep' }, { id: 5, code: 'NEW-1', name: 'New feed' }],
  users: { rsm: 'RSM <One>' },
}

test('Weekly Sales filenames use role scope and the selected date range', () => {
  const report = { ...input, fromWeek: '2026-W45', toWeek: '2026-W49', regions: [{ id: 1, name: 'LUZON' }], subregions: [{ id: 2, name: 'SOUTH LUZON' }] }
  const scope = { userId: 'kam', viewerName: 'ALEX A. MAGUA', regionId: 1, subregionId: 2 }
  const name = level => weeklySalesExportFilename({ ...report, weeklyScope: { ...scope, level } })
  assert.equal(name('kam'), 'Alex A. Magua - Weekly Sales (Nov 2 - Dec 6, 2026).xlsx')
  assert.equal(name('subregion'), 'South Luzon - Weekly Sales (Nov 2 - Dec 6, 2026).xlsx')
  assert.equal(name('region'), 'Luzon - Weekly Sales (Nov 2 - Dec 6, 2026).xlsx')
  assert.equal(name('all'), 'All Regions - Weekly Sales (Nov 2 - Dec 6, 2026).xlsx')
  assert.equal(weeklySalesExportFilename(report), name('region'))
  const crossing = weeklySalesExportFilename({ ...report, fromWeek: '2026-W53', toWeek: '2027-W01', weeklyScope: { ...scope, level: 'kam' } })
  assert.equal(crossing, 'Alex A. Magua - Weekly Sales (Dec 28, 2026 - Jan 10, 2027).xlsx')
})

test('Weekly Sales sheets follow KAM, RSM, ASM and NSM scopes and keep Supervisor unchanged', () => {
  const report = { ...input, fromWeek: '2026-W47', toWeek: '2026-W47',
    regions: [...input.regions, { id: 9, name: 'LUZON' }, { id: 99, name: 'EMPTY REGION' }],
    subregions: [{ id: 2, name: 'ILOILO', region_id: 1 }, { id: 4, name: 'NEGROS', region_id: 1 }, { id: 91, name: 'NORTH LUZON', region_id: 9 }, { id: 5, name: 'EMPTY SUBREGION', region_id: 1 }],
    users: { a: 'KAM A', b: 'KAM B', c: 'KAM C', rsm: 'RSM One' },
    sales: [
      { ...input.sales[0], user_id: 'a', submitted_by: 'rsm' },
      { ...input.sales[0], user_id: 'b', submitted_by: 'rsm', volume: 5 },
      { ...input.sales[1], user_id: 'c' },
      { ...input.sales[0], region_id: 9, subregion_id: 91, user_id: 'other', volume: 99 },
    ],
    budgets: [{ year: 2026, month: 11, region_id: 1, subregion_id: 2, customer_id: null, product_id: 3, volume: 80, kam_id: 'a' },
      { year: 2026, month: 11, region_id: 1, subregion_id: 2, customer_id: null, product_id: 3, volume: 20, kam_id: 'b' }],
    actuals: [{ actual_date: '2026-11-16', region_id: 1, subregion_id: 2, product_id: 3, volume: 15, kam_id: 'a' },
      { actual_date: '2026-11-16', region_id: 1, subregion_id: 2, product_id: 3, volume: 10, kam_id: 'b' }],
  }
  const build = weeklyScope => XLSX.read(buildWeeklySalesExport({ ...report, weeklyScope }), { type: 'array' })
  const scope = { userId: 'a', regionId: 1, subregionId: 2, viewerName: 'KAM A' }
  const kam = build({ ...scope, level: 'kam' })
  assert.deepEqual(kam.SheetNames, ['KAM A'])
  assert.equal(kam.Sheets['KAM A'].A3.v, 'KAM:')
  assert.equal(kam.Sheets['KAM A'].B3.v, 'KAM A')
  assert.equal(kam.Sheets['KAM A'].A4.v, 'SUBREGION:')
  assert.equal(kam.Sheets['KAM A'].B4.v, 'ILOILO')
  assert.equal(kam.Sheets['KAM A'].A5, undefined)
  const missingAssignments = XLSX.read(buildWeeklySalesExport({ ...report, users: {},
    weeklyScope: { ...scope, level: 'kam', subregionId: null, viewerName: '' },
  }), { type: 'array' }).Sheets.KAM
  assert.equal(missingAssignments.B3.v, 'Unassigned')
  assert.equal(missingAssignments.B4.v, 'Unassigned')
  assert.equal(kam.Sheets['KAM A'].D8.v, 12.5)
  assert.equal(kam.Sheets['KAM A'].C8.v, 80)
  assert.equal(kam.Sheets['KAM A'].F8.v, 15)
  const rsm = build({ ...scope, level: 'subregion', userId: 'rsm', viewerName: 'RSM One' })
  assert.deepEqual(rsm.SheetNames, ['ILOILO', 'KAM A', 'KAM B'])
  assert.equal(rsm.Sheets.ILOILO.D8.v, 17.5)
  assert.equal(rsm.Sheets['KAM B'].D8.v, 5)
  assert.equal(rsm.Sheets['KAM B'].C8.v, 20)
  assert.equal(rsm.Sheets['KAM B'].F8.v, 10)
  const allKams = XLSX.read(buildWeeklySalesExport({ ...report,
    weeklyScope: { ...scope, level: 'subregion' }, kamAssignments: [
      { id: 'idle', full_name: 'KAM without forecasts', region_id: 1, subregion_id: 2 },
      { id: 'foreign', full_name: 'Outside assigned area', region_id: 1, subregion_id: 4 },
    ],
  }), { type: 'array' })
  assert.deepEqual(allKams.SheetNames, ['ILOILO', 'KAM A', 'KAM B'])
  const asm = XLSX.read(buildWeeklySalesExport({ ...report, asmNames: { 1: 'Assigned ASM' }, rsmNames: { '1:2': 'Assigned RSM' },
    weeklyScope: { ...scope, level: 'region' },
  }), { type: 'array' })
  assert.deepEqual(asm.SheetNames, ['VISAYAS', 'ILOILO', 'NEGROS'])
  assert.equal(asm.Sheets.ILOILO.A3.v, 'RSM:')
  assert.equal(asm.Sheets.ILOILO.B3.v, 'Assigned RSM')
  assert.equal(asm.Sheets.ILOILO.A4.v, 'ASM:')
  assert.equal(asm.Sheets.ILOILO.B4.v, 'Assigned ASM')
  assert.equal(asm.Sheets.ILOILO.A5.v, 'SUBREGION:')
  assert.equal(asm.Sheets.ILOILO.B5.v, 'ILOILO')
  const nsm = build({ ...scope, level: 'all', regionId: null })
  assert.deepEqual(nsm.SheetNames, ['VISAYAS', 'ILOILO', 'NEGROS', 'LUZON', 'NORTH LUZON'])
  assert.equal(nsm.Sheets.LUZON.D8.v, 99)
  for (const weeklyScope of [undefined, ...['kam', 'subregion', 'region', 'all'].map(level => ({ ...scope, level }))]) {
    assert.throws(() => buildWeeklySalesExport({ ...report, sales: [], weeklyScope }), /No Weekly Sales/)
    const zero = XLSX.read(buildWeeklySalesExport({ ...report, sales: [{ ...report.sales[0], forecast: 0, volume: 0 }], weeklyScope }), { type: 'array' })
    assert.ok(zero.SheetNames.length > 0)
    assert.ok(zero.SheetNames.every(name => !/EMPTY|without forecasts/.test(name)))
    assert.equal(zero.Sheets[zero.SheetNames[0]].D8.v, 0)
    assert.equal(zero.Sheets[zero.SheetNames[0]].C8.v, weeklyScope?.level === 'kam' ? 80 : 100)
    assert.throws(() => buildWeeklySalesExport({ ...report, fromWeek: '2026-W48', toWeek: '2026-W48', weeklyScope }), /No Weekly Sales/)
  }
  assert.deepEqual(build(undefined).SheetNames, ['VISAYAS', 'ILOILO', 'NEGROS', 'LUZON', 'NORTH LUZON'])
  assert.throws(() => build({ ...scope, level: 'subregion', subregionId: null }), /assigned/)
})

test('Weekly Sales and Approvals forecast columns use 50kg volume instead of quantity', () => {
  const sales = [
    { ...input.sales[0], year: 2026, week: 50, forecast: 2, volume: 1 },
    { ...input.sales[0], year: 2026, week: 50, forecast: 35, volume: 35 },
    { ...input.sales[0], year: 2026, week: 50, forecast: 99, volume: null },
  ]
  for (const reportType of [undefined, 'approvals']) {
    const workbook = XLSX.read(buildWeeklySalesExport({ ...input, sales, reportType }), { type: 'array' })
    for (const sheet of Object.values(workbook.Sheets)) {
      assert.equal(sheet.D8.v, 36)
      assert.equal(sheet.E8.v, 36)
      assert.equal(sheet.D9.v, 36)
      assert.equal(sheet.D10.v, 36)
    }
  }
})

test('approval workbooks enforce ASM region and RSM subregion with KAM sheets and complete owned references', () => {
  const report = { ...input, reportType: 'approvals', fromWeek: '2026-W47', toWeek: '2026-W47',
    sales: [...input.sales.map(sale => ({ ...sale, submitted_by: 'kam' })), { year: 2026, week: 47, region_id: 99, subregion_id: 99, product_id: 3, forecast: 999, volume: 999 }],
    users: { ...input.users, kam: 'Alex' }, asmNames: { 1: 'Regional ASM' },
    budgets: [{ year: 2026, month: 11, region_id: 1, subregion_id: 2, customer_id: 123, product_id: 3, volume: 80, kam_id: 'kam' }, { year: 2026, month: 11, region_id: 1, subregion_id: 2, customer_id: 456, product_id: 3, volume: 20, kam_id: 'other' }],
    actuals: [{ actual_date: '2026-11-16', region_id: 1, subregion_id: 2, product_id: 3, volume: 15, kam_id: 'kam' }],
    approvalScope: { level: 'region', regionId: 1, viewerName: 'ASM Viewer' } }
  const asm = XLSX.read(buildWeeklySalesExport(report), { type: 'array' })
  assert.deepEqual(asm.SheetNames, ['VISAYAS', 'ILOILO', 'NEGROS'])
  assert.equal(asm.Sheets.VISAYAS.B1.v, 'WEEKLY FORECAST APPROVAL')
  assert.equal(asm.Sheets.VISAYAS.B3.v, 'Regional ASM')
  const rsmInput = { ...report, approvalScope: { level: 'subregion', regionId: 1, subregionId: 2, viewerName: 'RSM Viewer' } }
  const rsm = XLSX.read(buildWeeklySalesExport(rsmInput), { type: 'array' })
  assert.deepEqual(rsm.SheetNames, ['ILOILO', 'Alex'])
  assert.equal(rsm.Sheets.ILOILO.B3.v, 'RSM Viewer')
  assert.equal(rsm.Sheets.ILOILO.C8.v, 100)
  assert.equal(rsm.Sheets.Alex.C8.v, 80)
  assert.equal(rsm.Sheets.Alex.F8.v, 15)
  assert.equal(rsm.Sheets.Alex.B4.v, 'RSM Viewer')
  assert.throws(() => buildWeeklySalesExport({ ...rsmInput, approvalScope: { ...rsmInput.approvalScope, subregionId: null } }), /assigned/)
  const december = XLSX.read(buildWeeklySalesExport({ ...rsmInput, budgetMonth: 12 }), { type: 'array' })
  assert.equal(december.Sheets.Alex.C6.v, 'DEC')
  assert.equal(december.Sheets.Alex.C8.v, 0)
})

test('approval preview loads references through the Approvals View endpoint', async () => {
  const client = { rpc(name, args) {
    assert.equal(name, 'get_approval_excel_volume_rows')
    assert.deepEqual(args, { p_from: '2026-11-16', p_to: '2026-11-22' })
    return { order: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }
  } }
  assert.deepEqual(await loadWeeklySalesExportReferences(client, { ...input, reportType: 'approvals', fromWeek: '2026-W47', toWeek: '2026-W47' }), { budgets: [], actuals: [] })
})

test('Admin RSM Approvals exports subregion summaries followed by KAM sheets instead of region sheets', () => {
  const report = { ...input, reportType: 'approvals', approvalStage: 'rsm', fromWeek: '2026-W47', toWeek: '2026-W47',
    sales: input.sales.map(sale => ({ ...sale, submitted_by: sale.subregion_id === 2 ? 'kam-a' : 'kam-b' })),
    users: { ...input.users, 'kam-a': 'KAM A', 'kam-b': 'KAM B' }, rsmNames: { '1:2': 'Assigned RSM A', '1:4': 'Assigned RSM B' } }
  const workbook = XLSX.read(buildWeeklySalesExport(report), { type: 'array' })
  assert.deepEqual(workbook.SheetNames, ['ILOILO', 'KAM A', 'NEGROS', 'KAM B'])
  assert.equal(workbook.Sheets.ILOILO.D8.v, 12.5)
  assert.equal(workbook.Sheets['KAM A'].D8.v, 12.5)
  assert.equal(workbook.Sheets.NEGROS.D8.v, 7)
  assert.equal(workbook.Sheets['KAM B'].D8.v, 7)
  assert.equal(workbook.Sheets['KAM A'].A3.v, 'KAM:')
  assert.equal(workbook.Sheets.ILOILO.B3.v, 'Assigned RSM A')
  assert.equal(workbook.Sheets.ILOILO.A4.v, 'SUBREGION:')
  assert.equal(workbook.Sheets.ILOILO.B4.v, 'ILOILO')
  assert.equal(workbook.Sheets.ILOILO.A5, undefined)
  assert.equal(workbook.Sheets.NEGROS.B3.v, 'Assigned RSM B')
  assert.equal(workbook.Sheets['KAM A'].B4.v, 'Assigned RSM A')
  assert.equal(workbook.Sheets['KAM A'].A5.v, 'SUBREGION:')
  assert.equal(workbook.Sheets['KAM A'].B5.v, 'ILOILO')
  const asm = XLSX.read(buildWeeklySalesExport({ ...report, approvalStage: 'asm' }), { type: 'array' })
  assert.deepEqual(asm.SheetNames, ['VISAYAS', 'ILOILO', 'NEGROS'])
  assert.equal(asm.Sheets.VISAYAS.A4.v, 'REGION:')
  assert.equal(asm.Sheets.VISAYAS.B4.v, 'VISAYAS')
  assert.equal(asm.Sheets.ILOILO.A3.v, 'RSM:')
  assert.equal(asm.Sheets.ILOILO.A4.v, 'ASM:')
  assert.equal(asm.Sheets.ILOILO.A5.v, 'SUBREGION:')
  assert.equal(asm.Sheets.ILOILO.B5.v, 'ILOILO')
})

test('selected budget month loads first and changing it reprioritizes the next page without losing other months', async () => {
  const records = [
    ...Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, year: 2026, month: 11, region_id: 1, subregion_id: 2, customer_id: i, product_id: 3, volume: 1 })),
    ...Array.from({ length: 110 }, (_, i) => ({ id: i + 2001, year: 2026, month: 12, region_id: 1, subregion_id: 2, customer_id: i, product_id: 3, volume: 2 })),
    { id: 3000, year: 2026, month: null, region_id: 1, subregion_id: 2, customer_id: null, product_id: 5, volume: 120 },
  ]
  let preferred = 12
  const filters = [], snapshots = []
  const client = { rpc() {
    let kind
    const query = {
      order() { return query }, eq(_field, value) { kind = value; return query }, or() { return query },
      range(from, to) {
        let filter = ''
        const request = {
          in() { return request }, or(value) { filter = value; return request },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              if (kind === 'actual') return { data: [], error: null }
              filters.push(filter)
              const selected = /month\.eq\.(\d+)/.exec(filter)
              const excluded = /month\.not\.in\.\(([^)]+)\)/.exec(filter)
              const data = records.filter(row => selected ? row.month === Number(selected[1]) || row.month === null
                : row.month !== null && !excluded[1].split(',').map(Number).includes(row.month))
              return { data: data.slice(from, to + 1).map(row => ({ ...row, record_type: 'budget' })), error: null }
            }).then(resolve, reject)
          },
        }
        return request
      },
    }
    return query
  } }
  const result = await loadWeeklySalesExportReferences(client, { ...input, reportType: 'approvals' }, (_count, snapshot) => {
    if (snapshot.budgets.length && !snapshots.length) {
      snapshots.push(snapshot.budgets)
      preferred = 11
    }
  }, () => preferred)
  assert.ok(snapshots[0].every(row => row.month === 12 || row.month === null))
  assert.match(filters[0], /month\.eq\.12/)
  assert.match(filters[1], /month\.eq\.11/)
  assert.equal(result.budgets.length, records.length)
  assert.equal(new Set(result.budgets.map(row => row.id)).size, records.length)
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, ...result, reportType: 'approvals', budgetMonth: 12 }), { type: 'array' })
  assert.equal(workbook.Sheets.VISAYAS.C8.v, 230)
})

test('approval reports smaller than 500 rows publish real partial totals before actuals finish', async () => {
  const budgets = Array.from({ length: 180 }, (_, id) => ({ record_type: 'budget', id, year: 2026, month: 11, region_id: 1, subregion_id: 2, customer_id: id, product_id: 3, volume: 1 }))
  let releaseActual, firstBudget
  const actualGate = new Promise(resolve => { releaseActual = resolve })
  const budgetArrived = new Promise(resolve => { firstBudget = resolve })
  const client = { rpc() {
    let kind
    const query = {
      order() { return query },
      eq(column, value) { assert.equal(column, 'record_type'); kind = value; return query },
      async range(from, to) {
        if (kind === 'actual') {
          await actualGate
          return { error: null, data: [{ record_type: 'actual', id: 1, actual_date: '2026-11-16', region_id: 1, subregion_id: 2, product_id: 3, volume: 12 }] }
        }
        return { error: null, data: budgets.slice(from, to + 1) }
      },
    }
    return query
  } }
  const totals = []
  const pending = loadWeeklySalesExportReferences(client, { ...input, reportType: 'approvals' }, (_count, snapshot) => {
    if (!snapshot.actuals.length) {
      totals.push(snapshot.budgets.reduce((sum, row) => sum + row.volume, 0))
      if (snapshot.budgets.length === 180) firstBudget()
    }
  })
  await budgetArrived
  assert.deepEqual(totals, [25, 125, 180])
  releaseActual()
  const result = await pending
  assert.equal(result.budgets.length, 180)
  assert.equal(result.actuals.length, 1)
  assert.ok(totals.length >= 1)
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, ...result, reportType: 'approvals' }), { type: 'array' })
  assert.equal(workbook.Sheets.VISAYAS.C8.v, 180)
})

test('large approval reports fetch bounded parallel pages and preserve every row in order', async () => {
  let active = 0, peak = 0
  const progress = [], snapshots = [], regionFilters = []
  const all = Array.from({ length: 1603 }, (_, id) => ({ id, record_type: 'actual', volume: id }))
  const client = { rpc: () => ({ order: () => ({ order: () => ({ range: (from, to) => {
    const promise = (async () => {
      active++; peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 2))
      active--
      return { data: all.slice(from, to + 1), error: null }
    })()
    promise.in = (field, ids) => { regionFilters.push([field, ids]); return promise }
    return promise
  } }) }) }) }
  const result = await loadWeeklySalesExportReferences(client, { ...input, reportType: 'approvals' }, (count, references) => {
    progress.push(count)
    snapshots.push(references.actuals.length)
  })
  assert.equal(peak, 3)
  assert.deepEqual(result.actuals.map(row => row.id), all.map(row => row.id))
  assert.deepEqual(progress, [500, 1603])
  assert.deepEqual(snapshots, [500, 1603])
  assert.ok(regionFilters.every(([field, ids]) => field === 'region_id' && ids.length === 1 && ids[0] === 1))
})
test('exports regional and area sheets with template totals, dates and new/unassigned products', () => {
  const bytes = buildWeeklySalesExport(input)
  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true })
  assert.deepEqual(workbook.SheetNames, ['VISAYAS', 'ILOILO', 'NEGROS', 'VISAYAS - Unassigned'])
  const sheet = workbook.Sheets.VISAYAS
  assert.equal(sheet.B3.v, 'ASM & Co')
  assert.equal(sheet.D10.v, 19.5)
  assert.equal(sheet.D9.v, 19.5)
  assert.equal(sheet.D8.v, 19.5)
  assert.equal(sheet.E8.v, 0)
  assert.equal(sheet.K8.v, 5)
  assert.equal(sheet.L8.v, 24.5)
  assert.match(sheet.D7.v, /Nov 16 -\s+Nov 22/)
  assert.match(sheet.K7.v, /Jan 4 -\s+Jan 10 \(2027\)/)
  assert.equal(workbook.Sheets.ILOILO.B3.v, 'RSM <One>')
  assert.equal(workbook.Sheets.ILOILO.L8.v, 14.5)
  assert.equal(workbook.Sheets.NEGROS.L8.v, 7)
  assert.equal(workbook.Sheets['VISAYAS - Unassigned'].L8.v, 3)
  assert.equal(sheet.D10.t, 'n')
  assert.equal(sheet.L10.f, 'SUM(D10:K10)')
  assert.equal(sheet.D8.s.patternType, 'solid')
  assert.equal(sheet.D8.s.fgColor.rgb, '0070C0')
  assert.equal(Object.values(sheet).some((cell) => cell?.f?.includes('[1]')), false)
})
test('exports only supplied filtered records and supports five or more weeks', () => {
  const sales = Array.from({ length: 6 }, (_, i) => ({ ...input.sales[0], week: 45 + i, forecast: (i + 1) * 2, volume: i + 1 }))
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, sales }), { type: 'array' })
  assert.equal(workbook.Sheets.VISAYAS.J8.v, 21)
  assert.equal(workbook.Sheets.VISAYAS.I10.v, 6)
  assert.equal(workbook.Sheets.VISAYAS.J10.f, 'SUM(D10:I10)')
  assert.deepEqual(workbook.SheetNames, ['VISAYAS', 'ILOILO'])
})
test('rejects an empty export', () => {
  assert.throws(() => buildWeeklySalesExport({ ...input, sales: [] }), /No Weekly Sales/)
})

test('reference layout includes monthly budget and actual sales by week with separate totals', () => {
  const budgets=[
    {year:2026,month:11,region_id:1,subregion_id:2,customer_id:10,product_id:3,volume:100},
    {year:2026,month:null,region_id:1,subregion_id:2,customer_id:10,product_id:3,volume:2400},
    {year:2026,month:11,region_id:1,subregion_id:4,customer_id:20,product_id:3,volume:50},
  ]
  const actuals=[
    {actual_date:'2026-11-16',region_id:1,subregion_id:2,product_id:3,volume:10},
    {actual_date:'2026-11-22',region_id:1,subregion_id:2,product_id:3,volume:5},
    {actual_date:'2026-11-23',region_id:1,subregion_id:4,product_id:3,volume:20},
    {actual_date:'2026-12-14',region_id:1,subregion_id:2,product_id:3,volume:999},
    {actual_date:'2026-11-16',region_id:2,subregion_id:2,product_id:3,volume:999},
  ]
  const book=XLSX.read(buildWeeklySalesExport({...input,fromWeek:'2026-W47',toWeek:'2026-W50',budgets,actuals}),{type:'array',cellStyles:true})
  const sheet=book.Sheets.VISAYAS
  assert.equal(sheet.A6.v,'BP CODE');assert.equal(sheet.B6.v,'ITEM DESCRIPTION')
  assert.equal(sheet.C6.v,'NOV');assert.equal(sheet.C7.v,'BUDGET\n2026')
  assert.equal(sheet.D6.v,'WEEKLY FORECAST');assert.equal(sheet.I6.v,'SALES PER WEEK')
  assert.equal(sheet.C10.v,150);assert.equal(sheet.C9.v,150);assert.equal(sheet.C8.v,150)
  assert.equal(sheet.D10.v,19.5);assert.equal(sheet.H10.v,19.5)
  assert.equal(sheet.I10.v,15);assert.equal(sheet.J10.v,20);assert.equal(sheet.M10.v,35)
  assert.equal(sheet.M10.f,'SUM(I10:L10)');assert.equal(sheet.H10.f,'SUM(D10:G10)')
  assert.equal(sheet.M8.v,35)
  assert.equal(book.Sheets.ILOILO.C10.v,100);assert.equal(book.Sheets.ILOILO.M10.v,15)
  assert.equal(book.Sheets.NEGROS.C10.v,50);assert.equal(book.Sheets.NEGROS.M10.v,20)
  assert.equal(sheet.D6.s.fgColor.rgb,'CAEDFA');assert.equal(sheet.I6.s.fgColor.rgb,'D9EFD1')
})

test('export reference loader pages all rows and fails if references cannot be loaded', async () => {
  const calls=[]
  const client={rpc:(name,args)=>({order:()=>({order:()=>({range:async(from,to)=>{
    calls.push({name,args,from,to})
    return {error:null,data:from===0?Array.from({length:500},(_,id)=>({id,record_type:'budget'})):[{id:501,record_type:'actual'}]}
  }})})})}
  const result=await loadWeeklySalesExportReferences(client,{...input,fromWeek:'2026-W47',toWeek:'2026-W50'})
  assert.equal(result.budgets.length,500);assert.equal(result.actuals.length,1)
  assert.deepEqual(calls[0].args,{p_from:'2026-11-16',p_to:'2026-12-13'})
  const denied={rpc:()=>({order:()=>({order:()=>({range:async()=>({data:null,error:{message:'Denied'}})})})})}
  await assert.rejects(loadWeeklySalesExportReferences(denied,input),/Denied/)
})

test('budget month dropdown has all twelve months, distinct colors and formula-driven annual/monthly values', () => {
  const budgets=[
    {year:2026,month:null,region_id:1,subregion_id:2,customer_id:10,product_id:3,volume:2400},
    {year:2026,month:11,region_id:1,subregion_id:2,customer_id:10,product_id:3,volume:100},
    {year:2026,month:12,region_id:1,subregion_id:2,customer_id:10,product_id:3,volume:300},
  ]
  const bytes=buildWeeklySalesExport({...input,fromWeek:'2026-W47',toWeek:'2026-W50',budgets})
  const sheet=XLSX.read(bytes,{type:'array',cellStyles:true}).Sheets.VISAYAS
  assert.equal(sheet.C6.v,'NOV');assert.equal(sheet.C10.v,100)
  assert.equal(sheet.C10.f,'INDEX($N10:$Y10,1,MATCH($C$6,$N$6:$Y$6,0))')
  assert.equal(sheet.N6.v,'JAN');assert.equal(sheet.Y6.v,'DEC')
  assert.equal(sheet.N10.v,200);assert.equal(sheet.X10.v,100);assert.equal(sheet.Y10.v,300)
  assert.equal(sheet.C6.s.fgColor.rgb,'E4D7F5');assert.equal(sheet.C7.s.fgColor.rgb,'7030A0')
  assert.equal(sheet.C8.s.fgColor.rgb,'7030A0')
  assert.equal(sheet.C9.s.fgColor.rgb,'D2B8E8')
  assert.equal(sheet.C10.s.fgColor.rgb,'E4D7F5')
  assert.equal(sheet.B9.v,'TOTAL')
  assert.ok(sheet['!cols'].slice(13,25).every(col=>col.hidden))
  const archive=CFB.read(bytes,{type:'array'})
  const xml=part=>new TextDecoder().decode(Uint8Array.from(archive.FileIndex[archive.FullPaths.findIndex(path=>path.endsWith('/'+part))].content))
  assert.match(xml('xl/worksheets/sheet1.xml'),/dataValidation type="list"[^>]*sqref="C6"/)
  assert.match(xml('xl/worksheets/sheet1.xml'),/JAN,FEB,MAR,APR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC/)
  assert.match(xml('xl/workbook.xml'),/calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/)
})

test('selected W46–W50 includes all five weeks and only their records', () => {
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, fromWeek: '2026-W46', toWeek: '2026-W50', asmNames: { 1: 'Assigned ASM' } }), { type: 'array' })
  const sheet = workbook.Sheets.VISAYAS
  assert.equal(sheet.B3.v, 'Assigned ASM')
  assert.equal(workbook.Sheets.ILOILO.B4.v, 'Assigned ASM')
  assert.match(sheet.D7.v, /Nov 9 -\s+Nov 15/)
  assert.match(sheet.H7.v, /Dec 7 -\s+Dec 13/)
  assert.equal(sheet.I7.v, 'TOTAL')
  assert.deepEqual(['D8', 'E8', 'F8', 'G8', 'H8'].map((cell) => sheet[cell].v), [0, 19.5, 0, 0, 0])
  assert.equal(sheet.I8.v, 19.5)
})

test('one selected week has exactly one week column and retains zero-volume records', () => {
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, sales: [{ ...input.sales[0], week: 46, forecast: 0, volume: 0 }], fromWeek: '2026-W46', toWeek: '2026-W46', asmNames: { 1: 'Assigned ASM' } }), { type: 'array' })
  const sheet = workbook.Sheets.VISAYAS
  assert.equal(sheet.B3.v, 'Assigned ASM')
  assert.match(sheet.D7.v, /Nov 9 -\s+Nov 15/)
  assert.equal(sheet.E7.v, 'TOTAL')
  assert.equal(sheet.D8.v, 0)
  assert.equal(sheet.E8.v, 0)
})

test('selected ranges handle ISO week 53 across years and reject invalid ranges', () => {
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, fromWeek: '2026-W53', toWeek: '2027-W01' }), { type: 'array' })
  assert.match(workbook.Sheets.VISAYAS.D7.v, /Dec 28 -\s+Jan 3 \(2026\/2027\)/)
  assert.match(workbook.Sheets.VISAYAS.E7.v, /Jan 4 -\s+Jan 10/)
  assert.equal(workbook.Sheets.VISAYAS.F7.v, 'TOTAL')
  assert.throws(() => buildWeeklySalesExport({ ...input, fromWeek: '2027-W53' }), /valid week range/)
  assert.throws(() => buildWeeklySalesExport({ ...input, fromWeek: '2026-W50', toWeek: '2026-W46' }), /valid week range/)
})

test('every sheet has the logo, bold merged title and merged grand total label', () => {
  const bytes = buildWeeklySalesExport({ ...input, fromWeek: '2026-W46', toWeek: '2026-W50' })
  const workbook = XLSX.read(bytes, { type: 'array' })
  const archive = CFB.read(bytes, { type: 'array' })
  const part = (path) => {
    const index = archive.FullPaths.findIndex((name) => name.endsWith(`/${path}`))
    assert.ok(index >= 0, `Missing ${path}`)
    return Uint8Array.from(archive.FileIndex[index].content)
  }
  const xml = (path) => new TextDecoder().decode(part(path))
  for (const [i, name] of workbook.SheetNames.entries()) {
    const sheet = workbook.Sheets[name]
    assert.equal(sheet.B1.v, 'WEEKLY SALES')
    assert.equal(sheet.A8.v, 'GRAND TOTAL')
    assert.deepEqual(sheet['!merges'].map(XLSX.utils.encode_range), ['A1:A2', 'B1:B2', 'A6:A7', 'B6:B7', 'D6:I6', 'J6:O6', 'A8:B8'])
    assert.match(xml(`xl/worksheets/sheet${i + 1}.xml`), /<drawing r:id="rId1"\/>/)
    assert.match(xml(`xl/worksheets/sheet${i + 1}.xml`), /<ignoredError sqref="A1:XFD1048576" formula="1"\/>/)
    assert.match(xml(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`), /Target="\.\.\/drawings\/drawing1.xml"/)
  }
  assert.match(xml('xl/styles.xml'), /<font><b\/><sz val="18"/)
  assert.match(xml('xl/drawings/drawing1.xml'), /<xdr:col>0<\/xdr:col>.*<xdr:row>0<\/xdr:row>/)
  assert.match(xml('xl/drawings/_rels/drawing1.xml.rels'), /Target="\.\.\/media\/weekly-sales-logo.png"/)
  assert.deepEqual([...part('xl/media/weekly-sales-logo.png').slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.match(xml('[Content_Types].xml'), /ContentType="image\/png"/)
  assert.match(xml('[Content_Types].xml'), /PartName="\/xl\/drawings\/drawing1.xml"/)
})
