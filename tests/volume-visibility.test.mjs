import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canReadAllVolumeRegions } from '../lib/volume-visibility.ts'

test('RSM, ASM and Supervisor are limited to their assigned region', () => {
  for (const [role, position] of [['Manager', 'RSM'], ['Manager', 'ASM'], ['Superuser', 'Supervisor'], ['Superuser', 'SV']]) {
    assert.equal(canReadAllVolumeRegions(role, position), false)
  }
})

test('NSM and Admin can read every region', () => {
  assert.equal(canReadAllVolumeRegions('Manager', 'NSM'), true)
  assert.equal(canReadAllVolumeRegions('Manager', ' nsm '), true)
  assert.equal(canReadAllVolumeRegions('Admin', ''), true)
  assert.equal(canReadAllVolumeRegions('User', 'NSM'), false)
})
