export type SummaryLevel = 'rsms' | 'kams' | 'regions' | 'subregions' | 'customers' | 'categories'

export function summaryForLevel(records: number, level: SummaryLevel, values: (string | number | null | undefined)[]) {
  const count = new Set(values.filter((value) => value != null && value !== '')).size
  return { records, [level]: count }
}
