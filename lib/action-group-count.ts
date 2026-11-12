type GroupRecord = { customer_id?: number | null; submitted_by?: string | null; user_id?: string | null; endorsed_by?: string | null }

export function actionGroupCount(items: GroupRecord[], level: 'customer' | 'kam' | 'rsm') {
  return new Set(items.map((item) => level === 'customer' ? item.customer_id ?? 'unassigned'
    : level === 'kam' ? item.submitted_by ?? item.user_id ?? 'unassigned'
    : item.endorsed_by ?? 'unassigned')).size
}
