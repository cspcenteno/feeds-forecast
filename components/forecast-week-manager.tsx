'use client'

import { Settings as HeadingSettings, CalendarDays as HeadingCalendarDays } from 'lucide-react'

import { useStatusNotification } from '@/components/action-dialogs'

import { Save as ActionSaveIcon, LockOpen as ActionLockOpenIcon, Lock as ActionLockIcon, RotateCcw as ActionRotateCcwIcon } from 'lucide-react'
import { useActionDialogs } from '@/components/action-dialogs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'
import { currentWeekInput, weekInputDate } from '@/lib/forecast-weeks'
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [ahead, setAhead] = useState(4)
  const [selectedWeek, setSelectedWeek] = useState(currentWeekInput)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setMessage = useStatusNotification()
  const working = useRef(false)
  const canManage = isAdmin && authorization.can('Week Locks', 'edit')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await client.auth.getUser()
      if (!user) throw new Error('Sign in to view week locks.')
      const { data: profile, error: profileError } = await client.from('users').select('role, is_active').eq('id', user.id).single()
      if (profileError || !profile?.is_active) throw new Error(profileError?.message ?? 'An active account is required.')
      setIsAdmin(profile.role === 'Admin')
      const { data, error } = await client.rpc('get_forecast_week_calendar', { p_year: year })
      if (error || !Array.isArray(data?.weeks) || !Number.isInteger(data?.open_ahead_weeks)) throw new Error('Apply the automatic week-lock SQL, then refresh. ' + (error?.message ?? 'Week policy is unavailable.'))
      setWeeks(data.weeks); setAhead(data.open_ahead_weeks)
    } finally { setLoading(false) }
  }, [client, year])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) return load() }).catch((error) => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true }
  }, [load])

  async function save(action: 'window' | 'reopen' | 'lock' | 'reset') {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!canManage || busy || loading || working.current) return
    setError(''); setMessage('')
    try {
      const args: Record<string, unknown> = action === 'window'
        ? { p_action: 'policy', p_ahead: ahead, p_reason: `Set automatic future weeks to ${ahead}` }
        : { p_action: action === 'reset' ? 'reset' : 'range', p_from: weekInputDate(selectedWeek), p_to: weekInputDate(selectedWeek), p_status: action === 'lock' ? 'Locked' : 'Open', p_reason: reason.trim() }
      if (action !== 'window' && !reason.trim()) throw new Error('Enter a reason for changing this week.')
      if (action === 'reopen') args.p_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      if (!(actionConfirmation = await confirmAction({ message: action === 'window' ? `Open the current week plus ${ahead} future weeks?` : action === 'reopen' ? `Reopen ${selectedWeek} for 24 hours?` : action === 'lock' ? `Lock ${selectedWeek}?` : `Restore automatic rules for ${selectedWeek}?` }))) return
      working.current = true; setBusy(true)
      const { error } = await client.rpc('manage_forecast_weeks', args)
      if (error) throw new Error(error.message)
      setMessage(action === 'reopen' ? `${selectedWeek} is open for 24 hours. It will then follow the automatic rule.` : 'Week-lock settings updated.')
      setReason('')
      await load()
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to change week locks.') }
    finally { working.current = false; setBusy(false) }

    } finally { actionConfirmation?.finish() }
  }

  const input = 'h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-50'
  const button = 'h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50'
  return <main className="space-y-5">
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center"><div><h2 data-section-title="" className="font-semibold"><HeadingSettings className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Schedule Settings</h2></div><button data-action-tone="neutral" type="button" disabled={busy || loading} onClick={() => { setError(''); void load().catch((error) => setError(error.message)) }} className={button + ' inline-flex items-center gap-2'}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {canManage && <div className="space-y-4">
        <div className="app-field-row">
          <label data-field-size="compact" className="space-y-1.5 text-sm font-medium">Future Weeks
            <input type="number" min={0} max={52} disabled={busy} value={ahead} onChange={(event) => setAhead(Number(event.target.value))} className={input} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">Week
            <input type="week" disabled={busy} value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)} className={input} />
          </label>
          <label data-field-size="wide" className="space-y-1.5 text-sm font-medium">Correction Reason
            <input disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter correction reason" className={input} />
          </label>
        </div>
        <div data-action-toolbar="" className="flex flex-wrap gap-2"><button data-action-tone="primary" data-action-fill="" type="button" disabled={busy || loading} onClick={() => void save('window')} className={button}><ActionSaveIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Save Week Settings</button><button data-action-tone="positive" type="button" disabled={busy || loading} onClick={() => void save('reopen')} className={button}><ActionLockOpenIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Reopen for 24 hours</button><button data-action-tone="caution" type="button" disabled={busy || loading} onClick={() => void save('lock')} className={button}><ActionLockIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Lock week</button><button data-action-tone="caution" type="button" disabled={busy || loading} onClick={() => void save('reset')} className={button}><ActionRotateCcwIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Use automatic rule</button></div>
      </div>}
    </section>
    <section className="overflow-hidden rounded-xl border bg-card"><div data-section-header="" className="flex flex-col items-start gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-start"><h3 data-section-title="" className="text-sm font-semibold"><HeadingCalendarDays className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Week schedule</h3><input aria-label="Schedule year" type="number" min={2020} max={2100} value={year} disabled={busy} onChange={(event) => { const value = Number(event.target.value); if (value >= 2020 && value <= 2100) setYear(value) }} className={input + ' w-24'} /></div>
      <Table summary={{ records: weeks.length }} data-week-schedule className="min-w-[760px] table-fixed" containerProps={{ className: 'max-h-[min(32rem,65vh)] overflow-auto', tabIndex: 0, role: 'region', 'aria-label': 'Forecast week schedule' }}><colgroup><col style={{ width: "20%" }} /><col style={{ width: "28%" }} /><col style={{ width: "18%" }} /><col style={{ width: "34%" }} /></colgroup><thead className="sticky top-0 z-10 bg-card"><tr className="border-b">{['Week', 'Dates', 'Status', 'Reason'].map((label) => <th key={label} className="px-3 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{loading ? <TableLoadingRow columns={4} label="week schedule" /> : weeks.map((row) => <tr key={row.week} className="border-b"><td className="px-3 py-2 text-sm">{row.year}-W{String(row.week).padStart(2, '0')}</td><td className="px-3 py-2 text-xs">{dateLabel(row.start_date)} – {dateLabel(row.end_date)}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === 'Open' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'}`}>{row.status}</span></td><td className="px-3 py-2 text-xs wrap-anywhere">{row.is_override ? row.reason || 'Existing lock' : 'Automatic'}{row.is_override && row.expires_at && <span className="block text-muted-foreground">Until {new Date(row.expires_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span>}</td></tr>)}</tbody></Table>
    </section>
  </main>
}
