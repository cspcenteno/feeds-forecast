export function savedCustomerGroupKey(item: { customer_id: number | null; status: string; user_id: string }, groupByKam: boolean) {
  return JSON.stringify([...(groupByKam ? [item.user_id] : []), item.customer_id, item.status])
}

export function savedKamGroupKey(weekKey: string, ownerId: string) {
  return JSON.stringify(['kam', weekKey, ownerId])
}
