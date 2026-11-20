import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canReadAllVolumeRegions, requiresVolumeSubregion } from '../lib/volume-visibility.ts'

test('RSM and KAM require a subregion while regional and global positions retain their scope', () => {
  assert.equal(requiresVolumeSubregion('Manager', 'RSM'), true)
  assert.equal(requiresVolumeSubregion('User', ' kam '), true)
  for (const [role, position] of [['Admin', 'RSM'], ['Manager', 'NSM'], ['Manager', 'ASM'], ['Superuser', 'Supervisor']]) {
    assert.equal(requiresVolumeSubregion(role, position), false)
  }
})

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
