'use client'

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Check, ChevronDown, Download } from 'lucide-react'
import { Select } from '@base-ui/react/select'
import { buildWeeklySalesExport, downloadWeeklySalesExport, type ExportInput } from '@/lib/weekly-sales-export'

export default function ApprovalExcelPreview({ input, loading, loadError, canDownload, onBudgetMonthChange }: {
  input: ExportInput; loading: boolean; loadError: string; canDownload: boolean; onBudgetMonthChange: (month: number) => void
}) {
  const [sheetIndex, setSheetIndex] = useState(0)
  const [month, setMonth] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const report = useMemo(() => ({ ...input, budgetMonth: month }), [input, month])
  const workbook = useMemo(() => XLSX.read(buildWeeklySalesExport(report), { type: 'array', cellStyles: true }), [report])
  const sheet = workbook.Sheets[workbook.SheetNames[sheetIndex]]
  const range = XLSX.utils.decode_range(sheet['!ref']!)
  const hidden = sheet['!cols']?.findIndex(col => col?.hidden) ?? -1
  const lastColumn = hidden >= 0 ? hidden - 1 : range.e.c
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return <>
    <div className="flex shrink-0 flex-wrap items-center gap-3 pr-10 pb-4">
      <h2 className="mr-auto text-lg font-semibold">Weekly Forecast Approval</h2>
      {canDownload && <button disabled={busy || loading || Boolean(loadError)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50" onClick={async () => {
        setBusy(true); setError('')
        try {
          const response = await fetch('/api/authorization', { cache: 'no-store' })
          const access = await response.json()
          if (!response.ok || !access.permissions?.Approvals?.view || !access.permissions?.Approvals?.export) throw new Error('Approvals View and Export permissions are required to download this report.')
          downloadWeeklySalesExport(report)
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to download report.') }
        finally { setBusy(false) }
      }}><Download className="size-4" />{busy ? 'Downloading…' : 'Download Excel'}</button>}
    </div>
    {(error || loadError) && <p role="alert" className="pb-3 text-sm text-destructive">{error || loadError}</p>}
    <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border" tabIndex={0} role="region" aria-label="Excel worksheet">
      <table aria-label={workbook.SheetNames[sheetIndex]} aria-busy={loading} className="table-fixed border-separate border-spacing-0 text-xs" style={{ width: 170 + 280 + 90 * (lastColumn - 1) }}>
        <colgroup>
          {Array.from({ length: lastColumn + 1 }, (_, c) => <col key={c} style={{ width: c === 0 ? 170 : c === 1 ? 280 : 90 }} />)}
        </colgroup>
        <tbody>{Array.from({ length: Math.max(0, range.e.r - 1) }, (_, index) => index + 2).filter(r => r < 3 || r > 4 || Boolean(sheet['A' + (r + 1)]?.v || sheet['B' + (r + 1)]?.v)).map(r => <tr key={r}>
          {Array.from({ length: lastColumn + 1 }, (_, c) => {
            const merge = sheet['!merges']?.find(item => r >= item.s.r && r <= item.e.r && c >= item.s.c && c <= item.e.c)
            if (merge && (merge.s.r !== r || merge.s.c !== c)) return null
            const cell = sheet[XLSX.utils.encode_cell({ r, c })]
            const fill = cell?.s?.fgColor?.rgb as string | undefined
            const dark = ['7030A0','38761D','3F7D20'].includes(fill?.slice(-6) ?? '') || (r === 7 && c < 2)
            return <td key={c} rowSpan={merge ? merge.e.r - r + 1 : undefined} colSpan={merge ? merge.e.c - c + 1 : undefined}
              style={{ left: c < 3 ? [0, 170, 450][c] : undefined, background: fill ? '#' + fill.slice(-6) : '#ffffff', color: dark ? 'white' : undefined, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', textAlign: c > 1 ? 'right' : 'left', fontWeight: r < 9 || !sheet['B' + (r + 1)]?.v || sheet['B' + (r + 1)]?.v === 'TOTAL' ? 600 : 400 }}
              className={'border border-black/10 px-2 py-2' + (c < 3 ? ' md:sticky md:z-10' : '') + (c === 2 ? ' md:shadow-[2px_0_0_#d1d5db]' : '')}>{r === 5 && c === 2
                ? <Select.Root value={month ?? months.indexOf(String(sheet.C6?.v)) + 1} onValueChange={value => { if (value !== null) { setMonth(value); onBudgetMonthChange(value) } }} items={months.map((label, index) => ({ label, value: index + 1 }))}>
                    <Select.Trigger aria-label="Budget Month" className="inline-flex h-8 w-full items-center justify-between gap-1 rounded border border-black/15 bg-white/70 px-1.5 text-xs font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Select.Value /><Select.Icon><ChevronDown className="size-3.5" /></Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Positioner sideOffset={4} align="end" alignItemWithTrigger={false} className="z-[130]">
                        <Select.Popup className="w-[var(--anchor-width)] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
                          <Select.List className="max-h-[min(16rem,var(--available-height))] overflow-x-hidden overflow-y-auto">
                            {months.map((label, index) => <Select.Item key={label} value={index + 1} className="flex min-w-0 cursor-pointer items-center justify-between gap-1 rounded px-1.5 py-2 text-xs font-semibold outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
                              <Select.ItemText>{label}</Select.ItemText><Select.ItemIndicator><Check className="size-3.5" /></Select.ItemIndicator>
                            </Select.Item>)}
                          </Select.List>
                        </Select.Popup>
                      </Select.Positioner>
                    </Select.Portal>
                  </Select.Root>
                : typeof cell?.v === 'number'
                ? cell.v.toLocaleString('en-US', { maximumFractionDigits: 2 })
                : String(cell?.v ?? '')}</td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div role="tablist" aria-label="Report sheets" className="mt-3 flex shrink-0 flex-wrap gap-2">
      {workbook.SheetNames.map((name, index) => <button role="tab" aria-selected={index === sheetIndex} key={name} onClick={() => setSheetIndex(index)} className={'rounded-md border px-3 py-2 text-sm ' + (index === sheetIndex ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{name}</button>)}
    </div>
  </>
}
