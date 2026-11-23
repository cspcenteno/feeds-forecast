
'use client'

import { findActualHeaderRow, parseOracleActualDate, resolveOracleKam, oracleSalespersonName, type ImportKam } from '@/lib/oracle-actual-import'

import { volumeFilterOptions } from '@/lib/volume-filter-options'
import { importVolumeSummary } from '@/lib/import-volume-summary'
import { importValidationGroups, type ImportValidationGroup } from '@/lib/import-validation-groups'
import { readSavedVolumePage } from '@/lib/saved-volume-page'
import { actualVolumeCursor, currentVolumePeriod, volumeLoadPhases } from '@/lib/volume-load-period'
import { canReadAllVolumeRegions, requiresVolumeSubregion } from '@/lib/volume-visibility'

import { summaryForLevel } from '@/lib/table-summary-level'

import { usePopupError } from '@/components/action-dialogs'

import { sortRegions } from '@/lib/region-order'

import { StatusBadge } from '@/components/ui/status-badge'

import { Pencil as HeadingPencil, Database as HeadingDatabase } from 'lucide-react'

import { useStatusNotification } from '@/components/action-dialogs'

import { ImportProductDialog } from '@/components/import-product-dialog'

import { HeaderExpandCollapseButton } from '@/components/ui/expand-collapse-icon'
import { FilterX, PackagePlus, UserPlus as ActionUserPlusIcon, Save as ActionSaveIcon, X as ActionXIcon } from 'lucide-react'
import { useActionDialogs } from '@/components/action-dialogs'
import { confirmationRecordDetails } from '@/lib/action-confirmation'
import { SelectionField } from '@/components/ui/selection-field'
import { TableActionButton } from '@/components/ui/table-action-button'
import { Table } from '@/components/ui/table'
import { LoadingSpinner, TableLoadingRow } from '@/components/ui/loading-spinner'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { RecordDialog } from '@/components/ui/record-dialog'
import { SalespersonInput } from '@/components/ui/salesperson-input'
import { ActiveField } from '@/components/ui/active-field'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Upload,
  FileSpreadsheet,
  Download,
} from 'lucide-react'
import { createClient } from '@/lib/client'
import { getActualPeriod } from '@/lib/actual-records'
import { getBudgetImportKey } from '@/lib/budget-import-key'
import { groupedTableKeys } from '@/lib/grouped-table-keys'
import { persistCustomerVolumeUpdates, validateSavedVolumePeriod, orderVolumeEditorRows } from '@/lib/saved-volume-records'
import { useAuthorization } from '@/lib/authorization'
import { downloadImportTemplate } from '@/lib/download-import-template'

type Region = {
  id: number
  name: string
  code: string | null
}

type Customer = {
  id: number
  customer: string
  region_id: number | null
}

type Product = {
  id: number
  category_id: number | null
  code: string
  name: string
  weight: number | null
}

type BudgetRecord = {
  actual_date?: string
  id: number
  year: number
  month: number | null
  region_id: number | null
  subregion_id: number | null
  customer_id: number | null
  category_id: number | null
  product_id: number | null
  kam: string | null
  volume: number
}

type BudgetImportRecord = {
  savedActual?: boolean
  actual_date?: string | null
  id: number
  year: string | null
  region: string | null
  month: string | null
  kam: string | null
  customer: string | null
  product_code: string | null
  product_name: string | null
  volume: string | null
}

type SavedRecordDraft = {
  original: BudgetRecord; year: string; month: string; actualDate: string; volume: string; productId: string
}

type ImportPreview = {
  salesperson: ImportKam | null
  actualDate: string | null
  source: BudgetImportRecord
  year: number | null
  month: number | null
  region: Region | null
  customer: Customer | null
  product: Product | null
  volume: number | null
  status: 'Ready' | 'Already imported' | 'Invalid'
  issues: string[]
}

type ImportGroup = ImportValidationGroup<ImportPreview>

type SavedCustomerGroup = {
  key: string
  customer: string
  items: BudgetRecord[]
}

type SavedKamGroup = {
  key: string
  kam: string
  customers: SavedCustomerGroup[]
}

const PAGE_SIZE = 1000
const LOAD_REQUEST_TIMEOUT_MS = 15000
const SAVED_RECORDS_TIMEOUT_MS = 45000
const SAVED_RECORDS_PAGE_SIZE = 500
const UPLOAD_BATCH_SIZE = 500

function formatNumber(value: number | string | null | undefined) {
  return (Number(value) || 0).toLocaleString('en-PH', {
    maximumFractionDigits: 2,
  })
}

function getMonthName(month: number, year: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    'en-PH',
    {
      month: 'long',
      timeZone: 'UTC',
    }
  )
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseMonth(value: string | null): number | null {
  const normalized = normalizeText(value)

  if (!normalized) return null

  const numericMonth = Number(normalized)

  if (
    Number.isInteger(numericMonth) &&
    numericMonth >= 1 &&
    numericMonth <= 12
  ) {
    return numericMonth
  }

  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]

  const match = monthNames.findIndex(
    (name) =>
      normalized === name ||
      normalized === name.substring(0, 3)
  )

  return match >= 0 ? match + 1 : null
}

function parseActualDate(value: unknown, date1904 = false) {
  const oracleDate = parseOracleActualDate(value)
  if (oracleDate) return oracleDate
  const text = String(value ?? '').trim()
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{2}:\d{2}.*)?$/.exec(text)
  const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text)
  const serial = /^\d{5}(?:\.\d+)?$/.test(text)
    ? XLSX.SSF.parse_date_code(Number(text), { date1904 })
    : null
  const slashYear = slashDate?.[3]
  const year = Number(match?.[1] ?? (slashYear?.length === 2 ? '20' + slashYear : slashYear) ?? serial?.y)
  const month = Number(match?.[2] ?? slashDate?.[1] ?? serial?.m)
  const day = Number(match?.[3] ?? slashDate?.[2] ?? serial?.d)
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null

  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null

  return date.toISOString().slice(0, 10)
}


function getImportStatusLabel(status: ImportPreview['status']) {
  switch (status) {
    case 'Ready':
      return 'Ready'
    case 'Invalid':
      return 'Invalid'
    case 'Already imported':
      return 'Already Imported'
  }
}

export function VolumeImportPage({ moduleName }: { moduleName: 'Budgets' | 'Actuals' }) {
  const { confirmAction } = useActionDialogs()

  const isActual = moduleName === 'Actuals'
  const label = moduleName.toLowerCase()
  const savedTitle = isActual ? 'Saved Actuals' : 'Saved Budgets'
  const metricLabel = isActual ? 'Actual' : 'Budget'
  const volumeLabel = metricLabel + ' (Vol.)'
  const savedTable = isActual ? 'actuals' : 'budgets'
  const stagingTable = isActual ? 'actual_import_staging' : 'budget_import_staging'

  const supabase = createClient()
  const authorization = useAuthorization()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const savedRecordsRequestRef = useRef<AbortController | null>(null)
  const stagingRequestRef = useRef<AbortController | null>(null)

  const currentPeriod = currentVolumePeriod()
  const currentYear = Number(currentPeriod.year)

  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<{ id: number; name: string; region_id: number }[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [stagingRecords, setStagingRecords] = useState<BudgetImportRecord[]>([])
  const [actualImportKams, setActualImportKams] = useState<ImportKam[] | null>(null)
  const [editingImportSalesman, setEditingImportSalesman] = useState<{ name: string; items: BudgetImportRecord[] } | null>(null)
  const [savedSalesmanNames, setSavedSalesmanNames] = useState<Set<string> | null>(null)

  const [role, setRole] = useState('')
  const [position, setPosition] = useState('')
  const isSupervisor = role === 'Superuser' && ['SUPERVISOR', 'SV'].includes(position.trim().toUpperCase())
  const canReadAllRegions = canReadAllVolumeRegions(role, position)
  const canWriteAllRegions = role === 'Admin' || (role === 'Superuser' && !isSupervisor)
  const [assignedRegionId, setAssignedRegionId] = useState<number | null>(null)
  const [assignedSubregionId, setAssignedSubregionId] = useState<number | null>(null)
  const subregionRestricted = requiresVolumeSubregion(role, position)

  const [filterYear, setFilterYear] = useState(currentPeriod.year)
  const [filterMonth, setFilterMonth] = useState(currentPeriod.month)
  const [filterRegionId, setFilterRegionId] = useState('')
  const [filterSalesman, setFilterSalesman] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const searchingSavedRecords = filterCustomer.trim() !== '' || filterProduct.trim() !== ''
  const [manualSavedSearchQuery, setManualSavedSearchQuery] = useState<string | null>(null)
  const savedSearchQuery = JSON.stringify([filterCustomer, filterProduct, filterYear, filterMonth, filterRegionId, filterSalesman])
  const autoExpandSavedSearch = searchingSavedRecords && manualSavedSearchQuery !== savedSearchQuery

  const [expandedImportGroups, setExpandedImportGroups] = useState(
    () => new Set(['["invalid"]', '["valid"]'])
  )

  // Saved budget expansion states
  const [expandedBudgetKams, setExpandedBudgetKams] = useState<Set<string>>(
    new Set()
  )
  const [expandedBudgetCustomers, setExpandedBudgetCustomers] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(false)
  const [loadingSavedRecords, setLoadingSavedRecords] = useState(false)
  const [savedRecordsComplete, setSavedRecordsComplete] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [loadingStaging, setLoadingStaging] = useState(false)
  const [stagingLoaded, setStagingLoaded] = useState(false)
  const [stagingError, setStagingError] = usePopupError()
  const [uploadingExcel, setUploadingExcel] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingImport, setEditingImport] = useState<BudgetImportRecord | null>(null)
  const [focusImportVolume, setFocusImportVolume] = useState(false)
  const [customerDraft, setCustomerDraft] = useState<{ customer: string; salesman: string; regionId: string; segment: string; active: boolean } | null>(null)
  const [editingSavedCustomer, setEditingSavedCustomer] = useState<{ customer: string; customerId: string; kam: string; year: string; rows: SavedRecordDraft[] } | null>(null)
  const [, setSavedEditError] = usePopupError()
  const [editingSavedSalesman, setEditingSavedSalesman] = useState<{ name: string; originalName: string; items: BudgetRecord[] } | null>(null)
  const [savingImport, setSavingImport] = useState(false)
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [addingProduct, setAddingProduct] = useState<{ code: string; name: string } | null>(null)
  const importBusy = initializing || savingImport || addingCustomer || uploadingExcel || importing || loadingStaging
  const [showImportPreview, setShowImportPreview] = useState(false)

  const [, setError] = usePopupError()
  const setMessage = useStatusNotification()

  useEffect(() => {
    let cancelled = false
    async function initialize() {
      try {
        if (await loadUserAccess(() => cancelled) && !cancelled) await loadInitialData(() => cancelled)
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load the page.')
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }

    initialize()

    return () => {
      cancelled = true
      savedRecordsRequestRef.current?.abort()
      stagingRequestRef.current?.abort()
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadUserAccess(isCancelled: () => boolean) {
    setError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (isCancelled()) return false

    if (!user) {
      setError('User session not found.')
      return false
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, position, is_active, region_id, subregion_id')
      .eq('id', user.id)
      .abortSignal(AbortSignal.timeout(LOAD_REQUEST_TIMEOUT_MS))
      .single()

    if (isCancelled()) return false

    if (profileError) {
      setError(profileError.message)
      return false
    }

    if (!profile?.is_active) {
      setError('Your account is inactive.')
      return false
    }

    const profileRole = profile.role ?? ''
    const profileRegionId = profile.region_id
      ? Number(profile.region_id)
      : null

    setRole(profileRole)
    setPosition(profile.position ?? '')
    setAssignedRegionId(profileRegionId)
    setAssignedSubregionId(profile.subregion_id == null ? null : Number(profile.subregion_id))
    setFilterRegionId(canReadAllVolumeRegions(profileRole, profile.position ?? '')
      ? ''
      : String(profileRegionId ?? ''))

    return true
  }

  async function loadInitialData(isCancelled: () => boolean) {
    setError('')

    const [
      regionsResult,
      customersResult,
      productsResult,
      subregionsResult,
    ] = await Promise.all([
      supabase
        .from('regions')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name')
        .abortSignal(AbortSignal.timeout(LOAD_REQUEST_TIMEOUT_MS)),

      loadCustomers(),

      supabase
        .from('products')
        .select('id, category_id, code, name, weight')
        .eq('is_active', true)
        .order('name'),
      supabase.from('subregions').select('id, name, region_id').order('name')
        .abortSignal(AbortSignal.timeout(LOAD_REQUEST_TIMEOUT_MS)),
    ])

    if (isCancelled()) return

    if (regionsResult.error) {
      setError(regionsResult.error.message)
      return
    }

    if (customersResult.error) {
      setError(customersResult.error.message)
      return
    }

    if (productsResult.error) {
      setError(productsResult.error.message)
      return
    }

    if (subregionsResult.error) {
      setError(subregionsResult.error.message)
      return
    }

    setRegions(sortRegions((regionsResult.data ?? []) as Region[]))
    setCustomers((customersResult.data ?? []) as Customer[])
    setProducts((productsResult.data ?? []) as Product[])
    setSubregions(subregionsResult.data ?? [])

    setInitializing(false)
    await loadBudgets()
  }

  async function loadCustomers() {
    const customers: Customer[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer, region_id')
        .eq('is_active', true)
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
        .abortSignal(AbortSignal.timeout(LOAD_REQUEST_TIMEOUT_MS))

      if (error) return { data: null, error }

      customers.push(...data)
      if (data.length < PAGE_SIZE) return { data: customers, error: null }
    }
  }

  async function loadBudgets() {
    savedRecordsRequestRef.current?.abort()
    const request = new AbortController()
    savedRecordsRequestRef.current = request
    setLoadingSavedRecords(true)
    setSavedRecordsComplete(false)
    setSavedSalesmanNames(null)
    setError('')
    try {
      const records = new Map<number, BudgetRecord>()
      let pageSize = isActual ? 250 : SAVED_RECORDS_PAGE_SIZE
      for (const phase of volumeLoadPhases(isActual, filterYear, filterMonth)) {
        let lastRecord: BudgetRecord | null = null
        while (true) {
        const result = await readSavedVolumePage<BudgetRecord>(async (size) => {
        let query = supabase
          .from(savedTable)
          .select(`
            id,
            ${isActual ? 'actual_date' : 'year, month'},
            region_id,
            subregion_id,
            customer_id,
            category_id,
            product_id,
            kam,
            volume
          ` as string)
        if (isActual) query.not('actual_date', 'is', null)
        if (phase.from) query = query.gte('actual_date', phase.from)
        if (phase.to) query = query.lt('actual_date', phase.to)
        if (phase.year !== undefined) query = query.eq('year', phase.year)
        if (phase.month !== undefined) query = query.eq('month', phase.month)
        if (phase.or) query = query.or(phase.or)
        if (!canReadAllRegions && assignedRegionId !== null) query = query.eq('region_id', assignedRegionId)
        if (subregionRestricted && assignedSubregionId !== null) query = query.eq('subregion_id', assignedSubregionId)

        if (lastRecord) {
          query = isActual ? query.or(actualVolumeCursor(lastRecord)) : query.lt('id', lastRecord.id)
        }
        if (isActual) query = query.order('actual_date', { ascending: false })

        const { data, error } = await query
          .order('id', { ascending: false })
          .limit(size)
          .abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(SAVED_RECORDS_TIMEOUT_MS)]))
        return { data: data as unknown as BudgetRecord[] | null, error }
        }, pageSize, request.signal)
        const { data, error } = result
        pageSize = result.size

        if (request.signal.aborted) return

        if (error) {
          setError('Unable to load all saved ' + label + ' records. Please refresh to retry. ' + error.message)
          return
        }

        const page = (data ?? []) as unknown as BudgetRecord[]
        for (const item of page) records.set(item.id, item.actual_date ? { ...item, ...getActualPeriod(item.actual_date) } : item)
        setBudgets([...records.values()].sort(compareSavedRecords))

        if (page.length < pageSize) break

        lastRecord = page[page.length - 1]
        }
      }
      setBudgets([...records.values()].sort(compareSavedRecords))
      setSavedRecordsComplete(true)
      try {
        const response = await fetch('/api/saved-volume-salesman-names?module=' + moduleName, { cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to check salesman names.')
        if (!request.signal.aborted) setSavedSalesmanNames(new Set<string>(result.names))
      } catch (error) {
        if (!request.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to check salesman names. Refresh to retry.')
      }
    } catch (error) {
      if (!request.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load saved records.')
    } finally {
      if (!request.signal.aborted) setLoadingSavedRecords(false)
    }
  }

  function compareSavedRecords(a: BudgetRecord, b: BudgetRecord) {
    return (isActual ? (b.year ?? -Infinity) - (a.year ?? -Infinity) ||
      (a.actual_date ?? '').localeCompare(b.actual_date ?? '') :
      (b.year ?? -Infinity) - (a.year ?? -Infinity) ||
      (a.month ?? 0) - (b.month ?? 0)) || b.id - a.id
  }

  async function loadStagingRecords() {
    stagingRequestRef.current?.abort()
    const request = new AbortController()
    stagingRequestRef.current = request
    setLoadingStaging(true)
    setStagingLoaded(false)
    setStagingRecords([])
    setActualImportKams(null)
    setStagingError('')
    try {
    if (authorization.can(moduleName, 'import') && (authorization.can(moduleName, 'add') || authorization.can(moduleName, 'edit'))) {
      await loadActualImportKams(request.signal)
    }
    const allRecords: BudgetImportRecord[] = []
    let lastId: number | null = null

    while (true) {
      const query = supabase
        .from(stagingTable)
        .select(`
          id,
          ${isActual ? 'actual_date' : 'year, month'},
          region,
          kam,
          customer,
          product_code,
          product_name,
          volume
        ` as string)
        .order('id', { ascending: true })
        .limit(SAVED_RECORDS_PAGE_SIZE)
      if (lastId !== null) query.gt('id', lastId)
      const { data, error } = await query
        .abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(SAVED_RECORDS_TIMEOUT_MS)]))

      if (request.signal.aborted) return

      if (error) {
        throw new Error(`Unable to load ${label} staging data: ${error.message}`)
      }

      const page = (data ?? []) as unknown as BudgetImportRecord[]
      allRecords.push(...page)
      setStagingRecords([...allRecords])

      if (page.length < SAVED_RECORDS_PAGE_SIZE) break

      lastId = page[page.length - 1].id
    }

    setStagingRecords(allRecords)
    setStagingLoaded(true)
    } catch (error) {
      if (request.signal.aborted) return
      const message = error instanceof Error ? error.message : 'Unable to load uploaded records.'
      setStagingError(message + ' Refresh staging records to retry; your uploads have not been removed.')
    } finally {
      if (!request.signal.aborted) setLoadingStaging(false)
    }
  }

  async function handleExcelUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file || importBusy) return

    if ((!authorization.can(moduleName, 'add') || !authorization.can(moduleName, 'import'))) {
      setError('You do not have permission to upload ' + label + ' records.')
      event.target.value = ''
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase()

    if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
      setError('Please select an Excel (.xlsx or .xls) or CSV file.')
      event.target.value = ''
      return
    }

    setError('')
    setMessage('')
    setUploadingExcel(true)

    let uploadedCount = 0

    try {
      const buffer = await file.arrayBuffer()

      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: !isActual,
      })

      const firstSheetName = workbook.SheetNames[0]

      if (!firstSheetName) {
        throw new Error('The selected file does not contain a worksheet.')
      }

      const worksheet = workbook.Sheets[firstSheetName]
      const headerRow = isActual ? findActualHeaderRow(worksheet) : undefined

      const excelRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        {
          defval: '',
          raw: false,
          dateNF: 'yyyy-mm-dd',
          blankrows: false,
          ...(isActual ? { range: headerRow } : {}),
        }
      )

      if (excelRows.length === 0) {
        throw new Error('The selected worksheet does not contain any data.')
      }

      const headers = Object.keys(excelRows[0] ?? {})
      const normalizedHeaders = new Map(
        headers.map((header) => [normalizeHeader(header), header])
      )

      function findHeader(aliases: string[]) {
        for (const alias of aliases) {
          const matchedHeader = normalizedHeaders.get(
            normalizeHeader(alias)
          )

          if (matchedHeader) return matchedHeader
        }

        return null
      }

      const columnMap = {
        year: findHeader(['year']),
        region: findHeader(['region', 'area']),
        month: findHeader(['month']),
        actual_date: findHeader(['date', 'actual date', 'sales date', 'transaction date', 'trans date']),
        kam: findHeader([
          'kam',
          'kam / salesman',
          'salesman',
          'sales person',
          'salesperson',
          'salesperson w/MLO-AN',
          'key account manager',
        ]) ?? headers.find(header => /^salespersonw[a-z0-9]+an$/.test(normalizeHeader(header))) ?? null,
        customer: findHeader([
          'customer',
          'customer name',
          'partynme',
        ]),
        product_code: findHeader([
          'product code',
          'product_code',
          'code',
          'sku',
          'item no',
        ]),
        product_name: findHeader([
          'product name',
          'product_name',
          'product description',
          'description',
        ]),
        volume: findHeader([
          'volume',
          label,
          label + ' (vol.)',
          label + ' volume',
          label + ' vol',
          'volume ' + label,
          'at50 kg',
        ]),
      }

      const requiredColumns: Array<keyof typeof columnMap> = [
        ...(!isActual || !columnMap.actual_date ? ['year', 'month'] as const : []),
        ...(!isActual || !columnMap.kam ? ['region'] as const : []),
        'customer',
        'product_code',
        'volume',
      ]

      const missingColumns = requiredColumns.filter(
        (column) => !columnMap[column]
      )

      if (missingColumns.length > 0) {
        const labels: Record<string, string> = {
          year: 'Year',
          region: 'Region',
          month: 'Month',
          actual_date: 'Date',
          customer: 'Customer',
          product_code: 'Product Code',
          volume: volumeLabel,
        }

        throw new Error(
          `Missing required Excel column(s): ${missingColumns
            .map((column) => labels[column])
            .join(', ')}. ${isActual ? 'Provide Date or both Year and Month. ' : ''}Please check your header row.`
        )
      }

      function getCellValue(
        row: Record<string, unknown>,
        header: string | null
      ) {
        if (!header) return ''

        const value = row[header]

        if (value === null || value === undefined) return ''

        return String(value).trim()
      }

      const rawDateRows = isActual
        ? new Map(XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { raw: true, range: headerRow })
            .map((row) => [row.__rowNum__, row]))
        : null

      function getActualDate(row: Record<string, unknown>) {
        const dateText = getCellValue(row, columnMap.actual_date)
        if (dateText) {
          return parseActualDate(
            rawDateRows?.get(row.__rowNum__)?.[columnMap.actual_date!],
            workbook.Workbook?.WBProps?.date1904
          ) ?? dateText
        }
        const yearText = getCellValue(row, columnMap.year)
        const year = Number(yearText)
        const month = parseMonth(getCellValue(row, columnMap.month))
        if (!/^\d{4}$/.test(yearText) || year < 2020 || year > 2100 || month === null) return null
        return `${year}-${String(month).padStart(2, '0')}-01`
      }

      let kamAssignments: ImportKam[] | null = null
      if (isActual && columnMap.kam) kamAssignments = await loadActualImportKams()
      const records = excelRows
        .filter((row) =>
          Object.values(row).some(
            (value) => String(value ?? '').trim() !== ''
          )
        )
        .map((row) => {
          let region = getCellValue(row, columnMap.region) || null
          let kam = getCellValue(row, columnMap.kam) || null
          if (isActual) {
            kam = oracleSalespersonName(kam) || null
            if (!region && kamAssignments) {
              try {
                const assigned = resolveOracleKam(kam ?? '', kamAssignments)
                region = regions.find(item => item.id === assigned.region_id)?.name ?? null
                kam = oracleSalespersonName(assigned.full_name) || kam
              } catch {
                // Retain the row in staging; preview validation explains the
                // missing/ambiguous assignment without rejecting the file.
              }
            }
          }
          return {
            ...(isActual
              ? { actual_date: getActualDate(row) }
              : { year: getCellValue(row, columnMap.year) || null, month: getCellValue(row, columnMap.month) || null }),
            region,
            kam,
            customer: getCellValue(row, columnMap.customer) || null,
            product_code: getCellValue(row, columnMap.product_code) || null,
            product_name: getCellValue(row, columnMap.product_name) || null,
            volume: getCellValue(row, columnMap.volume) || null,
          }
        })

      if (records.length === 0) {
        throw new Error('No non-empty rows were found in the worksheet.')
      }

      for (
        let index = 0;
        index < records.length;
        index += UPLOAD_BATCH_SIZE
      ) {
        const batch = records.slice(
          index,
          index + UPLOAD_BATCH_SIZE
        )

        const { error: uploadError } = await supabase
          .from(stagingTable)
          .insert(batch)

        if (uploadError) {
          throw new Error(
            `Upload stopped after ${uploadedCount} row(s). ${uploadError.message}`
          )
        }

        uploadedCount += batch.length
      }

      setShowImportPreview(true)
      setMessage(
        `${uploadedCount.toLocaleString('en-PH')} row(s) uploaded successfully from "${file.name}". Review the validation results before importing them into ${savedTitle}.`
      )

      await loadStagingRecords()
    } catch (uploadError) {
      const errorMessage =
        uploadError instanceof Error
          ? uploadError.message
          : 'An unexpected error occurred while reading the file.'

      setError(
        uploadedCount > 0
          ? `${errorMessage} ${uploadedCount} row(s) were uploaded successfully before the error. Refresh the staging records to review them.`
          : errorMessage
      )

      if (uploadedCount > 0) {
        setShowImportPreview(true)
        await loadStagingRecords()
      }
    } finally {
      setUploadingExcel(false)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const availableRegions = useMemo(() => {
    if (canReadAllRegions) {
      return regions
    }

    return regions.filter(
      (region) => region.id === assignedRegionId
    )
  }, [regions, canReadAllRegions, assignedRegionId])

  const productLabels = useMemo(() => new Map(
    products.map((product) => [product.id, product.code + ' - ' + product.name])
  ), [products])

  const scopedBudgets = useMemo(() => {

    return budgets.filter((item) => {
      if (filterYear && item.year !== Number(filterYear)) return false
      if (filterMonth && item.month !== Number(filterMonth)) return false

      if (
        filterRegionId &&
        item.region_id !== Number(filterRegionId)
      ) {
        return false
      }


      if (
        !canReadAllRegions &&
        item.region_id !== assignedRegionId
      ) {
        return false
      }


      if (subregionRestricted && (assignedRegionId === null || assignedSubregionId === null ||
        item.region_id !== assignedRegionId || item.subregion_id !== assignedSubregionId)) return false

      return true
    })
  }, [
    budgets,
    filterYear,
    filterMonth,
    filterRegionId,
    canReadAllRegions,
    assignedRegionId,
    assignedSubregionId,
    subregionRestricted,
  ])

  const savedSalesmanOptions = useMemo(() => [...new Set(scopedBudgets.map((record) => record.kam?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b)), [scopedBudgets])
  const salesmanScopedBudgets = useMemo(() => filterSalesman
    ? scopedBudgets.filter((record) => normalizeText(record.kam ?? '') === normalizeText(filterSalesman))
    : scopedBudgets, [scopedBudgets, filterSalesman])

  useEffect(() => {
    if (filterSalesman && !savedSalesmanOptions.includes(filterSalesman)) setFilterSalesman('')
  }, [filterSalesman, savedSalesmanOptions])

  const { customers: savedCustomerOptions } = useMemo(
    () => volumeFilterOptions(salesmanScopedBudgets, customers, productLabels),
    [salesmanScopedBudgets, customers, productLabels],
  )
  const savedProductOptions = useMemo(() => {
    const search = filterCustomer.trim().toLowerCase()
    const matchingCustomerIds = new Set(customers.filter((customer) => customer.customer.toLowerCase().includes(search)).map((customer) => customer.id))
    const records = search ? salesmanScopedBudgets.filter((record) => record.customer_id !== null && matchingCustomerIds.has(record.customer_id)) : salesmanScopedBudgets
    return volumeFilterOptions(records, customers, productLabels).products
  }, [salesmanScopedBudgets, customers, productLabels, filterCustomer])

  const filteredBudgets = useMemo(() => {
    const customerSearch = filterCustomer.trim().toLowerCase()
    const productSearch = filterProduct.trim().toLowerCase()
    const customerNames = new Map(customers.map(customer => [customer.id, customer.customer.toLowerCase()]))
    return salesmanScopedBudgets.filter(item =>
      (!customerSearch || (item.customer_id !== null && customerNames.get(item.customer_id)?.includes(customerSearch))) &&
      (!productSearch || (item.product_id !== null && productLabels.get(item.product_id)?.toLowerCase().includes(productSearch))),
    )
  }, [salesmanScopedBudgets, customers, productLabels, filterCustomer, filterProduct])

  const previewRecords = stagingRecords

  async function loadActualImportKams(signal?: AbortSignal) {
    const response = await fetch('/api/actual-import-kams?module=' + moduleName, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load KAM assignments.')
    if (signal?.aborted) throw new Error('Loading KAM assignments was cancelled.')
    const users = result.users as ImportKam[]
    setActualImportKams(users)
    return users
  }

  const importPreview = useMemo<ImportPreview[]>(() => {
    const actualKey = (date: string | null | undefined, region: number | null, customer: number | null, product: number | null, kam: string | null, volume: number) =>
      JSON.stringify([date, region, customer, product, normalizeText(kam), Number(volume)])
    const savedActualMatches = new Map<string, number>()
    if (isActual) for (const item of budgets) {
      const key = actualKey(item.actual_date, item.region_id, item.customer_id, item.product_id, item.kam, item.volume)
      savedActualMatches.set(key, (savedActualMatches.get(key) ?? 0) + 1)
    }
    const existingKeys = new Set(
      (isActual ? [] : budgets).map((item) =>
          getBudgetImportKey(
              item.year,
              item.month ?? 0,
              item.region_id ?? 0,
              item.customer_id ?? 0,
              item.product_id ?? 0,
              item.kam
            )
      )
    )

    const seenStagingKeys = new Set<string>()

    return previewRecords.map((source) => {
      const issues: string[] = []

      const actualDate = isActual ? parseActualDate(source.actual_date) : null
      const parsedYear = Number(isActual ? actualDate?.slice(0, 4) : source.year)
      const validYear =
        Number.isInteger(parsedYear) &&
        parsedYear >= 2020 &&
        parsedYear <= 2100
          ? parsedYear
          : null

      const parsedMonth = parseMonth(isActual ? actualDate?.slice(5, 7) ?? null : source.month)

      if (isActual) {
        if (!actualDate) issues.push('Invalid or missing period. Use Date (YYYY-MM-DD) or Year (2020–2100) and Month (1–12 or month name).')
      } else {
        if (validYear === null) issues.push('Invalid or missing year')
        if (parsedMonth === null) issues.push('Invalid or missing month')
      }

      let matchedKam: ImportKam | null = null
      {
        if (!source.kam?.trim()) issues.push('Missing salesman (KAM/RSM/ASM)')
        else if (actualImportKams === null) issues.push('Salesman assignments are unavailable. Refresh the uploaded records to retry.')
        else {
          try { matchedKam = resolveOracleKam(source.kam, actualImportKams) }
          catch (cause) { issues.push(cause instanceof Error ? cause.message : 'Salesman assignment not found (KAM/RSM/ASM)') }
        }
      }
      const regionName = source.region?.trim() || (matchedKam ? regions.find(region => region.id === matchedKam.region_id)?.name : null)
      const matchingRegions = regions.filter(
        (item) =>
          normalizeText(item.name) === normalizeText(regionName) ||
          (Boolean(item.code?.trim()) && normalizeText(item.code) === normalizeText(regionName))
      )

      const matchedRegion =
        matchingRegions.length === 1 ? matchingRegions[0] : null

      if (!regionName) {
        issues.push('Missing region')
      } else if (matchingRegions.length === 0) {
        issues.push(`Region not found: ${source.region}`)
      } else if (matchingRegions.length > 1) {
        issues.push(`Multiple regions found: ${source.region}`)
      }
      if (matchedKam && matchedRegion && matchedKam.region_id !== matchedRegion.id) issues.push('Salesman is assigned to a different region')

      const matchingCustomers = customers.filter(
        (item) =>
          normalizeText(item.customer) ===
            normalizeText(source.customer) &&
          (matchedRegion
            ? item.region_id === matchedRegion.id
            : true)
      )

      const matchedCustomer =
        matchingCustomers.length === 1 ? matchingCustomers[0] : null

      if (!source.customer?.trim()) {
        issues.push('Missing customer')
      } else if (matchingCustomers.length === 0) {
        issues.push(`Customer not found: ${source.customer}`)
      } else if (matchingCustomers.length > 1) {
        issues.push(`Multiple customers found: ${source.customer}`)
      }

      const matchingProducts = products.filter(
        (item) =>
          normalizeText(item.code) ===
          normalizeText(source.product_code)
      )

      const matchedProduct =
        matchingProducts.length === 1 ? matchingProducts[0] : null

      if (!source.product_code?.trim()) {
        issues.push('Missing product code')
      } else if (matchingProducts.length === 0) {
        issues.push(`Product code not found: ${source.product_code}`)
      } else if (matchingProducts.length > 1) {
        issues.push(`Multiple products found: ${source.product_code}`)
      }

      const volumeText = String(source.volume ?? '').trim()
      const parsedBudget = volumeText ? Number(volumeText.replace(/,/g, '')) : NaN

      const validBudget =
        Number.isFinite(parsedBudget)
          ? parsedBudget
          : null

      if (validBudget === null) {
        issues.push(volumeText ? 'Invalid volume' : 'Missing volume')
      }

      let status: ImportPreview['status'] = 'Ready'

      if (issues.length > 0) {
        status = 'Invalid'
      } else if (
        validYear !== null &&
        parsedMonth !== null &&
        matchedRegion &&
        matchedCustomer &&
        matchedProduct
      ) {
        if (isActual) {
          const key = actualKey(actualDate, matchedRegion.id, matchedCustomer.id, matchedProduct.id, matchedKam?.full_name?.trim() || source.kam, validBudget!)
          const remaining = savedActualMatches.get(key) ?? 0
          if (remaining > 0) {
            status = 'Already imported'
            savedActualMatches.set(key, remaining - 1)
          }
        } else {
        const key = getBudgetImportKey(
              validYear,
              parsedMonth,
              matchedRegion.id,
              matchedCustomer.id,
              matchedProduct.id,
              matchedKam?.full_name?.trim() || source.kam
            )

        if (existingKeys.has(key)) {
          status = 'Already imported'
        } else if (seenStagingKeys.has(key)) {
          status = 'Invalid'
          issues.push('Duplicate in upload')
        } else {
          seenStagingKeys.add(key)
        }
        }
      }

      return {
        salesperson: matchedKam,
        source: isActual && !source.region && matchedRegion ? { ...source, region: matchedRegion.name } : source,
        actualDate,
        year: validYear,
        month: parsedMonth,
        region: matchedRegion,
        customer: matchedCustomer,
        product: matchedProduct,
        volume: validBudget,
        status,
        issues,
      }
    })
  }, [previewRecords, budgets, regions, customers, products, isActual, actualImportKams])

  const visibleImportPreview = useMemo(() => {
    if (canWriteAllRegions) {
      return importPreview
    }

    return importPreview.filter(
      (item) => !item.region || Number(item.region.id) === assignedRegionId
    )
  }, [importPreview, canWriteAllRegions, assignedRegionId])

  const readyImportCount = visibleImportPreview.filter(
    (item) => item.status === 'Ready' && !item.source.savedActual
  ).length

  const invalidImportCount = visibleImportPreview.filter(
    (item) => item.status === 'Invalid'
  ).length

  const alreadyImportedCount = visibleImportPreview.filter(
    (item) => item.status === 'Already imported'
  ).length
  const importVolumes = useMemo(() => importVolumeSummary(visibleImportPreview), [visibleImportPreview])

  const importGroups = useMemo(() => {
    return importValidationGroups(visibleImportPreview)
  }, [visibleImportPreview])

  const importGroupKeys = useMemo(() => groupedTableKeys(importGroups), [importGroups])
  const allImportGroupsExpanded = importGroupKeys.length > 0 && importGroupKeys.every((key) => expandedImportGroups.has(key))

  const groupedBudgets = useMemo<SavedKamGroup[]>(() => {
    const kams = new Map<string, { kam: string; customers: Map<string, SavedCustomerGroup> }>()

    for (const item of filteredBudgets) {
      const kam = item.kam?.trim() || 'Unassigned salesman'
      const kamKey = normalizeText(kam)
      let kamGroup = kams.get(kamKey)
      if (!kamGroup) {
        kamGroup = { kam, customers: new Map() }
        kams.set(kamKey, kamGroup)
      }

      const customerKey = String(item.customer_id)
      let customer = kamGroup.customers.get(customerKey)
      if (!customer) {
        customer = {
          key: JSON.stringify([kamKey, customerKey]),
          customer: customers.find((customer) => customer.id === item.customer_id)?.customer ?? '—',
          items: [],
        }
        kamGroup.customers.set(customerKey, customer)
      }
      customer.items.push(item)
    }

    return Array.from(kams, ([key, group]) => ({
      key,
      kam: group.kam,
      customers: Array.from(group.customers.values()).sort((a, b) => a.customer.localeCompare(b.customer)),
    })).sort((a, b) => a.kam.localeCompare(b.kam))
  }, [filteredBudgets, customers])

  const savedKamKeys = groupedBudgets.map((group) => group.key)
  const savedCustomerKeys = groupedBudgets.flatMap((group) => group.customers.map((customer) => customer.key))
  const allSavedGroupsExpanded = savedKamKeys.length > 0 && (autoExpandSavedSearch || (
    savedKamKeys.every((key) => expandedBudgetKams.has(key)) &&
    savedCustomerKeys.every((key) => expandedBudgetCustomers.has(key))
  ))

  function toggleAllSavedGroups() {
    setManualSavedSearchQuery(savedSearchQuery)
    setExpandedBudgetKams(new Set(allSavedGroupsExpanded ? [] : savedKamKeys))
    setExpandedBudgetCustomers(new Set(allSavedGroupsExpanded ? [] : savedCustomerKeys))
  }

  function getRegionName(id: number | null) {
    return regions.find((region) => region.id === id)?.name ?? '-'
  }

  function getProductName(id: number | null) {
    const product = products.find((item) => item.id === id)

    if (!product) return '-'

    return `${product.code} - ${product.name}`
  }

  function toggleSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string
  ) {
    setter((current) => {
      const next = new Set(current)

      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }

      return next
    })
  }

  function toggleBudgetKam(key: string) {
    setManualSavedSearchQuery(savedSearchQuery)
    if (autoExpandSavedSearch) {
      setExpandedBudgetKams(new Set(savedKamKeys.filter((item) => item !== key)))
      setExpandedBudgetCustomers(new Set(savedCustomerKeys))
    } else toggleSet(setExpandedBudgetKams, key)
  }

  function toggleBudgetCustomer(key: string) {
    setManualSavedSearchQuery(savedSearchQuery)
    if (autoExpandSavedSearch) {
      setExpandedBudgetKams(new Set(savedKamKeys))
      setExpandedBudgetCustomers(new Set(savedCustomerKeys.filter((item) => item !== key)))
    } else toggleSet(setExpandedBudgetCustomers, key)
  }

  async function deleteStagingRows(ids: number[], deletedIds: Set<number>) {
    const batchSize = 100
    for (let index = 0; index < ids.length; index += batchSize) {
      const { data, error } = await supabase.from(stagingTable)
        .delete()
        .in('id', ids.slice(index, index + batchSize))
        .select('id')

      if (error) throw new Error(error.message)
      for (const row of data) deletedIds.add(row.id)
    }
  }

  async function deleteAllStagingRecords() {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (importBusy || !authorization.can(moduleName, 'delete')) return

    const ids = visibleImportPreview.filter((item) => !item.source.savedActual).map((item) => item.source.id)
    if (ids.length === 0) return
    if (!(actionConfirmation = await confirmAction({ message: `Discard all ${ids.length} staging rows available to you? ${savedTitle} will be kept.` }))) return

    setSavingImport(true)
    setError('')
    setMessage('')
    const deletedIds = new Set<number>()

    try {
      await deleteStagingRows(ids, deletedIds)

      if (deletedIds.size < ids.length) {
        setError(`${deletedIds.size} of ${ids.length} staging rows discarded. Some rows were unavailable or could not be discarded with your permissions.`)
      } else {
        setMessage(`Discarded ${deletedIds.size} staging rows.`)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to discard staging rows.'
      setError(`Deleted ${deletedIds.size} of ${ids.length} staging rows. ${reason}`)
    } finally {
      setEditingImport((current) => current && deletedIds.has(current.id) ? null : current)
      try {
        await loadStagingRecords()
      } finally {
        setSavingImport(false)
      }
    }

    } finally { actionConfirmation?.finish() }
  }

  async function saveStagingRecord(record: BudgetImportRecord, action: 'edit' | 'delete') {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (record.savedActual) return
    if (importBusy || !authorization.can(moduleName, action)) return
    if (action === 'delete' && !(actionConfirmation = await confirmAction({ message: 'Discard this uploaded record from staging?' }))) return

    setSavingImport(true)
    setError('')
    setMessage('')
    const { id, ...fields } = record

    try {
      const table = supabase.from(stagingTable)
      const query = action === 'edit' ? table.update(fields) : table.delete()
      const { data, error } = await query.eq('id', id).select('id').maybeSingle()

      if (error || !data) {
        setError(error?.message ?? 'The uploaded record is unavailable or you lack permission to change it.')
        return
      }

      setEditingImport((current) => current?.id === id ? null : current)
      await loadStagingRecords()
      setMessage(action === 'edit' ? 'Uploaded record updated.' : 'Uploaded record discarded.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to change the uploaded record.')
    } finally {
      setSavingImport(false)
    }

    } finally { actionConfirmation?.finish() }
  }

  function renderImportGroup(group: ImportGroup, path: string[]): React.ReactNode {
    const key = JSON.stringify(path)
    const expanded = expandedImportGroups.has(key)
    const Chevron = expanded ? ChevronDown : ChevronRight
    const missingCustomer = group.kind === 'customer' && group.validation === 'Customer not found'
      ? group.rows.find((item) => item.region) : undefined
    const product = group.kind === 'product' && group.validation === 'Product code not found' ? group.rows[0]?.source : undefined
    const record = group.kind === 'record' ? group.rows.find((item) => !item.source.savedActual)?.source : undefined

    return (
      <Fragment key={key}>
        <tr data-import-group="" className={path.length === 1 && group.label === 'Invalid' ? 'border-b bg-destructive/10' : 'border-b bg-muted/30'}>
          <td colSpan={isActual ? 7 : 8}>
            <div className="flex items-center gap-3 py-1 pr-3" style={{ paddingLeft: path.length * 12 }}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => toggleSet(setExpandedImportGroups, key)}
              disabled={group.count === 0}
              className="flex min-w-0 items-center gap-2 text-left font-medium"
            >
              <Chevron className="size-4 shrink-0" aria-hidden="true" />
              {group.label}
              <span className="text-xs font-normal text-muted-foreground">({group.count})</span>
            </button>
            {group.kind === 'salesman' && authorization.can(moduleName, 'edit') && group.rows.some((item) => !item.source.savedActual) && <TableActionButton action="edit" compact type="button" title="Edit uploaded salesman" aria-label="Edit uploaded salesman" disabled={importBusy} onClick={() => {
              const name = group.rows[0]?.source.kam ?? ''
              const items = visibleImportPreview.filter((item) => !item.source.savedActual && normalizeText(item.source.kam) === normalizeText(name)).map((item) => item.source)
              setEditingImportSalesman({ name, items })
            }} />}
                    {missingCustomer && authorization.can('Customers', 'add') && (
                      <button data-action-tone="primary" data-slot="table-action-button" data-compact-action="" data-import-add-customer="" type="button" aria-label="Add to Customers" title="Add to Customers" className="inline-flex shrink-0 items-center justify-center rounded-md border" disabled={importBusy} onClick={() => addMissingCustomer(missingCustomer)}>
                        <ActionUserPlusIcon className="size-4 shrink-0" aria-hidden="true" />
                      </button>
                    )}
                    {record && authorization.can(moduleName, 'edit') && <TableActionButton action="edit" compact aria-label="Edit uploaded record" title="Edit uploaded record" disabled={importBusy} onClick={() => { setFocusImportVolume(/volume/i.test(group.validation ?? '')); setEditingImport(record) }} />}
                    {product && authorization.can('Products', 'add') && (
                      <button data-action-tone="primary" data-slot="table-action-button" data-compact-action="" type="button" aria-label="Add to Products" title="Add to Products" className="inline-flex shrink-0 items-center justify-center rounded-md border" disabled={importBusy} onClick={() => setAddingProduct({ code: product.product_code?.trim() ?? '', name: product.product_name?.trim() ?? '' })}>
                        <PackagePlus className="size-4 shrink-0" aria-hidden="true" />
                      </button>
                    )}
            </div>
          </td>
        </tr>
        {expanded && Array.from(group.groups, ([childKey, child]) =>
          renderImportGroup(child, [...path, childKey])
        )}
        {expanded && group.rows.map(renderImportRow)}
      </Fragment>
    )
  }

  function addMissingCustomer(item: ImportPreview) {
    if (!item.region || importBusy || !authorization.can('Customers', 'add')) return
    setCustomerDraft({ customer: item.source.customer?.trim() ?? '', salesman: item.source.kam?.trim() ?? '', regionId: String(item.region.id), segment: '', active: true })
  }

  async function saveMissingCustomer() {
    if (!customerDraft) return
    const name = customerDraft.customer.trim()
    const region = regions.find((item) => String(item.id) === customerDraft.regionId)
    if (importBusy || !authorization.can('Customers', 'add') || !name || !region) return
    if (!canWriteAllRegions && region.id !== assignedRegionId) return

    setAddingCustomer(true)
    setError('')
    setMessage('')
    try {
      // Refresh first so another row or a recent customer addition is reused.
      const result = await loadCustomers()
      if (result.error) throw result.error
      const currentCustomers = result.data ?? []
      const exists = currentCustomers.some((customer) =>
        normalizeText(customer.customer) === normalizeText(name) && customer.region_id === region.id
      )
      if (exists) {
        setCustomers(currentCustomers)
        setMessage('Customer already exists. Import preview updated.')
        setCustomerDraft(null)
        return
      }
      const { data, error } = await supabase.from('customers').insert({
        customer: name,
        region_id: region.id,
        salesman: customerDraft.salesman.trim() || null,
        segment: customerDraft.segment.trim() || null,
        is_active: customerDraft.active,
      }).select('id, customer, region_id').single()
      if (error) throw error
      setCustomers([...currentCustomers, data as Customer])
      setMessage(`Customer "${name}" added. Import preview updated.`)
      setCustomerDraft(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'Unable to add customer.')
    } finally {
      setAddingCustomer(false)
    }

  }

  function renderImportRow(item: ImportPreview) {
    return (
      <tr key={item.source.id} data-import-record="" className="border-b last:border-0 hover:bg-muted/20">
        <td data-action-column="compact" className="px-1 py-2 text-center"><div className="flex flex-nowrap items-center justify-center gap-1">
          {!item.source.savedActual && authorization.can(moduleName, 'edit') && (
            <TableActionButton action="edit" compact data-action-tone="caution" type="button" className="inline-flex items-center justify-center rounded-md border" disabled={importBusy} onClick={() => { setFocusImportVolume(false); setEditingImport(item.source) }} />
          )}
          {!item.source.savedActual && authorization.can(moduleName, 'delete') && (
            <TableActionButton action="discard" compact data-action-tone="danger" type="button" className="inline-flex items-center justify-center rounded-md border" disabled={importBusy} onClick={() => saveStagingRecord(item.source, 'delete')} />
          )}
        </div></td>
        <td className="px-3 py-3">
          <StatusBadge status={getImportStatusLabel(item.status)} />
        </td>
        {!isActual && <td className="px-3 py-3">{item.year ?? (item.source.year || '-')}</td>}
        <td className="px-3 py-3">{isActual ? item.actualDate ?? (item.source.actual_date || '-') : item.source.month || '-'}</td>
        <td className="px-3 py-3">{item.source.region || '-'}</td>
        <td className="px-3 py-3 wrap-anywhere">
          {item.source.product_code || '-'}
        </td>
        <td className="max-w-44 px-3 py-3 wrap-anywhere" title={item.source.product_name ?? ''}>{item.source.product_name || '-'}</td>
        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
          {item.volume === null ? '-' : formatNumber(item.volume)}
        </td>
      </tr>
    )
  }

  async function handleImport() {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (importBusy || loadingSavedRecords || !savedRecordsComplete || stagingError || !stagingLoaded) return
    if ((!authorization.can(moduleName, 'add') || !authorization.can(moduleName, 'import'))) return
    if (isSupervisor && assignedRegionId === null) {
      setError('Your account needs an assigned region to import records.')
      return
    }
    if (readyImportCount === 0) return

    const confirmed = (actionConfirmation = await confirmAction({ message: `Import ${readyImportCount} valid ${label} record(s) into ${savedTitle}? Rows that need review will stay in the preview.`, details: confirmationRecordDetails(visibleImportPreview.filter((item) => item.status === 'Ready' && !item.source.savedActual)) }))

    if (!confirmed) return

    setError('')
    setMessage('')
    setImporting(true)

    const recordsToImport = visibleImportPreview.filter(
      (item) => item.status === 'Ready' && !item.source.savedActual
    )

    const payload = recordsToImport.map((item) => ({
      ...(item.actualDate
        ? { actual_date: item.actualDate }
        : { year: item.year!, month: item.month! }),
      region_id: item.region!.id,
      subregion_id: item.salesperson?.subregion_id ?? null,
      customer_id: item.customer!.id,
      category_id: item.product!.category_id,
      product_id: item.product!.id,
      kam: item.salesperson?.full_name?.trim() || item.source.kam?.trim() || null,
      volume: item.volume!,
    }))

    try {
      let importedCount = 0
      try {
        for (let start = 0; start < payload.length; start += 100) {
          const batch = payload.slice(start, start + 100)
          const { error: importError } = await supabase.rpc('import_volume_records', { p_module: moduleName, p_records: batch })
            .abortSignal(AbortSignal.timeout(SAVED_RECORDS_TIMEOUT_MS))
          if (importError) throw new Error(importError.message)
          importedCount += batch.length
          // Only remove staging IDs belonging to this confirmed saved batch.
          const ids = recordsToImport.slice(start, start + batch.length).map((item) => item.source.id)
          const deletedIds = new Set<number>()
          await deleteStagingRows(ids, deletedIds)
          if (deletedIds.size !== ids.length) throw new Error('Saved records could not all be cleared from staging. Check staging delete permissions.')
          setEditingImport((current) => current && deletedIds.has(current.id) ? null : current)
        }
        setMessage(`${importedCount} ${label} record(s) imported and cleared from staging.`)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unable to finish the import batch.'
        setError(`Import stopped after ${importedCount} confirmed saved record(s): ${reason}. Unsaved rows remain in staging. Refresh and review validation before retrying.`)
      } finally {
        await Promise.all([loadBudgets(), loadStagingRecords()])
      }
    } finally {
      setImporting(false)
    }

    } finally { actionConfirmation?.finish() }
  }

  async function handleDeleteMany(items: BudgetRecord[], salesman?: string) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (loading || loadingSavedRecords || !authorization.can(moduleName, 'delete') || items.length === 0) return

    if (
      !canWriteAllRegions &&
      items.some((item) => item.region_id !== assignedRegionId)
    ) {
      setError('You can only delete records from your assigned region.')
      return
    }

    const confirmed = (actionConfirmation = await confirmAction({ message: salesman
      ? `Delete ${items.length} currently filtered ${label} record(s) for salesman ${salesman}? This action cannot be undone.`
      : `Delete ${items.length} ${label} record(s)? This action cannot be undone.`, details: confirmationRecordDetails(items) }))

    if (!confirmed) return

    setError('')
    setMessage('')
    setLoading(true)

    const query = supabase
      .from(savedTable)
      .delete()
      .in(
        'id',
        items.map((item) => item.id)
      )
    const { error: deleteError } = await (isActual ? query.not('actual_date', 'is', null) : query)

    setLoading(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setMessage(`${items.length} ${label} record(s) deleted successfully.`)
    await loadBudgets()

    } finally { actionConfirmation?.finish() }
  }

  function editSavedCustomer(customer: string, items: BudgetRecord[]) {
    if (loading || loadingSavedRecords || !authorization.can(moduleName, 'edit') || !items.length) return
    if (!canWriteAllRegions && items.some((item) => item.region_id !== assignedRegionId)) {
      setSavedEditError('You can only edit records from your assigned region.')
      return
    }
    setEditingSavedCustomer({ customer, customerId: String(items[0].customer_id ?? ''), kam: items[0].kam ?? '',
      year: items.every((item) => item.year === items[0].year) ? String(items[0].year) : '',
      rows: orderVolumeEditorRows(items, isActual).map((original) => ({
      original, year: String(original.year), month: original.month == null ? '' : String(original.month),
      actualDate: original.actual_date ?? '', volume: String(original.volume), productId: String(original.product_id ?? ''),
    })) })
  }

  async function saveSavedSalesman(event: React.FormEvent) {
    event.preventDefault()
    if (!editingSavedSalesman || loading || loadingSavedRecords || !authorization.can(moduleName, 'edit')) return
    try {
      const kam = editingSavedSalesman.name.trim()
      if (!kam) throw new Error('Select a salesman.')
      if (!canWriteAllRegions && editingSavedSalesman.items.some((item) => item.region_id !== assignedRegionId)) throw new Error('You can only edit records from your assigned region.')
      setLoading(true)
      const count = await persistCustomerVolumeUpdates(supabase, moduleName, editingSavedSalesman.items.map((original) => ({
        original, kam, volume: String(original.volume), year: String(original.year),
        month: original.month == null ? '' : String(original.month), actualDate: original.actual_date ?? '',
      })), 'update_salesman_volume_records')
      setEditingSavedSalesman(null)
      if (count) { await loadBudgets(); setMessage(`${count} ${label} record(s) reassigned successfully.`) }
    } catch (error) { setSavedEditError(error instanceof Error ? error.message : 'Unable to update salesman records.') }
    finally { setLoading(false) }
  }

  async function saveImportSalesman(event: React.FormEvent) {
    event.preventDefault()
    if (!editingImportSalesman || importBusy || !authorization.can(moduleName, 'edit') || !authorization.can(moduleName, 'import')) return
    try {
      if (!actualImportKams) throw new Error('Refresh uploaded records to load salesman assignments.')
      const salesman = resolveOracleKam(editingImportSalesman.name, actualImportKams)
      setSavingImport(true)
      const { error } = await supabase.rpc('update_import_salesman_records', {
        p_module: moduleName, p_salesman: salesman.full_name,
        p_records: editingImportSalesman.items.map((item) => ({ id: item.id, kam: item.kam, region: item.region })),
      })
      if (error) throw new Error(error.message)
      setEditingImportSalesman(null)
      await loadStagingRecords()
      setMessage('Uploaded salesman updated. Validation refreshed.')
    } catch (error) { setSavedEditError(error instanceof Error ? error.message : 'Unable to update uploaded salesman.') }
    finally { setSavingImport(false) }
  }

  async function saveSavedCustomer(event: React.FormEvent) {
    event.preventDefault()
    if (!editingSavedCustomer || loading || loadingSavedRecords || !authorization.can(moduleName, 'edit')) return
    if (!canWriteAllRegions && editingSavedCustomer.rows.some((row) => row.original.region_id !== assignedRegionId)) {
      setSavedEditError('You can only edit records from your assigned region.')
      return
    }
    try {
      for (const row of editingSavedCustomer.rows) validateSavedVolumePeriod(row.volume, isActual, row.year, row.month, row.actualDate)
      setLoading(true)
      const customerName = editingSavedCustomer.customer.trim()
      let customer = customers.find((item) => item.customer.trim().toLowerCase() === customerName.toLowerCase())
      if (customerName && !customer) {
        if (!authorization.can('Customers', 'add')) throw new Error('You need permission to add customers before saving a new customer name.')
        const regionId = editingSavedCustomer.rows[0].original.region_id
        const { data, error } = await supabase.from('customers').insert({ customer: customerName, salesman: editingSavedCustomer.kam.trim() || null, region_id: regionId, is_active: true }).select('id, customer, region_id').single()
        if (error) throw error
        customer = data as Customer
        setCustomers((current) => [...current, data as Customer])
      }
      const customerId = customer?.id ?? (editingSavedCustomer.customerId === '' ? null : Number(editingSavedCustomer.customerId))
      if (editingSavedCustomer.rows.some((row) => row.original.customer_id !== customerId) && !customer) throw new Error('Choose a valid customer.')
      const changes = editingSavedCustomer.rows.map((row) => {
        const regionId = customer?.region_id ?? row.original.region_id
        if (!canWriteAllRegions && regionId !== assignedRegionId) throw new Error('Choose a customer in your assigned region.')
        const productId = row.productId === '' ? null : Number(row.productId)
        const product = products.find((item) => item.id === productId)
        if (productId !== row.original.product_id && !product) throw new Error('Choose a valid product for each row.')
        return { ...row, customerId, regionId, productId,
          categoryId: productId === row.original.product_id ? row.original.category_id : product?.category_id ?? null,
          kam: editingSavedCustomer.kam.trim() || null }
      })
      const count = await persistCustomerVolumeUpdates(supabase, moduleName, changes)
      setEditingSavedCustomer(null)
      if (count) {
        await loadBudgets()
        setMessage(`${count} customer ${label} record(s) updated successfully.`)
      }
    } catch (error) { setSavedEditError(error instanceof Error ? error.message : 'Unable to update customer records.') }
    finally { setLoading(false) }
  }

  const canShowActions = authorization.can(moduleName, 'edit') || authorization.can(moduleName, 'delete')
  const canManageImport = authorization.can(moduleName, 'import') && (authorization.can(moduleName, 'add') || canShowActions)
  const savedActionColumn = 'compact'

  return (
    <div data-volume-page className="space-y-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-4 lg:space-y-0">
      {editingImportSalesman && <RecordDialog open onClose={() => setEditingImportSalesman(null)} title={`Edit ${isActual ? 'Actuals' : 'Budget'} Import Salesman`} busy={savingImport} fitContent maxWidth="36rem" stackLevel={1}>
        <form data-salesman-editor="" onSubmit={saveImportSalesman} className="flex flex-col gap-4">
          <div data-popup-form-header="" className="border-b pb-4 pr-10"><h2 data-dialog-title data-section-title=""><HeadingPencil className="size-5 text-muted-foreground" aria-hidden="true" />Edit {isActual ? 'Actuals' : 'Budget'} Import Salesman</h2><p className="mt-1 text-xs text-muted-foreground">{editingImportSalesman.items.length.toLocaleString()} uploaded records</p></div>
          <label className="flex min-w-0 flex-col gap-2 text-sm font-medium"><span>Salesman</span>
            <SearchableSelect aria-label="Salesman" required value={editingImportSalesman.name} disabled={savingImport} placeholder="Select salesman" onValueChange={(name) => setEditingImportSalesman((current) => current && ({ ...current, name }))} options={(actualImportKams ?? []).filter((user) => user.full_name?.trim()).map((user) => ({ value: user.full_name!.trim(), label: user.full_name!.trim() }))} />
          </label>
          <div data-action-toolbar="" data-dialog-footer="" className="flex justify-end gap-2 border-t pt-4">
            <button data-action-tone="neutral" type="button" disabled={savingImport} onClick={() => setEditingImportSalesman(null)} className="inline-flex h-10 items-center gap-2 rounded-md border px-4"><ActionXIcon className="size-4" aria-hidden="true" />Cancel</button>
            <button data-action-tone="primary" data-action-fill="" type="submit" disabled={savingImport || !editingImportSalesman.name.trim()} className="inline-flex h-10 items-center gap-2 rounded-md border px-4"><ActionSaveIcon className="size-4" aria-hidden="true" />{savingImport ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </RecordDialog>}
      {customerDraft && <RecordDialog open onClose={() => setCustomerDraft(null)} title="Add Customer" busy={addingCustomer} stackLevel={1}>
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void saveMissingCustomer() }}>
          <div data-popup-form-header=""><h2 data-section-title=""><ActionUserPlusIcon className="size-5 text-muted-foreground" aria-hidden="true" />Add Customer</h2></div>
          <div data-customer-fields="" className="app-field-row gap-4">
            <label className="space-y-2 text-sm font-medium"><span className="text-destructive">*</span> Customer<input required value={customerDraft.customer} onChange={(event) => setCustomerDraft({ ...customerDraft, customer: event.target.value })} className="h-10 w-full rounded-md border bg-background px-3 text-sm" /></label>
            <label className="space-y-2 text-sm font-medium">Salesman<SalespersonInput value={customerDraft.salesman} onValueChange={(salesman) => setCustomerDraft({ ...customerDraft, salesman })} placeholder="Select or enter salesman name" /></label>
            <label className="space-y-2 text-sm font-medium"><span className="text-destructive" aria-hidden="true">*</span> Region<SelectionField aria-label="Region" required disabled={!canWriteAllRegions} value={customerDraft.regionId} onValueChange={(regionId) => setCustomerDraft({ ...customerDraft, regionId })}><option value="">Select region</option>{regions.filter((region) => canWriteAllRegions || region.id === assignedRegionId).map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</SelectionField></label>
            <label className="space-y-2 text-sm font-medium">Segment<SearchableSelect aria-label="Segment" freeText placeholder="Select or enter segment" value={customerDraft.segment} onValueChange={(segment) => setCustomerDraft({ ...customerDraft, segment })} options={[{ value: 'DISTRIBUTOR', label: 'DISTRIBUTOR' }, { value: 'FARM', label: 'FARM' }]} /></label>
            <div data-field-size="toggle" className="flex items-end"><ActiveField checked={customerDraft.active} onChange={(event) => setCustomerDraft({ ...customerDraft, active: event.target.checked })} /></div>
          </div>
          <div data-action-toolbar="" data-dialog-footer="">
            <button data-action-tone="neutral" type="button" onClick={() => setCustomerDraft(null)} disabled={addingCustomer} className="rounded-md border px-4 text-sm"><ActionXIcon className="size-4" aria-hidden="true" />Cancel</button>
            <button data-action-tone="primary" data-action-fill="" type="submit" disabled={addingCustomer} className="rounded-md border px-4 text-sm"><ActionUserPlusIcon className="size-4" aria-hidden="true" />{addingCustomer ? 'Saving…' : 'Add Customer'}</button>
          </div>
        </form>
      </RecordDialog>}
      {addingProduct && <ImportProductDialog code={addingProduct.code} name={addingProduct.name} onClose={() => setAddingProduct(null)} onAdded={(product) => {
        setProducts((current) => [...current.filter((item) => item.id !== product.id), product])
        setAddingProduct(null)
        setMessage(`Product "${product.code}" added. Import validation updated.`)
      }} />}


      {/* BUDGET EXCEL IMPORT */}

      {canManageImport && showImportPreview && <RecordDialog open onClose={() => setShowImportPreview(false)} title={`${moduleName} Excel Import`} busy={uploadingExcel || importing || savingImport || addingCustomer} wide contained fitContent maxWidth="90rem" maxHeight="min(42rem, calc(100dvh - 2rem))">
      <div className="app-tables flex min-h-0 min-w-0 flex-1 flex-col">
        <div data-import-dialog-header className="flex shrink-0 flex-col gap-3 border-b pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-muted-foreground" />
              <h2 data-dialog-title className="text-lg font-semibold">
                {moduleName} Excel Import
              </h2>
            </div>


          </div>

          <div data-action-toolbar="" className="flex max-w-full shrink-0 flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap [&>button]:shrink-0">
<input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload}
              className="hidden"
            />
<button data-action-tone="transfer" data-action-fill=""
              type="button"
              title="Upload File" aria-label="Upload File" onClick={() => fileInputRef.current?.click()}
              disabled={
                importBusy ||
                (!authorization.can(moduleName, 'add') || !authorization.can(moduleName, 'import'))
              }
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingExcel ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              <span data-import-icon-label="" className="sr-only md:not-sr-only">{uploadingExcel ? 'Uploading...' : 'Upload File'}</span>
            </button>
<button data-action-tone="neutral"
              type="button"
              title="Download Template" aria-label="Download Template" onClick={() => downloadImportTemplate(moduleName)}
              disabled={importBusy}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            >
              <Download className="size-4" />
              <span data-import-icon-label="" className="sr-only md:not-sr-only">Template</span>
            </button>
<button data-compact-action="" data-action-tone="neutral"
              type="button"
              title="Refresh" aria-label="Refresh" onClick={loadStagingRecords}
              disabled={importBusy}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${loadingStaging ? 'animate-spin' : ''}`}
              />

            </button>
</div>
        </div>

        {showImportPreview && (
          <div data-volume-import-body className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pt-4 sm:flex sm:flex-col sm:gap-4 sm:space-y-0 sm:overflow-hidden">
            <div data-import-summary-cards="" className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Total Records
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {loadingStaging && visibleImportPreview.length === 0 ? <LoadingSpinner label="total records" /> : (!stagingLoaded && !loadingStaging) || stagingError ? '—' : visibleImportPreview.length}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Ready to Import
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {loadingStaging && visibleImportPreview.length === 0 ? <LoadingSpinner label="ready to import" /> : (!stagingLoaded && !loadingStaging) || stagingError ? '—' : readyImportCount}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Invalid
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {loadingStaging && visibleImportPreview.length === 0 ? <LoadingSpinner label="invalid records" /> : (!stagingLoaded && !loadingStaging) || stagingError ? '—' : invalidImportCount}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Already Imported
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {loadingStaging && visibleImportPreview.length === 0 ? <LoadingSpinner label="already imported records" /> : (!stagingLoaded && !loadingStaging) || stagingError ? '—' : alreadyImportedCount}
                </p>
              </div>
            </div>


            <div className="flex shrink-0 justify-end">

              <div data-action-toolbar="" data-import-preview-actions="" className="flex shrink-0 flex-wrap items-center gap-2">
                <button data-action-tone="transfer" data-action-fill=""
                  type="button"
                  title="Import Ready" aria-label="Import Ready" onClick={handleImport}
                  disabled={
                    importBusy ||
                    loadingSavedRecords ||
                    !savedRecordsComplete ||
                    Boolean(stagingError) ||
                    !stagingLoaded ||
                    readyImportCount === 0 ||
                    (!authorization.can(moduleName, 'add') || !authorization.can(moduleName, 'import'))
                  }
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  <span data-import-icon-label="" className="sr-only md:not-sr-only">{importing ? 'Importing...' : 'Import Ready'}</span>
                </button>
                {authorization.can(moduleName, 'delete') && (
                  <button data-action-tone="danger"
                    type="button"
                    title="Discard All" aria-label="Discard All" onClick={deleteAllStagingRecords}
                    disabled={importBusy || stagingRecords.length === 0}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span data-import-icon-label="" className="sr-only md:not-sr-only">Discard All</span>
                  </button>
                )}

</div>
            </div>

            {editingImport && (
              <RecordDialog open onClose={() => setEditingImport(null)} title="Edit Uploaded Record" busy={savingImport} contained fitContent maxWidth="42rem" initialFocusSelector={focusImportVolume ? '[data-import-volume]' : undefined}>
              <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={(event) => {
                event.preventDefault()
                void saveStagingRecord(editingImport, 'edit')
              }}>
                <div className="shrink-0 border-b pb-4 pr-10" data-popup-form-header="">
                  <h2 data-dialog-title className="text-lg font-semibold"><HeadingPencil className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Edit Uploaded Record</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{moduleName} · Record #{editingImport.id}</p>
                </div>
                <div role="region" aria-label="Uploaded record fields" tabIndex={0} className="min-h-0 min-w-0 max-h-[max(5rem,calc(100dvh-17rem))] flex-1 overflow-y-auto overscroll-contain pr-1 pb-1 sm:max-h-[max(5rem,calc(100dvh-13rem))]">
                <fieldset data-uploaded-record-fields="" data-actual-editor={isActual ? '' : undefined} disabled={importBusy} className="grid min-w-0 content-start grid-cols-2 gap-4 border-0 p-0">
                  {([
                    ...(isActual ? [['actual_date', 'Date']] as const : [['year', 'Year'], ['month', 'Month']] as const),
                    ['region', 'Region'],
                    ['kam', 'Salesman'],
                    ['customer', 'Customer'], ['product_name', 'Product Name'],
                    ['product_code', 'Product Code'], ['volume', volumeLabel],
                  ] as const).map(([field, label]) => (
                    <label key={field} data-import-field={field} className={`flex min-w-0 flex-col gap-1.5 text-sm font-medium ${field === 'kam' || field === 'customer' || field === 'product_name' ? 'col-span-2 sm:col-span-1' : ''}`}>
                      <span>{field === 'volume' && <span className="text-destructive" aria-hidden="true">* </span>}{label}</span>
                      {field === 'kam' ? <SalespersonInput
                        value={editingImport.kam ?? ''} disabled={importBusy}
                        onValueChange={(kam) => setEditingImport({ ...editingImport, kam: kam || null })}
                      /> : <input
                        data-import-volume={field === 'volume' ? '' : undefined}
                        required={field === 'volume'}
                        type={field === 'actual_date' ? 'date' : field === 'year' || field === 'volume' ? 'number' : 'text'}
                        step={field === 'volume' ? 'any' : undefined}
                        className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        value={editingImport[field] ?? ''}
                        disabled={importBusy}
                        onChange={(event) => setEditingImport({
                          ...editingImport,
                          [field]: event.target.value || null,
                        })}
                      />}
                    </label>
                  ))}
                </fieldset>
                </div>
                <div data-action-toolbar="" data-dialog-footer="" data-uploaded-record-actions="" className="flex shrink-0 flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                  <button data-action-tone="neutral" type="button" disabled={savingImport} onClick={() => setEditingImport(null)} className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"><ActionXIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
                    Cancel
                  </button>
                  <button data-action-tone="primary" data-action-fill="" type="submit" disabled={importBusy} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"><ActionSaveIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
                    {savingImport ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
              </RecordDialog>
            )}


            <Table data-volume-layout="import" id={moduleName.toLowerCase() + '-import-records'}
              className="min-w-[1144px]"
              containerProps={{ className: "max-h-[min(22rem,50vh)] w-full overflow-auto rounded-lg border", tabIndex: 0, role: "region", "aria-label": moduleName + ' upload preview', 'aria-busy': loadingStaging }}
            >
                <colgroup>
                  <col data-action-column="compact" />
                  <col data-import-column="status" className="w-44" />
                  {!isActual && <col data-import-column="year" className="w-[72px]" />}
                  <col data-import-column="period" className="w-28" />
                  <col data-import-column="region" className="w-28" />
                  <col data-import-column="code" className="w-44" />
                  <col data-import-column="product" className="w-[280px]" />
                  <col data-import-column="volume" className="w-28" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b bg-muted/40">
                    <th data-action-column="compact" className="px-1 py-3 text-center font-medium">Action</th>
                    <th className="px-3 py-3 text-left font-medium">
                      <div className="flex items-center gap-1.5">
                        <HeaderExpandCollapseButton expanded={allImportGroupsExpanded} loading={importBusy} empty={importGroupKeys.length === 0}
                          onClick={() => setExpandedImportGroups(new Set(allImportGroupsExpanded ? [] : importGroupKeys))}
                          aria-controls={moduleName.toLowerCase() + '-import-records'} />
                        <span>Status</span>
                      </div>
                    </th>
                    {!isActual && <th className="px-3 py-3 text-left font-medium">Year</th>}
                    <th className="px-3 py-3 text-left font-medium">{isActual ? 'Date' : 'Month'}</th>
                    <th className="px-3 py-3 text-left font-medium">Region</th>
                    <th className="px-3 py-3 text-left font-medium">Product Code</th>
                    <th className="px-3 py-3 text-left font-medium">Product Name</th>
                    <th data-import-volume-header="" className="px-3 py-3 text-right font-medium">{volumeLabel}</th>
                  </tr>
                </thead>

                <tbody>
                  {loadingStaging && visibleImportPreview.length === 0 ? (
                    <TableLoadingRow columns={isActual ? 7 : 8} label="uploaded records" />
                  ) : visibleImportPreview.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isActual ? 7 : 8}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        {stagingError || (!stagingLoaded
                          ? 'Uploaded records have not loaded. Select Refresh to try again.'
                          : stagingRecords.length > 0
                            ? 'Uploaded records exist, but none match your assigned region.'
                            : 'No pending uploads.')}
                      </td>
                    </tr>
                  ) : (
                    Array.from(importGroups, ([key, group]) => renderImportGroup(group, [key]))
                  )}
                </tbody>
            <tfoot className="sticky bottom-0 z-10 border-t bg-card">
                  <tr><td colSpan={isActual ? 6 : 7} className="px-3 py-3 text-sm text-muted-foreground"><div className="flex items-center justify-between gap-3"><span>{visibleImportPreview.length.toLocaleString('en-PH')} {visibleImportPreview.length === 1 ? 'record' : 'records'}</span><span>Grand Total</span></div></td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums" aria-busy={loadingStaging}>{stagingLoaded && !stagingError ? formatNumber(importVolumes.total) : '—'}</td></tr>
                </tfoot>
            </Table>


          </div>
        )}
      </div></RecordDialog>}

      {/* SAVED BUDGETS */}

      <div data-saved-volumes className="rounded-xl border bg-card shadow-sm lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
        <div data-section-header="" data-aligned-toolbar="" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <h2 data-section-title="" className="text-base font-semibold"><HeadingDatabase className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
              {savedTitle}
            </h2>
          </div>
          <div data-action-toolbar="" data-saved-volume-actions="" className="flex flex-wrap items-center gap-2">
            {canManageImport && <button type="button" data-action-tone="transfer" aria-label="Excel Import" title="Excel Import" onClick={() => {
              setShowImportPreview(true)
              if (!importBusy) void loadStagingRecords()
            }} disabled={initializing || importBusy} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50">
              <FileSpreadsheet className="size-4" aria-hidden="true" /><span className="hidden md:inline">Excel Import</span>
            </button>}
          <button data-action-tone="neutral" type="button" aria-label="Reset filters" title="Reset filters"
            onClick={() => {
              setFilterCustomer('')
              setFilterProduct('')
              setFilterYear(currentPeriod.year)
              setFilterSalesman('')
              setFilterMonth(currentPeriod.month)
              setFilterRegionId(canReadAllRegions ? '' : assignedRegionId === null ? '' : String(assignedRegionId))
              setManualSavedSearchQuery(null)
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-sm">
            <FilterX className="size-4 shrink-0" aria-hidden="true" /><span className="hidden md:inline">Reset filters</span>
          </button>

            <button data-compact-action="" data-action-tone="neutral"
              type="button"
              onClick={loadBudgets}
              aria-label="Refresh saved records" title="Refresh saved records"
              disabled={initializing || loading || loadingSavedRecords}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="size-4" aria-hidden="true" />

            </button>
          </div>
        </div>

        {editingSavedSalesman && <RecordDialog open onClose={() => setEditingSavedSalesman(null)} title={isActual ? 'Edit Actuals Salesman' : 'Edit Budget Salesman'} busy={loading} fitContent maxWidth="36rem">
          <form data-salesman-editor="" onSubmit={saveSavedSalesman} className="flex flex-col gap-4">
            <div data-popup-form-header="" className="border-b pb-4 pr-10"><h2 data-dialog-title data-section-title=""><HeadingPencil className="size-5 text-muted-foreground" aria-hidden="true" />{isActual ? 'Edit Actuals Salesman' : 'Edit Budget Salesman'}</h2></div>
          <label className="flex min-w-0 flex-col gap-2 text-sm font-medium"><span>Salesman</span><SalespersonInput value={editingSavedSalesman.name} disabled={loading} onValueChange={(name) => setEditingSavedSalesman((current) => current && ({ ...current, name }))} /></label>
            <div data-action-toolbar="" data-dialog-footer="" className="flex justify-end gap-2 border-t pt-4">
              <button data-action-tone="neutral" type="button" disabled={loading} onClick={() => setEditingSavedSalesman(null)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50"><ActionXIcon className="size-4" aria-hidden="true" />Cancel</button>
              <button data-action-tone="primary" data-action-fill="" type="submit" disabled={loading || !editingSavedSalesman.name.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50"><ActionSaveIcon className="size-4" aria-hidden="true" />{loading ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </RecordDialog>}
        {editingSavedCustomer && <RecordDialog open onClose={() => setEditingSavedCustomer(null)} title={`Edit Customer ${moduleName}`} busy={loading} wide contained fitContent maxWidth="56rem">
          <form onSubmit={saveSavedCustomer} className="app-tables flex min-h-0 flex-1 flex-col gap-4 text-sm">
            <div className="shrink-0 border-b pb-4 pr-10" data-popup-form-header="">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 data-dialog-title data-section-title="" className="font-semibold"><HeadingPencil className="size-5 text-muted-foreground" aria-hidden="true" />Edit Customer {moduleName}</h2>
              <p className="text-xs text-muted-foreground">{editingSavedCustomer.rows.length.toLocaleString('en-PH')} {editingSavedCustomer.rows.length === 1 ? 'record' : 'records'}</p>
              </div>
            </div>
            <div role="region" aria-label="Customer record fields" tabIndex={0} className="flex min-h-0 min-w-0 max-h-[max(5rem,calc(100dvh-17rem))] flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1 pb-1 sm:max-h-[max(5rem,calc(100dvh-13rem))] sm:overflow-hidden">
              <fieldset disabled={loading} className="grid min-w-0 shrink-0 grid-cols-1 gap-4 border-0 p-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_6rem]">
                <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">Salesman
                  <SalespersonInput value={editingSavedCustomer.kam} disabled={loading} onValueChange={(kam) => setEditingSavedCustomer((current) => current && ({ ...current, kam }))} />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"><span className="text-destructive" aria-hidden="true">*</span> Customer Name
                  <SearchableSelect aria-label="Customer Name" freeText required value={editingSavedCustomer.customer} disabled={loading} placeholder="Select or enter customer name"
                    onValueChange={(customer) => setEditingSavedCustomer((current) => current && ({ ...current, customer }))}
                    options={customers.filter((customer) => canWriteAllRegions || customer.region_id === assignedRegionId).map((customer) => ({ value: customer.customer, label: customer.customer }))} />
                </label>
                <label data-field-size="compact" className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">Year
                  <input type="number" min={2020} max={2100} step={1} value={editingSavedCustomer.year} placeholder="Keep existing years"
                    onChange={(event) => {
                      const year = event.target.value
                      setEditingSavedCustomer((current) => current && ({ ...current, year, rows: current.rows.map((row) => ({...row,year:year || String(row.original.year),actualDate:year && year.length === 4 && row.actualDate ? year + row.actualDate.slice(4) : row.actualDate})) }))
                    }} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
                </label>
              </fieldset>
              <Table className="min-w-[680px] table-fixed" containerProps={{ className: 'min-h-0 shrink-0 rounded-lg border sm:flex-[0_1_auto]', style: { maxHeight: 'none' }, 'aria-label': 'Customer record editor', tabIndex: 0, role: 'region' }}>
                <colgroup><col className="w-12" /><col className="w-[168px]" /><col /><col className="w-[144px]" /></colgroup>
                <thead className="sticky top-0 z-10 border-b bg-muted text-sm"><tr><th className="px-3 py-2 text-left font-medium">#</th><th className="px-3 py-2 text-left font-medium">{isActual && <span className="text-destructive" aria-hidden="true">* </span>}{isActual ? 'Date' : 'Month'}</th><th className="px-3 py-2 text-left font-medium">Product</th><th className="px-3 py-2 text-right font-medium whitespace-nowrap"><span className="text-destructive" aria-hidden="true">*</span> Volume (50kg)</th></tr></thead>
                <tbody>{editingSavedCustomer.rows.map((draft, index) => {
                  const update = (change: Partial<SavedRecordDraft>) => setEditingSavedCustomer((current) => current && ({ ...current, rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...change } : row) }))
                  return <tr key={draft.original.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2 text-left">{isActual
                      ? <input aria-label={`Date for row ${index+1}`} type="date" disabled={loading} required min={editingSavedCustomer.year ? editingSavedCustomer.year+'-01-01' : undefined} max={editingSavedCustomer.year ? editingSavedCustomer.year+'-12-31' : undefined} value={draft.actualDate} onChange={(event) => update({actualDate:event.target.value})} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
                      : <SelectionField aria-label={`Month for row ${index+1}`} value={draft.month} disabled={loading} onValueChange={(month) => update({month})}>
                          <option value="">Annual</option>
                          {Array.from({length:12},(_,month)=><option key={month+1} value={month+1}>{getMonthName(month+1,Number(draft.year)||currentYear)}</option>)}
                        </SelectionField>}
                    </td>
                    <td className="px-3 py-2 text-left"><SearchableSelect aria-label={`Product for row ${index+1}`} value={draft.productId} placeholder="Select product…" disabled={loading}
                      options={[
                        ...(draft.original.product_id === null ? [{value:'',label:'Unassigned'}] : []),
                        ...(!products.some((product) => String(product.id) === draft.productId) && draft.productId ? [{value:draft.productId,label:getProductName(draft.original.product_id),disabled:true}] : []),
                        ...products.map((product) => ({value:String(product.id),label:product.code+' — '+product.name})),
                      ]} onValueChange={(productId) => update({productId})} /></td>
                    <td className="px-3 py-2 text-left"><input aria-label={`Volume for row ${index+1}`} disabled={loading} type="number" step="any" required value={draft.volume} onChange={(event)=>update({volume:event.target.value})} className="h-10 w-full rounded-md border bg-background px-3 text-right text-sm" /></td>
                  </tr>
                })}</tbody>
              </Table>
            </div>
            <div data-action-toolbar="" data-dialog-footer="" className="relative z-20 flex shrink-0 flex-col-reverse gap-2 border-t bg-card pt-4 sm:flex-row sm:justify-end">
              <button data-action-tone="neutral" type="button" disabled={loading} onClick={() => setEditingSavedCustomer(null)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50"><ActionXIcon className="size-4" aria-hidden="true" />Cancel</button>
              <button data-action-tone="primary" data-action-fill="" type="submit" disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50"><ActionSaveIcon className="size-4" aria-hidden="true" />{loading ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </RecordDialog>}

        <div data-filter-toolbar="" className="app-field-row saved-volume-filters shrink-0 border-b p-6">
          <div data-field-size="compact" className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Year
            </label>

            <SelectionField value={filterYear}
                  onValueChange={(selectionValue) => setFilterYear(selectionValue)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Year">
              <option value="">All Years</option>

              {Array.from(
                new Set(budgets.map((item) => item.year))
              )
                .sort((a, b) => b - a)
                .map((itemYear) => (
                  <option key={itemYear} value={itemYear}>
                    {itemYear}
                  </option>
                ))}
            </SelectionField>
          </div>

          <div data-field-size="compact" className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Month
            </label>

            <SelectionField value={filterMonth}
                  onValueChange={(selectionValue) => setFilterMonth(selectionValue)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Month">
              <option value="">All Months</option>

              {Array.from({ length: 12 }, (_, index) => index + 1).map(
                (monthNumber) => (
                  <option key={monthNumber} value={monthNumber}>
                    {getMonthName(monthNumber, currentYear)}
                  </option>
                )
              )}
            </SelectionField>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Region
            </label>

            <SelectionField value={filterRegionId}
                  loading={initializing} loadingText="Loading regions…"
                  disabled={initializing || !canReadAllRegions}
                  placeholder={initializing ? 'Loading regions…' : 'No assigned region'}
                  onValueChange={(selectionValue) => {
                setFilterRegionId(selectionValue)
                setFilterSalesman('')
                setFilterCustomer('')
              }}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Region">
              {canReadAllRegions && <option value="">All Regions</option>}

              {availableRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </SelectionField>
          </div>

          <div data-salesman-filter="" className="space-y-1.5">
            <label htmlFor="saved-volume-salesman-filter" className="text-xs font-medium text-muted-foreground">Salesman</label>
            <SelectionField id="saved-volume-salesman-filter" aria-label="Salesman" value={filterSalesman}
              onValueChange={(value) => { setFilterSalesman(value); setFilterCustomer(''); setFilterProduct('') }}
              disabled={initializing || savedSalesmanOptions.length === 0} loading={initializing}
              className="h-9 w-full" placeholder="All Salesmen">
              <option value="">All Salesmen</option>
              {savedSalesmanOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </SelectionField>
          </div>

          <div data-field-size="wide" className="space-y-1.5">
            <label htmlFor="saved-budget-customer-search" className="text-xs font-medium text-muted-foreground">
              Customer
            </label>

            <SelectionField id="saved-budget-customer-search"
                  value={filterCustomer}
                  onValueChange={(selectionValue) => { setFilterCustomer(selectionValue); setFilterProduct('') }}
                  placeholder="All Customers"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Customer"
                  freeText>
              <option value="">All Customers</option>
              {savedCustomerOptions.map((name) => <option key={name} value={name} />)}
            </SelectionField>

          </div>
          <div data-field-size="wide" className="space-y-1.5">
            <label htmlFor="saved-product-search" className="text-xs font-medium text-muted-foreground">
              Product
            </label>
            <SelectionField id="saved-product-search"
                  value={filterProduct}
                  onValueChange={(selectionValue) => setFilterProduct(selectionValue)}
                  placeholder="All Products"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Product"
                  freeText>
              <option value="">All Products</option>
              {savedProductOptions.map(([id, name]) => <option key={id} value={name} />)}
            </SelectionField>

          </div>

        </div>

        <Table summary={summaryForLevel(filteredBudgets.length, 'salespeople', filteredBudgets.map((row) => normalizeText(row.kam ?? '')))} id={moduleName.toLowerCase() + '-saved-records'}
          summaryEnd={<span className="inline-flex flex-wrap items-baseline justify-end gap-3" aria-busy={loadingSavedRecords}><span>Grand Total</span><strong className="font-semibold tabular-nums text-foreground">{savedRecordsComplete || loadingSavedRecords ? formatNumber(filteredBudgets.reduce((sum, item) => sum + (Number(item.volume) || 0), 0)) : '—'}</strong></span>}
          className="min-w-[760px] table-fixed text-xs wrap-anywhere md:min-w-0"
          containerProps={{ className: "max-h-[min(32rem,65vh)] w-full overflow-auto", tabIndex: 0, role: "region", "aria-label": savedTitle + ' table', 'aria-busy': initializing || loadingSavedRecords }}
        >
            <colgroup>
              {canShowActions && <col data-action-column={savedActionColumn} />}
              <col />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b bg-muted/40">
                {canShowActions && (
                  <th data-action-column={savedActionColumn} className="px-2 py-3 text-center font-medium">
                    Action
                  </th>
                )}

                <th className="px-3 py-3 text-left font-medium">
                  <div className="flex items-center gap-1.5"><HeaderExpandCollapseButton expanded={allSavedGroupsExpanded} onClick={toggleAllSavedGroups} loading={initializing || loading || loadingSavedRecords} empty={savedKamKeys.length === 0} aria-controls={moduleName.toLowerCase() + '-saved-records'} /><span>{metricLabel} Structure</span></div>
                </th>

                <th className="px-3 py-3 text-left font-medium">
                  Region
                </th>

                <th className="px-3 py-3 text-left font-medium">
                  Subregion
                </th>

                <th className="px-3 py-3 text-right font-medium">
                  {volumeLabel}
                </th>
              </tr>
            </thead>

            <tbody>
              {initializing || (loadingSavedRecords && groupedBudgets.length === 0) ? (
                <TableLoadingRow columns={canShowActions ? 5 : 4} label={label + ' records'} />
              ) : groupedBudgets.length === 0 ? (
                <tr>
                  <td
                    colSpan={canShowActions ? 5 : 4}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {isActual ? 'No actual sales match the current filters.' : 'No budgets match the current filters.'}
                  </td>
                </tr>
              ) : (
                groupedBudgets.map((kamGroup) => {
                  const kamExpanded = autoExpandSavedSearch || expandedBudgetKams.has(kamGroup.key)
                  const kamItems = kamGroup.customers.flatMap((customer) => customer.items)
                  const kamBudget = kamItems.reduce((total, item) => total + (Number(item.volume) || 0), 0)
                  const kamAreas = Array.from(new Set(kamItems.map((item) =>
                    subregions.find((subregion) => subregion.id === item.subregion_id && subregion.region_id === item.region_id)?.name || '—'
                  )))

                  return (
                    <Fragment key={kamGroup.key}>
                      <tr className="border-b bg-muted/60">
                        {canShowActions && <td data-action-column={savedActionColumn} className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                          {authorization.can(moduleName, 'edit') && <TableActionButton action="edit" compact type="button" title={'Edit salesman ' + label + ' records'} disabled={loading || loadingSavedRecords} onClick={() => setEditingSavedSalesman({ name: kamGroup.kam, originalName: kamGroup.kam, items: kamItems })} />}
                          {authorization.can(moduleName, 'delete') && <TableActionButton action="delete" compact data-action-tone="danger" type="button" title={'Delete salesman ' + label + ' records'} disabled={loading || loadingSavedRecords} onClick={() => handleDeleteMany(kamItems, kamGroup.kam)} />}
                          </div>
                        </td>}
                        <td className="px-3 py-3">
                          <button type="button" aria-expanded={kamExpanded} onClick={() => toggleBudgetKam(kamGroup.key)} className="flex w-full min-w-0 flex-nowrap items-center gap-2 text-left">
                            {kamExpanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="min-w-0 truncate font-semibold" title={'Salesman: ' + kamGroup.kam}>Salesman: {kamGroup.kam}</span>
                              {savedSalesmanNames !== null && !savedSalesmanNames.has(normalizeText(kamGroup.kam)) && <span className="basis-full"><StatusBadge status="Unmatched salesman" compact /></span>}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-xs font-normal text-muted-foreground">({kamItems.length} records)</span>
                          </button>
                        </td>
                        <td className="px-3 py-3">{Array.from(new Set(kamItems.map((item) => getRegionName(item.region_id)))).join(', ')}</td>
                        <td className="px-3 py-3"><span className="block truncate" title={kamAreas.join(', ') || '—'}>{kamAreas.join(', ') || '—'}</span></td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums">{formatNumber(kamBudget)}</td>
                      </tr>

                      {kamExpanded && kamGroup.customers.map((customerGroup) => {
                        const customerBudget = customerGroup.items.reduce((total, item) => total + (Number(item.volume) || 0), 0)
                        const customerExpanded = autoExpandSavedSearch || expandedBudgetCustomers.has(customerGroup.key)
                        return (
                          <Fragment key={customerGroup.key}>
                            <tr className="border-b bg-muted/30">
                              {canShowActions && (
                                <td data-action-column={savedActionColumn} className="px-2 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {authorization.can(moduleName, 'edit') && <TableActionButton action="edit" compact type="button" onClick={() => editSavedCustomer(customerGroup.customer, customerGroup.items)} disabled={loading || loadingSavedRecords} title={'Edit customer ' + label + ' records'} className="inline-flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40" />}
                                    {authorization.can(moduleName, 'delete') && (
                                      <TableActionButton action="delete" compact data-action-tone="danger" type="button" onClick={() => handleDeleteMany(customerGroup.items)} disabled={loading || loadingSavedRecords} className="inline-flex size-8 items-center justify-center rounded-md border transition hover:bg-muted disabled:opacity-40" title={'Delete customer ' + label + ' records'} />
                                    )}
                                  </div>
                                </td>
                              )}
                              <td colSpan={4} className="px-3 py-2">
                                <button
                                    type="button"
                                    aria-expanded={customerExpanded}
                                    onClick={() => toggleBudgetCustomer(customerGroup.key)}
                                    className="flex w-full items-center gap-2 pl-4 text-left"
                                  >
                                    {customerExpanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                                  <span className="inline-block max-w-40 align-top font-semibold wrap-anywhere">Customer: {customerGroup.customer}</span>
                                  <span className="ml-auto text-xs font-semibold text-muted-foreground">{formatNumber(customerBudget)}</span>
                                </button>
                              </td>
                            </tr>

                            {customerExpanded && customerGroup.items.map((item) => (
                              <tr key={item.id} className="border-b bg-muted/20 last:border-0 hover:bg-muted/40">
                                {canShowActions && <td data-action-column={savedActionColumn} />}
                                <td className="px-3 py-2" title={getProductName(item.product_id)}>
                                  <div className="flex min-w-0 items-center gap-2 pl-2 lg:pl-8">
                                    <span className="text-muted-foreground">↳</span>
                                    <div className="min-w-0">
                                      <div className="min-w-0 text-xs">{getProductName(item.product_id)}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {isActual ? item.actual_date : item.month === null ? item.year : getMonthName(item.month, item.year) + ' ' + item.year}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td />
                                <td />
                                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(item.volume)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  )
                })
              )}
            </tbody>
        </Table>


      </div>
    </div>
  )
}
