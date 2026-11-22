type ImportRow = {
  source: { id: number; kam?: string | null; customer?: string | null; product_code?: string | null; product_name?: string | null; region?: string | null; savedActual?: boolean }
  region?: { id: number; name?: string } | null
  issues: string[]
}
export type ImportValidationGroup<T> = {
  label: string; count: number; groups: Map<string, ImportValidationGroup<T>>; rows: T[]
  kind?: 'customer' | 'salesman' | 'product' | 'record'
  validation?: string
}
const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function importValidationGroups<T extends ImportRow>(items: T[]) {
  const groups = new Map<string, ImportValidationGroup<T>>()
  for (const label of ['Invalid','Valid']) groups.set(normalize(label), { label, count: 0, groups: new Map(), rows: [] })
  for (const item of items) {
    const root = groups.get(item.issues.length ? 'invalid' : 'valid')!
    root.count++
    const validations = item.issues.length ? [...new Set(item.issues.map(issue => issue.split(':')[0]))].sort() : ['']
    for (const validation of validations) {
      let parent = root
      if (validation) {
        const key = normalize(validation)
        if (!parent.groups.has(key)) parent.groups.set(key, { label: validation, count: 0, groups: new Map(), rows: [] })
        parent = parent.groups.get(key)!
        parent.count++
      }
      const type = normalize(validation)
      const kind = !validation || /salesman|\bkam\b|\brsm\b|\basm\b/.test(type) ? 'salesman'
        : /customer/.test(type) ? 'customer' : /product/.test(type) ? 'product' : 'record'
      if (kind === 'record') {
        parent.rows.push(item)
        continue
      }
      const region = item.region?.name || item.source.region?.trim() || 'Unassigned region'
      const name = kind === 'salesman' ? item.source.kam?.trim() || 'Unassigned salesman'
        : kind === 'customer' ? item.source.customer?.trim() || 'Missing customer'
        : item.source.product_code?.trim() || 'Missing product code'
      const key = JSON.stringify([kind, normalize(name), kind === 'customer' ? item.region?.id ?? normalize(region) : null])
      const productName = kind === 'product' ? item.source.product_name?.trim() : ''
      const label = `${kind === 'salesman' ? 'Salesman' : kind === 'customer' ? 'Customer' : 'Product'}: ${name}${kind === 'customer' ? ` (${region})` : productName ? ` - ${productName}` : ''}`
      if (!parent.groups.has(key)) parent.groups.set(key, { label, kind, validation, count: 0, groups: new Map(), rows: [] })
      const leaf = parent.groups.get(key)!
      if (productName) leaf.label = label
      leaf.count++
      leaf.rows.push(item)
    }
  }
  return groups
}
