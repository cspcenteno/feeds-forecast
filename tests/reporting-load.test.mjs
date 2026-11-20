import test from 'node:test'
import assert from 'node:assert/strict'
import { withReportingTimeout } from '../lib/reporting-load.ts'

test('reporting loads return successful results and preserve request errors', async () => {
  assert.equal(await withReportingTimeout(Promise.resolve(42), 'Session', 30), 42)
  await assert.rejects(withReportingTimeout(Promise.reject(new Error('Denied')), 'Session', 30), /Denied/)
})

test('a stalled reporting request exits with a retryable error', async () => {
  await assert.rejects(withReportingTimeout(new Promise(() => {}), 'Loading your session', 10), /Loading your session timed out.*refresh/)
})
