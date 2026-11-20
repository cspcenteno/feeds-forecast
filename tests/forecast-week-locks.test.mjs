import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentWeekInput, isoWeekStart, salesWeekRange, weekInputDate } from '../lib/forecast-weeks.ts'
import { loadForecastWeekStates } from '../lib/forecast-week-locks.ts'

test('ISO calendars validate week 53 and correctly cross year boundaries', () => {
  assert.equal(isoWeekStart(2026, 1), '2025-12-29')
  assert.equal(isoWeekStart(2026, 53), '2026-12-28')
  assert.equal(isoWeekStart(2027, 1), '2027-01-04')
  assert.throws(() => isoWeekStart(2025, 53), /52 ISO weeks/)
  assert.equal(weekInputDate('2026-W01'), '2025-12-29')
  assert.throws(() => weekInputDate('2026-W00'), /ISO weeks/)
})

test('current week uses the Philippine business date rather than host timezone', () => {
  assert.equal(currentWeekInput(new Date('2027-01-03T16:30:00Z')), '2027-W01')
  assert.equal(currentWeekInput(new Date('2027-01-03T15:30:00Z')), '2026-W53')
})

test('sales week defaults advance weekly and cross ISO year boundaries', () => {
  assert.deepEqual(salesWeekRange(new Date('2026-11-20T04:00:00Z')), { fromWeek: '2026-W47', toWeek: '2026-W50' })
  assert.deepEqual(salesWeekRange(new Date('2026-11-23T04:00:00Z')), { fromWeek: '2026-W48', toWeek: '2026-W51' })
  assert.deepEqual(salesWeekRange(new Date('2026-12-28T04:00:00Z')), { fromWeek: '2026-W53', toWeek: '2027-W03' })
})

test('status RPC deduplicates weeks and accepts only complete explicit statuses', async () => {
  const client = { async rpc(name, args) {
    assert.equal(name, 'get_forecast_week_states')
    assert.equal(args.p_periods.length, 1)
    return { data: [{ year: 2026, week: 1, status: 'Locked' }], error: null }
  } }
  const rows = await loadForecastWeekStates(client, [{ year: 2026, week: 1 }, { year: 2026, week: 1 }])
  assert.deepEqual(rows, [{ year: 2026, week: 1, status: 'Locked' }])
})

test('status errors and incomplete responses never fall back to Open', async () => {
  for (const response of [
    { data: null, error: { message: 'network failure' } },
    { data: [], error: null },
    { data: [{ year: 2026, week: 1, status: null }], error: null },
    { data: [{ year: 2026, week: 2, status: 'Open' }], error: null },
  ]) {
    await assert.rejects(loadForecastWeekStates({ async rpc() { return response } }, [{ year: 2026, week: 1 }]), /Unable to verify/)
  }
})
