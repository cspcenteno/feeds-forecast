export const savedStatusLabels = {
  Draft: 'Draft', Pending: 'Pending', Endorsed: 'Endorsed', Rejected: 'Returned', Approved: 'Approved',
} as const

export function savedForecastMatchesStatus(item: { status: string; returned_at: string | null }, filter: string) {
  if (!Object.hasOwn(savedStatusLabels, item.status)) return false
  if (filter === 'all') return true
  if (!filter) return item.status !== 'Approved'
  return item.status === filter || (filter === 'Rejected' && item.status === 'Draft' && item.returned_at !== null)
}

export function canEditSavedForecastStatus(status: string) {
  return status === 'Draft' || status === 'Rejected'
}
