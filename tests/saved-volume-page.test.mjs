import test from 'node:test'
import assert from 'node:assert/strict'
import { readSavedVolumePage } from '../lib/saved-volume-page.ts'

test('timed out reads retry with smaller pages and return their actual page size', async () => {
  const sizes = []
  const result = await readSavedVolumePage(async size => {
    sizes.push(size)
    return size > 125 ? {data:null,error:{code:'57014',message:'statement timeout'}} : {data:[{id:42}],error:null}
  },250,new AbortController().signal)
  assert.deepEqual(sizes,[250,125])
  assert.equal(result.size,125)
  assert.deepEqual(result.data,[{id:42}])
})

test('retries are bounded and permission errors are never retried', async () => {
  let calls = 0
  const timeout = await readSavedVolumePage(async () => { calls++; return {data:null,error:{code:'57014',message:'timeout'}} },250,new AbortController().signal)
  assert.equal(calls,3)
  assert.equal(timeout.error.code,'57014')
  calls=0
  await readSavedVolumePage(async () => { calls++; return {data:null,error:{code:'42501',message:'permission denied'}} },250,new AbortController().signal)
  assert.equal(calls,1)
})

test('aborted loads do not retry or publish a late successful result', async () => {
  const controller = new AbortController()
  let calls=0
  await assert.rejects(readSavedVolumePage(async () => {
    calls++; controller.abort(); return {data:[{id:1}],error:null}
  },250,controller.signal),{name:'AbortError'})
  assert.equal(calls,1)
})
