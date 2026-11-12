import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forecastSubmissionConfirmation } from '../lib/forecast-submission-confirmation.ts'

test('submission review summarizes customers and distinct products in two rows', () => {
  const result = forecastSubmissionConfirmation([
    { customer_id: 1, product_id: 10, volume: 5 },
    { customer_id: 1, product_id: 10, volume: 7 },
    { customer_id: 2, product_id: 11, volume: 3 },
  ], 'All Draft Forecasts', (id) => `Customer ${id}`, (id) => `Product ${id}`)
  assert.equal(result.layout, 'review')
  assert.equal(result.forecastSummary.level, 'submit')
  assert.equal(result.forecastSummary.scope, 'All Draft Forecasts')
  assert.equal(result.confirmLabel, 'Submit (3)')
  assert.deepEqual(result.details, [
    { label: 'Action Scope', value: 'All Draft Forecasts' },
    { label: 'Customers', value: '2' },
    { label: 'Products', value: '2' },
    { label: 'Total Volume (50kg)', value: '15' },
  ])
  assert.deepEqual(result.items, [
    { label: 'Customer 1 — Product 10', volume: '12' },
    { label: 'Customer 2 — Product 11', volume: '3' },
  ])
})

test('submission summary retains week and date inputs for every selected period', () => {
  const records = [
    { year: 2026, week: 48, customer_id: 1, product_id: 10, volume: 5 },
    { year: 2026, week: 49, customer_id: 1, product_id: 11, volume: 7 },
  ]
  const result = forecastSubmissionConfirmation(records, 'All Draft Forecasts', String, String)
  assert.deepEqual(result.forecastSummary.records, records)
  assert.equal(result.forecastSummary.level, 'submit')
})
