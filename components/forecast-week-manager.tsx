'use client'

import { usePopupError } from '@/components/action-dialogs'

import { StatusBadge } from '@/components/ui/status-badge'

import { Settings as HeadingSettings, CalendarDays as HeadingCalendarDays } from 'lucide-react'

import { useStatusNotification } from '@/components/action-dialogs'

import { LockOpen as ActionLockOpenIcon, Lock as ActionLockIcon, RotateCcw as ActionRotateCcwIcon } from 'lucide-react'
import { useActionDialogs } from '@/components/action-dialogs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'
import { currentWeekInput, weekInputDate, weekDateRangeLabel } from '@/lib/forecast-weeks'
import { Table } from '@/components/ui/table'
import { TableLoadingRow } from '@/components/ui/loading-spinner'

type Week = { year: number; week: number; start_date: string; end_date: string; status: 'Open' | 'Locked'; is_override: boolean; reason: string | null; expires_at: string | null }
const dateLabel = (value: string) => new Date(value + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function ForecastWeekManager() {
  const { confirmAction } = useActionDialogs()

  const client = useMemo(() => createClient(), [])
  const authorization = useAuthorization()
  const [year, setYear] = useState(() => Number(currentWeekInput().slice(0, 4)))
  const [weeks, setWeeks] = useState<Week[]>([])
  const [selectedWeek, setSelectedWeek] = useState(currentWeekInput)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [, setError] = usePopupError()
  const setMessage = useStatusNotification()
  const working = useRef(false)
  const canManage = ['Admin', 'Superuser'].includes(authorization.role) && authorization.can('Week Locks', 'edit')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await client.rpc('get_forecast_week_calendar', { p_year: year })
      if (error || !Array.isArray(data?.weeks) || !Number.isInteger(data?.open_ahead_weeks)) throw new Error('Apply the automatic week-lock SQL, then refresh. ' + (error?.message ?? 'Week policy is unavailable.'))
      setWeeks(data.weeks)
    } finally { setLoading(false) }
  }, [client, year])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) return load() }).catch((error) => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true }
  }, [load, setError])

  async function save(action: 'reopen' | 'lock' | 'reset') {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!canManage || busy || loading || working.current) return
    setError(''); setMessage('')
    try {
      const args: Record<string, unknown> = action === 'reset' ? {} : { p_action: 'range', p_from: weekInputDate(selectedWeek), p_to: weekInputDate(selectedWeek), p_status: action === 'lock' ? 'Locked' : 'Open', p_reason: reason.trim() }
      if (action !== 'reset' && !reason.trim()) throw new Error('Enter a reason to reopen or lock this week.')
      if (!(actionConfirmation = await confirmAction({ message: action === 'reopen' ? `Reopen ${selectedWeek} for 24 hours?` : action === 'lock' ? `Lock ${selectedWeek}?` : 'Restore the automatic rule for all weeks? This clears every manual lock and temporary reopening.' }))) return
      if (action === 'reopen') args.p_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      working.current = true; setBusy(true)
      const { error } = await client.rpc(action === 'reset' ? 'reset_all_forecast_week_overrides' : 'manage_forecast_weeks', args)
      if (error) throw new Error(error.message)
      setMessage(action === 'reset' ? 'All weeks now follow the automatic rule.' : action === 'reopen' ? `${selectedWeek} is open for 24 hours. It will then follow the automatic rule.` : 'Week-lock settings updated.')
      if (action !== 'reset') setReason('')
      await load()
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to change week locks.') }
    finally { working.current = false; setBusy(false) }

    } finally { actionConfirmation?.finish() }
  }

  const input = 'block h-10 w-full rounded-md border bg-background px-3 text-sm font-normal disabled:opacity-50'
  const button = 'h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50'
  return <main className="space-y-4">
    <section className="overflow-hidden rounded-xl border bg-card">
      <div data-week-settings-header="" data-section-header="" data-aligned-toolbar="" className="flex flex-col items-start justify-between gap-3 border-b sm:flex-row sm:items-center">
        <h2 data-section-title="" className="font-semibold"><HeadingSettings className="size-5 text-muted-foreground" aria-hidden="true" />Schedule Settings</h2>

      </div>

      {canManage && <div className="p-6"><div data-week-lock-controls="" className="max-w-3xl space-y-4">
        <div data-week-lock-fields="" className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"><span>Week <span className="text-destructive" aria-hidden="true">*</span>
            {weekDateRangeLabel(selectedWeek) && <span className="ml-2 text-xs font-normal text-muted-foreground">({weekDateRangeLabel(selectedWeek)})</span>}</span>
            <input type="week" disabled={busy} value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)} className={input} />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"><span>Reason <span className="text-destructive" aria-hidden="true">*</span></span>
            <input data-week-lock-reason="" required disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter reason…" className={input} />
          </label>
        </div>
        <div className="space-y-3">
          <div data-week-lock-actions="" className="flex flex-wrap items-center gap-2">
            <div className="space-y-2">
              <button data-week-lock-icon="" aria-label="Reopen for 24 hours" title="Reopen for 24 hours" data-action-tone="positive" type="button" disabled={busy || loading || !selectedWeek} onClick={() => void save('reopen')} className={button}><ActionLockOpenIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" /><span className="hidden md:inline">Reopen for 24 hours</span></button>
            </div>
            <div className="space-y-2">
              <button data-week-lock-icon="" aria-label="Lock week" title="Lock week" data-action-tone="caution" type="button" disabled={busy || loading || !selectedWeek} onClick={() => void save('lock')} className={button}><ActionLockIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" /><span className="hidden md:inline">Lock week</span></button>
            </div>
            <div className="space-y-2"><button data-week-lock-icon="" aria-label="Use Automatic Rule" title="Use Automatic Rule" data-action-tone="neutral" type="button" disabled={busy || loading} onClick={() => void save('reset')} className={button}><ActionRotateCcwIcon className="mr-1.5 inline-block size-4 align-middle" aria-hidden="true" /><span className="hidden md:inline">Use Automatic Rule</span></button></div>
          </div>
        </div>
      </div></div>}
    </section>
    <section className="overflow-hidden rounded-xl border bg-card"><div data-week-schedule-header="" data-section-header="" data-aligned-toolbar="" className="flex flex-row items-center gap-3 border-b px-5 py-3"><h3 data-section-title="" className="shrink-0 whitespace-nowrap text-sm font-semibold"><HeadingCalendarDays className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Week schedule</h3><div className="min-w-0 w-24 shrink sm:w-28"><input aria-label="Schedule year" type="number" min={2020} max={2100} value={year} disabled={busy} onChange={(event) => { const value = Number(event.target.value); if (value >= 2020 && value <= 2100) setYear(value) }} className={input} /></div></div>
      <Table summary={{ records: weeks.length }} data-week-schedule className="min-w-[760px] table-fixed" containerProps={{ className: 'max-h-[min(32rem,65vh)] overflow-auto', tabIndex: 0, role: 'region', 'aria-label': 'Forecast week schedule' }}><colgroup><col style={{ width: "20%" }} /><col style={{ width: "28%" }} /><col style={{ width: "18%" }} /><col style={{ width: "34%" }} /></colgroup><thead className="sticky top-0 z-10 bg-card"><tr className="border-b">{['Week', 'Dates', 'Status', 'Reason'].map((label) => <th key={label} className="px-3 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{loading ? <TableLoadingRow columns={4} label="week schedule" /> : weeks.map((row) => <tr key={row.week} className="border-b"><td className="px-3 py-2 text-sm">{row.year}-W{String(row.week).padStart(2, '0')}</td><td className="px-3 py-2 text-sm">{dateLabel(row.start_date)} – {dateLabel(row.end_date)}</td><td className="px-3 py-2"><StatusBadge status={row.status} /></td><td className="px-3 py-2 text-sm wrap-anywhere">{row.is_override ? row.reason || 'Existing lock' : 'Automatic'}{row.is_override && row.expires_at && <span className="block text-muted-foreground">Until {new Date(row.expires_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span>}</td></tr>)}</tbody></Table>
    </section>
  </main>
}
