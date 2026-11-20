'use client'

import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Table } from '@/components/ui/table'
import type { TableSummaryCounts } from '@/components/ui/table-summary'
import { LoadingSpinner, TableLoadingRow } from '@/components/ui/loading-spinner'
import { BudgetValueIndicator } from '@/components/ui/budget-value-indicator'

export type SalesHierarchyRow = {
  key: string; label: ReactNode; kind: 'week' | 'group' | 'product'; depth?: number
  area?: ReactNode; status?: ReactNode; actions?: ReactNode
  values?: number[]; expanded?: boolean; onToggle?: () => void
  referenceLoading?: boolean; referenceError?: boolean; volumeBudget?: number | null
}

const columns = [['Forecast', '(Qty.)'], ['Volume', '(50kg)'], ['Budget', '(Vol.)'],
  ['Actual', '(Cum. Vol.)'], ['Actual', '(Prev. Mo.)'], ['Forecast', '(Cum. Vol.)']]
const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })

export function SalesHierarchyTable({ rows, loading = false, label, emptyMessage, summary, totalVolume, showActions = true, showStatus = true }: {
  rows: SalesHierarchyRow[]; loading?: boolean; label: string; emptyMessage: string
  summary: TableSummaryCounts; totalVolume?: number; showActions?: boolean; showStatus?: boolean
}) {
  const columnCount = 8 + Number(showActions) + Number(showStatus)
  return <Table data-sales-hierarchy="" aria-busy={loading} summary={summary}
    summaryAlignColumn={Number(showActions) + Number(showStatus) + 3}
    summaryEnd={totalVolume === undefined ? undefined : <span className="inline-flex flex-wrap items-baseline justify-end gap-2 text-sm leading-5" aria-busy={loading}><span>Grand Total</span><strong className="text-sm leading-5 font-semibold tabular-nums text-foreground">{loading ? '—' : number.format(totalVolume)}</strong></span>}
    className="w-full table-fixed"
    containerProps={{ className: 'max-h-[min(36rem,70vh)] overflow-auto', tabIndex: 0, role: 'region', 'aria-label': label }}>
    <colgroup>
      {showActions && <col style={{ width: '6.5rem' }} />}
      {showStatus && <col style={{ width: '7%' }} />}
      <col style={{ width: showStatus ? '26%' : '28%' }} /><col style={{ width: '9%' }} />
      {columns.map(([title, unit]) => <col key={title + unit} />)}
    </colgroup>
    <thead className="sticky top-0 z-10 bg-card">
      <tr className="border-b bg-muted/40">
        {showActions && <th scope="col" className="px-1 py-3 text-center font-semibold">Action</th>}
        {showStatus && <th scope="col" className="px-1 py-3 text-center font-semibold">Status</th>}
        <th scope="col" className="px-2 py-3 text-left font-semibold">Sales Structure</th>
        <th scope="col" className="px-2 py-3 text-left font-semibold">Area</th>
        {columns.map(([title, unit], index) => <th key={title + unit} scope="col"
          className={'px-1.5 py-3 text-right font-semibold ' + (index >= 2 ? 'bg-muted/50 text-muted-foreground ' : '') + (index === 2 ? 'border-l' : '')}>
          <span className="block">{title}</span><span className="block">{unit}</span>
        </th>)}
      </tr>
    </thead>
    <tbody>
      {loading ? <TableLoadingRow columns={columnCount} label={label} /> : !rows.length
        ? <tr><td colSpan={columnCount} className="px-4 py-10 text-center text-muted-foreground">{emptyMessage}</td></tr>
        : rows.map(row => row.kind === 'week'
          ? <tr key={row.key} className="border-b bg-muted/40"><th scope="rowgroup" colSpan={columnCount} className="px-3 py-2 text-left font-semibold">{row.label}</th></tr>
          : <tr key={row.key} className={row.kind === 'group'
            ? 'border-b bg-emerald-50/70 font-semibold dark:bg-emerald-950/35'
            : 'border-b hover:bg-muted/30'}>
            {showActions && <td className="px-1 py-2"><div className="flex flex-nowrap items-center justify-center gap-1">{row.actions}</div></td>}
            {showStatus && <td data-hierarchy-status="" className="px-1 py-2"><div className="flex flex-wrap justify-center gap-1">{row.status}</div></td>}
            <td className="px-2 py-2">
              <div style={{ paddingInlineStart: (row.depth ?? 0) * 12 }}>
                {row.onToggle ? <button type="button" aria-expanded={row.expanded} onClick={row.onToggle}
                  className="flex w-full min-w-0 items-start gap-1.5 text-left hover:text-primary">
                  {row.expanded ? <ChevronDown className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 wrap-anywhere">{row.label}</span>
                </button> : <div className="wrap-anywhere pl-[22px]">{row.label}</div>}
              </div>
            </td>
            <td className="px-2 py-2 wrap-anywhere">{row.area}</td>
            {(row.values ?? Array(6).fill(NaN)).map((value: number, index: number) => <td key={index}
              className={'px-1.5 py-2 text-right tabular-nums ' + (index === 2 ? 'border-l border-border/50' : '')}>
              {index >= 2 && row.referenceLoading ? <LoadingSpinner label="monthly reference" />
                : (index >= 2 && row.referenceError) || !Number.isFinite(value) ? '—'
                  : index === 1 || index >= 3 ? <BudgetValueIndicator value={value}
                    budgetLabel={index === 1 && row.volumeBudget !== undefined ? 'weekly budget' : 'monthly budget'}
                    budget={row.referenceLoading || row.referenceError ? null : index === 1 ? row.volumeBudget ?? row.values?.[2] : row.values?.[2]}>
                    {number.format(value)}</BudgetValueIndicator> : number.format(value)}
            </td>)}
          </tr>)}
    </tbody>
  </Table>
}
