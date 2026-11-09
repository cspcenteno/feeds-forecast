import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readForecastWorkspace, writeForecastWorkspace } from '../lib/forecast-workspace.ts'

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  }
}
const workspace = {
  version: 1, ownerId: 'alex', year: 2026, week: 46, selectedWeek: '2026-W46',
  selectedMonth: 10, selectedRegionId: '1', selectedSubregionId: '3', selectedCustomerId: '249',
  rows: [{tempId:'row-1',id:null,category_id:'2',product_id:'312',product_search:'010BP202',forecast:'0.5',status:'Draft'}],
}

test('unsaved selections and fractional quantities survive leaving and returning', () => {
  const browser = storage()
  writeForecastWorkspace(browser, workspace)
  assert.deepEqual(readForecastWorkspace(browser, 'alex'), workspace)
})

test('accounts cannot restore each other’s work', () => {
  const browser = storage()
  writeForecastWorkspace(browser, workspace)
  assert.equal(readForecastWorkspace(browser, 'another-user'), null)
  browser.setItem('forecast-input:workspace:v1:another-user', JSON.stringify(workspace))
  assert.equal(readForecastWorkspace(browser, 'another-user'), null)
})

test('clearing a saved form removes the old unsaved copy and retains other accounts', () => {
  const browser = storage()
  writeForecastWorkspace(browser, workspace)
  writeForecastWorkspace(browser, {...workspace,ownerId:'other'})
  writeForecastWorkspace(browser, {...workspace,selectedCustomerId:'',rows:[{...workspace.rows[0],category_id:'',product_id:'',product_search:'',forecast:''}]})
  assert.equal(readForecastWorkspace(browser, 'alex'), null)
  assert.equal(readForecastWorkspace(browser, 'other').rows[0].forecast, '0.5')
})

test('a typed zero is retained; malformed or inconsistent storage is ignored', () => {
  const browser = storage()
  writeForecastWorkspace(browser, {...workspace,selectedCustomerId:'',rows:[{...workspace.rows[0],forecast:'0'}]})
  assert.equal(readForecastWorkspace(browser, 'alex').rows[0].forecast, '0')
  browser.setItem('forecast-input:workspace:v1:alex', '{broken')
  assert.equal(readForecastWorkspace(browser, 'alex'), null)
  browser.setItem('forecast-input:workspace:v1:alex', JSON.stringify({...workspace,year:2025}))
  assert.equal(readForecastWorkspace(browser, 'alex'), null)
  browser.setItem('forecast-input:workspace:v1:alex', JSON.stringify({...workspace,rows:[{}]}))
  assert.equal(readForecastWorkspace(browser, 'alex'), null)
})

test('browser tabs use independent workspace stores', () => {
  const firstTab = storage(), secondTab = storage()
  writeForecastWorkspace(firstTab, workspace)
  assert.equal(readForecastWorkspace(secondTab, 'alex'), null)
})
