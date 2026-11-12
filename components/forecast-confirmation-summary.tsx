type RecordRow = {
  customer_id: number | null; product_id: number | null; volume: number | null
  year?: number; week?: number; submitted_by?: string | null; user_id?: string | null; endorsed_by?: string | null
}
export type ForecastConfirmationSummaryProps = {
  records: RecordRow[]; scope: string; level: 'submit' | 'endorse' | 'approve'
  customerName: (id: number | null) => string; productName: (id: number | null) => string
  personName?: (id: string | null) => string
}
export function ForecastConfirmationSummary({ records, scope, level }: ForecastConfirmationSummaryProps) {
  const number = (value: number) => value.toLocaleString('en-PH', { maximumFractionDigits: 2 })
  const weeks = [...new Map(records.flatMap(row => row.year == null || row.week == null
    ? [] : [[`${row.year}-${row.week}`, { year: row.year, week: row.week }] as const])).values()]
    .sort((a, b) => a.year - b.year || a.week - b.week)
  const weekLabel = ({ year, week }: { year: number; week: number }) => {
    const start = new Date(Date.UTC(year, 0, 4))
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + (week - 1) * 7)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    const format = (date: Date) => date.toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', timeZone: 'UTC',
    })
    return `Week ${week}, ${year} (${format(start)} – ${format(end)})`
  }
  const details = [
    ...(weeks.length ? [{ label: 'Week / Date', value: weeks.map(weekLabel).join('\n') }] : []),
    { label: 'Action Scope', value: scope },
    ...(level === 'approve' ? [{ label: 'RSMs', value: number(new Set(records.map(row => row.endorsed_by ?? null)).size) }] : []),
    ...(level !== 'submit' ? [{ label: 'KAMs', value: number(new Set(records.map(row => row.submitted_by ?? row.user_id ?? null)).size) }] : []),
    { label: 'Customers', value: number(new Set(records.map(row => row.customer_id)).size) },
    { label: 'Products', value: number(new Set(records.map(row => row.product_id)).size) },
    { label: 'Total Volume (50kg)', value: number(records.reduce((sum, row) => sum + (Number(row.volume) || 0), 0)) },
  ]
  return <div className="shrink-0 rounded-lg border bg-muted/30 p-4">
    <dl className="grid shrink-0 grid-cols-2 gap-4">
      {details.map(detail => <div key={detail.label} className="min-w-0">
        <dt className="text-xs text-muted-foreground">{detail.label}</dt>
        <dd className="mt-1 whitespace-pre-line text-sm font-medium wrap-anywhere">{detail.value}</dd>
      </div>)}
    </dl>

  </div>
}
