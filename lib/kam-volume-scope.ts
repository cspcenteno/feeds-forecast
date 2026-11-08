type Kam = { id: string; full_name: string | null; email: string | null }
type Volume = { region_id: number | null; customer_id: number | null; product_id: number | null; kam?: string | null }
const normalize = (text: string | null | undefined) => (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function buildKamVolumeScope(userId: string, regionId: number | null, kams: Kam[], customers: { id: number; salesman: string | null }[], forecastKeys: Set<string>) {
  const identities = new Map<string, Set<string>>()
  for (const kam of kams) {
    for (const value of [kam.full_name, kam.email]) {
      const key = normalize(value)
      if (!key) continue
      const ids = identities.get(key) ?? new Set<string>()
      ids.add(kam.id)
      identities.set(key, ids)
    }
  }
  const salesmen = new Map(customers.map((customer) => [customer.id, customer.salesman]))
  return (row: Volume) => {
    if (regionId === null || row.region_id !== regionId) return false
    for (const value of [row.kam, row.customer_id === null ? null : salesmen.get(row.customer_id)]) {
      const key = normalize(value)
      if (!key) continue
      const ids = identities.get(key)
      if (ids) return ids.size === 1 && ids.has(userId)
    }
    // Legacy unlabelled records can still use the viewer's own forecast keys.
    // An explicit, unrecognized KAM/customer label must not grant ownership.
    if (normalize(row.kam) || normalize(row.customer_id === null ? null : salesmen.get(row.customer_id))) return false
    return forecastKeys.has(JSON.stringify([row.region_id, row.customer_id, row.product_id]))
  }
}
