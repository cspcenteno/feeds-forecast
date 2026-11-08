import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupedTableKeys } from '../lib/grouped-table-keys.ts'

const group = (count, children = []) => ({ count, groups: new Map(children) })

test('expand-all keys include each nested grouping level', () => {
  const groups = new Map([
    ['valid', group(2, [['kam: chris', group(2, [['customer: north', group(2)]])]])],
    ['invalid', group(1, [['validation: missing product', group(1)]])],
  ])
  assert.deepEqual(groupedTableKeys(groups).map(JSON.parse), [
    ['valid'], ['valid', 'kam: chris'], ['valid', 'kam: chris', 'customer: north'],
    ['invalid'], ['invalid', 'validation: missing product'],
  ])
})

test('empty groups do not prevent the expanded state from matching the visible groups', () => {
  assert.deepEqual(groupedTableKeys(new Map([['valid', group(0)], ['invalid', group(0)]])), [])
  assert.deepEqual(groupedTableKeys(new Map([['valid', group(1)], ['invalid', group(0)]])), ['["valid"]'])
})

test('same group names under different parents have distinct safe keys', () => {
  const keys = groupedTableKeys(new Map([
    ['KAM "A"', group(1, [['customer|north', group(1)]])],
    ['KAM B', group(1, [['customer|north', group(1)]])],
  ]))
  assert.equal(new Set(keys).size, 4)
  assert.deepEqual(JSON.parse(keys[1]), ['KAM "A"', 'customer|north'])
})
