'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, ScrollText } from 'lucide-react'
import { createClient } from '@/lib/client'
import { modules, useAuthorization } from '@/lib/authorization'
import { Table } from '@/components/ui/table'
import { TableLoadingRow } from '@/components/ui/loading-spinner'

type AuditRow = {
  id: number; created_at: string; actor_name: string; module: string; table_name: string
  record_id: string | null; action: string; summary: string; changed_fields: string[]
}
const pageSize = 50
const field = 'h-10 w-full rounded-md border bg-background px-3 text-sm'

export default function AuditLogsPage() {
  const authorization = useAuthorization()
  const client = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [recordId, setRecordId] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const request = useRef(0)
  const allowed = authorization.role === 'Admin' && authorization.can('Audit Logs', 'view')
  const load = useCallback(async () => {
    if (!allowed) return
    const current = ++request.current
    setLoading(true)
    setError('')
    try {
      if (from && to && from > to) throw new Error('From date must be on or before To date.')
      let query = client.from('audit_logs').select('id, created_at, actor_name, module, table_name, record_id, action, summary, changed_fields')
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize)
      if (module) query = query.eq('module', module)
      if (action) query = query.eq('action', action)
      if (recordId) query = query.eq('record_id', recordId)
      if (from) query = query.gte('created_at', new Date(from + 'T00:00:00').toISOString())
      if (to) {
        const end = new Date(to + 'T00:00:00')
        end.setDate(end.getDate() + 1)
        query = query.lt('created_at', end.toISOString())
      }
      const result = await query.abortSignal(AbortSignal.timeout(45000))
      if (result.error) throw new Error(`Unable to load audit logs. Apply migration 202611090003_audit_logs.sql if this module is new. ${result.error.message}`)
      if (current !== request.current) return
      setRows((result.data ?? []).slice(0, pageSize))
      setHasMore((result.data?.length ?? 0) > pageSize)
    } catch (err) {
      if (current === request.current) { setRows([]); setHasMore(false); setError(err instanceof Error ? err.message : 'Unable to load audit logs.') }
    } finally { if (current === request.current) setLoading(false) }
  }, [allowed, client, module, action, recordId, from, to, page])
  useEffect(() => {
    const activeRequest = request
    const timer = setTimeout(() => { void load() }, 0)
    return () => { clearTimeout(timer); ++activeRequest.current }
  }, [load])
  if (!allowed) return <p className="text-sm text-muted-foreground">Audit Logs is available to authorized Admins.</p>
  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <header data-section-header="" className="flex flex-col items-start justify-between gap-3 border-b sm:flex-row sm:items-center">
      <h2 data-section-title=""><ScrollText className="size-5 text-muted-foreground" aria-hidden="true" />Audit Logs</h2>
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={'size-4 ' + (loading ? 'animate-spin' : '')} />Refresh</button>
    </header>
    <form className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(event) => { event.preventDefault(); setPage(0); setRecordId(search.trim()) }}>
      <label className="space-y-1 text-xs text-muted-foreground">Module<select className={field} value={module} onChange={(event) => { setModule(event.target.value); setPage(0) }}><option value="">All modules</option>{modules.filter((item) => item !== 'Audit Logs' && item !== 'Dashboard' && item !== 'Weekly Sales' && item !== 'Approvals').map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="space-y-1 text-xs text-muted-foreground">Action<select className={field} value={action} onChange={(event) => { setAction(event.target.value); setPage(0) }}><option value="">All actions</option><option value="INSERT">Created</option><option value="UPDATE">Updated</option><option value="DELETE">Deleted</option></select></label>
      <label className="space-y-1 text-xs text-muted-foreground">From date<input type="date" className={field} value={from} onChange={(event) => { setFrom(event.target.value); setPage(0) }} /></label>
      <label className="space-y-1 text-xs text-muted-foreground">To date<input type="date" className={field} value={to} onChange={(event) => { setTo(event.target.value); setPage(0) }} /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Record ID<div className="flex gap-2"><input className={field} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Exact ID" /><button type="submit" className="rounded-md border px-2 text-sm">Search</button></div></label>
    </form>
    {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}
    <Table className="min-w-[1000px] text-sm" containerProps={{ className: 'max-h-[65vh] overflow-auto', 'aria-label': 'Audit activity', tabIndex: 0 }}>
      <thead className="sticky top-0 bg-card"><tr>{['Time', 'User', 'Module / Table', 'Action', 'Record ID', 'Details'].map((title) => <th key={title} className="px-3 py-3 text-left font-semibold">{title}</th>)}</tr></thead>
      <tbody>{loading ? <TableLoadingRow columns={6} label="audit logs" /> : rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">{error ? 'Audit logs could not be loaded.' : 'No audit activity found. Logging starts when the audit migration is applied.'}</td></tr> : rows.map((row) => <tr key={row.id} className="border-t align-top">
        <td className="whitespace-nowrap px-3 py-3">{new Date(row.created_at).toLocaleString()}</td>
        <td className="px-3 py-3">{row.actor_name}</td>
        <td className="px-3 py-3">{row.module}<span className="block text-xs text-muted-foreground">{row.table_name}</span></td>
        <td className={'px-3 py-3 font-medium ' + (row.action === 'DELETE' ? 'text-red-600 dark:text-red-400' : row.action === 'INSERT' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>{row.action === 'INSERT' ? 'Created' : row.action === 'UPDATE' ? 'Updated' : 'Deleted'}</td>
        <td className="px-3 py-3">{row.record_id ?? '—'}</td>
        <td className="max-w-sm px-3 py-3 wrap-anywhere">{row.summary}{row.changed_fields.length > 0 && <span className="mt-1 block text-xs text-muted-foreground">Fields: {row.changed_fields.join(', ')}</span>}</td>
      </tr>)}</tbody>
    </Table>
    <footer className="flex items-center justify-between gap-2 border-t p-4 text-sm"><span>Page {page + 1} · {rows.length} records</span><div className="flex gap-2"><button className="rounded-md border px-3 py-2 disabled:opacity-50" disabled={loading || page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="rounded-md border px-3 py-2 disabled:opacity-50" disabled={loading || !hasMore} onClick={() => setPage((current) => current + 1)}>Next</button></div></footer>
  </section>
}
