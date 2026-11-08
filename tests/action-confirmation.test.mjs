import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmationPresentation, confirmationRecordDetails, createConfirmationController } from '../lib/action-confirmation.ts'

test('cancel resolves without authorizing an operation', async () => {
  const views = []
  const controller = createConfirmationController((view) => views.push(view))
  const request = controller.request({ message: 'Delete 3 records?' })
  controller.cancel()
  assert.equal(await request, null)
  assert.equal(views.at(-1), null)
})

test('confirmation stays busy until completion and blocks duplicate actions', async () => {
  const views = []
  const controller = createConfirmationController((view) => views.push(view))
  const request = controller.request({ message: 'Delete 3 records?' })
  assert.equal(await controller.request({ message: 'Delete 3 records?' }), null)
  controller.proceed()
  controller.proceed()
  const ticket = await request
  assert.ok(ticket)
  assert.equal(controller.isBusy(), true)
  assert.equal(views.at(-1).busy, true)
  controller.cancel()
  assert.equal(controller.isBusy(), true)
  assert.equal(await controller.request({ message: 'Delete again?' }), null)
  ticket.finish()
  assert.equal(controller.isBusy(), false)
  assert.equal(views.at(-1), null)
})

test('an old completion cannot close a later confirmation', async () => {
  let view
  const controller = createConfirmationController((next) => { view = next })
  const first = controller.request({ message: 'Delete first?' })
  controller.proceed()
  const ticket = await first
  ticket.finish()
  const second = controller.request({ message: 'Delete second?' })
  ticket.finish()
  assert.equal(view.options.message, 'Delete second?')
  controller.cancel()
  assert.equal(await second, null)
})

test('unmounting releases a pending confirmation without authorizing it', async () => {
  const controller = createConfirmationController(() => {})
  const request = controller.request({ message: 'Import records?' })
  controller.dispose()
  assert.equal(await request, null)
})

test('destructive, submission and import actions use their intended labels and colors', () => {
  for (const message of ['Delete 3 records?', 'Remove 2 forecast records?', 'Are you sure you want to delete this customer?', 'Discard uploaded records?']) {
    assert.equal(confirmationPresentation(message).tone, 'danger')
    assert.equal(confirmationPresentation(message).irreversible, true)
  }
  assert.equal(confirmationPresentation('Submit 3 forecasts?').confirmLabel, 'Submit')
  assert.equal(confirmationPresentation('Import 3 records?').tone, 'transfer')
  assert.equal(confirmationPresentation('Create 3 new user accounts?').tone, 'primary')
  assert.equal(confirmationPresentation('Lock 2026-W45?').tone, 'caution')
})

test('bulk confirmation shows record count and volume without nonfinite totals', () => {
  assert.deepEqual(confirmationRecordDetails([{ volume: 10 }, { volume: '2.5' }, { volume: null }, { volume: 'bad' }]), [
    { label: 'Records', value: '4' }, { label: 'Total volume', value: '12.5' },
  ])
})
