export type TableSummaryCounts = { records: number; customers?: number; products?: number; kams?: number; rsms?: number; asms?: number; regions?: number; subregions?: number; categories?: number }

export function TableSummary({ records, customers, products, kams, rsms, asms, regions, subregions, categories }: TableSummaryCounts) {
  const counts = [
    [records, 'record', 'records'], [asms, 'ASM', 'ASMs'], [rsms, 'RSM', 'RSMs'], [kams, 'KAM', 'KAMs'],
    [regions, 'region', 'regions'], [subregions, 'subregion', 'subregions'], [categories, 'category', 'categories'],
    [customers, 'customer', 'customers'], [products, 'product', 'products'],
  ] as const
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-4 py-3 text-sm text-muted-foreground" data-slot="table-summary">
    {counts.filter(([count]) => count !== undefined).map(([count, singular, plural], index) => <span key={singular} className="inline-flex items-center gap-2">
      {index > 0 && <span aria-hidden="true">·</span>}
      <span>{count?.toLocaleString('en-PH')} {count === 1 ? singular : plural}</span>
    </span>)}
  </div>
}

export function uniqueCount(values: (string | number | null | undefined)[]) {
  return new Set(values.filter((value) => value != null && value !== '')).size
}
