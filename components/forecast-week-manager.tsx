'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'
import { currentWeekInput, weekInputDate } from '@/lib/forecast-weeks'
import { Table } from '@/components/ui/table'

type Week = { year: number; week: number; start_date: string; end_date: string; status: 'Open' | 'Locked'; is_override: boolean; reason: string | null; expires_at: string | null }
const dateLabel = (value: string) => new Date(value + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function ForecastWeekManager() {
  const client = useMemo(() => createClient(), [])
  const authorization = useAuthorization()
  const [year, setYear] = useState(() => Number(currentWeekInput().slice(0, 4)))
  const [weeks, setWeeks] = useState<Week[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [ahead, setAhead] = useState(4)
  const [savedAhead, setSavedAhead] = useState(4)
  const [selectedWeek, setSelectedWeek] = useState(currentWeekInput)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
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
      setWeeks(data.weeks); setAhead(data.open_ahead_weeks); setSavedAhead(data.open_ahead_weeks)
    } finally { setLoading(false) }
  }, [client, year])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) return load() }).catch((error) => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true }
  }, [load])

  async function save(action: 'window' | 'reopen' | 'lock' | 'reset') {
    if (!canManage || busy || loading || working.current) return
    setError(''); setMessage('')
    try {
      const args: Record<string, unknown> = action === 'window'
        ? { p_action: 'policy', p_ahead: ahead, p_reason: `Set automatic future weeks to ${ahead}` }
        : { p_action: action === 'reset' ? 'reset' : 'range', p_from: weekInputDate(selectedWeek), p_to: weekInputDate(selectedWeek), p_status: action === 'lock' ? 'Locked' : 'Open', p_reason: reason.trim() }
      if (action !== 'window' && !reason.trim()) throw new Error('Enter a reason for changing this week.')
      if (action === 'reopen') args.p_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      if (!window.confirm(action === 'window' ? `Open the current week plus ${ahead} future weeks?` : action === 'reopen' ? `Reopen ${selectedWeek} for 24 hours?` : action === 'lock' ? `Lock ${selectedWeek}?` : `Restore automatic rules for ${selectedWeek}?`)) return
      working.current = true; setBusy(true)
      const { error } = await client.rpc('manage_forecast_weeks', args)
      if (error) throw new Error(error.message)
      setMessage(action === 'reopen' ? `${selectedWeek} is open for 24 hours. It will then follow the automatic rule.` : 'Week-lock settings updated.')
      setReason('')
      await load()
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to change week locks.') }
    finally { working.current = false; setBusy(false) }
  }

  const input = 'h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-50'
  const button = 'h-10 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50'
  return <main className="space-y-5">
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Week Locks</h2><p className="mt-1 text-sm text-muted-foreground">Current week + {savedAhead} future weeks are open. All other weeks are locked automatically.</p></div><button type="button" disabled={busy || loading} onClick={() => { setError(''); void load().catch((error) => setError(error.message)) }} className={button + ' inline-flex items-center gap-2'}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
      {canManage && <div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm font-medium"><span className="block">Future weeks</span><input type="number" min={0} max={52} disabled={busy} value={ahead} onChange={(event) => setAhead(Number(event.target.value))} className={input + ' w-24'} /></label><button type="button" disabled={busy || loading} onClick={() => void save('window')} className={button}>Save</button></div>}
    </section>
    {canManage && <section className="space-y-3 rounded-xl border bg-card p-5"><h3 className="text-sm font-semibold">Correct a specific week</h3><div className="flex flex-wrap gap-3"><input aria-label="Week to change" type="week" disabled={busy} value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)} className={input} /><input aria-label="Reason for week change" disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for correction" className={input + ' min-w-48 flex-1'} /></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || loading} onClick={() => void save('reopen')} className={button}>Reopen for 24 hours</button><button type="button" disabled={busy || loading} onClick={() => void save('lock')} className={button}>Lock week</button><button type="button" disabled={busy || loading} onClick={() => void save('reset')} className={button}>Use automatic rule</button></div></section>}
    <section className="overflow-hidden rounded-xl border bg-card"><div className="flex items-center justify-between gap-3 border-b px-5 py-3"><h3 className="text-sm font-semibold">Week schedule</h3><input aria-label="Schedule year" type="number" min={2020} max={2100} value={year} disabled={busy} onChange={(event) => { const value = Number(event.target.value); if (value >= 2020 && value <= 2100) setYear(value) }} className={input + ' w-24'} /></div>
      <Table containerProps={{ className: 'max-h-[min(32rem,65vh)] overflow-auto', tabIndex: 0, role: 'region', 'aria-label': 'Forecast week schedule' }}><thead className="sticky top-0 z-10 bg-card"><tr className="border-b">{['Week', 'Dates', 'Status', 'Reason'].map((label) => <th key={label} className="px-3 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={4} className="p-6 text-center">Loading…</td></tr> : weeks.map((row) => <tr key={row.week} className="border-b"><td className="px-3 py-2 text-sm">{row.year}-W{String(row.week).padStart(2, '0')}</td><td className="px-3 py-2 text-xs">{dateLabel(row.start_date)} – {dateLabel(row.end_date)}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === 'Open' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'}`}>{row.status}</span></td><td className="px-3 py-2 text-xs wrap-anywhere">{row.is_override ? row.reason || 'Existing lock' : 'Automatic'}{row.is_override && row.expires_at && <span className="block text-muted-foreground">Until {new Date(row.expires_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span>}</td></tr>)}</tbody></Table>
    </section>
  </main>
}
