'use client'

import dynamic from 'next/dynamic'
import { RecordDialog } from '@/components/ui/record-dialog'
import type { ExportInput } from '@/lib/weekly-sales-export'

const Preview = dynamic(() => import('@/components/approval-excel-preview'), { ssr: false, loading: () => null })

export function ApprovalExcelDialog({ input, loading, error, canDownload, onClose, onBudgetMonthChange }: {
  input: ExportInput | null; loading: boolean; error: string; canDownload: boolean; onClose: () => void; onBudgetMonthChange: (month: number) => void
}) {
  return <RecordDialog open onClose={onClose} title="Weekly Forecast Approval" wide contained maxWidth="95vw">
    {input ? <Preview input={input} loading={loading} loadError={error} canDownload={canDownload} onBudgetMonthChange={onBudgetMonthChange} /> : <>
      <h2 className="pr-10 text-lg font-semibold">Weekly Forecast Approval</h2>
      {error && <p role="alert" className="flex min-h-64 items-center justify-center text-sm text-destructive">{error}</p>}
    </>}
  </RecordDialog>
}
