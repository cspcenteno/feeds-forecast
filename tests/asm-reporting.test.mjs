import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asmForRegion } from '../lib/asm-reporting.ts'

const users = [{ id:'a',full_name:'ASM A',region_id:1 }, { id:'b',full_name:'ASM B',region_id:2 }]
test('groups records under the active ASM assigned to their region', () => {
  assert.deepEqual(asmForRegion(1,users), { asm_id:'a',asm_name:'ASM A' })
  assert.deepEqual(asmForRegion(2,users), { asm_id:'b',asm_name:'ASM B' })
})
test('does not attribute an unassigned or ambiguous region to an arbitrary ASM', () => {
  assert.equal(asmForRegion(null,users).asm_id,null)
  assert.equal(asmForRegion(3,users).asm_name,'Unassigned ASM')
  assert.equal(asmForRegion(1,[...users,{ id:'c',full_name:'ASM C',region_id:1 }]).asm_name,'Multiple ASMs assigned')
})
