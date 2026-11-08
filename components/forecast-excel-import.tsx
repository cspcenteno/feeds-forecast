'use client'

import { useActionDialogs } from '@/components/action-dialogs'
import { confirmationRecordDetails } from '@/lib/action-confirmation'
import { TableActionButton } from '@/components/ui/table-action-button'
import { TableLoadingRow } from '@/components/ui/loading-spinner'
import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { ChevronDown, ChevronRight, Download, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Table } from '@/components/ui/table'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'
import { downloadImportTemplate } from '@/lib/download-import-template'
import { deleteForecastStaging, loadForecastStaging, toForecastStagingValues, updateForecastStaging } from '@/lib/forecast-staging'
import { loadForecastWeekStates } from '@/lib/forecast-week-locks'
import {
  forecastImportFields, forecastImportInputFields, forecastImportPeriods, validateForecastImport,
  type ForecastImportReferences, type ForecastImportRow, type ForecastImportScope,
} from '@/lib/forecast-import'

const emptyReferences: ForecastImportReferences = { users: [], regions: [], subregions: [], customers: [], products: [], forecasts: [], locks: [] }
const headerKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const numberLabel = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-PH', { maximumFractionDigits: 2 })

export function ForecastExcelImport({ userId, isAdmin, scope, blocked, onBusyChange, onImported }: {
  userId: string
  isAdmin: boolean
  scope: ForecastImportScope
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onImported: () => Promise<void>
}) {
  const { confirmAction } = useActionDialogs()

  const supabase = useMemo(() => createClient(), [])
  const authorization = useAuthorization()
  const [rows, setRows] = useState<ForecastImportRow[]>([])
  const [references, setReferences] = useState(emptyReferences)
  const [referencesReady, setReferencesReady] = useState(false)
  const [stagingReady, setStagingReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
  const [expanded, setExpanded] = useState({ Valid: true, Invalid: true })
  const [expandedValidationGroups, setExpandedValidationGroups] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<ForecastImportRow | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const taskInProgress = useRef(false)
  const disabled = busy || blocked || !userId || !isAdmin
  const preview = useMemo(() => validateForecastImport(rows, references, scope), [rows, references, scope])
  const ready = preview.filter((row) => row.status === 'Ready')
  const invalidCount = preview.filter((row) => row.issues.length > 0).length
  const validationGroups = useMemo(() => {
    const groups = new Map<string, { label: string; rows: typeof preview }>()
    for (const row of preview) {
      if (!row.issues.length) continue
      const label = row.issues.join('; ')
      const key = label.toLowerCase().replace(/\s+/g, ' ').trim()
      const group = groups.get(key) ?? { label, rows: [] }
      group.rows.push(row)
      groups.set(key, group)
    }
    return groups
  }, [preview])

  const allPreviewGroupsExpanded = expanded.Valid && expanded.Invalid &&
    [...validationGroups.keys()].every((key) => expandedValidationGroups.has(key))

  function toggleAllPreviewGroups() {
    const expand = !allPreviewGroupsExpanded
    setExpanded({ Valid: expand, Invalid: expand })
    setExpandedValidationGroups(new Set(expand ? validationGroups.keys() : []))
  }

  async function refreshPreview() {
    setStagingReady(false)
    const loadedRows = await loadForecastStaging(supabase)
    const loadedReferences = await loadReferences(loadedRows)
    setRows(loadedRows)
    setStagingReady(true)
    return { rows: loadedRows, references: loadedReferences }
  }

  async function loadReferences(sourceRows = rows) {
    setReferencesReady(false)
    async function load(table: string, columns: string, options?: { active?: boolean; owner?: boolean }) {
      const records: Record<string, unknown>[] = []
      let lastId: number | null = null
      while (true) {
        const query = supabase.from(table).select(columns).order('id').limit(500)
        if (options?.active) query.eq('is_active', true)
        if (options?.owner) query.eq('user_id', userId)
        if (lastId !== null) query.gt('id', lastId)
        const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))
        if (error) throw new Error(`Unable to load ${table}: ${error.message}`)
        const page = (data ?? []) as unknown as Record<string, unknown>[]
        records.push(...page)
        if (page.length < 500) return records
        lastId = Number(page[page.length - 1].id)
      }
    }
    async function loadUsers() {
      const response = await fetch('/api/admin/forecast-import', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Unable to load KAM users.')
      return result.users as ForecastImportReferences['users']
    }
    const [users, regions, subregions, customers, products, forecasts, locks] = await Promise.all([
      loadUsers(),
      load('regions', 'id, name, code', { active: true }),
      load('subregions', 'id, name, region_id', { active: true }),
      load('customers', 'id, customer, region_id', { active: true }),
      load('products', 'id, code, name, category_id, weight', { active: true }),
      load('sales_forecasts', 'id, user_id, year, week, region_id, subregion_id, customer_id, product_id'),
      loadForecastWeekStates(supabase, forecastImportPeriods(sourceRows)),
    ])
    const loaded = { users, regions, subregions, customers, products, forecasts, locks } as unknown as ForecastImportReferences
    setReferences(loaded)
    setReferencesReady(true)
    return loaded
  }

  async function run(work: () => Promise<void>) {
    if (disabled || taskInProgress.current) return
    taskInProgress.current = true
    setBusy(true)
    onBusyChange(true)
    setError('')
    setMessage('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || user?.id !== userId) throw new Error('Your session has changed. Refresh the page before importing.')
      const { data: profile, error: profileError } = await supabase.from('users')
        .select('role, is_active').eq('id', user.id).single()
      if (profileError) throw new Error(profileError.message)
      if (profile?.role !== 'Admin' || !profile.is_active) throw new Error('Forecast Excel Import is available only to active Admin accounts.')
      await work()
    }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to process the forecast upload.') }
    finally {
      taskInProgress.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  async function upload(file: File) {
    await run(async () => {
      if (!authorization.can('Forecast Input', 'add')) throw new Error('You do not have permission to import forecasts.')
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Choose an Excel (.xlsx, .xls) or CSV file.')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('The file does not contain a worksheet.')
      const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
      if (!sourceRows.length) throw new Error('The worksheet contains no records.')
      const headers = new Map(Object.keys(sourceRows[0]).map((header) => [headerKey(header), header]))
      const aliases = {
        year: ['year'], week: ['week', 'weeknumber', 'isoweek'], region: ['region', 'regionname', 'regioncode'],
        subregion: ['subregion', 'subregionname'], customer: ['customer', 'customername'],
        product_code: ['productcode', 'code'], forecast: ['forecast', 'forecastquantity', 'quantity', 'qty', 'forecastqty'],
        volume: ['volume', 'forecastvolume', 'forecastvol', 'vol', 'volume50kg'],
        product_name: ['productname', 'productdescription', 'description'],
        kam: ['kam', 'kamsalesman', 'kamname', 'keyaccountmanager', 'salesman', 'salesmanname'],
      }
      const columns = Object.fromEntries(forecastImportInputFields.map(([field]) => [field,
        aliases[field].map((alias) => headers.get(alias)).find(Boolean),
      ]))
      const missing = forecastImportFields.filter(([field]) => ['region', 'year', 'week', 'product_code'].includes(field) && !columns[field])
      if (missing.length) throw new Error(`Missing required columns: ${missing.map(([, label]) => label).join(', ')}.`)
      if (!columns.forecast && !columns.volume) throw new Error('Missing required column: Volume or Forecast quantity.')
      const uploaded: ForecastImportRow[] = sourceRows.map((row) => ({
        id: crypto.randomUUID(),
        ...Object.fromEntries(forecastImportInputFields.map(([field]) => [field, String(row[columns[field] ?? ''] ?? '').trim()])),
      } as ForecastImportRow))
      setEditing(null)
      setShow(true)
      setStagingReady(false)
      let uploadedCount = 0
      try {
        for (let start = 0; start < uploaded.length; start += 500) {
          const batch = uploaded.slice(start, start + 500).map((row) => ({ ...toForecastStagingValues(row), uploaded_by: userId }))
          const { error } = await supabase.from('forecast_import_staging').insert(batch).abortSignal(AbortSignal.timeout(45000))
          if (error) throw new Error(`Upload stopped after ${uploadedCount} row(s) saved to staging: ${error.message}. Refresh to review saved rows before retrying.`)
          uploadedCount += batch.length
        }
        setMessage(`${uploadedCount} row(s) uploaded to staging from ${file.name}. Review Valid and Invalid records before importing.`)
      } finally {
        await refreshPreview()
      }
    })
  }

  async function importReady() {
    await run(async () => {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
      if (!authorization.can('Forecast Input', 'add')) throw new Error('You do not have permission to import forecasts.')
      // Recheck locks and existing forecasts immediately before saving.
      const latest = await refreshPreview()
      const eligible = validateForecastImport(latest.rows, latest.references, scope).filter((row) => row.status === 'Ready')
      if (!eligible.length) { setMessage('No Ready records remain. Review validation results.'); return }
      if (!(actionConfirmation = await confirmAction({ message: `Import ${eligible.length} forecast record(s) as Drafts? Submission remains a separate step.`, details: confirmationRecordDetails(eligible.map((item) => ({ volume: item.payload.volume })), 'Total volume (50kg)') }))) return
      let imported = 0
      try {
        for (let start = 0; start < eligible.length; start += 250) {
          const ids = eligible.slice(start, start + 250).map((row) => row.source.id)
          const response = await fetch('/api/admin/forecast-import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
          })
          const result = await response.json()
          if (!response.ok) throw new Error(`Import stopped after ${imported} saved row(s): ${result.error ?? 'Unable to import forecasts.'} Refresh validation before retrying.`)
          imported += result.imported
        }
        setMessage(`${imported} forecast record(s) imported as Drafts. Uploaded rows remain available for review.`)
      } finally {
        await refreshPreview()
        await onImported()
      }

    } finally { actionConfirmation?.finish() }
  })
  }

  async function addCustomer(row: (typeof preview)[number]) {
    await run(async () => {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
      if (!authorization.can('Customers', 'add') || !row.region || !row.source.customer.trim()) return
      if (!scope.allRegions && row.region.id !== scope.regionId) return
      const latest = await loadReferences()
      const current = validateForecastImport([row.source], latest, scope)[0]
      if (!current.region || current.customer) return
      const name = row.source.customer.trim()
      const exists = latest.customers.some((customer) => customer.region_id === current.region!.id &&
        customer.customer.trim().toLowerCase().replace(/\s+/g, ' ') === name.toLowerCase().replace(/\s+/g, ' '))
      if (exists) throw new Error('Multiple matching customers exist. Correct the customer name before importing.')
      if (!(actionConfirmation = await confirmAction({ message: `Add "${name}" to Customers in ${current.region.name}?` }))) return
      const { error } = await supabase.from('customers').insert({ customer: name, region_id: current.region.id, is_active: true })
      if (error) throw new Error(error.message)
      await loadReferences()
      setMessage(`Customer "${name}" added. Validation updated.`)

    } finally { actionConfirmation?.finish() }
  })
  }

  async function saveUploadedRow(row: ForecastImportRow) {
    await run(async () => {
      if (!authorization.can('Forecast Input', 'edit')) throw new Error('You do not have permission to edit uploaded forecasts.')
      try {
        await updateForecastStaging(supabase, row)
        setEditing(null)
        setMessage('Uploaded forecast updated in staging.')
      } finally {
        await refreshPreview()
      }
    })
  }

  async function discardUploadedRows(ids: string[]) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!(actionConfirmation = await confirmAction({ message: `Discard ${ids.length} uploaded staging row(s)? Saved forecasts will be kept.` }))) return
    await run(async () => {
      if (!authorization.can('Forecast Input', 'delete')) throw new Error('You do not have permission to discard uploaded forecasts.')
      try {
        await deleteForecastStaging(supabase, ids)
        setEditing((current) => current && ids.includes(current.id) ? null : current)
        setMessage(`${ids.length} staging row(s) discarded.`)
      } finally {
        await refreshPreview()
      }
    })

    } finally { actionConfirmation?.finish() }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">Forecast Excel Import</h2>
          <p className="mt-1 text-sm text-muted-foreground">Upload Excel or CSV, review Valid / Invalid records, then import Ready rows as Drafts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void upload(file)
          }} />
          <button data-action-tone="neutral" type="button" disabled={disabled} onClick={() => downloadImportTemplate('Forecast')} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><Download className="size-4" />Template</button>
          <button data-action-tone="transfer" data-action-fill="" type="button" disabled={disabled || !authorization.can('Forecast Input', 'add')} onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"><Upload className="size-4" />Upload Excel</button>
          <button data-action-tone="neutral" type="button" disabled={disabled} onClick={() => { setShow(true); void run(async () => { await refreshPreview() }) }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />Refresh</button>
          <button data-slot="show-hide-button" data-action-tone="neutral" type="button" disabled={disabled} aria-expanded={show} onClick={() => {
            setShow(!show)
            if (!show) void run(async () => { await refreshPreview() })
          }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">{show ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}{show ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      {error && <p role="alert" className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="m-4 rounded-md border p-3 text-sm">{message}</p>}
      {show && <div className="space-y-4 p-6">
        {referencesReady && stagingReady && <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Total Records', rows.length], ['Ready to Import', ready.length], ['Invalid', invalidCount], ['Already Imported / Duplicate', preview.length - invalidCount - ready.length]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
          </div>
        </>}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium">Import validated records</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Only records marked Ready will be imported. Invalid, already imported, and duplicate staging records will be skipped.
                {(!referencesReady || !stagingReady) && (busy
                  ? ' Waiting for saved records to finish loading before checking duplicates.'
                  : ' Refresh staging records successfully to enable importing.')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button data-action-tone="transfer" data-action-fill="" type="button" disabled={disabled || !referencesReady || !stagingReady || !ready.length || !authorization.can('Forecast Input', 'add')} onClick={() => void importReady()} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                <Upload className="size-4" />Import {ready.length} Record(s)
              </button>
              {authorization.can('Forecast Input', 'delete') && <button data-action-tone="danger" type="button" disabled={disabled || !stagingReady || !rows.length} onClick={() => void discardUploadedRows(rows.map((row) => row.id))} className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50">
                <Trash2 className="size-4" aria-hidden="true" />Discard {rows.length} Record(s)
              </button>}
            </div>
          </div>
        {referencesReady && stagingReady && <>
          {editing && <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
            event.preventDefault()
            void saveUploadedRow(editing)
          }}>
            <h3 className="text-sm font-medium">Edit uploaded forecast</h3>
            <div className="app-field-row">{forecastImportFields.map(([field, label]) => <label key={field} className="space-y-1 text-sm"><span>{label}</span><input disabled={disabled} value={editing[field] ?? ''} onChange={(event) => setEditing({ ...editing, [field]: event.target.value })} className="w-full rounded-md border bg-background px-3 py-2" /></label>)}</div>
            <div className="flex gap-2"><button data-action-tone="primary" data-action-fill="" disabled={disabled} type="submit" className="rounded-md border px-3 py-2 text-sm">Save changes</button><button data-action-tone="neutral" type="button" disabled={disabled} onClick={() => setEditing(null)} className="rounded-md border px-3 py-2 text-sm">Cancel</button></div>
          </form>}
          <div className="flex justify-end">
            <button data-slot="expand-collapse-button" type="button" data-action-tone="neutral" disabled={disabled || !rows.length}
              aria-expanded={allPreviewGroupsExpanded} aria-controls="forecast-import-records" onClick={toggleAllPreviewGroups}
              className="rounded-md border px-3 py-2 text-sm">
              {allPreviewGroupsExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
          <Table data-volume-layout="forecast-import" id="forecast-import-records" className="min-w-[1200px] table-fixed" containerProps={{ className: 'max-h-[min(32rem,65vh)] overflow-auto rounded-lg border', tabIndex: 0, role: 'region', 'aria-label': 'Forecast import preview' }}>
            <colgroup>
              <col data-action-column="standard" className="w-[11%]" />
              <col className="w-[18%]" />
              <col className="w-[8%]" />
              <col className="w-[5%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[9%]" />
              <col className="w-[16%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card"><tr className="border-b">{['Action', 'Status / Validation', ...forecastImportFields.map(([, label]) => label)].map((label) => <th data-action-column={label === "Action" ? "standard" : undefined} key={label} scope="col" className={`px-3 py-3 font-medium ${label === 'Volume' ? 'text-right' : label === 'Year' ? 'text-center' : 'text-left'}`}>{label}</th>)}</tr></thead>
            <tbody>{busy ? <TableLoadingRow columns={forecastImportFields.length + 2} label="forecast import preview" /> : !rows.length ? <tr><td colSpan={forecastImportFields.length + 2} className="px-4 py-10 text-center text-muted-foreground">Upload an Excel or CSV file to begin.</td></tr> : (['Invalid', 'Valid'] as const).map((group) => {
              const grouped = preview.filter((row) => (row.issues.length > 0) === (group === 'Invalid'))
              const renderRows = (items: typeof preview) => items.map((row) => <tr key={row.source.id} className="border-b">
                  <td data-action-column="standard" className="px-3 py-3 align-top"><div className="flex flex-nowrap gap-1.5">
                    {authorization.can('Forecast Input', 'edit') && <TableActionButton action="edit" type="button" disabled={disabled} onClick={() => setEditing(row.source)} className="rounded-md border px-2 py-1 text-xs" />}
                    {authorization.can('Forecast Input', 'delete') && <TableActionButton action="discard" type="button" disabled={disabled} onClick={() => void discardUploadedRows([row.source.id])} className="rounded-md border px-2 py-1 text-xs" />}
                  </div></td>
                  <td className={`px-3 py-3 align-top text-xs leading-5 wrap-anywhere ${row.issues.length ? 'text-destructive' : ''}`}>
                    <p className="font-medium">{row.status}</p>
                    {row.issues.length > 0 && <p className="mt-1">{row.issues.join(' ')}</p>}
                    {!row.customer && row.region && row.source.customer.trim() && authorization.can('Customers', 'add') && (scope.allRegions || row.region.id === scope.regionId) && (
                      <button data-action-tone="primary" type="button" disabled={disabled} onClick={() => void addCustomer(row)} className="mt-2 block rounded-md border px-2 py-1 text-foreground disabled:opacity-50">Add to Customers</button>
                    )}
                  </td>
                  {forecastImportFields.map(([field]) => <td key={field} className={`px-3 py-3 align-top leading-5 ${field === 'volume' ? 'text-right tabular-nums wrap-anywhere' : field === 'year' ? 'whitespace-nowrap text-center tabular-nums' : 'wrap-anywhere'}`}>{field === 'volume' ? row.source.volume || numberLabel(row.payload.volume) : row.source[field] || '—'}</td>)}
                </tr>)
              return <ForecastPreviewGroup key={group} label={group} count={grouped.length} expanded={expanded[group]} onToggle={() => setExpanded((current) => ({ ...current, [group]: !current[group] }))}>
                {group === 'Invalid'
                  ? Array.from(validationGroups, ([key, validation]) => (
                    <ForecastPreviewGroup key={key} nested label={'Validation: ' + validation.label} count={validation.rows.length} expanded={expandedValidationGroups.has(key)} onToggle={() => setExpandedValidationGroups((current) => {
                      const next = new Set(current)
                      if (next.has(key)) next.delete(key)
                      else next.add(key)
                      return next
                    })}>
                      {renderRows(validation.rows)}
                    </ForecastPreviewGroup>
                  ))
                  : renderRows(grouped)}
              </ForecastPreviewGroup>
            })}</tbody>
          </Table>
        </>}
      </div>}
    </section>
  )
}

function ForecastPreviewGroup({ label, count, expanded, onToggle, children, nested = false }: {
  label: string; count: number; expanded: boolean; onToggle: () => void; children: React.ReactNode; nested?: boolean
}) {
  return <>
    <tr className={label === 'Invalid' ? 'border-b bg-destructive/10' : 'border-b bg-muted/30'}><td colSpan={forecastImportFields.length + 2}><button type="button" aria-expanded={expanded} onClick={onToggle} className={`flex w-full items-center gap-2 py-3 pr-3 text-left font-medium ${nested ? 'pl-6 text-sm' : 'pl-3'}`}>{expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}<span className="wrap-anywhere">{label} <span className="text-xs font-normal text-muted-foreground">({count})</span></span></button></td></tr>
    {expanded && children}
  </>
}
