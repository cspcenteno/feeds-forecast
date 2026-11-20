export type TableSummaryCounts = { records: number; customers?: number; products?: number; kams?: number; salespeople?: number; rsms?: number; asms?: number; regions?: number; subregions?: number; categories?: number }

export function TableSummary({ records, customers, products, kams, rsms, asms, salespeople, regions, subregions, categories, end, endRef }: TableSummaryCounts & { end?: import('react').ReactNode; endRef?: import('react').Ref<HTMLDivElement> }) {
  const counts = [
    [records, 'record', 'records'], [asms, 'ASM', 'ASMs'], [rsms, 'RSM', 'RSMs'], [kams, 'KAM', 'KAMs'], [salespeople, 'salesman', 'salesmen'],
    [regions, 'region', 'regions'], [subregions, 'subregion', 'subregions'], [categories, 'category', 'categories'],
    [customers, 'customer', 'customers'], [products, 'product', 'products'],
  ] as const
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-4 py-3 text-sm leading-5 text-muted-foreground" data-slot="table-summary">
    {counts.filter(([count]) => count !== undefined).map(([count, singular, plural], index) => <span key={singular} className="inline-flex items-center gap-2">
      {index > 0 && <span aria-hidden="true">·</span>}
      <span>{count?.toLocaleString('en-PH')} {count === 1 ? singular : plural}</span>
    </span>)}
    {end && <div ref={endRef} className="ml-auto lg:mr-[var(--summary-end-inset,0px)]">{end}</div>}
  </div>
}

export function uniqueCount(values: (string | number | null | undefined)[]) {
  return new Set(values.filter((value) => value != null && value !== '')).size
}
