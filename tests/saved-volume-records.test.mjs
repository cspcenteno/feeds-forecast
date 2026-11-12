import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistSavedVolumeUpdate, persistCustomerVolumeUpdates, validateSavedVolumePeriod, orderVolumeEditorRows } from '../lib/saved-volume-records.ts'
import { getBudgetImportKey } from '../lib/budget-import-key.ts'

const record = { id: 12, volume: 25, region_id: 1, subregion_id: null, customer_id: 3,
  product_id: 4, category_id: 5, asm: null, rsm: 'RSM', kam: 'KAM', year: 2026, month: null, actual_date: '2026-11-08' }

test('Budget editor sorts years and months chronologically without changing the source list', () => {
  const rows = [{...record,id:1,month:12},{...record,id:2,month:1},{...record,id:3,month:6},{...record,id:4,year:2025,month:12}]
  assert.deepEqual(orderVolumeEditorRows(rows,false).map((row)=>[row.year,row.month]), [[2025,12],[2026,1],[2026,6],[2026,12]])
  assert.equal(rows[0].month,12)
})

test('Actual editor orders dates from oldest to newest', () => {
  assert.deepEqual(orderVolumeEditorRows([{...record,id:1,actual_date:'2026-11-10'},{...record,id:2,actual_date:'2026-11-01'}],true).map((row)=>row.id),[2,1])
})

test('budget duplicate keys keep KAM identity and normalize its name', () => {
  assert.equal(getBudgetImportKey(2026, 11, 1, 3, 4, '  Chris   KAM '), getBudgetImportKey(2026, 11, 1, 3, 4, 'chris kam'))
  assert.notEqual(getBudgetImportKey(2026, 11, 1, 3, 4, 'Chris'), getBudgetImportKey(2026, 11, 1, 3, 4, 'Alex'))
  assert.equal(getBudgetImportKey(2026, 11, 1, 3, 4, null), getBudgetImportKey(2026, 11, 1, 3, 4, ''))
})

function clientReturning(result) {
  const calls = []
  const query = Object.fromEntries(['update', 'eq', 'is', 'select'].map((method) => [method, (...args) => { calls.push([method, ...args]); return query }]))
  query.maybeSingle = async () => result
  return { client: { from: (table) => { calls.push(['from', table]); return query } }, calls }
}

test('saved volumes accept zero and decimals but reject empty, negative and nonfinite values', () => {
  for (const volume of ['0', '12.5']) assert.doesNotThrow(() => validateSavedVolumePeriod(volume, false, '2026', '', ''))
  for (const volume of ['', ' ', '-1', 'NaN', 'Infinity']) assert.throws(() => validateSavedVolumePeriod(volume, false, '2026', '', ''), /valid volume/)
})

test('budget periods retain annual support and reject invalid years or months', () => {
  assert.doesNotThrow(() => validateSavedVolumePeriod('12', false, '2026', '11', ''))
  for (const [year, month] of [['2019', '1'], ['2101', '1'], ['2026', '13'], ['2026', '1.5']]) {
    assert.throws(() => validateSavedVolumePeriod('12', false, year, month, ''), /year/)
  }
})

test('actual dates reject calendar rollover rather than saving a different day', () => {
  assert.doesNotThrow(() => validateSavedVolumePeriod('12', true, '', '', '2024-02-29'))
  for (const date of ['', '2026-02-29', '2026-11-31', 'invalid']) {
    assert.throws(() => validateSavedVolumePeriod('12', true, '', '', date), /Actual date/)
  }
})

test('saved budget updates target one original snapshot and preserve null dimensions', async () => {
  const { client, calls } = clientReturning({ data: { id: 12 }, error: null })
  await persistSavedVolumeUpdate(client, 'budgets', record, { volume: 30 })
  assert.deepEqual(calls[0], ['from', 'budgets'])
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'id', 12])))
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'volume', 25])))
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['is', 'month', null])))
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['is', 'subregion_id', null])))
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['select', 'id'])))
})

test('actual updates filter by original date, and failed or unmatched updates never report success', async () => {
  const { client, calls } = clientReturning({ data: { id: 12 }, error: null })
  await persistSavedVolumeUpdate(client, 'actuals', record, { volume: 30 })
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'actual_date', '2026-11-08'])))
  assert.equal(calls.some((call) => call[1] === 'year'), false)
  await assert.rejects(persistSavedVolumeUpdate(clientReturning({ data: null, error: null }).client, 'budgets', record, { volume: 30 }), /changed or you no longer have permission/)
  await assert.rejects(persistSavedVolumeUpdate(clientReturning({ data: null, error: { message: 'permission denied' } }).client, 'actuals', record, { volume: 30 }), /permission denied/)
})


test('customer editing submits only changed rows in one atomic call with original snapshots', async () => {
  let sent
  const client={rpc:async(name,args)=>{sent={name,args};return {data:2,error:null}}}
  const draft={original:record,volume:'30.5',year:'2026',month:'',actualDate:record.actual_date}
  const count=await persistCustomerVolumeUpdates(client,'Budgets',[draft,{...draft,original:{...record,id:13,product_id:6},volume:'0'},{...draft,original:{...record,id:14},volume:'25'}])
  assert.equal(count,2)
  assert.equal(sent.name,'update_customer_volume_records')
  assert.equal(sent.args.p_records.length,2)
  assert.equal(sent.args.p_records[0].original.volume,25)
  assert.equal(sent.args.p_records[0].volume,30.5)
  assert.equal(sent.args.p_records[0].month,null)
  assert.equal(sent.args.p_records[1].volume,0)
})

test('unchanged customer records make no writes and invalid input stops before the RPC', async()=>{
  const client={rpc:async()=>{throw Error('Unexpected write')}}
  const draft={original:record,volume:'25',year:'2026',month:'',actualDate:record.actual_date}
  assert.equal(await persistCustomerVolumeUpdates(client,'Budgets',[draft]),0)
  await assert.rejects(persistCustomerVolumeUpdates(client,'Actuals',[{...draft,volume:'-1'}]),/valid volume/)
})

test('Actual customer edits send dates and preserve database conflict messages',async()=>{
  let args
  const client={rpc:async(_name,input)=>{args=input;return {data:null,error:{message:'A record changed while you were editing'}}}}
  await assert.rejects(persistCustomerVolumeUpdates(client,'Actuals',[{original:record,volume:'26',year:'2026',month:'',actualDate:'2026-11-09'}]),/record changed/)
  assert.equal(args.p_records[0].actual_date,'2026-11-09')
  assert.equal(args.p_records[0].original.actual_date,'2026-11-08')
  assert.equal(Object.hasOwn(args.p_records[0],'year'),false)
})


test('shared customer/KAM and per-row product changes save even when volume is unchanged',async()=>{
 let request
 const client={rpc:async(_name,args)=>{request=args;return {data:2,error:null}}}
 const row={original:record,volume:'25',year:'2026',month:'',actualDate:record.actual_date,customerId:8,regionId:2,kam:'New KAM'}
 await persistCustomerVolumeUpdates(client,'Budgets',[{...row,productId:9,categoryId:10},{...row,original:{...record,id:13},productId:11,categoryId:12}])
 assert.equal(request.p_records.length,2)
 assert.ok(request.p_records.every(r=>r.kam==='New KAM'&&r.customer_id===8&&r.region_id===2))
 assert.equal(request.p_records[0].product_id,9)
 assert.equal(request.p_records[1].product_id,11)
 assert.equal(request.p_records[0].original.customer_id,3)
 assert.equal(request.p_records[0].original.product_id,4)
})
