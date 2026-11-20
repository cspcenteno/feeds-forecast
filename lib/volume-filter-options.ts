export function volumeFilterOptions(
  records: { customer_id: number | null; product_id: number | null }[],
  customers: { id: number; customer: string }[], products: Map<number, string>,
) {
  const customerIds = new Set(records.map(row => row.customer_id))
  const productIds = new Set(records.map(row => row.product_id))
  return {
    customers: [...new Set(customers.filter(row => customerIds.has(row.id)).map(row => row.customer))]
      .sort((a, b) => a.localeCompare(b)),
    products: [...products].filter(([id]) => productIds.has(id)).sort((a, b) => a[1].localeCompare(b[1])),
  }
}
