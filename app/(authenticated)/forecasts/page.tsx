'use client'

import { weeklyBudget } from '@/lib/weekly-budget'
import { actionGroupCount } from '@/lib/action-group-count'
import { referencePeriod } from '@/lib/reference-period'
import { readForecastWorkspace, writeForecastWorkspace } from '@/lib/forecast-workspace'
import { saveForecastDrafts } from '@/lib/save-forecast-drafts'
import { findExistingForecast } from '@/lib/forecast-duplicates'
import { savedStatusLabels, savedForecastMatchesStatus, canEditSavedForecastStatus, canDeleteSavedForecastStatus } from '@/lib/saved-forecast-status'
import { uniqueReturnNotices } from '@/lib/return-notices'

import { sortRegions } from '@/lib/region-order'

import { StatusBadge } from '@/components/ui/status-badge'

import { ClipboardPlus as HeadingClipboardPlus, Archive as HeadingArchive } from 'lucide-react'

import { useStatusNotification, usePopupError } from '@/components/action-dialogs'

import { BudgetValueIndicator } from '@/components/ui/budget-value-indicator'
import { ExpandCollapseIcon } from '@/components/ui/expand-collapse-icon'
import { useActionDialogs } from '@/components/action-dialogs'
import { confirmationRecordDetails } from '@/lib/action-confirmation'
import { customerMonthlyBudgetReference, monthlyBudgetReference } from '@/lib/monthly-budget-reference'
import { forecastSubmissionConfirmation } from '@/lib/forecast-submission-confirmation'
import { SelectionField } from '@/components/ui/selection-field'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { TableActionButton } from '@/components/ui/table-action-button'
import { Table } from '@/components/ui/table'
import { ForecastEntryTable } from '@/components/forecast-entry-table'
import { ForecastReturnNotice } from '@/components/forecast-return-notice'
import { canReviseRsmForecast, rsmRevisionPayload } from '@/lib/rsm-returned-forecasts'
import { savedCustomerGroupKey, savedKamGroupKey } from '@/lib/saved-forecast-kam-groups'
import { RecordDialog } from '@/components/ui/record-dialog'
import { useForecastAttention } from '@/lib/use-forecast-attention'
import { MonthlySalesHeaders } from '@/components/ui/monthly-sales-columns'
import { LoadingSpinner, TableLoadingRow } from '@/components/ui/loading-spinner'
import { ForecastExcelImport } from '@/components/forecast-excel-import'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Save,
  Send,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react'
import { createClient } from '@/lib/client'
import { loadActualRecords, type ActualRecord } from '@/lib/actual-records'
import { useAuthorization } from '@/lib/authorization'
import { loadForecastWeekStates } from '@/lib/forecast-week-locks'
import { currentWeekInput } from '@/lib/forecast-weeks'

type Region = {
  id: number
  name: string
  code: string | null
}

type Category = {
  id: number
  code: string | null
  name: string
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
  id: number
  year: number
  month: number | null
  region_id: number | null
  subregion_id: number | null
  customer_id: number | null
  product_id: number | null
  volume: number
}

type SalesForecast = {
  id: number
  year: number
  week: number
  region_id: number | null
  subregion_id: number | null
  customer_id: number | null
  category_id: number | null
  product_id: number | null
  forecast: number
  volume: number | null
  status: string
  user_id: string
  remarks: string | null
  returned_at: string | null
}

type SalesRow = {
  tempId: string
  id: number | null
  category_id: string
  product_id: string
  product_search: string
  forecast: string
  status: string
}

type UserAccess = {
  userId: string
  role: string
  isAdmin: boolean
  assignedRegionId: number | null
  assignedSubregionId: number | null
}

type SavedProductGroup = {
  key: string
  items: SalesForecast[]
  product_id: number | null
  category_id: number | null
  forecast: number
  volume: number
  budget: number
  actualMonthly: number
  actualPreviousMonth: number
  forecastMonthly: number
}

type SavedCustomerGroup = {
  key: string
  customer_id: number | null
  items: SalesForecast[]
  products: SavedProductGroup[]
}

type SavedWeekGroup = {
  key: string
  year: number
  week: number
  customers: SavedCustomerGroup[]
}

const PAGE_SIZE = 1000

function isEditableForecast(item: SalesForecast) {
  return canEditSavedForecastStatus(item.status)
}

export default function SalesInputPage() {
  const [forecastDialogOpen, setForecastDialogOpen] = useState(false)
  const attention = useForecastAttention()
  const { confirmAction } = useActionDialogs()

  const supabase = createClient()
  const authorization = useAuthorization()
  const currentYear = new Date().getFullYear()

  const [subregions, setSubregions] = useState<{ id: number; name: string }[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerAssignmentRestricted, setCustomerAssignmentRestricted] = useState(true)
  const [actualRecords, setActualRecords] = useState<ActualRecord[]>([])
  const [selectedActualsLoading, setSelectedActualsLoading] = useState(false)
  const [selectedActualsError, setSelectedActualsError] = useState(false)
  const [forecastLoadError, setForecastLoadError] = useState(false)
  const [savedActualRecords, setSavedActualRecords] = useState<ActualRecord[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [products, setProducts] = useState<Product[]>([])
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [budgetLoadError, setBudgetLoadError] = usePopupError()
  const [forecasts, setForecasts] = useState<SalesForecast[]>([])
  const [savedOwnerNames, setSavedOwnerNames] = useState<Record<string, string>>({})
  const [collapsedKams, setCollapsedKams] = useState<Set<string>>(new Set())
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set()
  )

  const [userId, setUserId] = useState('')
  const [assignedRegionId, setAssignedRegionId] = useState<number | null>(null)
  const [assignedSubregionId, setAssignedSubregionId] = useState<number | null>(null)
  const [role, setRole] = useState('')
  const [salesPosition, setSalesPosition] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const isRsmSavedViewer = role === 'Manager' && salesPosition.trim().toUpperCase() === 'RSM'
  const groupSavedByKam = isAdmin || isRsmSavedViewer

  const [year, setYear] = useState(currentYear)
  const [week, setWeek] = useState(1)
  const [selectedWeek, setSelectedWeek] = useState('')
  const [selectedRegionId, setSelectedRegionId] = useState('')
  const [selectedSubregionId, setSelectedSubregionId] = useState('')

  const [rows, setRows] = useState<SalesRow[]>([
    {
      tempId: crypto.randomUUID(),
      id: null,
      category_id: '',
      product_id: '',
      product_search: '',
      forecast: '',
      status: 'Draft',
    },
  ])

  const [weekStatus, setWeekStatus] = useState('Locked')
  const [checkingWeekLock, setCheckingWeekLock] = useState(false)
  const [pendingAction, setPendingAction] = useState<'save' | 'submit' | 'submitAll' | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const loading = pendingAction !== null || importBusy
  const [, setError] = usePopupError()
  const setMessage = useStatusNotification()
  const [savedStatusFilter, setSavedStatusFilter] = useState('')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('status') === 'Returned') {
      void Promise.resolve().then(() => setSavedStatusFilter('Rejected'))
    }
  }, [])
  const [, setSavedError] = usePopupError()
  const setSavedMessage = useStatusNotification()
  const [savedTableLoading, setSavedTableLoading] = useState(true)
  const [initializing, setInitializing] = useState(true)
  const [budgetReferencesLoading, setBudgetReferencesLoading] = useState(true)
  const [savedActualsLoading, setSavedActualsLoading] = useState(true)
  const [savedActualsError, setSavedActualsError] = useState(false)
  const savedActualRequest = useRef(0)
  const [workspaceOwner, setWorkspaceOwner] = useState('')
  const workspaceStorageFailed = useRef(false)

  useEffect(() => {
    if (initializing || forecastLoadError || !userId || workspaceOwner === userId) return
    try {
      const stored = readForecastWorkspace(window.sessionStorage, userId)
      // Re-check edited records against current ownership and status. Browser
      // restoration never replaces the existing server-side save checks.
      const editsStillValid = stored?.rows.every((row) => row.id === null
        || forecasts.some((item) => item.id === row.id && (
          (item.user_id === userId && isEditableForecast(item)) ||
          (isAdmin && isEditableForecast(item)) ||
          (canReviseRsmForecast(item, {
            role, position: salesPosition, regionId: assignedRegionId, subregionId: assignedSubregionId,
          })))))
      if (stored && editsStillValid) {
        setYear(stored.year)
        setWeek(stored.week)
        setSelectedWeek(stored.selectedWeek)
        setSelectedMonth(stored.selectedMonth)
        setSelectedRegionId(stored.selectedRegionId)
        setSelectedSubregionId(stored.selectedSubregionId)
        setSelectedCustomerId(stored.selectedCustomerId)
        setRows(stored.rows)
      }
    } catch {
      workspaceStorageFailed.current = true
      setError('Your browser cannot retain unsaved work. Save a draft before leaving this page.')
    }
    setWorkspaceOwner(userId)
  }, [initializing, forecastLoadError, userId, workspaceOwner, forecasts, setError, role, salesPosition, assignedRegionId, assignedSubregionId, isAdmin])

  useEffect(() => {
    if (initializing || !userId || workspaceOwner !== userId || !selectedWeek || workspaceStorageFailed.current) return
    try {
      writeForecastWorkspace(window.sessionStorage, {
        version: 1, ownerId: userId, year, week, selectedWeek, selectedMonth,
        selectedRegionId, selectedSubregionId, selectedCustomerId, rows,
      })
    } catch {
      workspaceStorageFailed.current = true
      setError('Your browser could not retain unsaved work. Save a draft before leaving this page.')
    }
  }, [initializing, userId, workspaceOwner, year, week, selectedWeek, selectedMonth,
    selectedRegionId, selectedSubregionId, selectedCustomerId, rows, setError])

  useEffect(() => {
    async function initialize() {
    setSavedTableLoading(true)
    try {
        const access = await loadUserAccess()

        if (!access) return

        await Promise.all([loadInitialData(), loadForecasts()])

    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load forecasts.') }
    finally { setSavedTableLoading(false); setInitializing(false) }
  }

    initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedWeek) {
      const now = new Date()

      const date = new Date(
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
      )

      const day = date.getUTCDay() || 7
      date.setUTCDate(date.getUTCDate() + 4 - day)

      const isoYear = date.getUTCFullYear()
      const yearStart = new Date(Date.UTC(isoYear, 0, 1))

      const weekNumber = Math.ceil(
        ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
      )

      const formattedWeek =
        `${isoYear}-W${String(weekNumber).padStart(2, '0')}`

      setSelectedWeek(formattedWeek)
      setYear(isoYear)
      setWeek(weekNumber)
      setSelectedMonth(getMonthForWeek(isoYear, weekNumber))
    }
  }, [selectedWeek])

  useEffect(() => {
    if (!selectedWeek) return

    const [selectedYear, selectedWeekNumber] = selectedWeek.split('-W')
    const selectedYearNumber = Number(selectedYear)
    const selectedWeekNumberValue = Number(selectedWeekNumber)

    if (!selectedYearNumber || !selectedWeekNumberValue) return

    checkWeekLock(selectedYearNumber, selectedWeekNumberValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek])

  async function handleWeekChange(value: string) {
    setSelectedWeek(value)

    if (!value) {
      setWeekStatus('Locked')
      setCheckingWeekLock(false)
      return
    }

    const [selectedYear, selectedWeekNumber] = value.split('-W')
    const newYear = Number(selectedYear)
    const newWeek = Number(selectedWeekNumber)

    setYear(newYear)
    setWeek(newWeek)
    setSelectedMonth(getMonthForWeek(newYear, newWeek))

    setSelectedCustomerId('')

    setRows([
      {
        tempId: crypto.randomUUID(),
        id: null,
        category_id: '',
        product_id: '',
        product_search: '',
        forecast: '',
        status: 'Draft',
      },
    ])

    setError('')
    setMessage('')
    await checkWeekLock(newYear, newWeek)
  }

  useEffect(() => {
    let cancelled = false

    async function loadActuals() {
      setSelectedActualsError(false)
      if (!selectedRegionId || !selectedCustomerId) {
        setActualRecords([])
        setSelectedActualsLoading(false)
        return
      }

      setSelectedActualsLoading(true)
      try {
      const { data, error } = await loadActualRecords(supabase, [year, year - 1], {
        regionId: Number(selectedRegionId),
        customerId: Number(selectedCustomerId),
      }, 'Forecasts')

      if (cancelled) return

      if (error) {
        setActualRecords([])
        setSelectedActualsError(true)
        setError('Unable to load selected customer actuals. ' + error.message)
        return
      }

      setActualRecords(data ?? [])
      } catch (error) {
        if (!cancelled) {
          setSelectedActualsError(true)
          setError(error instanceof Error ? error.message : 'Unable to load customer actuals.')
        }
      } finally { if (!cancelled) setSelectedActualsLoading(false) }
    }

    loadActuals()

    return () => {
      cancelled = true
    }
  }, [year, selectedRegionId, selectedCustomerId, supabase])

  async function loadUserAccess(): Promise<UserAccess | null> {
    setError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('User session not found.')
      return null
    }

    setUserId(user.id)

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, is_active, region_id, subregion_id, position')
      .eq('id', user.id)
      .single()

    if (profileError) {
      setError(profileError.message)
      return null
    }

    if (!profile?.is_active) {
      setError('Your account is inactive.')
      return null
    }

    const profileRole = profile.role ?? ''
    const profileAssignedRegionId = profile.region_id
      ? Number(profile.region_id)
      : null

    const profileAssignedSubregionId =
      profile.subregion_id == null
        ? null
        : Number(profile.subregion_id)

    setRole(profileRole)
    setSalesPosition(profile.position ?? '')
    setAssignedSubregionId(profileAssignedSubregionId)

    setSelectedSubregionId(
      profileAssignedSubregionId == null
        ? ''
        : String(profileAssignedSubregionId)
    )

    if (profileRole === 'Admin') {
      setIsAdmin(true)
      setAssignedRegionId(null)
      setSelectedRegionId('')

      return {
        userId: user.id,
        role: profileRole,
        isAdmin: true,
        assignedRegionId: null,
        assignedSubregionId: null,
      }
    }

    if (profileRole === 'Manager' || profileRole === 'User') {
      setIsAdmin(false)
      setAssignedRegionId(profileAssignedRegionId)

      setSelectedRegionId(
        profileAssignedRegionId ? String(profileAssignedRegionId) : ''
      )

      setSelectedSubregionId(
        profileAssignedSubregionId == null
          ? ''
          : String(profileAssignedSubregionId)
      )

      return {
        userId: user.id,
        role: profileRole,
        isAdmin: false,
        assignedRegionId: profileAssignedRegionId,
        assignedSubregionId: profileAssignedSubregionId,
      }
    }

    setIsAdmin(false)
    setAssignedRegionId(profileAssignedRegionId)

    setSelectedRegionId(
      profileAssignedRegionId ? String(profileAssignedRegionId) : ''
    )

    return {
      userId: user.id,
      role: profileRole,
      isAdmin: false,
      assignedRegionId: profileAssignedRegionId,
      assignedSubregionId: profileAssignedSubregionId,
    }
  }

  async function loadInitialData() {
    setError('')
    void loadBudgetReferences()
    const [regionResult, subregionResult, categoryResult, customerResult, productResult] = await Promise.all([
      supabase.from('regions').select('id, name, code').eq('is_active', true).order('name'),
      supabase.from('subregions').select('id, name'),
      supabase.from('categories').select('id, code, name').eq('is_active', true).order('name'),
      (async () => {
        const response = await fetch('/api/forecast-customers', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error('Unable to load customers. ' + (data.error ?? 'Please try again.'))
        return data
      })(),
      supabase.from('products').select('id, category_id, code, name, weight').eq('is_active', true).order('name'),
    ])
    const failed = [regionResult, subregionResult, categoryResult, productResult].find((result) => result.error)
    if (failed?.error) throw new Error('Unable to load forecast lookups. ' + failed.error.message)
    setRegions(sortRegions(regionResult.data ?? []))
    setSubregions(subregionResult.data ?? [])
    setCategories(categoryResult.data ?? [])
    setCustomers(customerResult.customers as Customer[])
    setCustomerAssignmentRestricted(customerResult.restricted === true)
    setProducts(productResult.data ?? [])
  }

  async function loadBudgetReferences() {
    setBudgetReferencesLoading(true)
    setBudgetLoadError('')
    try {
    const loadedBudgets: BudgetRecord[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error } = await supabase
        .rpc('get_monthly_reference_budget_rows', { p_module: 'Forecasts' })
        .select('id, year, month, region_id, subregion_id, customer_id, product_id, volume')
        .order('id')
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        setBudgetLoadError('Unable to load budget references. ' + error.message)
        return
      }

      const records = (page ?? []) as BudgetRecord[]
      loadedBudgets.push(...records)
      if (records.length < PAGE_SIZE) break
    }

    setBudgets(loadedBudgets)
    } catch (error) { setBudgetLoadError(error instanceof Error ? error.message : 'Unable to load budget references.') }
    finally { setBudgetReferencesLoading(false) }
  }

  const canChooseRegion = role === 'Admin' || (role === 'Superuser' && salesPosition !== 'Supervisor')
  const availableRegions = useMemo(() => {
    if (canChooseRegion) {
      return regions
    }

    return regions.filter((region) => region.id === assignedRegionId)
  }, [regions, canChooseRegion, assignedRegionId])

  async function loadForecasts() {
    setSavedTableLoading(true)
    setForecastLoadError(false)
    try {
      setSavedError('')

      const baseQuery = supabase
        .rpc('get_saved_forecasts')
        .select(`
          id,
          year,
          week,
          region_id,
          subregion_id,
          customer_id,
          category_id,
          product_id,
          forecast,
          volume,
          status,
          user_id,
          remarks,
          returned_at
        `)
        .order('year', { ascending: false })
        .order('week', { ascending: false })
        .order('id', { ascending: false })

      const allForecasts: SalesForecast[] = []
      let from = 0

      while (true) {
        const { data, error } = await baseQuery.range(
          from,
          from + PAGE_SIZE - 1
        )

        if (error) {
          setForecastLoadError(true)
          setSavedError('Unable to load saved forecasts. ' + error.message)
          return
        }

        const page = (data ?? []) as SalesForecast[]
        allForecasts.push(...page)

        if (page.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      const ownerNames: Record<string, string> = {}
      // Resolve only owners of accessible saved records, including returned KAMs.
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase.rpc('get_saved_forecast_owners')
          .order('id').range(offset, offset + PAGE_SIZE - 1)
        if (error) throw new Error('Unable to load forecast owner names. ' + error.message)
        for (const owner of data ?? []) ownerNames[owner.id] = owner.full_name || 'Unnamed KAM'
        if (!data || data.length < PAGE_SIZE) break
      }
      setSavedOwnerNames(ownerNames)
      setForecasts(allForecasts)
      window.dispatchEvent(new Event('forecast-workflow-changed'))

      void loadSavedActualReferences(allForecasts)

    } catch (error) {
      setForecastLoadError(true)
      setSavedError(error instanceof Error ? error.message : 'Unable to load saved forecasts.')
    } finally { setSavedTableLoading(false) }
  }

  async function loadSavedActualReferences(allForecasts: SalesForecast[]) {
    const request = ++savedActualRequest.current
    setSavedActualsLoading(true)
    setSavedActualsError(false)
    try {
      // Load actual records for the years represented in the saved forecasts
      // and the corresponding previous years. These are lookup-only values.
      const lookupYears = Array.from(
        new Set(
          allForecasts.flatMap((item) => [item.year, item.year - 1])
        )
      )

      if (lookupYears.length === 0) {
        setSavedActualRecords([])
        return
      }

      const { data, error } = await loadActualRecords(supabase, lookupYears, {
        regionIds: [...new Set(allForecasts.flatMap((item) => item.region_id == null ? [] : [item.region_id]))],
        customerIds: [...new Set(allForecasts.flatMap((item) => item.customer_id == null ? [] : [item.customer_id]))],
      }, 'Forecasts')
      if (request !== savedActualRequest.current) return
      if (error) {
        setSavedActualsError(true)
        setSavedActualRecords([])
        setSavedError('Unable to load saved forecast actuals. ' + error.message)
        return
      }

      setSavedActualRecords(data ?? [])

    } catch (error) {
      if (request !== savedActualRequest.current) return
      setSavedActualsError(true)
      setSavedError(error instanceof Error ? error.message : 'Unable to load saved forecast actuals.')
    } finally { if (request === savedActualRequest.current) setSavedActualsLoading(false) }
  }

  async function checkWeekLock(
    checkYear = year,
    checkWeek = week,
    scope: 'form' | 'saved' = 'form'
  ): Promise<boolean> {
    if (scope === 'form') setCheckingWeekLock(true)
    try {
      const states = await loadForecastWeekStates(supabase, [{ year: checkYear, week: checkWeek }])
      const status = states[0].status
      if (scope === 'form') setWeekStatus(status)
      return status !== 'Open'
    } catch (error) {
      if (scope === 'form') setWeekStatus('Locked')
      const report = scope === 'saved' ? setSavedError : setError
      report(error instanceof Error ? error.message : 'Unable to verify the week lock.')
      return true
    } finally { if (scope === 'form') setCheckingWeekLock(false) }
  }

  function getRowVolume(row: SalesRow) {
    if (!row.product_id) return null

    const product = products.find(
      (item) => item.id === Number(row.product_id)
    )

    if (!product || product.weight === null) return null

    return (Number(row.forecast) || 0) * Number(product.weight)
  }

  function getISOWeekStart(
    selectedYear: number,
    selectedWeek: number
  ) {
    const january4 = new Date(Date.UTC(selectedYear, 0, 4))
    const day = january4.getUTCDay() || 7
    const monday = new Date(january4)

    monday.setUTCDate(
      january4.getUTCDate() - day + 1 + (selectedWeek - 1) * 7
    )

    return monday
  }

  function getMonthForWeek(
    selectedYear: number,
    selectedWeek: number
  ) {
    const weekStart = getISOWeekStart(selectedYear, selectedWeek)
    const thursday = new Date(weekStart)

    thursday.setUTCDate(weekStart.getUTCDate() + 3)

    return thursday.getUTCMonth() + 1
  }

  const [scrollToLastRowRequest, setScrollToLastRowRequest] = useState(0)

  function addRow() {
    if (!canCreateForecast || ((editingSharedForecast || adminEditingExisting) && !canAddToExistingForecast)) return

    setRows((currentRows) => [
      ...currentRows,
      {
        tempId: crypto.randomUUID(),
        id: null,
        category_id: '',
        product_id: '',
        product_search: '',
        forecast: '',
        status: 'Draft',
      },
    ])
    setScrollToLastRowRequest((request) => request + 1)
  }

  function removeRow(tempId: string) {
    if (rows.length === 1) {
      setRows([
        {
          tempId: crypto.randomUUID(),
          id: null,
          category_id: '',
          product_id: '',
          product_search: '',
          forecast: '',
          status: 'Draft',
        },
      ])

      return
    }

    setRows((currentRows) =>
      currentRows.filter((row) => row.tempId !== tempId)
    )
  }

  function updateRow(
    tempId: string,
    field: keyof SalesRow,
    value: string
  ) {
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.tempId !== tempId) return row

        if (field === 'product_search') {
          const searchValue = value.trim().toLowerCase()

          const matchedProduct = products.find(
            (product) =>
              `${product.code} - ${product.name}`.toLowerCase() ===
              searchValue
          )

          return {
            ...row,
            product_search: value,
            product_id: matchedProduct ? String(matchedProduct.id) : '',
            category_id: matchedProduct?.category_id
              ? String(matchedProduct.category_id)
              : '',
          }
        }

        if (field === 'category_id') {
          return {
            ...row,
            category_id: value,
            product_id: '',
            product_search: '',
          }
        }

        if (field === 'product_id') {
          const selectedProduct = products.find(
            (product) => product.id === Number(value)
          )

          return {
            ...row,
            product_id: value,
            product_search: selectedProduct
              ? `${selectedProduct.code} - ${selectedProduct.name}`
              : '',
            category_id: selectedProduct?.category_id
              ? String(selectedProduct.category_id)
              : '',
          }
        }

        return { ...row, [field]: value }
      })
    )
  }

  function getCategoryName(id: number | null) {
    const category = categories.find((item) => item.id === id)

    if (!category) return '-'

    return category.code
      ? `${category.code} - ${category.name}`
      : category.name
  }

  function getCustomerName(id: number | null) {
    return customers.find((item) => item.id === id)?.customer ?? '—'
  }

  function getProductName(id: number | null) {
    const product = products.find((item) => item.id === id)

    if (!product) return '-'

    return `${product.code} - ${product.name}`
  }

  const availableCustomers = useMemo(() => {
    if (!selectedRegionId) return []

    return customers.filter(
      (customer) => customer.region_id === Number(selectedRegionId)
    )
  }, [customers, selectedRegionId])

  function getActualMonthlyForRow(
    row: SalesRow,
    previous = false
  ) {
    if (!selectedCustomerId) return 0
    const period = referencePeriod(year, selectedMonth, previous)

    return actualRecords
      .filter(
        (item) =>
          item.customer_id === Number(selectedCustomerId) &&
          item.region_id === Number(selectedRegionId) &&
          item.year === period.year &&
          item.month === period.month &&
          (!row.product_id || item.product_id === Number(row.product_id))
      )
      .reduce((total, item) => total + Number(item.volume || 0), 0)
  }

  function getMonthlyBudget(
    targetYear: number,
    targetMonth: number,
    regionId: number | null,
    subregionId: number | null,
    customerId: number | null,
    productId: number | null
  ) {
    return monthlyBudgetReference(budgets, targetYear, targetMonth, regionId, subregionId, customerId, productId)
  }

  function getFormSubregionId() {
    if (!canChooseRegion) return assignedSubregionId
    if (rows.some((row) => row.id !== null)) return Number(selectedSubregionId) || null
    if (role === 'Superuser' && assignedRegionId === Number(selectedRegionId)) {
      return assignedSubregionId
    }

    return null
  }

  function getMonthlyBudgetForRow(row: SalesRow) {
    if (!row.product_id) {
      return customerMonthlyBudgetReference(budgets, year, selectedMonth,
        Number(selectedRegionId) || null, getFormSubregionId(), Number(selectedCustomerId) || null)
    }
    return getMonthlyBudget(
      year,
      selectedMonth,
      Number(selectedRegionId) || null,
      getFormSubregionId(),
      Number(selectedCustomerId) || null,
      Number(row.product_id) || null
    )
  }

  function getForecastMonthlyForRow(row: SalesRow) {
    if (!selectedCustomerId) return 0

    return forecasts
      .filter(
        (item) =>
          item.status === 'Approved' &&
          item.year === year &&
          item.region_id === Number(selectedRegionId) &&
          item.customer_id === Number(selectedCustomerId) &&
          (!row.product_id || item.product_id === Number(row.product_id)) &&
          getMonthForWeek(item.year, item.week) === selectedMonth
      )
      .reduce((total, item) => total + Number(item.volume || 0), 0)
  }

  // Saved forecast reference values are calculated from lookup records.

  function getSavedActualMonthly(
    item: SalesForecast,
    previous = false,
    customerLevel = false
  ) {
    if (
      (!customerLevel && !item.product_id) ||
      !item.customer_id ||
      !item.region_id
    ) {
      return 0
    }

    const period = referencePeriod(item.year, getMonthForWeek(item.year, item.week), previous)

    return savedActualRecords
      .filter(
        (actual) =>
          actual.customer_id === item.customer_id &&
          actual.region_id === item.region_id &&
          (customerLevel || actual.product_id === item.product_id) &&
          actual.year === period.year &&
          actual.month === period.month
      )
      .reduce(
        (total, actual) => total + (Number(actual.volume) || 0),
        0
      )
  }

  function getSavedMonthlyBudget(item: SalesForecast) {
    return getMonthlyBudget(
      item.year,
      getMonthForWeek(item.year, item.week),
      item.region_id,
      item.subregion_id,
      item.customer_id,
      item.product_id
    )
  }

  function getSavedForecastMonthly(item: SalesForecast, customerLevel = false) {
    if (
      (!customerLevel && !item.product_id) ||
      !item.customer_id ||
      !item.region_id
    ) {
      return 0
    }

    const targetMonth = getMonthForWeek(item.year, item.week)

    return forecasts
      .filter(
        (forecast) =>
          forecast.status === 'Approved' &&
          forecast.year === item.year &&
          forecast.region_id === item.region_id &&
          forecast.customer_id === item.customer_id &&
          (customerLevel || forecast.product_id === item.product_id) &&
          getMonthForWeek(forecast.year, forecast.week) === targetMonth
      )
      .reduce(
        (total, forecast) => total + (Number(forecast.volume) || 0),
        0
      )
  }

  const totalForecast = rows.reduce(
    (total, row) => total + (Number(row.forecast) || 0),
    0
  )

  const totalVolume = rows.reduce(
    (total, row) => total + (getRowVolume(row) ?? 0),
    0
  )

  function validateRows() {
    if (!selectedRegionId) {
      setError('Please select a region.')
      return false
    }

    if (role !== 'Admin') {
      if (!assignedRegionId || Number(selectedRegionId) !== assignedRegionId) {
        setError('You can only use your assigned region.')
        return false
      }
    }

    if (!selectedCustomerId) {
      setError('Please select a customer.')
      return false
    }

    if (customerAssignmentRestricted && !customers.some((customer) => customer.id === Number(selectedCustomerId))) {
      setError('You can only forecast for customers assigned to your name.')
      return false
    }

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const rowNumber = index + 1

      if (!row.category_id) {
        setError(`Please select a category for row ${rowNumber}.`)
        return false
      }

      if (!row.product_id) {
        setError(`Please select a product for row ${rowNumber}.`)
        return false
      }

      if (
        row.forecast.trim() === '' ||
        Number.isNaN(Number(row.forecast)) ||
        Number(row.forecast) < 0
      ) {
        setError(`Please enter a valid forecast for row ${rowNumber}.`)
        return false
      }
    }

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (
          rows[i].category_id === rows[j].category_id &&
          rows[i].product_id === rows[j].product_id
        ) {
          setError(
            `Duplicate Product found in rows ${i + 1} and ${j + 1}.`
          )
          return false
        }
      }
    }

    return true
  }

  function handleClear() {
    if (loading || initializing) return
    const current = currentWeekInput()
    const [currentYear, currentWeek] = current.split('-W').map(Number)
    setYear(currentYear)
    setWeek(currentWeek)
    setSelectedWeek(current)
    setSelectedMonth(getMonthForWeek(currentYear, currentWeek))
    setSelectedRegionId(canChooseRegion ? '' : String(assignedRegionId ?? ''))
    setSelectedSubregionId(canChooseRegion ? '' : String(assignedSubregionId ?? ''))
    setSelectedCustomerId('')
    setRows([{
      tempId: crypto.randomUUID(), id: null, category_id: '', product_id: '',
      product_search: '', forecast: '', status: 'Draft',
    }])
    setError('')
    setSavedError('')
  }

  async function handleSave() {
    if (
      (rows.some((row) => row.id === null) &&
        !canCreateForecast) ||
      (rows.some((row) => row.id !== null) &&
        !authorization.can('Forecasts', 'edit'))
    ) {
      return
    }

    setError('')
    setMessage('')

    const locked = await checkWeekLock(year, week)

    if (locked) {
      // The form's week-lock notice already explains why saving is disabled.
      return
    }

    if (
      !year ||
      year < 2020 ||
      year > 2100 ||
      !week ||
      week < 1 ||
      week > 53
    ) {
      setError('Please select a valid week.')
      return
    }

    if (!validateRows()) return

    setPendingAction('save')

    const regionId =
      canChooseRegion
        ? Number(selectedRegionId)
        : assignedRegionId

    const subregionId = getFormSubregionId()

    if (!regionId) {
      setPendingAction(null)
      setError('No region is assigned to this account.')
      return
    }

    const payload = rows.map((row) => ({
        ...(row.id !== null ? { id: row.id } : {}),
        year,
        week,
        region_id: regionId,
        subregion_id: subregionId,
        customer_id: Number(selectedCustomerId),
        category_id: Number(row.category_id),
        product_id: Number(row.product_id),
        forecast: Number(row.forecast),
        volume: getRowVolume(row),
        status: 'Draft',
        user_id: adminEditingExisting ? existingForecastOwner! : editingSharedForecast ? forecasts.find((item) => item.id === row.id)?.user_id ?? userId : userId,
      }))

    for (const [index, row] of payload.entries()) {
      if (!findExistingForecast(row, forecasts)) continue
      const product = products.find((item) => item.id === row.product_id)
      const customer = customers.find((item) => item.id === row.customer_id)
      setPendingAction(null)
      setError(`Row ${index + 1}: ${product?.code || 'This product'} already has a forecast for ${customer?.customer || 'this customer'} in Week ${week}, ${year}. Open Saved Forecasts and edit the existing record instead of adding it again.`)
      return
    }

    const { error: saveError } = adminEditingExisting
      ? await supabase.rpc('save_admin_customer_forecast', {
          p_records: rsmRevisionPayload(forecasts, payload.filter((row) => row.id !== undefined).map((row) => ({
            id: row.id!, product_id: row.product_id, forecast: row.forecast,
          }))),
          p_new_records: payload.filter((row) => row.id === undefined).map((row) => ({ product_id: row.product_id, forecast: row.forecast })),
        })
      : editingSharedForecast
      ? await supabase.rpc(isAdmin ? 'revise_admin_saved_forecasts' : 'revise_rsm_returned_forecasts', {
          p_records: rsmRevisionPayload(forecasts, payload.map((row) => ({
            id: row.id!, product_id: row.product_id, forecast: row.forecast,
          }))),
          p_submit: false,
        })
      : await saveForecastDrafts(supabase, payload)

    if (saveError) {
      setPendingAction(null)
      setError('Unable to save drafts. ' + saveError.message)
      return
    }

    const revised = rows.some((row) => row.status === 'Rejected')
    setMessage(editingSharedForecast ? 'Changes saved as Draft. Use Submit in Saved Forecasts to send the corrected forecasts for RSM review.' : revised ? 'Changes saved as Draft. Use Submit in Saved Forecasts to send the corrected forecasts back to your RSM.' : 'Forecasts saved successfully.')
    if (revised) setSavedStatusFilter('Draft')
    setSelectedCustomerId('')

    setRows([
      {
        tempId: crypto.randomUUID(),
        id: null,
        category_id: '',
        product_id: '',
        product_search: '',
        forecast: '',
        status: 'Draft',
      },
    ])

    setPendingAction(null)
    setForecastDialogOpen(false)

    await loadForecasts()
  }

  async function handleEditCustomer(items: SalesForecast[]) {
    if (!authorization.can('Forecasts', 'edit') || items.length === 0) return
    const first = items[0]
    if (items.some((item) => item.region_id !== first.region_id || item.subregion_id !== first.subregion_id)) {
      setSavedError('This customer has forecasts across multiple areas and cannot be edited together.')
      return
    }
    for (const item of items) {
      const rsmReturned = canReviseRsmForecast(item, {
        role, position: salesPosition, regionId: assignedRegionId, subregionId: assignedSubregionId,
      })
      if (!(isAdmin && isEditableForecast(item)) && !rsmReturned && (groupSavedByKam || !isEditableForecast(item) || (role === 'Manager' && item.region_id !== assignedRegionId) || item.user_id !== userId)) {
        setSavedError('You can only edit eligible forecasts from your assigned area or account.')
        return
      }
      if (await checkWeekLock(item.year, item.week, 'saved')) {
        setSavedError(`Week ${item.week} - ${item.year} is locked. These forecasts cannot be edited.`)
        return
      }
    }

    setSavedError('')
    setSavedMessage('')
    setYear(first.year)
    setWeek(first.week)
    setSelectedMonth(getMonthForWeek(first.year, first.week))
    setSelectedWeek(`${first.year}-W${String(first.week).padStart(2, '0')}`)
    setSelectedRegionId(first.region_id ? String(first.region_id) : '')
    setSelectedSubregionId(first.subregion_id ? String(first.subregion_id) : '')
    setSelectedCustomerId(String(first.customer_id ?? ''))
    setRows(items.map((item) => {
      const selectedProduct = products.find((product) => product.id === item.product_id)
      return {
        tempId: crypto.randomUUID(),
        id: item.id,
        category_id: String(item.category_id ?? ''),
        product_id: String(item.product_id ?? ''),
        product_search: selectedProduct ? `${selectedProduct.code} - ${selectedProduct.name}` : '',
        forecast: String(item.forecast ?? ''),
        status: item.status,
      }
    }))
    setForecastDialogOpen(true)
  }

  function canSubmitItem(item: SalesForecast) {
    return item.status === 'Draft' && item.user_id === userId &&
      (!customerAssignmentRestricted || customers.some((customer) => customer.id === item.customer_id)) &&
      item.region_id !== null &&
      (isAdmin || (item.region_id === assignedRegionId && item.subregion_id === assignedSubregionId))
  }

  async function handleSubmitCustomer(items: SalesForecast[]) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    const rsmResubmission = authorization.can('Forecasts', 'edit') && items.length > 0 && items.every((item) =>
      item.status === 'Draft' && item.user_id !== userId && canReviseRsmForecast(item, {
        role, position: salesPosition, regionId: assignedRegionId, subregionId: assignedSubregionId,
      }))
    const adminSubmission = isAdmin && authorization.can('Forecasts', 'edit') && items.length > 0 && items.every((item) => item.status === 'Draft')
    if (isAdmin && !adminSubmission) return
    if (!canSubmitForecasts && !rsmResubmission) return
    const eligibleItems = adminSubmission ? items.filter((item) => item.status === 'Draft') : rsmResubmission ? items : items.filter(canSubmitItem)
    if (eligibleItems.length === 0) {
      setSavedError('There are no eligible forecasts for this customer.')
      return
    }
    for (const item of eligibleItems) {
      if (await checkWeekLock(item.year, item.week, 'saved')) {
        setSavedError(`Week ${item.week} - ${item.year} is locked. These forecasts cannot be submitted.`)
        return
      }
    }
    if (!(actionConfirmation = await confirmAction(forecastSubmissionConfirmation(eligibleItems, getCustomerName(eligibleItems[0].customer_id), getCustomerName, getProductName)))) return
    setPendingAction('submit')
    setSavedError('')
    setSavedMessage('')
    const { data, error } = rsmResubmission || adminSubmission ? await supabase.rpc(adminSubmission ? 'revise_admin_saved_forecasts' : 'revise_rsm_returned_forecasts', {
      p_records: rsmRevisionPayload(eligibleItems, eligibleItems.map((item) => ({
        id: item.id, product_id: Number(item.product_id), forecast: Number(item.forecast),
      }))),
      p_submit: true,
    }) : await supabase.rpc('transition_forecast_review', {
      p_ids: eligibleItems.map((item) => item.id),
      p_action: 'submit',
    })
    setPendingAction(null)
    if (error) {
      setSavedError(error.message)
      return
    }
    setSavedMessage(`${Number(data)} forecast record(s) submitted for RSM review.`)
    await loadForecasts()

    } finally { actionConfirmation?.finish() }
  }

  async function handleDeleteMany(items: SalesForecast[], scope: 'customer' | 'product' = 'customer') {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!authorization.can('Forecasts', 'delete') || items.length === 0) return
    for (const item of items) {
      if (!canDeleteSavedForecastStatus(item.status) || (!isAdmin && ((role === 'Manager' && item.region_id !== assignedRegionId) || item.user_id !== userId))) {
        setSavedError('You can only delete eligible forecasts from your assigned area or account.')
        return
      }
      if (await checkWeekLock(item.year, item.week, 'saved')) {
        setSavedError(`Week ${item.week} - ${item.year} is locked. These forecasts cannot be deleted.`)
        return
      }
    }
    const confirmed = (actionConfirmation = await confirmAction({ message: `Remove ${items.length} forecast record(s) ${scope === 'customer' ? 'for this customer' : 'for this product'}?`, details: confirmationRecordDetails(items, 'Total volume (50kg)') }))
    if (!confirmed) return
    const deletion = supabase.from('forecasts').delete().in('id', items.map((item) => item.id))
    if (role !== 'Admin') deletion.eq('user_id', userId)
    const { error } = isAdmin ? await supabase.rpc('delete_admin_saved_forecasts', { p_ids: items.map((item) => item.id) }) : await deletion
    if (error) {
      setSavedError(error.message)
      return
    }
    setSavedMessage(`${items.length} forecast record(s) removed.`)
    await loadForecasts()

    } finally { actionConfirmation?.finish() }
  }

  async function handleSubmitAll() {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!canSubmitForecasts) return

    setSavedError('')
    setSavedMessage('')

    const draftForecasts = forecasts.filter(canSubmitItem)

    if (draftForecasts.length === 0) {
      setSavedError('There are no eligible forecasts to submit.')
      return
    }

    // Check every distinct week represented by the Draft records.
    const uniqueWeeks = Array.from(
      new Map(
        draftForecasts.map((item) => [
          `${item.year}-W${item.week}`,
          { year: item.year, week: item.week },
        ])
      ).values()
    )

    setPendingAction('submitAll')

    let lockResults
    try {
      lockResults = await loadForecastWeekStates(supabase, uniqueWeeks)
    } catch (error) {
      setPendingAction(null)
      setSavedError(error instanceof Error ? error.message : 'Unable to verify forecast week locks.')
      return
    }

    const lockedWeeks = lockResults.filter(
      (item) => item.status === 'Locked'
    )

    if (lockedWeeks.length > 0) {
      setPendingAction(null)
      setSavedError(
        `Submission stopped. The following week(s) are locked: ${
          lockedWeeks
            .map(
              (item) =>
                `${item.year}-W${String(item.week).padStart(2, '0')}`
            )
            .join(', ')
        }.`
      )
      return
    }

    const confirmed = (actionConfirmation = await confirmAction(forecastSubmissionConfirmation(draftForecasts, 'All Draft Forecasts', getCustomerName, getProductName)))

    if (!confirmed) {
      setPendingAction(null)
      return
    }

    const { data, error: submitError } = await supabase.rpc('transition_forecast_review', {
      p_ids: draftForecasts.map((item) => item.id),
      p_action: 'submit',
    })

    if (submitError) {
      setPendingAction(null)
      setSavedError(submitError.message)
      return
    }

    setSavedMessage(`${Number(data)} forecast record(s) submitted for RSM review.`)

    setPendingAction(null)

    await loadForecasts()

    } finally { actionConfirmation?.finish() }
  }

  const visibleSavedForecasts = useMemo(() => forecasts.filter((item) =>
    (isAdmin || !customerAssignmentRestricted || customers.some((customer) => customer.id === item.customer_id)) &&
    savedForecastMatchesStatus(item, savedStatusFilter)
  ), [forecasts, savedStatusFilter, customerAssignmentRestricted, customers, isAdmin])

  // Group by week and customer, keeping each review status separate.
  const savedWeekGroups = useMemo<SavedWeekGroup[]>(() => {
    const weeks = new Map<
      string,
      {
        key: string
        year: number
        week: number
        customers: Map<
          string,
          {
            key: string
            customer_id: number | null
            items: SalesForecast[]
          }
        >
      }
    >()

    visibleSavedForecasts.forEach((item) => {
      const weekKey =
        `${item.year}-W${String(item.week).padStart(2, '0')}`

      if (!weeks.has(weekKey)) {
        weeks.set(weekKey, {
          key: weekKey,
          year: item.year,
          week: item.week,
          customers: new Map(),
        })
      }

      const weekGroup = weeks.get(weekKey)!
      const customerKey = savedCustomerGroupKey(item, groupSavedByKam)

      if (!weekGroup.customers.has(customerKey)) {
        weekGroup.customers.set(customerKey, {
          key: `${weekKey}-${customerKey}`,
          customer_id: item.customer_id,
          items: [],
        })
      }

      weekGroup.customers.get(customerKey)!.items.push(item)
    })

    return Array.from(weeks.values()).map((weekGroup) => ({
      ...weekGroup,
      customers: Array.from(weekGroup.customers.values()).sort((a, b) => groupSavedByKam
        ? (savedOwnerNames[a.items[0].user_id] ?? a.items[0].user_id).localeCompare(savedOwnerNames[b.items[0].user_id] ?? b.items[0].user_id)
          || a.items[0].user_id.localeCompare(b.items[0].user_id)
        : 0).map(
        (customerGroup) => {
          const productMap = new Map<string, SalesForecast[]>()

          customerGroup.items.forEach((item) => {
            const productKey = String(item.product_id ?? 'no-product')
            const existing = productMap.get(productKey) ?? []

            existing.push(item)
            productMap.set(productKey, existing)
          })

          const productsForCustomer: SavedProductGroup[] =
            Array.from(productMap.entries()).map(
              ([productKey, productItems]) => {
                const first = productItems[0]
                return {
                  key: `${customerGroup.key}-${productKey}`,
                  items: productItems,
                  product_id: first.product_id,
                  category_id: first.category_id,
                  forecast: productItems.reduce(
                    (total, item) =>
                      total + (Number(item.forecast) || 0),
                    0
                  ),
                  volume: productItems.reduce(
                    (total, item) =>
                      total + (Number(item.volume) || 0),
                    0
                  ),
                  // Lookup-only values; do not use saved snapshots.
                  budget: getSavedMonthlyBudget(first),
                  actualMonthly: getSavedActualMonthly(first),
                  actualPreviousMonth: getSavedActualMonthly(
                    first,
                    true
                  ),
                  forecastMonthly: getSavedForecastMonthly(first),
                }
              }
            )

          return {
            ...customerGroup,
            products: productsForCustomer,
          }
        }
      ),
    }))
  }, [visibleSavedForecasts, forecasts, budgets, savedActualRecords, groupSavedByKam, savedOwnerNames])

  function toggleCustomer(key: string) {
    setExpandedCustomers((current) => {
      const next = new Set(current)

      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }

      return next
    })
  }

  function getWeekDateLabel(
    selectedYear: number,
    selectedWeek: number
  ) {
    const weekStart = getISOWeekStart(selectedYear, selectedWeek)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6)

    const formatDate = (date: Date) =>
      date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
      })

    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`
  }

  const canSubmitForecasts =
    authorization.can('Forecasts', 'edit') &&
    (isAdmin || (
      (salesPosition === 'KAM' || salesPosition === 'Supervisor') &&
      assignedRegionId !== null && assignedSubregionId !== null
    ))
  const eligibleSubmissionCount = forecasts.filter(canSubmitItem).length
  const eligibleSubmissionCustomers = actionGroupCount(forecasts.filter(canSubmitItem), 'customer')

  const savedCustomers = savedWeekGroups.flatMap((group) => group.customers)
  const totalSavedCustomers = new Set(savedCustomers.map((customer) => customer.customer_id)).size
  const allSavedCustomersExpanded = savedCustomers.length > 0 &&
    savedCustomers.every((customer) => expandedCustomers.has(customer.key)) &&
    (!groupSavedByKam || savedWeekGroups.every((weekGroup) => weekGroup.customers.every((customer) =>
      !collapsedKams.has(savedKamGroupKey(weekGroup.key, customer.items[0].user_id)))))

  const isLocked = weekStatus === 'Locked'
  const canCreateForecast = authorization.can('Forecasts', 'add')
  const editingSharedForecast = rows.some((row) => row.id !== null &&
    forecasts.some((item) => item.id === row.id && item.user_id !== userId))
  const editingOriginals = rows.flatMap((row) => row.id === null ? [] : forecasts.filter((item) => item.id === row.id))
  const adminEditingExisting = isAdmin && editingOriginals.length > 0
  const existingForecastOwner = editingOriginals[0]?.user_id
  const canAddToExistingForecast = adminEditingExisting && canCreateForecast && authorization.can('Forecasts', 'edit')
    && editingOriginals.every((item) => item.user_id === existingForecastOwner && isEditableForecast(item))

  const isFormDisabled =
    initializing ||
    workspaceOwner !== userId ||
    isLocked ||
    checkingWeekLock ||
    loading ||
    (!authorization.can('Forecasts', 'add') &&
      !authorization.can('Forecasts', 'edit'))

  function formatNumber(value: number) {
    return Number(value || 0).toLocaleString('en-PH', {
      maximumFractionDigits: 2,
    })
  }

  const canShowActions =
    authorization.can('Forecasts', 'edit') ||
    authorization.can('Forecasts', 'delete')
  const savedColumnCount = 9 + Number(canShowActions) + Number(groupSavedByKam)
  const returnNotices = uniqueReturnNotices(rows.filter((row) => row.status === 'Rejected').map((row) => {
    const info = attention?.returned.find((record) => record.id === row.id)
    const saved = forecasts.find((record) => record.id === row.id)
    return {
      reviewer: info?.reviewer || 'Reviewer', returnedBy: info?.returned_by ?? null,
      returnedAt: info?.returned_at ?? saved?.returned_at ?? null,
      reason: info?.remarks || saved?.remarks || 'No remarks provided.',
    }
  }))

  return (
    <div className="space-y-4">

      {/* ADD FORECAST */}

      {userId && role === 'Admin' && authorization.can('Forecasts', 'add') && (
        <ForecastExcelImport
          key={userId}
          userId={userId}
          isAdmin={role === 'Admin'}
          scope={{ allRegions: canChooseRegion, regionId: assignedRegionId, subregionId: assignedSubregionId }}
          blocked={pendingAction !== null}
          onBusyChange={setImportBusy}
          onImported={() => loadForecasts()}
        />
      )}

      {canCreateForecast ||
      authorization.can('Forecasts', 'edit') ? (
        <RecordDialog open={forecastDialogOpen} onClose={() => setForecastDialogOpen(false)}
          title={rows.some((row) => row.id !== null) ? 'Edit Forecast' : 'Add Forecast'} busy={loading} wide maxWidth="75rem">
        <div data-forecast-form className="app-tables min-w-0">

          <div data-section-header="" className="border-b py-4 pr-10">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
              <div>
                <h2 data-section-title="" className="text-base font-semibold"><HeadingClipboardPlus className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
                  {rows.some((row) => row.id !== null) ? 'Edit Forecast' : 'Add Forecast'}
                </h2>


              </div>

              <div className="flex flex-wrap items-center gap-3">
              <div
                className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
                  checkingWeekLock
                    ? 'bg-muted text-muted-foreground'
                    : isLocked
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                Week {week} · {year} ·{' '}
                {checkingWeekLock ? 'Checking...' : weekStatus}
              </div>
              {forecastDialogOpen && returnNotices.length > 0 && <ForecastReturnNotice key={JSON.stringify(returnNotices)} notices={returnNotices} />}
              </div>
            </div>
          </div>

          <div data-forecast-form-body className="py-6">
            <div className="mb-6 space-y-4">
              <div className="app-field-row forecast-entry-fields">
                {/* WEEK */}

                <div data-field-size="compact" className="space-y-2">
                  <label className="text-sm font-medium">
                    Week
                  </label>

                  <input
                    type="week"
                    value={selectedWeek}
                    onChange={(e) => handleWeekChange(e.target.value)}
                    disabled={loading || editingSharedForecast || adminEditingExisting}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {/* REGION */}

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Region
                  </label>

                  <SelectionField value={selectedRegionId}
                  onValueChange={(selectionValue) => {
                      setSelectedRegionId(selectionValue)
                      setSelectedSubregionId('')
                      setSelectedCustomerId('')
                    }}
                  disabled={
                      isFormDisabled ||
                      adminEditingExisting ||
                      (role !== 'Admin' && role !== 'Superuser')
                    }
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Region">
                    <option value="">Select region</option>

                    {availableRegions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </SelectionField>
                </div>

                {/* CUSTOMER */}

                <div data-field-size="wide" className="space-y-2">
                  <label className="text-sm font-medium">
                    Customer
                  </label>

                  <SearchableSelect value={selectedCustomerId}
                    options={availableCustomers.map((customer) => ({ value: String(customer.id), label: customer.customer }))}
                    onValueChange={(id) => {
                      setSelectedCustomerId(id)
                    }}
                    disabled={isFormDisabled || editingSharedForecast || adminEditingExisting || !selectedRegionId}
                    placeholder={selectedRegionId ? 'Select customer…' : 'Select a region first'}
                    className="w-full" aria-label="Customer" />


                </div>
              </div>
            </div>

            {/* FORECAST INPUT TABLE */}

            <ForecastEntryTable data-monthly-sales data-forecast-entry
              scrollToLastRowRequest={scrollToLastRowRequest}
              className="w-full min-w-0 table-fixed"
              containerProps={{ className: "w-full overflow-x-auto rounded-lg border" }}
            >
                <colgroup>{[
                  'w-[64px]',
                  'w-[40px]',
                  'w-[288px]',
                  'w-[10%]',
                  'w-[10%]',
                  'w-[10%]',
                  'w-[10%]',
                  'w-[10%]',
                  'w-[10%]',
                ].map((width, index) => (
                  <col data-action-column={index === 0 ? "single" : undefined} key={index} data-volume-column={index >= 3 ? "number" : undefined} className={index >= 3 ? undefined : width} />
                ))}</colgroup>

    <thead>
      <tr className="border-b bg-muted/30">
        <th
          colSpan={5}
          className="px-2 py-2 text-left text-sm font-semibold"
        >
          Forecast Details
        </th>

        <th
          colSpan={4}
          className="border-l border-solid border-border bg-muted/50 px-2 py-2 text-left text-sm font-semibold text-muted-foreground"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span>Monthly Reference</span>

            <div className="flex items-center gap-2">
              <label
                htmlFor="row-input-month-filter"
                className="whitespace-nowrap text-xs font-medium"
              >
              </label>

              <SelectionField id="row-input-month-filter"
                  value={selectedMonth}
                  onValueChange={(selectionValue) => setSelectedMonth(Number(selectionValue))}
                  disabled={isFormDisabled}
                  className="h-9 w-[160px] min-w-[160px] rounded-md border bg-background px-3 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Month:">
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {new Date(2000, index, 1).toLocaleString('en', {
                      month: 'long',
                    })}
                  </option>
                ))}
              </SelectionField>
            </div>
          </div>
        </th>
      </tr>

      <tr className="border-b bg-muted/40">
        <th data-action-column="single" className="whitespace-nowrap px-0 py-3 text-center font-medium">
          Action
        </th>

        <th className="whitespace-nowrap px-0 py-3 text-center font-medium">
          #
        </th>

        <th className="break-words px-1 py-3 text-left font-medium">
          Product
        </th>

        <MonthlySalesHeaders />
      </tr>
    </thead>

    <tbody>
      {rows.map((row, index) => {
        const referenceReady = Boolean(selectedRegionId && selectedCustomerId)
        const rowVolume = getRowVolume(row)
        const rowMonthlyBudget = getMonthlyBudgetForRow(row)
        const rowActualMonthly = getActualMonthlyForRow(row)
        const rowActualPreviousMonth = getActualMonthlyForRow(row, true)
        const rowForecastMonthly = getForecastMonthlyForRow(row)

        return (
          <tr key={row.tempId} className="border-b last:border-0">
            <td data-action-column="single" className="px-0 py-3 text-center">
              <TableActionButton action="delete" compact data-action-tone="danger"
                type="button"
                onClick={() => removeRow(row.tempId)}
                disabled={isFormDisabled || ((editingSharedForecast || adminEditingExisting) && row.id !== null) || !selectedCustomerId}
                className="inline-flex size-4 items-center justify-center rounded-md border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                title="Remove row"
               />
            </td>

            <td className="px-0 py-3 text-center text-muted-foreground">
              {index + 1}
            </td>

            <td className="px-1 py-3">
              <SearchableSelect value={row.product_id}
                multiline inputHeightClassName="h-10"
                options={products.map((product) => ({ value: String(product.id), label: `${product.code} - ${product.name}` }))}
                onValueChange={(id) => updateRow(row.tempId, 'product_id', id)}
                disabled={isFormDisabled || !selectedCustomerId}
                placeholder="Select product…"
                className="w-full min-w-0" aria-label="Product" />


            </td>

            <td className="px-1 py-3">
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.forecast}
                onChange={(e) =>
                  updateRow(row.tempId, 'forecast', e.target.value)
                }
                disabled={isFormDisabled || !selectedCustomerId}
                placeholder="0"
                className="h-10 w-full min-w-0 rounded-md border bg-background px-1 text-right text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </td>

            <td className="break-words px-1 py-3 text-right font-medium">
              {rowVolume === null ? '—' : <BudgetValueIndicator value={rowVolume} budgetLabel="weekly budget" budget={budgetReferencesLoading || budgetLoadError ? null : weeklyBudget(rowMonthlyBudget, year, selectedMonth)}>{formatNumber(rowVolume)}</BudgetValueIndicator>}
            </td>

            <td className="break-words border-l border-solid border-border bg-muted/30 px-1 py-3 text-right font-medium text-muted-foreground">
              {!referenceReady ? '—' : budgetReferencesLoading ? <LoadingSpinner label="budget reference" /> : budgetLoadError ? '—' : formatNumber(rowMonthlyBudget)}
            </td>

            <td className="break-words bg-muted/30 px-1 py-3 text-right font-medium text-muted-foreground">
              {!referenceReady ? '—' : selectedActualsLoading ? <LoadingSpinner label="actual reference" /> : <BudgetValueIndicator value={selectedActualsError ? null : rowActualMonthly} budget={budgetReferencesLoading || budgetLoadError ? null : rowMonthlyBudget}>{formatNumber(rowActualMonthly)}</BudgetValueIndicator>}
            </td>

            <td className="break-words bg-muted/30 px-1 py-3 text-right font-medium text-muted-foreground">
              {!referenceReady ? '—' : selectedActualsLoading ? <LoadingSpinner label="previous-month actual reference" /> : <BudgetValueIndicator value={selectedActualsError ? null : rowActualPreviousMonth} budget={budgetReferencesLoading || budgetLoadError ? null : rowMonthlyBudget}>{formatNumber(rowActualPreviousMonth)}</BudgetValueIndicator>}
            </td>

            <td className="break-words bg-muted/30 px-1 py-3 text-right font-medium text-muted-foreground">
              {!referenceReady ? '—' : <BudgetValueIndicator value={forecastLoadError ? null : rowForecastMonthly} loading={savedTableLoading || initializing} budget={budgetReferencesLoading || budgetLoadError ? null : rowMonthlyBudget}>{formatNumber(rowForecastMonthly)}</BudgetValueIndicator>}
            </td>
          </tr>
        )
      })}
    </tbody>

    <tfoot>
      <tr className="border-t bg-muted/30">
        <td colSpan={2} className="px-2 py-4 text-left">
          <button data-action-tone="primary"
            type="button"
            onClick={addRow}
            disabled={
              isFormDisabled ||
              ((editingSharedForecast || adminEditingExisting) && !canAddToExistingForecast) ||
              !selectedCustomerId ||
              !canCreateForecast
            }
            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            Add Row
          </button>
        </td>

        <td className="px-1 py-4 text-right font-semibold">
          Total
        </td>

        <td className="break-words px-1 py-4 text-right font-semibold">
          {formatNumber(totalForecast)}
        </td>

        <td className="break-words px-1 py-4 text-right font-semibold">
          {formatNumber(totalVolume)}
        </td>

        <td className="border-l border-solid border-border bg-muted/30 px-1 py-4" />
        <td className="bg-muted/30 px-1 py-4" />
        <td className="bg-muted/30 px-1 py-4" />
        <td className="bg-muted/30 px-1 py-4" />
      </tr>
    </tfoot>
            </ForecastEntryTable>

            <div data-action-toolbar="" className="mt-5 flex flex-wrap items-center gap-2">
              <button data-action-tone="primary" data-action-fill=""
                type="button"
                onClick={handleSave}
                disabled={
                  isFormDisabled ||
                  (!authorization.can('Forecasts', 'add') &&
                    !authorization.can('Forecasts', 'edit'))
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="size-4" />
                {pendingAction === 'save' ? 'Saving...' : rows.some((row) => row.status === 'Rejected') ? 'Save Changes' : 'Save as Draft'}
              </button>
              <button data-action-tone="neutral" type="button" onClick={handleClear}
                disabled={loading || initializing || workspaceOwner !== userId}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
                <RotateCcw className="size-4" aria-hidden="true" />
                Clear
              </button>
            </div>

            {/* WEEK LOCK */}

            {isLocked && (
              <div className="mt-5 rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-sm font-medium">
                  Week {week} - {year} is locked.
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Forecast entries cannot be added, edited, or submitted for
                  this week.
                </p>
              </div>
            )}


          </div>
        </div>
        </RecordDialog>
      ) : null}

      {canCreateForecast && (
        <div className="flex justify-end">
          <button type="button" data-action-tone="primary" data-action-fill=""
            disabled={loading || initializing || workspaceOwner !== userId}
            onClick={() => {
              if (rows.some((row) => row.id !== null)) handleClear()
              setForecastDialogOpen(true)
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Plus className="size-4" aria-hidden="true" />Add Forecast
          </button>
        </div>
      )}

      {/* SAVED FORECASTS */}

      <div id="saved-forecasts" className="scroll-mt-4 rounded-xl border bg-card shadow-sm">
        <div data-section-header="" className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 data-section-title="" className="text-base font-semibold"><HeadingArchive className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
              Saved Forecasts
            </h2>


          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              Status
              <SelectionField value={savedStatusFilter}
                  onValueChange={(selectionValue) => setSavedStatusFilter(selectionValue)}
                  className="h-9 w-44 rounded-md border bg-background px-3 text-sm"
                  aria-label="Status">
                <option value="">All open statuses</option>
                <option value="all">All statuses</option>
                {Object.entries(savedStatusLabels).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </SelectionField>
            </label>
          {!groupSavedByKam && canSubmitForecasts &&
            (!savedStatusFilter || savedStatusFilter === 'Draft') &&
            eligibleSubmissionCount > 0 && (
              <button data-action-tone="transfer" data-action-fill=""
                type="button"
                onClick={handleSubmitAll}
                disabled={loading}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
                {pendingAction === 'submitAll' ? 'Submitting...' : eligibleSubmissionCustomers > 1 ? `Submit All (${eligibleSubmissionCustomers})` : 'Submit All'}
              </button>
            )}
          <button data-slot="expand-collapse-button"
            type="button"
            data-action-tone="neutral"
            onClick={() => {
              setExpandedCustomers(new Set(allSavedCustomersExpanded ? [] : savedCustomers.map((customer) => customer.key)))
              setCollapsedKams(new Set(allSavedCustomersExpanded && groupSavedByKam
                ? savedWeekGroups.flatMap((weekGroup) => weekGroup.customers.map((customer) => savedKamGroupKey(weekGroup.key, customer.items[0].user_id)))
                : []))
            }}
            disabled={savedCustomers.length === 0}
            className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          ><ExpandCollapseIcon expanded={allSavedCustomersExpanded} />
            {allSavedCustomersExpanded ? 'Collapse All' : 'Expand All'}
          </button>


          </div>
        </div>




      {/* SAVED FORECAST TABLE */}

        <Table summary={{ records: savedCustomers.reduce((count, customer) => count + customer.items.length, 0), customers: totalSavedCustomers }} data-volume-layout="forecast" saved aria-busy={savedTableLoading || initializing}
          className="table-fixed"
          containerProps={{ className: "max-h-[min(32rem,65vh)] w-full overflow-auto", tabIndex: 0, role: "region", "aria-label": "Saved Forecasts table" }}
        >
            <colgroup>
              {canShowActions && <col data-action-column="forecast" />}
              <col data-volume-column="status" className="w-[6%]" />
              {groupSavedByKam && <col data-volume-column="area" />}
              {/* Flexible description columns absorb spare width instead of Action. */}
              <col data-volume-column="customer" />
              <col data-volume-column="product" />
              {Array.from({ length: 6 }, (_, index) => <col key={index} data-volume-column="number" className="w-[6%]" />)}
            </colgroup>

            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b bg-muted/40">
                {canShowActions && (
                  <th data-action-column="forecast" className="whitespace-nowrap px-2 py-3 text-center font-medium">
                    Action
                  </th>
                )}

                <th className="px-2 py-3 text-center font-medium">
                  Status
                </th>
                {groupSavedByKam && <th className="px-2 py-3 text-left font-medium">Area</th>}

                <th className="px-2 py-3 text-left font-medium">
                  Customer
                </th>

                <th className="px-2 py-3 text-left font-medium">
                  Product
                </th>

                <MonthlySalesHeaders />
              </tr>
            </thead>

            <tbody>
              {savedTableLoading || initializing ? (
                <TableLoadingRow columns={savedColumnCount} label="saved forecasts" />
              ) : savedWeekGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={savedColumnCount}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No forecasts match the current filters.
                  </td>
                </tr>
              ) : (
                savedWeekGroups.map((weekGroup) => (
                  <Fragment key={weekGroup.key}>
                    {/* WEEK GROUP HEADER */}

                    <tr className="border-b bg-muted/50">
                      <td
                        colSpan={savedColumnCount}
                        className="px-3 py-2 font-semibold"
                      >
                        Week {weekGroup.week}, {weekGroup.year} (
                        {getWeekDateLabel(
                          weekGroup.year,
                          weekGroup.week
                        )})
                      </td>
                    </tr>

                    {weekGroup.customers.map((customerGroup, index) => {
                      const ownerId = customerGroup.items[0].user_id
                      const kamKey = savedKamGroupKey(weekGroup.key, ownerId)
                      const kamExpanded = !collapsedKams.has(kamKey)
                      const startsKam = groupSavedByKam && (index === 0 || weekGroup.customers[index - 1].items[0].user_id !== ownerId)
                      const kamCustomers = startsKam ? weekGroup.customers.filter((group) => group.items[0].user_id === ownerId) : []
                      const kamItems = kamCustomers.flatMap((group) => group.items)
                      const kamAreas = [...new Set(kamItems.map((item) =>
                        subregions.find((area) => area.id === item.subregion_id)?.name
                        ?? regions.find((area) => area.id === item.region_id)?.name ?? '—'))]
                      const kamScopes = [...new Map(kamItems.map((item) => [JSON.stringify([item.region_id, item.customer_id]), item])).values()]
                      const kamBudget = kamScopes.reduce((total, item) => total + customerMonthlyBudgetReference(budgets, item.year,
                        getMonthForWeek(item.year, item.week), item.region_id, null, item.customer_id), 0)
                      const kamTotals = [
                        kamItems.reduce((total, item) => total + Number(item.forecast || 0), 0),
                        kamItems.reduce((total, item) => total + Number(item.volume || 0), 0),
                        kamBudget,
                        kamScopes.reduce((total, item) => total + getSavedActualMonthly(item, false, true), 0),
                        kamScopes.reduce((total, item) => total + getSavedActualMonthly(item, true, true), 0),
                        kamScopes.reduce((total, item) => total + getSavedForecastMonthly(item, true), 0),
                      ]
                      const kamHeading = startsKam ? <Fragment key={kamKey}><tr className="border-b bg-muted/60">
                        <td colSpan={savedColumnCount} className="px-3 py-2">
                          <button type="button" aria-expanded={kamExpanded} onClick={() => setCollapsedKams((current) => {
                            const next = new Set(current)
                            if (next.has(kamKey)) next.delete(kamKey)
                            else next.add(kamKey)
                            return next
                          })} className="flex w-full items-center gap-2 text-left font-semibold">
                            {kamExpanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                            <span>KAM: {savedOwnerNames[ownerId] ?? 'Unknown KAM'}</span>
                          </button>
                        </td>
                      </tr>
                        <tr className="border-b bg-muted/30 font-semibold">
                          {canShowActions && <td data-action-column="forecast" className="px-2 py-2" />}
                          <td className="px-2 py-2 text-center"><div className="flex flex-wrap items-center justify-center gap-1">
                            {[...new Set(kamItems.map((item) => item.status))].map((status) => <StatusBadge key={status} status={savedStatusLabels[status as keyof typeof savedStatusLabels]} compact={new Set(kamItems.map((item) => item.status)).size > 1} />)}
                          </div></td>
                          <td className="px-2 py-2">{kamAreas.join(', ')}</td>
                          <td className="px-2 py-2">{new Set(kamItems.map((item) => item.customer_id)).size} {new Set(kamItems.map((item) => item.customer_id)).size === 1 ? 'Customer' : 'Customers'}</td>
                          <td className="px-2 py-2">{new Set(kamItems.map((item) => item.product_id)).size} {new Set(kamItems.map((item) => item.product_id)).size === 1 ? 'Product' : 'Products'}</td>
                          {kamTotals.map((value, index) => <td key={index} className="px-2 py-2 text-right tabular-nums">
                            {index === 2 && budgetReferencesLoading ? <LoadingSpinner label="budget reference" />
                              : index === 2 && budgetLoadError ? '—'
                              : (index === 3 || index === 4) && savedActualsLoading ? <LoadingSpinner label="actual reference" />
                              : (index === 3 || index === 4) && savedActualsError ? '—'
                              : index === 1 || index >= 3 ? <BudgetValueIndicator value={value} budget={budgetReferencesLoading || budgetLoadError ? null : index === 1 ? weeklyBudget(kamBudget, weekGroup.year, getMonthForWeek(weekGroup.year, weekGroup.week)) : kamBudget}>{formatNumber(value)}</BudgetValueIndicator>
                              : formatNumber(value)}
                          </td>)}
                        </tr>
                      </Fragment> : null
                      if (groupSavedByKam && !kamExpanded) return kamHeading
                      const isExpanded = expandedCustomers.has(
                        customerGroup.key
                      )

                      const allItems = customerGroup.items

                      const customerForecast = allItems.reduce(
                        (total, item) =>
                          total + (Number(item.forecast) || 0),
                        0
                      )

                      const customerVolume = allItems.reduce(
                        (total, item) =>
                          total + (Number(item.volume) || 0),
                        0
                      )

                      // Customer references include every product in the month,
                      // independent of the saved rows currently visible below.
                      const customerScopes = [...new Map(allItems.map((item) =>
                        [item.region_id, item])).values()]
                      const customerBudget = customerScopes.reduce((total, item) =>
                        total + customerMonthlyBudgetReference(budgets, item.year,
                          getMonthForWeek(item.year, item.week), item.region_id, null, item.customer_id), 0)
                      const customerActualMonthly = customerScopes.reduce((total, item) =>
                        total + getSavedActualMonthly(item, false, true), 0)
                      const customerActualPreviousMonth = customerScopes.reduce((total, item) =>
                        total + getSavedActualMonthly(item, true, true), 0)
                      const customerForecastMonthly = customerScopes.reduce((total, item) =>
                        total + getSavedForecastMonthly(item, true), 0)

                      const status = allItems[0].status as keyof typeof savedStatusLabels
                      const customerStatus = savedStatusLabels[status]
                      const editable = allItems.every((item) => (isAdmin || item.user_id === userId) && isEditableForecast(item))
                      const rsmCanRevise = authorization.can('Forecasts', 'edit') && allItems.every((item) =>
                        isAdmin ? isEditableForecast(item) : canReviseRsmForecast(item, { role, position: salesPosition, regionId: assignedRegionId, subregionId: assignedSubregionId }))

                      const customerCanEdit =
                        !groupSavedByKam && editable && authorization.can('Forecasts', 'edit')

                      const customerCanDelete =
                        (isAdmin || !groupSavedByKam) && editable && allItems.every((item) => canDeleteSavedForecastStatus(item.status)) && authorization.can('Forecasts', 'delete')
                      const customerCanSubmit =
                        (!groupSavedByKam && canSubmitForecasts && allItems.some(canSubmitItem)) ||
                        (rsmCanRevise && allItems.every((item) => item.status === 'Draft'))

                      return (
                        <Fragment key={customerGroup.key}>
                          {kamHeading}
                          {/* CUSTOMER SUMMARY ROW */}

                          <tr className="border-b bg-background hover:bg-muted/30">
                            {canShowActions && (
                              <td data-action-column="forecast" className="px-2 py-3 text-center">
                                <div className="flex flex-wrap items-center justify-center gap-1">
                                  {(rsmCanRevise || customerCanEdit) && <TableActionButton action="edit" data-action-tone="caution" type="button" count={actionGroupCount(allItems, 'customer')} onClick={() => handleEditCustomer(allItems)} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40" title="Edit customer forecasts" />}
                                  {customerCanDelete && <TableActionButton action="delete" data-action-tone="danger" type="button" count={actionGroupCount(allItems, 'customer')} onClick={() => handleDeleteMany(allItems)} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40" title="Delete customer forecasts" />}
                                  {customerCanSubmit && <TableActionButton action="submit" data-action-tone="transfer" type="button" count={actionGroupCount(allItems, 'customer')} onClick={() => handleSubmitCustomer(allItems)} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40" title="Submit customer forecasts" />}
                                </div>
                              </td>
                            )}

                            <td className="px-2 py-3 text-center">
                              <StatusBadge status={customerStatus} />
                            </td>
                            {groupSavedByKam && <td className="px-2 py-3" />}

                            <td className="px-2 py-3">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleCustomer(customerGroup.key)
                                }
                                className="flex w-full min-w-0 items-center gap-2 text-left font-semibold hover:text-primary"
                                title={
                                  isExpanded
                                    ? 'Collapse customer'
                                    : 'Expand customer'
                                }
                              >
                                {isExpanded ? (
                                  <ChevronDown className="size-4 shrink-0" />
                                ) : (
                                  <ChevronRight className="size-4 shrink-0" />
                                )}

                                <span className="min-w-0 wrap-anywhere">
                                  {getCustomerName(
                                    customerGroup.customer_id
                                  )}
                                </span>

                              </button>
                            </td>

                            <td className="px-2 py-3 text-muted-foreground tabular-nums">
                              {formatNumber(customerGroup.products.length)} {customerGroup.products.length === 1 ? 'Product' : 'Products'}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold">
                              {formatNumber(customerForecast)}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold">
                              <BudgetValueIndicator value={customerVolume} budgetLabel="weekly budget" budget={budgetReferencesLoading || budgetLoadError ? null : weeklyBudget(customerBudget, weekGroup.year, getMonthForWeek(weekGroup.year, weekGroup.week))}>{formatNumber(customerVolume)}</BudgetValueIndicator>
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-muted-foreground">
                              {budgetReferencesLoading ? <LoadingSpinner label="budget reference" /> : budgetLoadError ? '—' : formatNumber(customerBudget)}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-muted-foreground">
                              {savedActualsLoading ? <LoadingSpinner label="actual reference" /> : savedActualsError ? '—' : <BudgetValueIndicator value={customerActualMonthly} budget={budgetReferencesLoading || budgetLoadError ? null : customerBudget}>{formatNumber(customerActualMonthly)}</BudgetValueIndicator>}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-muted-foreground">
                              {savedActualsLoading ? <LoadingSpinner label="actual reference" /> : savedActualsError ? '—' : <BudgetValueIndicator value={customerActualPreviousMonth} budget={budgetReferencesLoading || budgetLoadError ? null : customerBudget}>{formatNumber(customerActualPreviousMonth)}</BudgetValueIndicator>}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-muted-foreground">
                              {<BudgetValueIndicator value={forecastLoadError ? null : customerForecastMonthly} loading={savedTableLoading || initializing} budget={budgetReferencesLoading || budgetLoadError ? null : customerBudget}>{formatNumber(customerForecastMonthly)}</BudgetValueIndicator>}
                            </td>
                          </tr>

                          {/* EXPANDED PRODUCT ROWS */}

                          {isExpanded &&
                            customerGroup.products.map((productGroup) => {
                              return (
                                <tr
                                  key={productGroup.key}
                                  className="border-b bg-muted/20 last:border-0 hover:bg-muted/40"
                                >
                                  {canShowActions && <td data-action-column="forecast" className="px-2 py-2" />}

                                  <td className="px-2 py-2" />

                                  {/* Customer is shown once on the customer row. */}
                                  {groupSavedByKam && <td className="px-2 py-2" />}

                                  <td className="px-2 py-2" />

                                  <td
                                    className="px-2 py-2"
                                    title={getProductName(
                                      productGroup.product_id
                                    )}
                                  >
                                    <div className="flex min-w-0 items-center gap-2 pl-5">
                                      <span className="text-muted-foreground">
                                        ↳
                                      </span>
                                      <span className="min-w-0 text-xs">
                                        {getProductName(
                                          productGroup.product_id
                                        )}
                                      </span>
                                    </div>
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right">
                                    {formatNumber(productGroup.forecast)}
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right">
                                    <BudgetValueIndicator value={productGroup.volume} budgetLabel="weekly budget" budget={budgetReferencesLoading || budgetLoadError ? null : weeklyBudget(productGroup.budget, weekGroup.year, getMonthForWeek(weekGroup.year, weekGroup.week))}>{formatNumber(productGroup.volume)}</BudgetValueIndicator>
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                                    {budgetReferencesLoading ? <LoadingSpinner label="budget reference" /> : budgetLoadError ? '—' : formatNumber(productGroup.budget)}
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                                    {savedActualsLoading ? <LoadingSpinner label="actual reference" /> : savedActualsError ? '—' : <BudgetValueIndicator value={productGroup.actualMonthly} budget={budgetReferencesLoading || budgetLoadError ? null : productGroup.budget}>{formatNumber(productGroup.actualMonthly)}</BudgetValueIndicator>}
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                                    {savedActualsLoading ? <LoadingSpinner label="actual reference" /> : savedActualsError ? '—' : <BudgetValueIndicator value={productGroup.actualPreviousMonth} budget={budgetReferencesLoading || budgetLoadError ? null : productGroup.budget}>{formatNumber(productGroup.actualPreviousMonth)}</BudgetValueIndicator>}
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                                    {<BudgetValueIndicator value={forecastLoadError ? null : productGroup.forecastMonthly} loading={savedTableLoading || initializing} budget={budgetReferencesLoading || budgetLoadError ? null : productGroup.budget}>{formatNumber(productGroup.forecastMonthly)}</BudgetValueIndicator>}
                                  </td>
                                </tr>
                              )
                            })}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
        </Table>

      </div>
    </div>
  )
}
