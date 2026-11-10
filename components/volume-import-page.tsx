
'use client'

import { summaryForLevel } from '@/lib/table-summary-level'

import { usePopupError } from '@/components/action-dialogs'

import { sortRegions } from '@/lib/region-order'

import { StatusBadge } from '@/components/ui/status-badge'

import { Pencil as HeadingPencil, Database as HeadingDatabase } from 'lucide-react'

import { useStatusNotification } from '@/components/action-dialogs'

import { ImportProductDialog } from '@/components/import-product-dialog'

import { ExpandCollapseIcon } from '@/components/ui/expand-collapse-icon'
import { UserPlus as ActionUserPlusIcon, Save as ActionSaveIcon, X as ActionXIcon } from 'lucide-react'
import { useActionDialogs } from '@/components/action-dialogs'
import { confirmationRecordDetails } from '@/lib/action-confirmation'
import { SelectionField } from '@/components/ui/selection-field'
import { TableActionButton } from '@/components/ui/table-action-button'
import { Table } from '@/components/ui/table'
import { LoadingSpinner, TableLoadingRow } from '@/components/ui/loading-spinner'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { RecordDialog } from '@/components/ui/record-dialog'
import { SalespersonInput } from '@/components/ui/salesperson-input'

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
  asm: string | null
  rsm: string | null
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
  asm: string | null
  rsm: string | null
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
  actualDate: string | null
  source: BudgetImportRecord
  year: number | null
  month: number | null
  region: Region | null
  customer: Customer | null
  product: Product | null
  volume: number | null
  status: 'Ready' | 'Already imported' | 'Invalid' | 'Duplicate in staging'
  issues: string[]
}

type ImportGroup = {
  label: string
  count: number
  groups: Map<string, ImportGroup>
  rows: ImportPreview[]
}

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
    case 'Duplicate in staging':
      return 'Duplicate'
  }
}

export function VolumeImportPage({ moduleName }: { moduleName: 'Budget' | 'Actual' }) {
  const { confirmAction } = useActionDialogs()

  const isActual = moduleName === 'Actual'
  const label = moduleName.toLowerCase()
  const savedTitle = isActual ? 'Saved Actuals' : 'Saved Budgets'
  const volumeLabel = moduleName + ' (Vol.)'
  const savedTable = isActual ? 'actuals' : 'budgets'
  const stagingTable = isActual ? 'actual_import_staging' : 'budget_import_staging'

  const supabase = createClient()
  const authorization = useAuthorization()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const savedRecordsRequestRef = useRef<AbortController | null>(null)
  const stagingRequestRef = useRef<AbortController | null>(null)

  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()

  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<{ id: number; name: string; region_id: number }[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [stagingRecords, setStagingRecords] = useState<BudgetImportRecord[]>([])

  const [role, setRole] = useState('')
  const [position, setPosition] = useState('')
  const isSupervisor = role === 'Superuser' && position === 'Supervisor'
  const canReadAllRegions = role === 'Admin' || (role === 'Superuser' && !isSupervisor) ||
    (role === 'Manager' && position === 'ASM')
  const canWriteAllRegions = role === 'Admin' || (role === 'Superuser' && !isSupervisor)
  const [assignedRegionId, setAssignedRegionId] = useState<number | null>(null)
  const [assignedSubregionId, setAssignedSubregionId] = useState<number | null>(
    null
  )

  const [filterYear, setFilterYear] = useState(String(currentYear))
  const [filterMonth, setFilterMonth] = useState('')
  const [filterRegionId, setFilterRegionId] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const searchingSavedRecords = filterCustomer.trim() !== '' || filterProduct.trim() !== ''
  const [manualSavedSearchQuery, setManualSavedSearchQuery] = useState<string | null>(null)
  const savedSearchQuery = JSON.stringify([filterCustomer, filterProduct, filterYear, filterMonth, filterRegionId])
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
  const [editingSavedCustomer, setEditingSavedCustomer] = useState<{ customer: string; customerId: string; kam: string; year: string; rows: SavedRecordDraft[] } | null>(null)
  const [, setSavedEditError] = usePopupError()
  const stagingEditorRef = useRef<HTMLInputElement>(null)
  const [savingImport, setSavingImport] = useState(false)
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [addingProduct, setAddingProduct] = useState<{ code: string; name: string } | null>(null)
  const importBusy = initializing || savingImport || addingCustomer || uploadingExcel || importing || loadingStaging
  const [showImportPreview, setShowImportPreview] = useState(false)

  const [, setError] = usePopupError()
  const setMessage = useStatusNotification()

  useEffect(() => {
    if (editingImport?.id !== undefined) stagingEditorRef.current?.focus()
  }, [editingImport?.id])

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
    const profileSubregionId =
      profile.subregion_id == null ? null : Number(profile.subregion_id)

    setRole(profileRole)
    setPosition(profile.position ?? '')
    setAssignedRegionId(profileRegionId)
    setAssignedSubregionId(profileSubregionId)

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
    setError('')
    try {
      const allRecords: BudgetRecord[] = []
      let lastRecord: BudgetRecord | null = null

      while (true) {
        const query = supabase
          .from(savedTable)
          .select(`
            id,
            ${isActual ? 'actual_date' : 'year, month'},
            region_id,
            subregion_id,
            customer_id,
            category_id,
            product_id,
            asm,
            rsm,
            kam,
            volume
          ` as string)
        if (isActual) query.not('actual_date', 'is', null)

        if (lastRecord) {
          query.lt('id', lastRecord.id)
        }

        const { data, error } = await query
          .order('id', { ascending: false })
          .limit(SAVED_RECORDS_PAGE_SIZE)
          .abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(SAVED_RECORDS_TIMEOUT_MS)]))

        if (request.signal.aborted) return

        if (error) {
          setError('Unable to load all saved ' + label + ' records. Please refresh to retry. ' + error.message)
          return
        }

        const page = (data ?? []) as unknown as BudgetRecord[]
        allRecords.push(...page.map((item) => item.actual_date ? { ...item, ...getActualPeriod(item.actual_date) } : item))

        setBudgets([...allRecords].sort(compareSavedRecords))

        if (page.length < SAVED_RECORDS_PAGE_SIZE) break

        lastRecord = page[page.length - 1]
      }

      setBudgets(allRecords.sort(compareSavedRecords))
      setSavedRecordsComplete(true)
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
    setStagingError('')
    try {
    const allRecords: BudgetImportRecord[] = []
    let lastId: number | null = null

    while (true) {
      const query = supabase
        .from(stagingTable)
        .select(`
          id,
          ${isActual ? 'actual_date' : 'year, month'},
          region,
          asm,
          rsm,
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

    if (!authorization.can(moduleName, 'add')) {
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

      const excelRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        {
          defval: '',
          raw: false,
          dateNF: 'yyyy-mm-dd',
          blankrows: false,
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
        actual_date: findHeader(['date', 'actual date', 'sales date', 'transaction date']),
        kam: findHeader([
          'kam',
          'kam / salesman',
          'salesman',
          'sales person',
          'salesperson',
          'key account manager',
        ]),
        customer: findHeader([
          'customer',
          'customer name',
        ]),
        product_code: findHeader([
          'product code',
          'product_code',
          'code',
          'sku',
        ]),
        product_name: findHeader([
          'product name',
          'product_name',
          'product description',
        ]),
        volume: findHeader([
          'volume',
          label,
          label + ' (vol.)',
          label + ' volume',
          label + ' vol',
          'volume ' + label,
        ]),
      }

      const requiredColumns: Array<keyof typeof columnMap> = [
        ...(!isActual || !columnMap.actual_date ? ['year', 'month'] as const : []),
        'region',
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
        ? new Map(XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { raw: true })
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

      const records = excelRows
        .filter((row) =>
          Object.values(row).some(
            (value) => String(value ?? '').trim() !== ''
          )
        )
        .map((row) => ({
          ...(isActual
            ? {
                actual_date: getActualDate(row),
              }
            : { year: getCellValue(row, columnMap.year) || null, month: getCellValue(row, columnMap.month) || null }),
          region: getCellValue(row, columnMap.region) || null,
          asm: null,
          rsm: null,
          kam: getCellValue(row, columnMap.kam) || null,
          customer: getCellValue(row, columnMap.customer) || null,
          product_code:
            getCellValue(row, columnMap.product_code) || null,
          product_name:
            getCellValue(row, columnMap.product_name) || null,
          volume: getCellValue(row, columnMap.volume) || null,
        }))

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

  const savedCustomerOptions = useMemo(() => {
    const regionId = filterRegionId
      ? Number(filterRegionId)
      : canReadAllRegions ? null : assignedRegionId

    return Array.from(new Set(customers
      .filter((customer) => regionId === null || customer.region_id === regionId)
      .map((customer) => customer.customer)))
      .sort((a, b) => a.localeCompare(b))
  }, [customers, filterRegionId, canReadAllRegions, assignedRegionId])

  const productLabels = useMemo(() => new Map(
    products.map((product) => [product.id, product.code + ' - ' + product.name])
  ), [products])

  const filteredBudgets = useMemo(() => {
    const search = filterCustomer.trim().toLowerCase()
    const productSearch = filterProduct.trim().toLowerCase()

    return budgets.filter((item) => {
      if (filterYear && item.year !== Number(filterYear)) return false
      if (filterMonth && item.month !== Number(filterMonth)) return false
      if (productSearch && (item.product_id === null || !productLabels.get(item.product_id)?.toLowerCase().includes(productSearch))) return false

      if (
        filterRegionId &&
        item.region_id !== Number(filterRegionId)
      ) {
        return false
      }

      if (search) {
        const customerName =
          customers
            .find((customer) => customer.id === item.customer_id)
            ?.customer.toLowerCase() ?? ''

        if (!customerName.includes(search)) return false
      }

      if (
        !canReadAllRegions &&
        item.region_id !== assignedRegionId
      ) {
        return false
      }

      if (
        isSupervisor &&
        (assignedSubregionId === null || item.subregion_id !== assignedSubregionId)
      ) {
        return false
      }

      return true
    })
  }, [
    budgets,
    filterYear,
    filterMonth,
    filterRegionId,
    filterCustomer,
    filterProduct,
    productLabels,
    customers,
    isActual,
    canReadAllRegions,
    isSupervisor,
    assignedRegionId,
    assignedSubregionId,
  ])

  const previewRecords = stagingRecords

  const importPreview = useMemo<ImportPreview[]>(() => {
    const existingKeys = new Set(
      budgets.map((item) =>
        isActual
          ? [item.actual_date, item.region_id, item.customer_id, item.product_id].join('|')
          : getBudgetImportKey(
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

      const matchingRegions = regions.filter(
        (item) =>
          normalizeText(item.name) === normalizeText(source.region) ||
          (Boolean(item.code?.trim()) && normalizeText(item.code) === normalizeText(source.region))
      )

      const matchedRegion =
        matchingRegions.length === 1 ? matchingRegions[0] : null

      if (!source.region?.trim()) {
        issues.push('Missing region')
      } else if (matchingRegions.length === 0) {
        issues.push(`Region not found: ${source.region}`)
      } else if (matchingRegions.length > 1) {
        issues.push(`Multiple regions found: ${source.region}`)
      }

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
        issues.push('Invalid or missing volume')
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
        const key = isActual
          ? [actualDate, matchedRegion.id, matchedCustomer.id, matchedProduct.id].join('|')
          : getBudgetImportKey(
              validYear,
              parsedMonth,
              matchedRegion.id,
              matchedCustomer.id,
              matchedProduct.id,
              source.kam
            )

        if (existingKeys.has(key)) {
          status = 'Already imported'
        } else if (seenStagingKeys.has(key)) {
          status = 'Duplicate in staging'
        } else {
          seenStagingKeys.add(key)
        }
      }

      return {
        source,
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
  }, [previewRecords, budgets, regions, customers, products, isActual])

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

  const duplicateImportCount = visibleImportPreview.filter(
    (item) => item.status === 'Duplicate in staging'
  ).length

  const importGroups = useMemo(() => {
    const groups = new Map<string, ImportGroup>()
    for (const label of ['Invalid', 'Valid']) {
      groups.set(normalizeText(label), { label, count: 0, groups: new Map(), rows: [] })
    }

    for (const item of visibleImportPreview) {
      const valid = item.issues.length === 0
      const labels = [valid ? 'Valid' : 'Invalid']
      if (valid) {
        labels.push(
          'KAM: ' + (item.source.kam?.trim() || 'Unassigned KAM'),
          'Customer: ' + (item.customer?.customer ?? (item.source.customer?.trim() || 'Missing customer'))
        )
      } else {
        const validation = item.issues.length ? item.issues.join('; ') : item.status
        labels.push('Validation: ' + validation)
      }

      let children = groups
      let group: ImportGroup | undefined
      for (const label of labels) {
        const key = normalizeText(label)
        group = children.get(key)
        if (!group) {
          group = { label, count: 0, groups: new Map(), rows: [] }
          children.set(key, group)
        }
        group.count++
        children = group.groups
      }
      group?.rows.push(item)
    }

    return groups
  }, [visibleImportPreview])

  const importGroupKeys = useMemo(() => groupedTableKeys(importGroups), [importGroups])
  const allImportGroupsExpanded = importGroupKeys.length > 0 && importGroupKeys.every((key) => expandedImportGroups.has(key))

  const groupedBudgets = useMemo<SavedKamGroup[]>(() => {
    const kams = new Map<string, { kam: string; customers: Map<string, SavedCustomerGroup> }>()

    for (const item of filteredBudgets) {
      const kam = item.kam?.trim() || 'Unassigned KAM'
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

    return (
      <Fragment key={key}>
        <tr className={path.length === 1 && group.label === 'Invalid' ? 'border-b bg-destructive/10' : 'border-b bg-muted/30'}>
          <td colSpan={isActual ? 9 : 10}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => toggleSet(setExpandedImportGroups, key)}
              disabled={group.count === 0}
              className="flex w-full items-center gap-2 py-2 pr-3 text-left font-medium"
              style={{ paddingLeft: path.length * 12 }}
            >
              <Chevron className="size-4 shrink-0" aria-hidden="true" />
              {group.label}
              {!group.label.startsWith('Customer: ') && (
                <span className="text-xs font-normal text-muted-foreground">({group.count})</span>
              )}
            </button>
          </td>
        </tr>
        {expanded && Array.from(group.groups, ([childKey, child]) =>
          renderImportGroup(child, [...path, childKey])
        )}
        {expanded && group.rows.map(renderImportRow)}
      </Fragment>
    )
  }

  async function addMissingCustomer(item: ImportPreview) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    const name = item.source.customer?.trim()
    if (importBusy || !authorization.can('Customers', 'add') || !name || !item.region) return
    if (!canWriteAllRegions && item.region.id !== assignedRegionId) return
    if (!(actionConfirmation = await confirmAction({ message: `Add "${name}" to Customers in ${item.region.name}?` }))) return

    setAddingCustomer(true)
    setError('')
    setMessage('')
    try {
      // Refresh first so another row or a recent customer addition is reused.
      const result = await loadCustomers()
      if (result.error) throw result.error
      const currentCustomers = result.data ?? []
      const exists = currentCustomers.some((customer) =>
        normalizeText(customer.customer) === normalizeText(name) && customer.region_id === item.region!.id
      )
      if (exists) {
        setCustomers(currentCustomers)
        setMessage('Customer already exists. Import preview updated.')
        return
      }
      const { data, error } = await supabase.from('customers').insert({
        customer: name,
        region_id: item.region.id,
        salesman: item.source.kam?.trim() || null,
        is_active: true,
      }).select('id, customer, region_id').single()
      if (error) throw error
      setCustomers([...currentCustomers, data as Customer])
      setMessage(`Customer "${name}" added. Import preview updated.`)
    } catch (error) {
      setError(error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'Unable to add customer.')
    } finally {
      setAddingCustomer(false)
    }

    } finally { actionConfirmation?.finish() }
  }

  function renderImportRow(item: ImportPreview) {
    return (
      <tr key={item.source.id} className="border-b last:border-0 hover:bg-muted/20">
        <td data-action-column="standard" className="whitespace-nowrap px-3 py-3">
          {!item.source.savedActual && authorization.can(moduleName, 'edit') && (
            <TableActionButton action="edit" data-action-tone="caution" type="button" className="mr-2 rounded-md border px-2 py-1" disabled={importBusy} onClick={() => setEditingImport(item.source)} />
          )}
          {!item.source.savedActual && authorization.can(moduleName, 'delete') && (
            <TableActionButton action="discard" data-action-tone="danger" type="button" className="rounded-md border px-2 py-1" disabled={importBusy} onClick={() => saveStagingRecord(item.source, 'delete')} />
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          <StatusBadge status={getImportStatusLabel(item.status)} />
        </td>
        {!isActual && <td className="px-3 py-3">{item.year ?? (item.source.year || '-')}</td>}
        <td className="px-3 py-3">{isActual ? item.actualDate ?? (item.source.actual_date || '-') : item.source.month || '-'}</td>
        <td className="px-3 py-3">{item.source.region || '-'}</td>
        <td className="px-3 py-3">{item.source.kam || '-'}</td>
        <td className="max-w-40 px-3 py-3 wrap-anywhere" title={item.source.customer ?? ''}>
          {item.source.customer || '-'}
          {item.region && item.issues.some((issue) => issue.startsWith('Customer not found:')) && authorization.can('Customers', 'add') && (
            <button data-action-tone="primary" type="button" className="mt-1 block rounded-md border px-2 py-1 text-xs" disabled={importBusy} onClick={() => addMissingCustomer(item)}><ActionUserPlusIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
              Add to Customers
            </button>
          )}
        </td>
        <td className="px-3 py-3 wrap-anywhere">
          {item.source.product_code || '-'}
          {item.issues.some((issue) => issue.startsWith('Product code not found:')) && authorization.can('Products', 'add') && (
            <button data-action-tone="primary" type="button" className="mt-1 block rounded-md border px-2 py-1 text-xs" disabled={importBusy} onClick={() => setAddingProduct({ code: item.source.product_code?.trim() ?? '', name: item.source.product_name?.trim() ?? '' })}>
              <ActionUserPlusIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Add to Products
            </button>
          )}
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
    if (!authorization.can(moduleName, 'add')) return
    if (isSupervisor && assignedSubregionId === null) {
      setError('Your account needs an assigned subregion to import records.')
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
      subregion_id: isSupervisor ? assignedSubregionId : null,
      customer_id: item.customer!.id,
      category_id: item.product!.category_id,
      product_id: item.product!.id,
      kam: item.source.kam?.trim() || null,
      volume: item.volume!,
    }))

    try {
      let importedCount = 0
      try {
        for (let start = 0; start < payload.length; start += 100) {
          const batch = payload.slice(start, start + 100)
          const { error: importError } = await supabase.from(savedTable).insert(batch)
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

  async function handleDeleteMany(items: BudgetRecord[]) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (loadingSavedRecords || !authorization.can(moduleName, 'delete') || items.length === 0) return

    if (
      !canWriteAllRegions &&
      items.some((item) => item.region_id !== assignedRegionId)
    ) {
      setError('You can only delete records from your assigned region.')
      return
    }

    const confirmed = (actionConfirmation = await confirmAction({ message: `Delete ${items.length} ${label} record(s)? This action cannot be undone.`, details: confirmationRecordDetails(items) }))

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
  const canManageImport = authorization.can(moduleName, 'add') || canShowActions
  const savedActionColumn = authorization.can(moduleName, 'edit') && authorization.can(moduleName, 'delete') ? 'standard' : 'single'

  return (
    <div className="space-y-4">
      {addingProduct && <ImportProductDialog code={addingProduct.code} name={addingProduct.name} onClose={() => setAddingProduct(null)} onAdded={(product) => {
        setProducts((current) => [...current.filter((item) => item.id !== product.id), product])
        setAddingProduct(null)
        setMessage(`Product "${product.code}" added. Import validation updated.`)
      }} />}


      {/* BUDGET EXCEL IMPORT */}

      {canManageImport && <div className="rounded-xl border bg-card shadow-sm">
        <div data-section-header="" className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-muted-foreground" />
              <h2 data-section-title="" className="text-base font-semibold">
                {moduleName} Excel Import
              </h2>
            </div>


          </div>

          <div data-action-toolbar="" className="flex max-w-full shrink-0 flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap [&>button]:shrink-0">
            <button data-action-tone="neutral"
              type="button"
              onClick={() => downloadImportTemplate(moduleName)}
              disabled={importBusy}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            >
              <Download className="size-4" />
              Download Template
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload}
              className="hidden"
            />

            <button data-action-tone="transfer" data-action-fill=""
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                importBusy ||
                !authorization.can(moduleName, 'add')
              }
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingExcel ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploadingExcel ? 'Uploading...' : 'Upload File'}
            </button>

            <button data-action-tone="neutral"
              type="button"
              onClick={loadStagingRecords}
              disabled={importBusy}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${loadingStaging ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>

            <button data-slot="show-hide-button" data-action-tone="neutral"
              type="button"
              onClick={() => {
                setShowImportPreview(!showImportPreview)
                if (!showImportPreview && !importBusy) void loadStagingRecords()
              }}
              aria-expanded={showImportPreview}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted"
            >
              {showImportPreview ? (
                <>
                  <ChevronDown className="size-4" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronRight className="size-4" />
                  Show
                </>
              )}
            </button>
          </div>
        </div>

        {showImportPreview && (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Total Records
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {(initializing || loadingSavedRecords || loadingStaging) && visibleImportPreview.length === 0 ? <LoadingSpinner label="total records" /> : (!stagingLoaded && !loadingStaging) || stagingError ? '—' : visibleImportPreview.length}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Ready to Import
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {(initializing || loadingSavedRecords || loadingStaging) && visibleImportPreview.length === 0 ? <LoadingSpinner label="ready to import" /> : (!stagingLoaded && !loadingStaging) || stagingError ? '—' : readyImportCount}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Invalid
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {(initializing || loadingSavedRecords || loadingStaging) && visibleImportPreview.length === 0 ? <LoadingSpinner label="invalid records" /> : (!stagingLoaded && !loadingStaging) || stagingError ? '—' : invalidImportCount}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Already Imported / Duplicate
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {(initializing || loadingSavedRecords || loadingStaging) && visibleImportPreview.length === 0 ? <LoadingSpinner label="already imported or duplicate records" /> : (!stagingLoaded && !loadingStaging) || stagingError ? '—' : alreadyImportedCount + duplicateImportCount}
                </p>
              </div>
            </div>


            <div className="flex justify-end">

              <div data-action-toolbar="" className="flex shrink-0 flex-wrap items-center gap-2">
                <button data-action-tone="transfer" data-action-fill=""
                  type="button"
                  onClick={handleImport}
                  disabled={
                    importBusy ||
                    loadingSavedRecords ||
                    !savedRecordsComplete ||
                    Boolean(stagingError) ||
                    !stagingLoaded ||
                    readyImportCount === 0 ||
                    !authorization.can(moduleName, 'add')
                  }
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {importing
                    ? 'Importing...'
                    : `Import ${readyImportCount} Record(s)`}
                </button>
                {authorization.can(moduleName, 'delete') && (
                  <button data-action-tone="danger"
                    type="button"
                    onClick={deleteAllStagingRecords}
                    disabled={importBusy || stagingRecords.length === 0}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Discard {visibleImportPreview.filter((item) => !item.source.savedActual).length} Record(s)
                  </button>
                )}
              <button data-slot="expand-collapse-button" type="button" data-action-tone="neutral" disabled={importBusy || importGroupKeys.length === 0}
                aria-expanded={allImportGroupsExpanded} aria-controls={moduleName.toLowerCase() + '-import-records'}
                onClick={() => setExpandedImportGroups(new Set(allImportGroupsExpanded ? [] : importGroupKeys))}
                className="rounded-md border px-3 py-2 text-sm"><ExpandCollapseIcon expanded={allImportGroupsExpanded} />
                {allImportGroupsExpanded ? 'Collapse All' : 'Expand All'}
              </button>
</div>
            </div>

            {editingImport && (
              <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
                event.preventDefault()
                void saveStagingRecord(editingImport, 'edit')
              }}>
                <h3 data-section-title="" className="text-sm font-medium"><HeadingPencil className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Edit uploaded record #{editingImport.id}</h3>
                <div className="app-field-row">
                  {([
                    ...(isActual ? [['actual_date', 'Date']] as const : [['year', 'Year'], ['month', 'Month']] as const),
                    ['region', 'Region'],
                    ['kam', 'KAM / Salesman'],
                    ['customer', 'Customer'], ['product_code', 'Product Code'],
                    ['product_name', 'Product Name'], ['volume', volumeLabel],
                  ] as const).map(([field, label]) => (
                    <label key={field} className="space-y-1 text-sm">
                      <span>{label}</span>
                      {field === 'kam' ? <SalespersonInput
                        value={editingImport.kam ?? ''} disabled={importBusy}
                        onValueChange={(kam) => setEditingImport({ ...editingImport, kam: kam || null })}
                      /> : <input
                        className="w-full rounded-md border bg-background px-3 py-2"
                        ref={field === 'year' ? stagingEditorRef : undefined}
                        value={editingImport[field] ?? ''}
                        disabled={importBusy}
                        onChange={(event) => setEditingImport({
                          ...editingImport,
                          [field]: event.target.value || null,
                        })}
                      />}
                    </label>
                  ))}
                </div>
                <div data-action-toolbar="" className="flex gap-2">
                  <button data-action-tone="primary" data-action-fill="" type="submit" disabled={importBusy} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-40"><ActionSaveIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
                    Save Changes
                  </button>
                  <button data-action-tone="neutral" type="button" disabled={savingImport} onClick={() => setEditingImport(null)} className="rounded-md border px-3 py-2 text-sm"><ActionXIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              </form>
            )}


            <Table summary={{ records: visibleImportPreview.length }} data-volume-layout="import" id={moduleName.toLowerCase() + '-import-records'}
              className="min-w-[1600px]"
              containerProps={{ className: "max-h-[min(22rem,50vh)] w-full overflow-auto rounded-lg border", tabIndex: 0, role: "region", "aria-label": moduleName + ' upload preview', 'aria-busy': loadingStaging }}
            >
                <colgroup>
                  <col data-action-column="standard" />
                  <col style={{ width: 120 }} />
                  {!isActual && <col style={{ width: 72 }} />}
                  {[112, 112, 160, 200, 176, 200, 112].map((width, index) => <col key={index} style={{ width }} />)}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b bg-muted/40">
                    <th data-action-column="standard" className="px-3 py-3 text-left font-medium">Action</th>
                    <th className="px-3 py-3 text-left font-medium">Status / Group</th>
                    {!isActual && <th className="px-3 py-3 text-left font-medium">Year</th>}
                    <th className="px-3 py-3 text-left font-medium">{isActual ? 'Date' : 'Month'}</th>
                    <th className="px-3 py-3 text-left font-medium">Region</th>
                    <th className="px-3 py-3 text-left font-medium">KAM / Salesman</th>
                    <th className="px-3 py-3 text-left font-medium">Customer</th>
                    <th className="px-3 py-3 text-left font-medium">Product Code</th>
                    <th className="w-44 px-3 py-3 text-left font-medium">Product Name</th>
                    <th className="px-3 py-3 text-right font-medium">{volumeLabel}</th>
                  </tr>
                </thead>

                <tbody>
                  {loadingStaging && visibleImportPreview.length === 0 ? (
                    <TableLoadingRow columns={isActual ? 9 : 10} label="uploaded records" />
                  ) : visibleImportPreview.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isActual ? 9 : 10}
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
            </Table>


          </div>
        )}
      </div>}

      {/* SAVED BUDGETS */}

      <div className="rounded-xl border bg-card shadow-sm">
        <div data-section-header="" className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <div>
            <h2 data-section-title="" className="text-base font-semibold"><HeadingDatabase className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
              {savedTitle}
            </h2>

          </div>
          <div data-action-toolbar="" className="flex flex-wrap items-center gap-2">
            <button data-slot="expand-collapse-button" type="button" data-action-tone="neutral" onClick={toggleAllSavedGroups}
              disabled={initializing || loadingSavedRecords || savedKamKeys.length === 0}
              aria-expanded={allSavedGroupsExpanded} aria-controls={moduleName.toLowerCase() + '-saved-records'}
              className="rounded-md border px-3 py-2 text-sm"><ExpandCollapseIcon expanded={allSavedGroupsExpanded} />
              {allSavedGroupsExpanded ? 'Collapse All' : 'Expand All'}
            </button>
            <button data-action-tone="neutral"
              type="button"
              onClick={loadBudgets}
              disabled={initializing || loading || loadingSavedRecords}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="size-4" />
              Refresh
            </button>
          </div>
        </div>

        {editingSavedCustomer && <RecordDialog open onClose={() => setEditingSavedCustomer(null)} title={`Edit Customer ${moduleName}`} busy={loading} wide contained>
          <form onSubmit={saveSavedCustomer} className="app-tables flex min-h-0 flex-1 flex-col gap-4 text-sm">
            <h2 data-section-title="" className="shrink-0 font-semibold"><HeadingPencil className="size-5" aria-hidden="true" />Edit Customer {moduleName}</h2>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto sm:overflow-hidden">
              <fieldset disabled={loading} className="grid min-w-0 shrink-0 grid-cols-1 gap-4 border-0 p-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_6rem]">
                <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">KAM
                  <SalespersonInput value={editingSavedCustomer.kam} disabled={loading} onValueChange={(kam) => setEditingSavedCustomer((current) => current && ({ ...current, kam }))} />
                </label>
                <label className="min-w-0 text-sm font-medium">Customer Name
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
              <Table className="min-w-[680px] table-fixed" containerProps={{ className: 'min-h-0 shrink-0 rounded-lg border sm:flex-1', style: { maxHeight: 'none' }, 'aria-label': 'Customer record editor', tabIndex: 0, role: 'region' }}>
                <colgroup><col className="w-12" /><col className="w-[168px]" /><col /><col className="w-[144px]" /></colgroup>
                <thead className="sticky top-0 z-10 border-b bg-muted text-sm"><tr><th className="px-3 py-2 text-left font-medium">#</th><th className="px-3 py-2 text-left font-medium">{isActual ? 'Date' : 'Month'}</th><th className="px-3 py-2 text-left font-medium">Product</th><th className="px-3 py-2 text-right font-medium whitespace-nowrap">Volume (50kg)</th></tr></thead>
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
                    <td className="px-3 py-2 text-left"><input aria-label={`Volume for row ${index+1}`} disabled={loading} type="number" min={0} step="any" required value={draft.volume} onChange={(event)=>update({volume:event.target.value})} className="h-10 w-full rounded-md border bg-background px-3 text-right text-sm" /></td>
                  </tr>
                })}</tbody>
              </Table>
            </div>
            <div data-action-toolbar="" className="relative z-20 flex shrink-0 flex-wrap justify-end gap-2 border-t bg-card pt-4">
              <button data-action-tone="neutral" type="button" disabled={loading} onClick={() => setEditingSavedCustomer(null)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50"><ActionXIcon className="size-4" aria-hidden="true" />Cancel</button>
              <button data-action-tone="primary" data-action-fill="" type="submit" disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50"><ActionSaveIcon className="size-4" aria-hidden="true" />{loading ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </RecordDialog>}

        <div className="app-field-row saved-volume-filters border-b p-6">
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
                  onValueChange={(selectionValue) => {
                setFilterRegionId(selectionValue)
                setFilterCustomer('')
              }}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Region">
              <option value="">All Regions</option>

              {availableRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </SelectionField>
          </div>

          <div data-field-size="wide" className="space-y-1.5">
            <label htmlFor="saved-budget-customer-search" className="text-xs font-medium text-muted-foreground">
              Search customer
            </label>

            <SelectionField id="saved-budget-customer-search"
                  value={filterCustomer}
                  onValueChange={(selectionValue) => setFilterCustomer(selectionValue)}
                  placeholder="Search customers…"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Search customer"
                  freeText>
              {savedCustomerOptions.map((name) => <option key={name} value={name} />)}
            </SelectionField>

          </div>
          <div data-field-size="wide" className="space-y-1.5">
            <label htmlFor="saved-product-search" className="text-xs font-medium text-muted-foreground">
              Search product
            </label>
            <SelectionField id="saved-product-search"
                  value={filterProduct}
                  onValueChange={(selectionValue) => setFilterProduct(selectionValue)}
                  placeholder="Search products…"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Search product"
                  freeText>
              {Array.from(productLabels, ([id, name]) => <option key={id} value={name} />)}
            </SelectionField>

          </div>
        </div>

        <Table summary={summaryForLevel(filteredBudgets.length, 'kams', filteredBudgets.map((row) => normalizeText(row.kam ?? '')))} id={moduleName.toLowerCase() + '-saved-records'}
          className="min-w-[760px] table-fixed text-xs wrap-anywhere md:min-w-0"
          containerProps={{ className: "max-h-[min(32rem,65vh)] w-full overflow-auto", tabIndex: 0, role: "region", "aria-label": savedTitle + ' table', 'aria-busy': initializing || loadingSavedRecords }}
        >
            <colgroup>
              {canShowActions && <col data-action-column={savedActionColumn} />}
              <col />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b bg-muted/40">
                {canShowActions && (
                  <th data-action-column={savedActionColumn} className="px-2 py-3 text-center font-medium">
                    Action
                  </th>
                )}

                <th className="px-3 py-3 text-left font-medium">
                  {moduleName} Structure
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
                        {canShowActions && <td />}
                        <td className="px-3 py-3">
                          <button type="button" aria-expanded={kamExpanded} onClick={() => toggleBudgetKam(kamGroup.key)} className="flex w-full min-w-0 flex-wrap items-center gap-2 text-left">
                            {kamExpanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                            <span className="min-w-0 font-semibold wrap-anywhere">KAM: {kamGroup.kam}</span>
                            <span className="text-xs font-normal text-muted-foreground">({kamItems.length} records)</span>
                          </button>
                        </td>
                        <td className="px-3 py-3">{Array.from(new Set(kamItems.map((item) => getRegionName(item.region_id)))).join(', ')}</td>
                        <td className="px-3 py-3">{kamAreas.join(', ') || '—'}</td>
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
                                    {authorization.can(moduleName, 'edit') && <TableActionButton action="edit" type="button" onClick={() => editSavedCustomer(customerGroup.customer, customerGroup.items)} disabled={loading || loadingSavedRecords} title={'Edit customer ' + label + ' records'} className="rounded-md border hover:bg-muted disabled:opacity-40" />}
                                    {authorization.can(moduleName, 'delete') && (
                                      <TableActionButton action="delete" data-action-tone="danger" type="button" onClick={() => handleDeleteMany(customerGroup.items)} disabled={loading || loadingSavedRecords} className="inline-flex size-8 items-center justify-center rounded-md border transition hover:bg-muted disabled:opacity-40" title={'Delete customer ' + label + ' records'} />
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
                                <td className="px-3 py-2">{getRegionName(item.region_id)}</td>
                                <td className="px-3 py-2">{subregions.find((subregion) => subregion.id === item.subregion_id && subregion.region_id === item.region_id)?.name || '—'}</td>
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
