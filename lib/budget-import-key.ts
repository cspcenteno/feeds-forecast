export function getBudgetImportKey(
  year: number,
  month: number,
  regionId: number,
  customerId: number,
  productId: number,
  kam: string | null,
) {
  const normalizedKam = (kam ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return [year, month, regionId, customerId, productId, normalizedKam].join('|')
}
