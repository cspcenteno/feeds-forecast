import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actualInDashboardScope, compareVolumes, dashboardComparisons, mergeRegionalActuals } from '../lib/dashboard-comparisons.ts'

test('all three comparisons use their named baseline and measured volume', () => {
  const totals = { budget: 100, forecast: 80, actual: 60 }
  assert.deepEqual(dashboardComparisons.map((item) => compareVolumes(totals[item.baseline], totals[item.measured])), [
    { variance: -20, percent: 80 }, { variance: -40, percent: 60 }, { variance: -20, percent: 75 },
  ])
})

test('missing baselines show no percentage and preserve the actual gap', () => {
  assert.deepEqual(compareVolumes(0, 100), { variance: 100, percent: null })
  assert.deepEqual(compareVolumes(100, 0), { variance: -100, percent: 0 })
  assert.deepEqual(compareVolumes(100, -10), { variance: -110, percent: -10 })
})

test('regional Actuals include regions without any approved forecasts or budgets', () => {
  assert.deepEqual(mergeRegionalActuals([{ region: 'North', budget: 100, forecast: 80 }], [
    { region: 'South', actual: 40 }, { region: 'North', actual: 60 }, { region: 'South', actual: -5 },
  ]), [
    { region: 'North', budget: 100, forecast: 80, actual: 60 },
    { region: 'South', budget: 0, forecast: 0, actual: 35 },
  ])
})

test('months with only Actuals or only budgets still produce complete rows', () => {
  assert.deepEqual(mergeRegionalActuals([], [{ region: 'North', actual: 50 }]), [{ region: 'North', budget: 0, forecast: 0, actual: 50 }])
  assert.deepEqual(mergeRegionalActuals([{ region: 'North', budget: 50, forecast: 0 }], []), [{ region: 'North', budget: 50, forecast: 0, actual: 0 }])
})

const actual = { region_id: 1, subregion_id: 2, customer_id: 3, product_id: 4 }
const keys = new Set([JSON.stringify([1, 3, 4])])
const viewer = { scope: 'global', regionId: 1, subregionId: 2, isSupervisor: false }

test('regional viewers can compare Actuals without forecasts but cannot see another region', () => {
  assert.equal(actualInDashboardScope(actual, { ...viewer, scope: 'rsm' }, new Set()), true)
  assert.equal(actualInDashboardScope({ ...actual, region_id: 9 }, { ...viewer, scope: 'rsm' }, keys), false)
  assert.equal(actualInDashboardScope(actual, { ...viewer, scope: 'rsm', regionId: null }, keys), false)
})

test('supervisor dashboards include every subregion in their assigned region', () => {
  assert.equal(actualInDashboardScope(actual, { ...viewer, isSupervisor: true }, keys), true)
  assert.equal(actualInDashboardScope({ ...actual, subregion_id: 9 }, { ...viewer, isSupervisor: true }, keys), true)
  assert.equal(actualInDashboardScope(actual, { ...viewer, isSupervisor: true, subregionId: null }, keys), true)
})

test('supervisor dashboards cannot cross their region or use an unassigned region', () => {
  assert.equal(actualInDashboardScope({ ...actual, region_id: 9 }, { ...viewer, isSupervisor: true }, keys), false)
  assert.equal(actualInDashboardScope(actual, { ...viewer, isSupervisor: true, regionId: null }, keys), false)
})

test('KAM Actuals remain limited to their forecast customer/product keys', () => {
  assert.equal(actualInDashboardScope(actual, { ...viewer, scope: 'kam' }, keys), true)
  assert.equal(actualInDashboardScope({ ...actual, customer_id: 9 }, { ...viewer, scope: 'kam' }, keys), false)
  assert.equal(actualInDashboardScope(actual, { ...viewer, scope: 'kam' }, new Set()), false)
  assert.equal(actualInDashboardScope(actual, { ...viewer, scope: 'unknown' }, keys), false)
})
