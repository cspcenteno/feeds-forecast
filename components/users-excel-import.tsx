'use client'

import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { ChevronDown, ChevronRight, Download, RefreshCw, Upload } from 'lucide-react'
import { Table } from '@/components/ui/table'
import { createClient } from '@/lib/client'
import { defaultPermissions, modules } from '@/lib/authorization-rules'
import { useAuthorization } from '@/lib/authorization'
import { parseUserImportSheets, userImportColumns, validateUserImport, type UserImportReferences, type UserImportRow } from '@/lib/users-import'

type Outcome = { status: 'Created' | 'Failed'; message: string }

export function UsersExcelImport({ blocked, onBusyChange, onCreated }: {
  blocked: boolean; onBusyChange: (value: boolean) => void; onCreated: () => Promise<void>
}) {
  const authorization = useAuthorization()
  const client = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<UserImportRow[]>([])
  const [refs, setRefs] = useState<UserImportReferences>({ users: [], regions: [], subregions: [] })
  const [referencesReady, setReferencesReady] = useState(false)
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<UserImportRow | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const working = useRef(false)
  const disabled = busy || blocked || !authorization.can('Users', 'add')
  const preview = useMemo(() => validateUserImport(rows, refs), [rows, refs])
  const ready = preview.filter((row) => row.status === 'Ready' && outcomes[row.source.id]?.status !== 'Created')

  async function loadReferences() {
    setReferencesReady(false)
    async function load(table: string, columns: string, active = false) {
      const records: Record<string, unknown>[] = []
      let cursor: string | number | null = null
      while (true) {
        const query = client.from(table).select(columns).order('id').limit(500)
        if (active) query.eq('is_active', true)
        if (cursor !== null) query.gt('id', cursor)
        const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))
        if (error) throw new Error(`Unable to load ${table}: ${error.message}`)
        const page = (data ?? []) as unknown as Record<string, unknown>[]
        records.push(...page)
        if (page.length < 500) return records
        cursor = page[page.length - 1].id as string | number
      }
    }
    const [users, regions, subregions] = await Promise.all([
      load('users', 'id, email'), load('regions', 'id, name', true), load('subregions', 'id, name, region_id', true),
    ])
    const loaded = { users, regions, subregions } as unknown as UserImportReferences
    setRefs(loaded)
    setReferencesReady(true)
    return loaded
  }

  async function run(work: () => Promise<void>) {
    if (disabled || working.current) return
    working.current = true
    setBusy(true)
    onBusyChange(true)
    setError('')
    setMessage('')
    try { await work() }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to process the users import.') }
    finally { working.current = false; setBusy(false); onBusyChange(false); setProgress('') }
  }

  async function upload(file: File) {
    await run(async () => {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Choose an Excel (.xlsx, .xls) or CSV file.')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const data = parseUserImportSheets(workbook.SheetNames.map((name) => ({
        name, rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: true }),
      })))
      setRows(data.map((row) => ({ ...row, id: crypto.randomUUID() })))
      setOutcomes({})
      setEditing(null)
      setShow(true)
      await loadReferences()
      setMessage(`${data.length} row(s) loaded. Review the records before creating accounts.`)
    })
  }

  async function createUsers() {
    await run(async () => {
      if (temporaryPassword.length < 8 || temporaryPassword.length > 128) throw new Error('Set a temporary password between 8 and 128 characters.')
      const latest = await loadReferences()
      const eligible = validateUserImport(rows, latest).filter((row) => row.status === 'Ready' && outcomes[row.source.id]?.status !== 'Created')
      if (!eligible.length) { setMessage('No new valid users remain to create.'); return }
      if (!window.confirm(`Create ${eligible.length} new user account(s) with role-default permissions? All accounts will require a password change at first sign-in.`)) return
      let created = 0
      let failed = 0
      try {
        for (const [index, row] of eligible.entries()) {
          setProgress(`Creating account ${index + 1} of ${eligible.length}…`)
          const roleDefaults = defaultPermissions(row.values.role!)
          const response = await fetch('/api/admin/users', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...row.values, temporaryPassword, permissions: modules.map((module) => ({
              module, can_view: roleDefaults[module].view, can_add: roleDefaults[module].add,
              can_edit: roleDefaults[module].edit, can_delete: roleDefaults[module].delete,
            })) }),
          })
          const result = await response.json()
          if (!response.ok) {
            failed++
            setOutcomes((current) => ({ ...current, [row.source.id]: { status: 'Failed', message: result.error ?? 'Unable to create this account.' } }))
            if ([401, 403, 429].includes(response.status)) break
          } else {
            created++
            setOutcomes((current) => ({ ...current, [row.source.id]: { status: 'Created', message: 'Account created. Password change required at first sign-in.' } }))
          }
        }
        const remaining = eligible.length - created - failed
        setMessage(`${created} account(s) created; ${failed} failed.${remaining ? ` ${remaining} account(s) remain unprocessed.` : ''} Existing accounts and duplicate emails were skipped.`)
      } finally {
        await loadReferences()
        await onCreated()
        if (created) setTemporaryPassword('')
      }
    })
  }

  function downloadTemplate() {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([[...userImportColumns]])
    sheet['!cols'] = userImportColumns.map((column) => ({ wch: column === 'email' ? 36 : 24 }))
    XLSX.utils.book_append_sheet(workbook, sheet, 'Users Import')
    XLSX.writeFile(workbook, 'users-import-template.xlsx')
  }

  return <section className="rounded-xl border bg-card shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
      <div><h2 className="font-semibold">Users Excel Import</h2><p className="mt-1 text-sm text-muted-foreground">Create new accounts from Excel or CSV using region and subregion names.</p></div>
      <div className="flex flex-wrap gap-2">
        <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
        <button type="button" disabled={disabled} onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><Download className="size-4" />Template</button>
        <button type="button" disabled={disabled} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"><Upload className="size-4" />Upload Excel</button>
        <button type="button" disabled={disabled} onClick={() => { setShow(true); void run(async () => { await loadReferences() }) }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />Refresh</button>
        <button type="button" disabled={disabled} aria-expanded={show} onClick={() => setShow(!show)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">{show ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}{show ? 'Hide' : 'Show'}</button>
      </div>
    </div>
    {error && <p role="alert" className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="m-4 rounded-md border p-3 text-sm">{message}</p>}
    {show && <div className="space-y-4 p-6">
      {busy && <p role="status" className="text-sm">{progress || 'Loading and validating users…'}</p>}
      <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-lg space-y-2"><h3 className="text-sm font-medium">Create validated users</h3><p className="text-xs text-muted-foreground">Ready rows create new accounts with role-default permissions. Existing accounts are kept. Users must change their temporary password when signing in.</p>
          <label htmlFor="users-import-password" className="block text-sm font-medium">Temporary password for new accounts</label><input id="users-import-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} disabled={disabled} value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" /></div>
        <button type="button" disabled={disabled || !referencesReady || !ready.length || temporaryPassword.length < 8} onClick={() => void createUsers()} className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Create {ready.length} User(s)</button>
      </div>
      {editing && <form onSubmit={(event) => { event.preventDefault(); setRows((current) => current.map((row) => row.id === editing.id ? editing : row)); setOutcomes((current) => { const next = { ...current }; delete next[editing.id]; return next }); setEditing(null) }} className="space-y-3 rounded-lg border p-4"><h3 className="text-sm font-medium">Edit uploaded user</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{userImportColumns.map((column) => <label key={column} className="space-y-1 text-sm"><span>{column}</span><input value={editing[column]} disabled={disabled} onChange={(event) => setEditing({ ...editing, [column]: event.target.value })} className="h-10 w-full rounded-md border bg-background px-3" /></label>)}</div><div className="flex gap-2"><button type="submit" disabled={disabled} className="rounded-md border px-3 py-2 text-sm">Save changes</button><button type="button" disabled={disabled} onClick={() => setEditing(null)} className="rounded-md border px-3 py-2 text-sm">Cancel</button></div></form>}
      {referencesReady && <Table className="min-w-[1400px] table-fixed" containerProps={{ className: 'max-h-[min(32rem,65vh)] overflow-auto rounded-lg border', tabIndex: 0, role: 'region', 'aria-label': 'Users import preview' }}>
        <colgroup>{[8, 20, 14, 18, 8, 8, 10, 8, 6].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead className="sticky top-0 z-10 bg-card"><tr className="border-b">{['Action', 'Status / Validation', ...userImportColumns].map((label) => <th key={label} className="px-3 py-3 text-left font-medium">{label}</th>)}</tr></thead>
        <tbody>{!rows.length ? <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Upload a file to review new users.</td></tr> : preview.map((row) => { const outcome = outcomes[row.source.id]; return <tr key={row.source.id} className="border-b align-top">
          <td className="px-3 py-3"><button type="button" disabled={disabled || outcome?.status === 'Created'} onClick={() => setEditing(row.source)} className="rounded-md border px-2 py-1 text-xs disabled:opacity-50">Edit</button></td>
          <td className={`px-3 py-3 text-xs leading-5 wrap-anywhere ${row.status === 'Invalid' || outcome?.status === 'Failed' ? 'text-destructive' : ''}`}><p className="font-medium">{outcome?.status ?? row.status}</p>{outcome?.message ?? row.issues.join(' ')}</td>
          {userImportColumns.map((column) => <td key={column} className="px-3 py-3 wrap-anywhere">{row.source[column] || '—'}</td>)}
        </tr> })}</tbody>
      </Table>}
    </div>}
  </section>
}
