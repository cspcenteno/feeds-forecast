import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findExistingForecast } from '../lib/forecast-duplicates.ts'

const saved = { id: 10, year: 2026, week: 46, user_id: 'alex', region_id: 1, subregion_id: 3, customer_id: 249, product_id: 312 }

test('new rows match an already saved product in the same owner/customer/week scope', () => {
  assert.equal(findExistingForecast({ ...saved, id: undefined }, [saved]), saved)
})

test('editing the same record is allowed', () => {
  assert.equal(findExistingForecast(saved, [saved]), undefined)
})

test('other products, weeks, customers, areas and users remain independent', () => {
  for (const change of [{ product_id: 313 }, { week: 47 }, { year: 2027 }, { customer_id: 250 }, { region_id: 2 }, { subregion_id: 4 }, { user_id: 'other' }]) {
    assert.equal(findExistingForecast({ ...saved, id: undefined, ...change }, [saved]), undefined)
  }
})
