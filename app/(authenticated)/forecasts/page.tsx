'use client'

import { SalesHierarchyTable, type SalesHierarchyRow } from '@/components/ui/sales-hierarchy-table'
import { loadMonthlyReferences, monthlyReferenceKey, type MonthlyReference } from '@/lib/sales-monthly-references'

import { weeklyBudget } from '@/lib/weekly-budget'
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
import { HeaderExpandCollapseButton } from '@/components/ui/expand-collapse-icon'
import { useActionDialogs } from '@/components/action-dialogs'
import { confirmationRecordDetails } from '@/lib/action-confirmation'
import { customerMonthlyBudgetReference, monthlyBudgetReference } from '@/lib/monthly-budget-reference'
import { forecastSubmissionConfirmation } from '@/lib/forecast-submission-confirmation'
import { ForecastConfirmationSummary } from '@/components/forecast-confirmation-summary'
import { SelectionField } from '@/components/ui/selection-field'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { TableActionButton } from '@/components/ui/table-action-button'
import { ForecastEntryTable } from '@/components/forecast-entry-table'
import { ForecastReturnNotice } from '@/components/forecast-return-notice'
import { canReviseRsmForecast, canSubmitRsmForecast, rsmRevisionPayload } from '@/lib/rsm-returned-forecasts'
import { savedCustomerGroupKey, savedKamGroupKey } from '@/lib/saved-forecast-kam-groups'
import { RecordDialog } from '@/components/ui/record-dialog'
import { useForecastAttention } from '@/lib/use-forecast-attention'
import { MonthlySalesHeaders } from '@/components/ui/monthly-sales-columns'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { ForecastExcelImport } from '@/components/forecast-excel-import'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Save,
  Send,
  RotateCcw,
  RefreshCw,
  Ban,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/client'
import { loadActualRecords, type ActualRecord } from '@/lib/actual-records'
import { useAuthorization } from '@/lib/authorization'
import { loadForecastWeekStates } from '@/lib/forecast-week-locks'
import { currentWeekInput, salesWeekRange, weekDateRangeLabel } from '@/lib/forecast-weeks'

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
  void_reason?: string | null
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
  const { confirmAction, notify } = useActionDialogs()

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
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [products, setProducts] = useState<Product[]>([])
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [budgetLoadError, setBudgetLoadError] = usePopupError()
  const [forecasts, setForecasts] = useState<SalesForecast[]>([])
  const [voidingForecasts, setVoidingForecasts] = useState<SalesForecast[] | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidScope, setVoidScope] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
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
  const loading = pendingAction !== null || importBusy || voidBusy
  const [, setError] = usePopupError()
  const setMessage = useStatusNotification()
  const [savedStatusFilter, setSavedStatusFilter] = useState('all')
  const [initialSavedWeekRange] = useState(() => salesWeekRange())
  const [savedFromWeek, setSavedFromWeek] = useState(initialSavedWeekRange.fromWeek)
  const [savedToWeek, setSavedToWeek] = useState(initialSavedWeekRange.toWeek)
  const [savedRegionFilter, setSavedRegionFilter] = useState('all')
  const canFilterAllSavedRegions = role === 'Admin' || salesPosition.trim().toUpperCase() === 'NSM'
  const effectiveSavedRegion = canFilterAllSavedRegions ? savedRegionFilter : String(assignedRegionId ?? '')
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
  const [savedMonthlyReferences, setSavedMonthlyReferences] = useState<Map<string, MonthlyReference>>(new Map())
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
          returned_at,
          void_reason
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
    setSavedMonthlyReferences(new Map())
    try {
      const references = await loadMonthlyReferences(supabase, allForecasts.map((item) => item.id), 'saved')
      if (request !== savedActualRequest.current) return
      setSavedMonthlyReferences(references)

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

  function getSavedActualMonthly(item: SalesForecast, previous = false, customerLevel = false) {
    const reference = savedMonthlyReferences.get(monthlyReferenceKey(item.id, customerLevel ? 'customer' : 'product'))
    return Number((previous ? reference?.previous_actual_volume : reference?.actual_volume) ?? NaN)
  }

  function getSavedMonthlyBudget(item: SalesForecast) {
    return Number(savedMonthlyReferences.get(monthlyReferenceKey(item.id, 'product'))?.budget_volume ?? NaN)
  }

  function getSavedForecastMonthly(item: SalesForecast, customerLevel = false) {
    return Number(savedMonthlyReferences.get(monthlyReferenceKey(item.id, customerLevel ? 'customer' : 'product'))?.forecast_volume ?? NaN)
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
      const existing = findExistingForecast(row, forecasts)
      if (!existing) continue
      const product = products.find((item) => item.id === row.product_id)
      const customer = customers.find((item) => item.id === row.customer_id)
      setPendingAction(null)
      const guidance = existing.status === 'Draft' || existing.status === 'Rejected'
        ? `The existing forecast is ${existing.status === 'Rejected' ? 'Returned' : 'Draft'}. Open Saved Forecasts and edit the existing record instead of adding it again.`
        : existing.status === 'Approved'
          ? 'The existing forecast is Approved and cannot be edited.'
          : existing.status === 'Pending'
            ? 'The existing forecast is Pending. Please wait for endorsement/approval; it cannot be edited while under review.'
            : existing.status === 'Endorsed'
              ? 'The existing forecast is Endorsed. Please wait for approval; it cannot be edited while under review.'
              : 'The existing forecast cannot be added again. Check its status in Saved Forecasts.'
      setError(`Row ${index + 1}: ${product?.code || 'This product'} already has a forecast for ${customer?.customer || 'this customer'} in Week ${week}, ${year}. ${guidance}`)
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
    setSavedStatusFilter('')
    setMessage(editingSharedForecast ? 'Changes saved as Draft. Use Submit in Saved Forecasts to send the corrected forecasts for RSM review.' : revised ? 'Changes saved as Draft. Use Submit in Saved Forecasts to send the corrected forecasts back to your RSM.' : 'Forecasts saved successfully.')
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
    if (isAdmin) return authorization.can('Forecasts', 'edit') && item.status === 'Draft'
    if (isRsmSavedViewer) return canSubmitRsmForecast(item, {
      role, position: salesPosition, regionId: assignedRegionId, subregionId: assignedSubregionId,
      userId, canEdit: authorization.can('Forecasts', 'edit'),
    })
    return item.status === 'Draft' && item.user_id === userId &&
      (!customerAssignmentRestricted || customers.some((customer) => customer.id === item.customer_id)) &&
      item.region_id !== null &&
      (isAdmin || (item.region_id === assignedRegionId && item.subregion_id === assignedSubregionId))
  }

  async function handleSubmitCustomer(items: SalesForecast[], scopeLabel?: string) {
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
    if (!(actionConfirmation = await confirmAction(forecastSubmissionConfirmation(eligibleItems, scopeLabel ?? getCustomerName(eligibleItems[0].customer_id), getCustomerName, getProductName)))) return
    setPendingAction('submit')
    setSavedError('')
    setSavedMessage('')
    const { data, error } = rsmResubmission || adminSubmission ? await supabase.rpc(adminSubmission ? 'submit_admin_saved_forecasts' : 'submit_rsm_returned_forecasts', {
      p_records: rsmRevisionPayload(eligibleItems, eligibleItems.map((item) => ({
        id: item.id, product_id: Number(item.product_id), forecast: Number(item.forecast),
      }))),
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

  async function handleDeleteMany(items: SalesForecast[], scope: 'customer' | 'product' | 'kam' = 'customer', scopeLabel?: string) {
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
    const confirmed = (actionConfirmation = await confirmAction({
      message: `Remove ${items.length} draft forecast record(s) ${scope === 'kam' ? 'for this KAM and week' : scope === 'customer' ? 'for this customer' : 'for this product'}?`,
      details: [...(scope === 'kam' ? [{ label: 'KAM', value: scopeLabel ?? 'Selected KAM' }] : []), ...confirmationRecordDetails(items, 'Total volume (50kg)')],
    }))
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

  async function handleVoidForecasts(event: React.FormEvent) {
    event.preventDefault()
    if (!voidingForecasts?.length || loading || !isAdmin || !authorization.can('Forecasts','view') || !authorization.can('Forecasts','delete')) return
    if (voidReason.trim().length < 3) { setSavedError('Enter a reason for voiding these forecasts.'); return }
    try {
      setVoidBusy(true)
      const { data,error } = await supabase.rpc('void_approved_forecasts', {
        p_records:voidingForecasts.map(item=>({id:item.id,original:item})), p_reason:voidReason.trim(),
      })
      if (error) throw new Error(error.message)
      setVoidingForecasts(null); setVoidReason('')
      await loadForecasts()
      setSavedMessage(`${Number(data)} approved forecast record(s) voided.`)
    } catch (error) { setSavedError(error instanceof Error ? error.message : 'Unable to void forecasts.') }
    finally { setVoidBusy(false) }
  }

  async function handleSubmitAll() {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!canSubmitForecasts) return

    setSavedError('')
    setSavedMessage('')

    const draftForecasts = visibleSavedForecasts.filter(canSubmitItem)

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

    const confirmed = (actionConfirmation = await confirmAction(forecastSubmissionConfirmation(draftForecasts, 'All Filtered Draft Forecasts', getCustomerName, getProductName)))

    if (!confirmed) {
      setPendingAction(null)
      return
    }

    const { data, error: submitError } = isRsmSavedViewer || isAdmin ? await supabase.rpc(isAdmin ? 'submit_admin_saved_forecasts' : 'submit_rsm_returned_forecasts', {
      p_records: rsmRevisionPayload(draftForecasts, draftForecasts.map((item) => ({
        id: item.id, product_id: Number(item.product_id), forecast: Number(item.forecast),
      }))),
    }) : await supabase.rpc('transition_forecast_review', {
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

  const visibleSavedForecasts = useMemo(() => forecasts.filter((item) => {
    const week = `${item.year}-W${String(item.week).padStart(2, '0')}`
    return (isAdmin || !customerAssignmentRestricted || customers.some((customer) => customer.id === item.customer_id)) &&
    savedForecastMatchesStatus(item, savedStatusFilter) &&
    (effectiveSavedRegion === 'all' || (effectiveSavedRegion !== '' && item.region_id === Number(effectiveSavedRegion))) &&
    (!savedFromWeek || week >= savedFromWeek) && (!savedToWeek || week <= savedToWeek)
  }), [forecasts, savedStatusFilter, savedFromWeek, savedToWeek, effectiveSavedRegion, customerAssignmentRestricted, customers, isAdmin])

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
  }, [visibleSavedForecasts, forecasts, budgets, savedMonthlyReferences, groupSavedByKam, savedOwnerNames])

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
      (salesPosition === 'KAM' || salesPosition === 'Supervisor' || isRsmSavedViewer) &&
      assignedRegionId !== null && assignedSubregionId !== null
    ))
  const eligibleSubmissionCount = visibleSavedForecasts.filter(canSubmitItem).length

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

  const forecastProductOptions = useMemo(() => {
    const customerId = Number(selectedCustomerId)
    const regionId = Number(selectedRegionId)
    const owner = existingForecastOwner ?? (isAdmin ? null : userId)
    const recent = new Map<number, number>()
    const remember = (productId: number | null, date: number) => {
      if (productId !== null) recent.set(productId, Math.max(recent.get(productId) ?? 0, date))
    }
    for (const item of budgets) if (item.customer_id === customerId && item.region_id === regionId) remember(item.product_id, Date.UTC(item.year, (item.month ?? 1) - 1, 1))
    for (const item of actualRecords) if (item.customer_id === customerId && item.region_id === regionId) remember(item.product_id, Date.parse(item.actual_date))
    for (const item of forecasts) if (item.customer_id === customerId && item.region_id === regionId && (!owner || item.user_id === owner)) {
      const januaryFourth = new Date(Date.UTC(item.year, 0, 4))
      remember(item.product_id, Date.UTC(item.year, 0, 4 - (januaryFourth.getUTCDay() + 6) % 7 + (item.week - 1) * 7))
    }
    return [...products].sort((a, b) => Number(recent.has(b.id)) - Number(recent.has(a.id)) || (recent.get(b.id) ?? 0) - (recent.get(a.id) ?? 0) || a.name.localeCompare(b.name))
      .map((product) => ({ value: String(product.id), label: `${product.code} - ${product.name}`, group: recent.has(product.id) ? 'Customer products' : 'Other products' }))
  }, [products, budgets, actualRecords, forecasts, selectedCustomerId, selectedRegionId, existingForecastOwner, isAdmin, userId])

  function formatNumber(value: number) {
    return Number(value || 0).toLocaleString('en-PH', {
      maximumFractionDigits: 2,
    })
  }



  function savedHierarchyRows(): SalesHierarchyRow[] {
    const result: SalesHierarchyRow[]=[]
    const statuses=(items:SalesForecast[])=>[...new Set(items.map(item=>item.status))].map(status=><StatusBadge key={status} status={savedStatusLabels[status as keyof typeof savedStatusLabels]} compact />)
    const area=(items:SalesForecast[])=>[...new Set(items.map(item=>subregions.find(value=>value.id===item.subregion_id)?.name??regions.find(value=>value.id===item.region_id)?.name??'—'))].join(', ')
    const groupValues=(items:SalesForecast[],level:'kam'|'customer')=>{
      const scopes=[...new Map(items.map(item=>[JSON.stringify([item.region_id,item.subregion_id]),item])).values()]
      return [items.reduce((sum,item)=>sum+(item.status==='Voided'?0:Number(item.forecast||0)),0),items.reduce((sum,item)=>sum+(item.status==='Voided'?0:Number(item.volume||0)),0),
        ...(['budget_volume','actual_volume','previous_actual_volume','forecast_volume'] as const).map(field=>scopes.reduce((sum,item)=>sum+Number(savedMonthlyReferences.get(monthlyReferenceKey(item.id,level))?.[field]??NaN),0))]
    }
    const actions=(items:SalesForecast[])=>{
      const editable=items.every(item=>(isAdmin||item.user_id===userId)&&isEditableForecast(item))
      const canRevise=authorization.can('Forecasts','edit')&&items.every(item=>isAdmin?isEditableForecast(item):canReviseRsmForecast(item,{role,position:salesPosition,regionId:assignedRegionId,subregionId:assignedSubregionId}))
      const canEdit=canRevise||(!groupSavedByKam&&editable&&authorization.can('Forecasts','edit'))
      const canDelete=(isAdmin||!groupSavedByKam)&&editable&&items.every(item=>canDeleteSavedForecastStatus(item.status))&&authorization.can('Forecasts','delete')
      const canSubmit=(!groupSavedByKam&&canSubmitForecasts&&items.some(canSubmitItem))||(canRevise&&items.every(item=>item.status==='Draft'))
      const approved=items.filter(item=>item.status==='Approved')
      return <>
        {canEdit&&<TableActionButton compact action="edit" onClick={()=>handleEditCustomer(items)} disabled={loading} title="Edit customer forecasts"/>}
        {canDelete&&<TableActionButton compact action="delete" onClick={()=>handleDeleteMany(items)} disabled={loading} title="Delete customer forecasts"/>}
        {canSubmit&&<TableActionButton compact action="submit" onClick={()=>handleSubmitCustomer(items)} disabled={loading} title="Submit customer forecasts"/>}
        {isAdmin&&authorization.can('Forecasts','view')&&authorization.can('Forecasts','delete')&&approved.length>0&&<TableActionButton compact action="void" disabled={loading} title="Void approved forecasts" onClick={()=>{setVoidScope('Customer: '+getCustomerName(approved[0].customer_id));setVoidReason('');setVoidingForecasts(approved)}}/>}
      </>
    }
    for(const weekGroup of savedWeekGroups){
      result.push({key:'week-'+weekGroup.key,kind:'week',label:<>Week {weekGroup.week}, {weekGroup.year} ({getWeekDateLabel(weekGroup.year,weekGroup.week)})</>})
      const seen=new Set<string>()
      for(const customer of weekGroup.customers){
        const owner=customer.items[0].user_id
        const kamKey=savedKamGroupKey(weekGroup.key,owner)
        if(groupSavedByKam&&!seen.has(owner)){
          seen.add(owner)
          const items=weekGroup.customers.filter(group=>group.items[0].user_id===owner).flatMap(group=>group.items)
          const eligible=items.filter(canSubmitItem)
          const deletable=authorization.can('Forecasts','delete') ? items.filter(item=>
            canDeleteSavedForecastStatus(item.status) && (isAdmin || (item.user_id===userId && (role!=='Manager'||item.region_id===assignedRegionId)))) : []
          const canSubmitKam=(isAdmin||isRsmSavedViewer)&&eligible.length>0
          const voidable=isAdmin&&authorization.can('Forecasts','view')&&authorization.can('Forecasts','delete') ? items.filter(item=>item.status==='Approved') : []
          const values=groupValues(items,'kam')
          result.push({key:kamKey,kind:'group',depth:0,label:'KAM: '+(savedOwnerNames[owner]??'Unknown KAM'),area:area(items),status:statuses(items),values,
            expanded:!collapsedKams.has(kamKey),onToggle:()=>setCollapsedKams(current=>{const next=new Set(current);if(next.has(kamKey))next.delete(kamKey);else next.add(kamKey);return next}),
            actions:deletable.length>0||canSubmitKam||voidable.length>0 ? <>
              {deletable.length>0&&<TableActionButton compact action="delete" disabled={loading} title="Delete KAM drafts" onClick={()=>handleDeleteMany(deletable,'kam',savedOwnerNames[owner]??'Unknown KAM')}/>}
              {canSubmitKam&&<TableActionButton compact action="submit" disabled={loading} title="Submit KAM forecasts" onClick={()=>handleSubmitCustomer(eligible,'KAM: '+(savedOwnerNames[owner]??'Unknown KAM'))}/>}
              {voidable.length>0&&<TableActionButton compact action="void" disabled={loading} title="Void approved KAM forecasts" onClick={()=>{setVoidScope('KAM: '+(savedOwnerNames[owner]??'Unknown KAM'));setVoidReason('');setVoidingForecasts(voidable)}}/>}
            </>:null,
            referenceLoading:savedActualsLoading,referenceError:savedActualsError,volumeBudget:weeklyBudget(values[2],weekGroup.year,getMonthForWeek(weekGroup.year,weekGroup.week)),
          })
        }
        if(groupSavedByKam&&collapsedKams.has(kamKey))continue
        const values=groupValues(customer.items,'customer')
        result.push({key:customer.key,kind:'group',depth:groupSavedByKam?1:0,label:getCustomerName(customer.customer_id),area:groupSavedByKam?'':area(customer.items),status:statuses(customer.items),actions:actions(customer.items),values,
          expanded:expandedCustomers.has(customer.key),onToggle:()=>toggleCustomer(customer.key),referenceLoading:savedActualsLoading,referenceError:savedActualsError,
          volumeBudget:weeklyBudget(values[2],weekGroup.year,getMonthForWeek(weekGroup.year,weekGroup.week)),
        })
        if(!expandedCustomers.has(customer.key))continue
        for(const product of customer.products)result.push({key:product.key,kind:'product',depth:groupSavedByKam?2:1,label:<span>{getProductName(product.product_id)}{product.items[0]?.status==='Voided'&&<span className="mt-1 block text-xs text-muted-foreground">Void reason: {product.items[0].void_reason}</span>}</span>,
          values:[product.forecast,product.volume,product.budget,product.actualMonthly,product.actualPreviousMonth,product.forecastMonthly],referenceLoading:savedActualsLoading,referenceError:savedActualsError||forecastLoadError,
          volumeBudget:weeklyBudget(product.budget,weekGroup.year,getMonthForWeek(weekGroup.year,weekGroup.week)),
        })
      }
    }
    return result
  }

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
    <div data-saved-forecasts-page className="space-y-4 md:flex md:h-full md:min-h-0 md:flex-col">
      {voidingForecasts && <RecordDialog open onClose={()=>setVoidingForecasts(null)} title="Void Sales Forecasts" busy={loading} fitContent maxWidth="42rem">
        <form onSubmit={handleVoidForecasts} className="flex flex-col gap-4">
          <div data-popup-form-header="" className="border-b pb-4 pr-10"><h2 data-section-title=""><Ban className="size-5 text-muted-foreground" aria-hidden="true"/>Void Sales Forecasts</h2><p className="mt-2 text-sm text-muted-foreground">Void {voidingForecasts.length} approved forecast record{voidingForecasts.length === 1 ? '' : 's'}? They will remain in history and stop contributing to forecast totals.</p></div>
          <ForecastConfirmationSummary records={voidingForecasts} scope={voidScope} level="void" customerName={getCustomerName} productName={getProductName}/>
          <label className="flex flex-col gap-2 text-sm font-medium"><span>Reason</span><textarea required minLength={3} maxLength={1000} disabled={loading} value={voidReason} onChange={event=>setVoidReason(event.target.value)} className="min-h-24 rounded-md border bg-background p-3"/></label>
          <div data-action-toolbar="" data-dialog-footer="" className="flex justify-end gap-2 border-t pt-4"><button type="button" data-action-tone="neutral" disabled={loading} onClick={()=>setVoidingForecasts(null)} className="inline-flex h-10 items-center gap-2 rounded-md border px-4"><X className="size-4"/>Cancel</button><button type="submit" data-action-tone="danger" data-action-fill="" disabled={loading || voidReason.trim().length < 3} className="inline-flex h-10 items-center gap-2 rounded-md border px-4"><Ban className="size-4"/>{voidBusy ? 'Voiding…' : `Void (${voidingForecasts.length})`}</button></div>
        </form>
      </RecordDialog>}

      {/* ADD FORECAST */}

      {canCreateForecast ||
      authorization.can('Forecasts', 'edit') ? (
        <RecordDialog open={forecastDialogOpen} onClose={() => setForecastDialogOpen(false)}
          title={rows.some((row) => row.id !== null) ? 'Edit Forecast' : 'Add Forecast'} busy={loading} wide maxWidth="75rem">
        <div data-forecast-form className="app-tables min-w-0">

          <div data-section-header="" data-aligned-toolbar="" className="border-b py-4 pr-10">
            <div data-forecast-title-row="" className="flex w-full min-w-0 flex-row items-center gap-2 sm:gap-6">
              <div>
                <h2 data-section-title="" className="text-base font-semibold"><HeadingClipboardPlus className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
                  {rows.some((row) => row.id !== null) ? 'Edit Forecast' : 'Add Forecast'}
                </h2>


              </div>

              <div className="flex min-w-0 items-center gap-3">
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

          <div data-forecast-form-body className="py-6"
            onPointerDownCapture={(event) => {
              const target = event.target as HTMLElement
              if (!isLocked || target.closest('[data-forecast-week-field]') || !target.closest('input, select, [role="combobox"], [data-content-size]')) return
              event.preventDefault()
              event.stopPropagation()
              notify('Select an open week first before entering forecast details.', { tone: 'warning' })
            }}
            onFocusCapture={(event) => {
              const target = event.target as HTMLElement
              if (!isLocked || target.closest('[data-forecast-week-field]') || !target.closest('input, select, [role="combobox"], [data-content-size]')) return
              notify('Select an open week first before entering forecast details.', { tone: 'warning' })
            }}>
            <div className="mb-6 space-y-4">
              <div className="app-field-row forecast-entry-fields">
                {/* WEEK */}

                <div data-forecast-week-field="" data-field-size="compact" className="space-y-2">
                  <label className="text-sm font-medium">
                    Week
                    {weekDateRangeLabel(selectedWeek) && <span className="ml-2 text-xs font-normal text-muted-foreground">({weekDateRangeLabel(selectedWeek)})</span>}
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
                options={forecastProductOptions}
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
        <td data-forecast-add-row-cell="" colSpan={2} className="px-2 py-4 text-left">
          <button data-action-tone="primary"
            type="button"
            aria-label="Add Row"
            title="Add Row"
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
            <span className="hidden md:inline">Add Row</span>
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

            <div data-action-toolbar="" className="mt-5 flex flex-wrap items-center gap-2" data-dialog-footer="">
              <button data-action-tone="neutral" type="button" onClick={handleClear}
                disabled={loading || initializing || workspaceOwner !== userId}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
                <RotateCcw className="size-4" aria-hidden="true" />
                <span>Clear</span>
              </button>
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
                <span>{pendingAction === 'save' ? 'Saving...' : rows.some((row) => row.status === 'Rejected') ? 'Save Changes' : 'Save as Draft'}</span>
              </button>
            </div>



          </div>
        </div>
        </RecordDialog>
      ) : null}

      {/* SAVED FORECASTS */}

      <div id="saved-forecasts" className="scroll-mt-4 rounded-xl border bg-card shadow-sm md:flex md:min-h-0 md:flex-[0_1_auto] md:flex-col md:overflow-hidden">
        <div data-section-header="" data-aligned-toolbar="" className="flex shrink-0 flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 data-section-title="" className="text-base font-semibold"><HeadingArchive className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
              Saved Forecasts
            </h2>


          </div>

        <div data-action-toolbar="" className="flex flex-wrap items-center gap-2">
      {authorization.role === 'Admin' && authorization.can('Forecasts', 'add') && authorization.can('Forecasts', 'import') && (
        <ForecastExcelImport
          userId={userId}
          isAdmin={authorization.role === 'Admin'}
          scope={{ allRegions: canChooseRegion, regionId: assignedRegionId, subregionId: assignedSubregionId }}
          blocked={initializing || pendingAction !== null}
          onBusyChange={setImportBusy}
          onImported={() => loadForecasts()}
        />
      )}

{canCreateForecast && (
          <button type="button" data-action-tone="primary" data-action-fill="" aria-label="Add Forecast" title="Add Forecast"
            disabled={loading || initializing || workspaceOwner !== userId}
            onClick={() => {
              if (rows.some((row) => row.id !== null)) handleClear()
              setForecastDialogOpen(true)
            }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Plus className="size-4" aria-hidden="true" /><span data-forecast-action-label="">Add Forecast</span>
          </button>
      )}

</div>
</div>
        <div data-filter-toolbar="" className="flex shrink-0 flex-wrap items-end justify-between gap-4 border-b px-6 py-4">
          <div data-saved-forecast-filters="" className="app-field-row min-w-0 w-full md:w-auto">
            <div data-field-size="compact" className="space-y-1.5">
              <label htmlFor="saved-forecast-from-week" className="block text-xs font-medium text-muted-foreground">From week {weekDateRangeLabel(savedFromWeek) && <span className="text-xs font-normal">({weekDateRangeLabel(savedFromWeek)})</span>}</label>
              <div data-compact-week-field="" className="relative">
              <input id="saved-forecast-from-week" type="week" value={savedFromWeek} onChange={event => {
                const value = event.target.value
                setSavedFromWeek(value)
                if (value && savedToWeek && value > savedToWeek) setSavedToWeek(value)
              }}
                className="block h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <span data-compact-week-label="" aria-hidden="true">{savedFromWeek ? `W${Number(savedFromWeek.slice(6))} · ${savedFromWeek.slice(0, 4)}` : 'Select week'}</span>
              </div>
            </div>
            <div data-field-size="compact" className="space-y-1.5">
              <label htmlFor="saved-forecast-to-week" className="block text-xs font-medium text-muted-foreground">To week {weekDateRangeLabel(savedToWeek) && <span className="text-xs font-normal">({weekDateRangeLabel(savedToWeek)})</span>}</label>
              <div data-compact-week-field="" className="relative">
              <input id="saved-forecast-to-week" type="week" value={savedToWeek} onChange={event => {
                const value = event.target.value
                setSavedToWeek(value)
                if (value && savedFromWeek && value < savedFromWeek) setSavedFromWeek(value)
              }}
                className="block h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <span data-compact-week-label="" aria-hidden="true">{savedToWeek ? `W${Number(savedToWeek.slice(6))} · ${savedToWeek.slice(0, 4)}` : 'Select week'}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="saved-forecast-region" className="block text-xs font-medium text-muted-foreground">Region</label>
              <SelectionField id="saved-forecast-region" aria-label="Saved Forecasts region" placeholder="Region" value={effectiveSavedRegion}
                loading={initializing} loadingText="Loading regions…"
                onValueChange={setSavedRegionFilter} disabled={!canFilterAllSavedRegions}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted">
                {canFilterAllSavedRegions && <option value="all">All Regions</option>}
                {!canFilterAllSavedRegions && assignedRegionId === null && <option value="">No assigned region</option>}
                {regions.filter(region=>canFilterAllSavedRegions||region.id===assignedRegionId).map(region=><option key={region.id} value={region.id}>{region.name}</option>)}
              </SelectionField>
            </div>
            <div data-field-size="compact" className="space-y-1.5">
              <label htmlFor="saved-forecast-status" className="block text-xs font-medium text-muted-foreground">Status</label>
              <SelectionField value={savedStatusFilter}
                  id="saved-forecast-status"
                  onValueChange={(selectionValue) => setSavedStatusFilter(selectionValue)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  aria-label="Status">
                <option value="">All Open Statuses</option>
                <option value="all">All Statuses</option>
                {Object.entries(savedStatusLabels).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </SelectionField>
            </div>
          </div>
          <div data-action-toolbar="" data-saved-forecast-actions="" className="ml-auto flex min-w-0 max-w-full flex-nowrap items-center gap-2 md:shrink-0 md:whitespace-nowrap">


          {(canSubmitForecasts || initializing || authorization.loading) && (
              <button data-action-tone="transfer" data-action-fill=""
                type="button"
                aria-label={pendingAction === 'submitAll' ? 'Submitting forecasts' : 'Submit All'}
                title="Submit All"
                onClick={handleSubmitAll}
                disabled={!canSubmitForecasts || loading || initializing || savedTableLoading || eligibleSubmissionCount === 0 || !(!savedStatusFilter || savedStatusFilter === 'Draft' || savedStatusFilter === 'all')}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" aria-hidden="true" />
                <span className="hidden md:inline">{pendingAction === 'submitAll' ? 'Submitting...' : 'Submit All'}</span>
              </button>
            )}




<button data-compact-action="" data-action-tone="neutral" type="button" aria-label="Refresh saved forecasts" title="Refresh saved forecasts" onClick={loadForecasts} disabled={savedTableLoading || initializing || loading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw className={`size-4 ${savedTableLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
</div>
        </div>




      {/* SAVED FORECAST TABLE */}

        <SalesHierarchyTable rows={savedHierarchyRows()} loading={savedTableLoading || initializing}
          structureHeaderAction={<HeaderExpandCollapseButton expanded={allSavedCustomersExpanded} empty={savedCustomers.length === 0} loading={savedTableLoading || initializing || loading} onClick={() => {
            setExpandedCustomers(new Set(allSavedCustomersExpanded ? [] : savedCustomers.map((customer) => customer.key)))
            setCollapsedKams(new Set(allSavedCustomersExpanded && groupSavedByKam
              ? savedWeekGroups.flatMap((weekGroup) => weekGroup.customers.map((customer) => savedKamGroupKey(weekGroup.key, customer.items[0].user_id)))
              : []))
          }} />}
          totalVolume={visibleSavedForecasts.reduce((sum, item) => sum + (item.status==='Voided'?0:(Number(item.volume) || 0)), 0)}
          label="Saved Forecasts table" emptyMessage="No forecasts match the current filters."
          summary={{records:savedCustomers.reduce((count,customer)=>count+customer.items.length,0),customers:totalSavedCustomers}} />


      </div>
    </div>
  )
}
