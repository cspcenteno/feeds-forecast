'use client'

import { usePopupError } from '@/components/action-dialogs'

import { StatusBadge } from '@/components/ui/status-badge'

import { FileSpreadsheet as HeadingFileSpreadsheet, Pencil as HeadingPencil } from 'lucide-react'

import { useStatusNotification } from '@/components/action-dialogs'

import { ExpandCollapseIcon } from '@/components/ui/expand-collapse-icon'
import { Save as ActionSaveIcon, X as ActionXIcon, UserPlus as ActionUserPlusIcon } from 'lucide-react'
import { useActionDialogs } from '@/components/action-dialogs'
import { confirmationRecordDetails } from '@/lib/action-confirmation'
import { TableActionButton } from '@/components/ui/table-action-button'
import { LoadingSpinner, TableLoadingRow } from '@/components/ui/loading-spinner'
import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { ChevronDown, ChevronRight, Download, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Table } from '@/components/ui/table'
import { RecordDialog } from '@/components/ui/record-dialog'
import { importVolumeSummary } from '@/lib/import-volume-summary'
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
const previewFields = forecastImportFields.filter(([field]) => field !== 'kam' && field !== 'customer')
const previewColumnCount = previewFields.length + 2
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
  const [, setError] = usePopupError()
  const setMessage = useStatusNotification()
  const [editing, setEditing] = useState<ForecastImportRow | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const taskInProgress = useRef(false)
  const disabled = busy || blocked || !userId || !isAdmin
  const preview = useMemo(() => validateForecastImport(rows, references, scope).map(row => row.status === 'Duplicate in upload'
    ? { ...row, status: 'Invalid' as const, issues: [...row.issues, 'Duplicate in upload'] } : row), [rows, references, scope])
  const volumes = importVolumeSummary(preview.map(row => ({ volume: row.payload.volume, status: row.status })))
  const ready = preview.filter((row) => row.status === 'Ready')
  const invalidCount = preview.filter((row) => row.issues.length > 0).length
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set())
  const ownerGroups = useMemo(() => {
    const groups = new Map<string, { label: string; customers: Map<string, { label: string; rows: typeof preview }> }>()
    for (const row of preview.filter(row => !row.issues.length)) {
      const label = row.source.kam?.trim() || 'Unassigned KAM'
      const key = label.toLowerCase()
      const group = groups.get(key) ?? { label, customers: new Map() }
      const customer = row.source.customer.trim() || 'Unassigned customer'
      const customerKey = key + ':' + customer.toLowerCase()
      const entry = group.customers.get(customerKey) ?? { label: customer, rows: [] }
      entry.rows.push(row)
      group.customers.set(customerKey, entry)
      groups.set(key, group)
    }
    return groups
  }, [preview])
  const ownerKeys = [...ownerGroups].flatMap(([key, group]) => [key, ...group.customers.keys()])
  function toggleOwner(key: string) {
    setExpandedOwners(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
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
    [...validationGroups.keys()].every((key) => expandedValidationGroups.has(key)) && ownerKeys.every(key => expandedOwners.has(key))

  function toggleAllPreviewGroups() {
    const expand = !allPreviewGroupsExpanded
    setExpanded({ Valid: expand, Invalid: expand })
    setExpandedValidationGroups(new Set(expand ? validationGroups.keys() : []))
    setExpandedOwners(new Set(expand ? ownerKeys : []))
  }

  async function refreshPreview() {
    setStagingReady(false)
    setReferencesReady(false)
    setRows([])
    const loadedRows = await loadForecastStaging(supabase, setRows)
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
      load('forecasts', 'id, user_id, year, week, region_id, subregion_id, customer_id, product_id'),
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
      if (profile?.role !== 'Admin' || !profile.is_active) throw new Error('Forecasts Excel Import is available only to active Admin accounts.')
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
      if ((!authorization.can('Forecasts', 'add') || !authorization.can('Forecasts', 'import'))) throw new Error('You do not have permission to import forecasts.')
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
      if ((!authorization.can('Forecasts', 'add') || !authorization.can('Forecasts', 'import'))) throw new Error('You do not have permission to import forecasts.')
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
        setMessage(`${imported} forecast record(s) imported as Drafts and cleared from staging.`)
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
      if (!authorization.can('Forecasts', 'edit')) throw new Error('You do not have permission to edit uploaded forecasts.')
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
      if (!authorization.can('Forecasts', 'delete')) throw new Error('You do not have permission to discard uploaded forecasts.')
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
    <>
      <button data-action-tone="transfer" type="button" aria-label="Excel Import" title="Excel Import" disabled={disabled} onClick={() => {
        setShow(true)
        void run(async () => { await refreshPreview() })
      }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><HeadingFileSpreadsheet className="size-4" aria-hidden="true" /><span data-forecast-action-label="">Excel Import</span></button>
      <RecordDialog open={show} onClose={() => { setShow(false); setEditing(null) }} title="Forecasts Excel Import" busy={busy} wide contained maxWidth="90rem">
      <section className="app-tables flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div data-import-dialog-header data-section-header="" data-aligned-toolbar="" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 data-section-title="" className="text-base font-semibold"><HeadingFileSpreadsheet className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Forecasts Excel Import</h2>

        </div>
        <div data-action-toolbar="" className="flex flex-wrap gap-2">
<input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void upload(file)
          }} />
<button data-action-tone="transfer" data-action-fill="" type="button" disabled={disabled || (!authorization.can('Forecasts', 'add') || !authorization.can('Forecasts', 'import'))} title="Upload File" aria-label="Upload File" onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"><Upload className="size-4" aria-hidden="true" /><span data-import-icon-label="" className="sr-only md:not-sr-only">Upload File</span></button>
<button data-action-tone="neutral" type="button" disabled={disabled} title="Download Template" aria-label="Download Template" onClick={() => downloadImportTemplate('Forecasts')} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><Download className="size-4" /><span data-import-icon-label="" className="sr-only md:not-sr-only">Template</span></button>

<button data-action-tone="neutral" type="button" disabled={disabled} title="Refresh" aria-label="Refresh" onClick={() => { setShow(true); void run(async () => { await refreshPreview() }) }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} /><span data-import-icon-label="" className="sr-only md:not-sr-only">Refresh</span></button>
</div>
      </div>

      <div data-volume-import-body className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pt-4 sm:flex sm:flex-col sm:gap-4 sm:space-y-0 sm:overflow-hidden">
          <div data-import-summary-cards="" className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Total Records', rows.length], ['Ready to Import', ready.length], ['Invalid', invalidCount], ['Already Imported', preview.length - invalidCount - ready.length]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{rows.length > 0 ? value : busy ? <LoadingSpinner label={String(label).toLowerCase()} /> : referencesReady && stagingReady ? value : '—'}</p></div>)}
          </div>
          <div className="flex shrink-0 justify-end">
            <div data-action-toolbar="" data-import-preview-actions="" className="flex shrink-0 flex-wrap items-center gap-2">
              <button data-action-tone="transfer" data-action-fill="" type="button" disabled={disabled || !referencesReady || !stagingReady || !ready.length || (!authorization.can('Forecasts', 'add') || !authorization.can('Forecasts', 'import'))} title="Import Ready" aria-label="Import Ready" onClick={() => void importReady()} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                <Upload className="size-4" aria-hidden="true" /><span data-import-icon-label="" className="sr-only md:not-sr-only">Import Ready</span>
              </button>
              {authorization.can('Forecasts', 'delete') && <button data-action-tone="danger" type="button" disabled={disabled || !stagingReady || !rows.length} title="Discard All" aria-label="Discard All" onClick={() => void discardUploadedRows(rows.map((row) => row.id))} className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50">
                <Trash2 className="size-4" aria-hidden="true" /><span data-import-icon-label="" className="sr-only md:not-sr-only">Discard All</span>
              </button>}
            <button data-slot="expand-collapse-button" type="button" data-action-tone="neutral" disabled={disabled || !rows.length}
              title={allPreviewGroupsExpanded ? 'Collapse All' : 'Expand All'} aria-label={allPreviewGroupsExpanded ? 'Collapse All' : 'Expand All'} aria-expanded={allPreviewGroupsExpanded} aria-controls="forecast-import-records" onClick={toggleAllPreviewGroups}
              className="rounded-md border px-3 py-2 text-sm"><ExpandCollapseIcon expanded={allPreviewGroupsExpanded} />
              <span className="hidden md:inline">{allPreviewGroupsExpanded ? 'Collapse All' : 'Expand All'}</span>
            </button>
</div>
          </div>
          {referencesReady && stagingReady && editing && <RecordDialog open onClose={() => setEditing(null)} title="Edit Uploaded Record" busy={busy} wide contained fitContent><form className="app-tables flex min-h-0 flex-1 flex-col gap-4" onSubmit={(event) => {
            event.preventDefault()
            void saveUploadedRow(editing)
          }}>
            <div className="shrink-0 border-b pb-4 pr-10" data-popup-form-header=""><h3 data-dialog-title className="text-lg font-semibold"><HeadingPencil className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Edit Uploaded Record</h3><p className="mt-1 text-xs text-muted-foreground">Forecasts</p></div>
            <div role="region" aria-label="Uploaded forecast fields" tabIndex={0} className="min-h-0 min-w-0 max-h-[max(5rem,calc(100dvh-17rem))] flex-1 overflow-y-auto overscroll-contain pr-1 pb-1 sm:max-h-[max(5rem,calc(100dvh-13rem))]"><fieldset disabled={disabled} className="grid min-w-0 grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">{forecastImportFields.map(([field, label]) => <label key={field} className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"><span>{field === 'volume' ? 'Volume (50kg)' : label}</span><input type={field === 'year' || field === 'volume' ? 'number' : 'text'} step={field === 'volume' ? 'any' : undefined} disabled={disabled} value={editing[field] ?? ''} onChange={(event) => setEditing({ ...editing, [field]: event.target.value })} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>)}</fieldset></div>
            <div data-action-toolbar="" data-dialog-footer="" className="flex shrink-0 flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end"><button data-action-tone="neutral" type="button" disabled={disabled} onClick={() => setEditing(null)} className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm"><ActionXIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Cancel</button><button data-action-tone="primary" data-action-fill="" disabled={disabled} type="submit" className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm"><ActionSaveIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Save Changes</button></div>
          </form></RecordDialog>}

          <Table data-volume-layout="forecast-import" id="forecast-import-records" className="w-full table-fixed" containerProps={{ className: 'max-h-[min(32rem,65vh)] overflow-auto rounded-lg border', tabIndex: 0, role: 'region', 'aria-label': 'Forecast import preview' }}>
            <colgroup>
              <col data-action-column="compact" />
              <col data-import-column="status" style={{ width: 144 }} />
              {previewFields.map(([field]) => <col key={field} data-import-column={field} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card"><tr className="border-b bg-muted/40">{['Action', 'Status', ...previewFields.map(([, label]) => label === 'Volume' ? 'Volume (50kg)' : label)].map((label) => <th data-action-column={label === "Action" ? "compact" : undefined} key={label} scope="col" className={`px-3 py-3 font-medium ${label === 'Volume (50kg)' ? 'text-right' : label === 'Year' || label === 'Action' ? 'text-center' : 'text-left'}`}>{label}</th>)}</tr></thead>
            <tbody>{busy ? <TableLoadingRow columns={previewColumnCount} label="forecast import preview" /> : !rows.length ? <tr><td colSpan={previewColumnCount} className="px-4 py-10 text-center text-muted-foreground">No pending uploads.</td></tr> : (['Invalid', 'Valid'] as const).map((group) => {
              const grouped = preview.filter((row) => (row.issues.length > 0) === (group === 'Invalid'))
              const renderRows = (items: typeof preview) => items.map((row) => <tr key={row.source.id} className="border-b">
                  <td data-action-column="compact" className="px-1 py-2 align-top"><div className="flex flex-nowrap items-center justify-center gap-1">
                    {authorization.can('Forecasts', 'edit') && <TableActionButton action="edit" compact type="button" disabled={disabled} onClick={() => setEditing(row.source)} className="inline-flex items-center justify-center rounded-md border" />}
                    {authorization.can('Forecasts', 'delete') && <TableActionButton action="discard" compact type="button" disabled={disabled} onClick={() => void discardUploadedRows([row.source.id])} className="inline-flex items-center justify-center rounded-md border" />}
                  </div></td>
                  <td className={`px-2 py-2 align-top text-xs leading-4 wrap-anywhere ${row.issues.length ? 'text-destructive' : ''}`}>
                    <StatusBadge compact status={row.status === 'Already imported' ? 'Already Imported' : row.status} />
                    {row.issues.length > 0 && <><p className="mt-1">{row.issues.join(' ')}</p><p className="mt-1 text-muted-foreground">{row.source.kam || 'Unassigned KAM'} · {row.source.customer || 'Unassigned customer'}</p></>}
                    {!row.customer && row.region && row.source.customer.trim() && authorization.can('Customers', 'add') && (scope.allRegions || row.region.id === scope.regionId) && (
                      <button data-action-tone="primary" type="button" disabled={disabled} onClick={() => void addCustomer(row)} className="mt-2 block rounded-md border px-2 py-1 text-foreground disabled:opacity-50"><ActionUserPlusIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Add to Customers</button>
                    )}
                  </td>
                  {previewFields.map(([field]) => <td key={field} className={`px-3 py-3 align-top leading-5 ${field === 'volume' ? 'text-right tabular-nums wrap-anywhere' : field === 'year' ? 'whitespace-nowrap text-center tabular-nums' : 'wrap-anywhere'}`}>{field === 'volume' ? row.source.volume || numberLabel(row.payload.volume) : row.source[field] || '—'}</td>)}
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
                  : Array.from(ownerGroups, ([ownerKey, owner]) => <ForecastPreviewGroup key={ownerKey} nested label={'KAM: ' + owner.label} count={[...owner.customers.values()].reduce((sum, customer) => sum + customer.rows.length, 0)} expanded={expandedOwners.has(ownerKey)} onToggle={() => toggleOwner(ownerKey)}>
                    {Array.from(owner.customers, ([customerKey, customer]) => <ForecastPreviewGroup key={customerKey} nested label={'Customer: ' + customer.label} count={customer.rows.length} expanded={expandedOwners.has(customerKey)} onToggle={() => toggleOwner(customerKey)}>{renderRows(customer.rows)}</ForecastPreviewGroup>)}
                  </ForecastPreviewGroup>)} 
              </ForecastPreviewGroup>
            })}</tbody>
            <tfoot className="sticky bottom-0 z-10 border-t bg-card">
              <tr><td colSpan={previewColumnCount - 1} className="px-3 py-3 text-sm text-muted-foreground"><div className="flex items-center justify-between gap-3"><span>{preview.length.toLocaleString('en-PH')} {preview.length === 1 ? 'record' : 'records'}</span><span>Grand Total</span></div></td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums" aria-busy={busy}>{referencesReady && stagingReady ? numberLabel(volumes.total) : '—'}</td></tr>
            </tfoot>
          </Table>
      </div>
    </section>
    </RecordDialog>
    </>
  )
}

function ForecastPreviewGroup({ label, count, expanded, onToggle, children, nested = false }: {
  label: string; count: number; expanded: boolean; onToggle: () => void; children: React.ReactNode; nested?: boolean
}) {
  return <>
    <tr className={label === 'Invalid' ? 'border-b bg-destructive/10' : 'border-b bg-muted/30'}><td colSpan={previewColumnCount}><button type="button" aria-expanded={expanded} onClick={onToggle} className={`flex w-full items-center gap-2 py-3 pr-3 text-left font-medium ${nested ? 'pl-6 text-sm' : 'pl-3'}`}>{expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}<span className="wrap-anywhere">{label} <span className="text-xs font-normal text-muted-foreground">({count})</span></span></button></td></tr>
    {expanded && children}
  </>
}
