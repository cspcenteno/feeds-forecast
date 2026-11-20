
'use client'

import { ApprovalExcelDialog } from '@/components/approval-excel-dialog'
import type { ExportInput } from '@/lib/weekly-sales-export'
import { withReportingTimeout } from '@/lib/reporting-load'

import { SalesHierarchyTable, type SalesHierarchyRow } from '@/components/ui/sales-hierarchy-table'
import { loadMonthlyReferences, monthlyReferenceKey, type MonthlyReference } from '@/lib/sales-monthly-references'

import { ForecastConfirmationSummary } from '@/components/forecast-confirmation-summary'
import { summaryForLevel } from '@/lib/table-summary-level'
import { asmForRegion } from '@/lib/asm-reporting'
import { rsmAssignmentKey, rsmForSubregion } from '@/lib/rsm-reporting'
import { actionGroupCount } from '@/lib/action-group-count'

import { weeklyBudget } from '@/lib/weekly-budget'
import { salesWeekRange } from '@/lib/forecast-weeks'

import { sortRegions } from '@/lib/region-order'

import { StatusBadge } from '@/components/ui/status-badge'

import { ClipboardCheck as HeadingClipboardCheck } from 'lucide-react'

import { useStatusNotification, usePopupError } from '@/components/action-dialogs'

import { ExpandCollapseIcon } from '@/components/ui/expand-collapse-icon'
import { ArrowLeftRight as ActionArrowLeftRightIcon, X as ActionXIcon } from 'lucide-react'
import { SelectionField } from '@/components/ui/selection-field'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Undo2,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'

type Region = {
  id: number
  name: string
  code: string | null
  is_active?: boolean
}

type Subregion = {
  id: number
  name: string
  region_id: number
  is_active?: boolean
}

type Product = {
  id: number
  code: string
  name: string
}

type Customer = {
  id: number
  customer: string
}

type SalesForecast = {
  asm_id?: string | null
  asm_name?: string
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
  user_id: string | null
  submitted_by: string | null
  endorsed_by?: string | null
  submitter_name?: string | null
}

type ProductGroup = {
  key: string
  product_id: number | null
  items: SalesForecast[]
  forecast: number
  volume: number
}

type CustomerGroup = {
  key: string
  customer_id: number | null
  items: SalesForecast[]
  products: ProductGroup[]
  forecast: number
  volume: number
}

type WeekGroup = {
  key: string
  year: number
  week: number
  customers: CustomerGroup[]
}

const reviewActions = {
  endorse: { label: 'Endorse', icon: Check, result: 'endorsed', tone: 'positive' },
  approve: { label: 'Approve', icon: Check, result: 'approved', tone: 'positive' },
  reject: { label: 'Reject', icon: X, result: 'rejected', tone: 'danger' },
  return: { label: 'Return', icon: X, result: 'returned for revision', tone: 'caution' },
  undo: { label: 'Unendorse', icon: Undo2, result: 'moved back to RSM review', tone: 'caution' },
} as const

type ActionType = keyof typeof reviewActions
type ReviewStage = 'Pending' | 'Endorsed'

export function SalesSubmissionsPage({ mode }: { mode: 'approvals' | 'weekly' }) {
  const weekly = mode === 'weekly'
  const supabase = createClient()
  const authorization = useAuthorization()

  // -----------------------------------------
  // DATA
  // -----------------------------------------

  const [sales, setSales] = useState<SalesForecast[]>([])
  const [teamReferences, setTeamReferences] = useState<Map<string, MonthlyReference>>(new Map())

  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<Subregion[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [asmNames, setAsmNames] = useState<Record<number, string>>({})
  const [customers, setCustomers] = useState<Customer[]>([])

  const [submittedUsers, setSubmittedUsers] =
    useState<Record<string, string>>({})

  // -----------------------------------------
  // USER ACCESS
  // -----------------------------------------

  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState('')
  const [reviewPosition, setReviewPosition] = useState('')
  const [reviewStage, setReviewStage] = useState<ReviewStage | null>(null)
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('stage')
    if (requested === 'Pending' || requested === 'Endorsed') {
      void Promise.resolve().then(() => setReviewStage(requested))
    }
  }, [])

  // -----------------------------------------
  // FILTERS
  // -----------------------------------------

  const [initialWeekRange] = useState(() => salesWeekRange())
  const [fromWeek, setFromWeek] = useState(initialWeekRange.fromWeek)
  const [toWeek, setToWeek] = useState(initialWeekRange.toWeek)
  const [selectedRegion, setSelectedRegion] = useState('all')

  // -----------------------------------------
  // EXPANSION
  // -----------------------------------------

  const [expandedGroups, setExpandedGroups] =
    useState<Set<string>>(new Set())

  // -----------------------------------------
  // APPROVAL MODAL
  // -----------------------------------------

  const [selectedItems, setSelectedItems] =
    useState<SalesForecast[]>([])

  const [actionType, setActionType] =
    useState<ActionType | null>(null)

  const [actionLabel, setActionLabel] = useState('')
  const [remarks, setRemarks] = useState('')

  // -----------------------------------------
  // UI STATE
  // -----------------------------------------

  const [loading, setLoading] = useState(true)
  const [referencesLoading, setReferencesLoading] = useState(true)
  const [referencesError, setReferencesError] = useState(false)
  const referenceRequest = useRef(0)
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [excelPreview, setExcelPreview] = useState<ExportInput | null>(null)
  const [excelOpen, setExcelOpen] = useState(false)
  const [excelError, setExcelError] = useState('')
  const excelRequest = useRef(0)
  const excelBudgetMonth = useRef<number | undefined>(undefined)
  const [viewerName, setViewerName] = useState('')
  const [, setError] = usePopupError()
  const setMessage = useStatusNotification()

  const isAdminReview = !weekly && userRole === 'Admin'
  const isAsmReview = userRole === 'Manager' && reviewPosition === 'ASM'
  const isRsmReview = !weekly && userRole === 'Manager' && reviewPosition === 'RSM'
  const stage = isAsmReview ? 'Endorsed' : reviewStage ?? 'Pending'
  const customerOnly = weekly && (reviewPosition === 'KAM' || (userRole === 'User' && !['NSM', 'ASM', 'RSM', 'Supervisor', 'SV'].includes(reviewPosition)))
  const weeklyKamLevel = weekly && reviewPosition === 'RSM'
  const weeklyAsmLevel = weekly && (userRole === 'Admin' || reviewPosition === 'NSM')
  const nestedKamGroups = weekly ? !customerOnly && !weeklyKamLevel : stage === 'Endorsed'
  const groupByEndorser = nestedKamGroups || (weekly && !customerOnly && !weeklyKamLevel)
  const pageTitle = weekly ? 'Weekly Sales' : stage === 'Endorsed' ? 'ASM Approvals' : 'RSM Approvals'
  const canApprove = !weekly && userRole === 'Manager' &&
    (reviewPosition === 'RSM' || reviewPosition === 'ASM') &&
    authorization.can('Approvals', 'edit')
  const availableReviewActions: ActionType[] = isAdminReview
    ? stage === 'Pending' ? ['endorse', 'reject'] : ['approve', 'reject']
    : !canApprove ? [] : isAsmReview
      ? ['approve', 'return']
      : ['endorse', 'return', 'undo']
  const [reviewAssignment, setReviewAssignment] = useState<{ region: number | null; subregion: number | null }>({ region: null, subregion: null })
  const regionRestricted = customerOnly || (userRole === 'Manager' && reviewPosition !== 'NSM') ||
    (userRole === 'Superuser' && ['Supervisor', 'SV'].includes(reviewPosition))
  const canShowActions = availableReviewActions.length > 0
  const requiresReviewReason = actionType === 'return' || actionType === 'reject'
  const ReviewActionIcon = actionType ? reviewActions[actionType].icon : Check
  // -----------------------------------------
  // ISO WEEK HELPERS
  // -----------------------------------------

  function getISOWeekStartDate(year: number, week: number) {
    const januaryFourth = new Date(Date.UTC(year, 0, 4))
    const dayOfWeek = januaryFourth.getUTCDay() || 7

    const firstMonday = new Date(januaryFourth)

    firstMonday.setUTCDate(
      januaryFourth.getUTCDate() - dayOfWeek + 1
    )

    firstMonday.setUTCDate(
      firstMonday.getUTCDate() + (week - 1) * 7
    )

    return firstMonday
  }

  function getMonthForWeek(year: number, week: number) {
    const thursday = getISOWeekStartDate(year, week)
    thursday.setUTCDate(thursday.getUTCDate() + 3)

    return thursday.getUTCMonth() + 1
  }

  function getWeekDateLabel(year: number, week: number) {
    const monday = getISOWeekStartDate(year, week)
    const sunday = new Date(monday)

    sunday.setUTCDate(sunday.getUTCDate() + 6)

    const format = (date: Date) =>
      date.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        timeZone: 'UTC',
      })

    return `${format(monday)} - ${format(sunday)}`
  }

  // -----------------------------------------
  // LOOKUP HELPERS
  // -----------------------------------------

  function getSubregionName(id: number | null) {
    return subregions.find((item) => item.id === id)?.name
  }

  function getAreaName(
    regionId: number | null,
    subregionId: number | null,
    level: 'region' | 'subregion' = 'subregion'
  ) {
    const region = regions.find((item) => item.id === regionId)
    return (level === 'subregion'
      ? getSubregionName(subregionId)
      : region?.name) || '—'
  }

  function getProductName(id: number | null) {
    const product = products.find((item) => item.id === id)

    if (!product) return 'Unassigned Product'

    return `${product.code} - ${product.name}`
  }

  function getCustomerName(id: number | null) {
    return (
      customers.find((item) => item.id === id)?.customer ??
      'Unassigned Customer'
    )
  }

  function getSubmittedByName(id: string | null) {
    if (!id) return 'Unassigned'

    return submittedUsers[id] || 'Name unavailable'
  }

  // Preserve fractional 50kg-equivalent volumes, such as 25kg bags (0.5).


  // -----------------------------------------
  // BUDGET REFERENCE
  // -----------------------------------------

  function getSavedBudgetVolume(item: SalesForecast) {
    return Number(teamReferences.get(monthlyReferenceKey(item.id, 'product'))?.budget_volume ?? NaN)
  }

  function getSavedActualMonthly(item: SalesForecast, previous = false) {
    const reference = teamReferences.get(monthlyReferenceKey(item.id, 'product'))
    return Number((previous ? reference?.previous_actual_volume : reference?.actual_volume) ?? NaN)
  }

  function getSavedForecastMonthly(item: SalesForecast) {
    return Number(teamReferences.get(monthlyReferenceKey(item.id, 'product'))?.forecast_volume ?? NaN)
  }

  // -----------------------------------------
  // CUSTOMER-LEVEL LOOKUP TOTALS
  // -----------------------------------------

  function customerReferenceTotal(items: SalesForecast[], field: 'budget_volume' | 'actual_volume' | 'previous_actual_volume' | 'forecast_volume') {
    const scopes = [...new Map(items.map((item) => [JSON.stringify([item.region_id, item.subregion_id, item.customer_id]), item])).values()]
    return scopes.reduce((total, item) => total + Number(teamReferences.get(monthlyReferenceKey(item.id, 'customer'))?.[field] ?? NaN), 0)
  }

  function getCustomerMonthlyBudget(group: CustomerGroup) {
    return customerReferenceTotal(group.items, 'budget_volume')
  }

  function getCustomerMonthlyActual(group: CustomerGroup, previous = false) {
    return customerReferenceTotal(group.items, previous ? 'previous_actual_volume' : 'actual_volume')
  }

  // -----------------------------------------
  // CUSTOMER-LEVEL FORECAST VOLUME TOTAL
  //
  // Sum all products belonging to THIS customer.
  // Do not include forecasts belonging to other customers.
  // -----------------------------------------

  function getCustomerForecastMonthlyTotal(customerId: number | null, items: SalesForecast[]) {
    return customerId === null ? 0 : customerReferenceTotal(items, 'forecast_volume')
  }

  async function loadData() {
    setLoading(true)
    try {
      await fetchSalesData()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load sales records.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchSalesData() {
    const request = ++referenceRequest.current
    setReferencesLoading(true)
    setReferencesError(false)
    setError('')
    setMessage('')

    const {
      data: { user },
    } = await withReportingTimeout(supabase.auth.getUser(), 'Loading your session')

    if (!user) {
      setError('User session not found.')
      return
    }

    setUserId(user.id)

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('users')
      .select('role, is_active, region_id, subregion_id, position, full_name')
      .eq('id', user.id)
      .abortSignal(AbortSignal.timeout(20000))
      .single()

    if (profileError) {
      setError(profileError.message)
      return
    }

    if (!profile?.is_active) {
      setError('Your account is inactive.')
      return
    }

    const role = profile.role ?? ''
    const isAdmin = role === 'Admin'
    const isSuperuser = role === 'Superuser'
    const ownWeeklyRecords = profile.position === 'KAM' || (role === 'User' && !['NSM', 'ASM', 'RSM', 'Supervisor', 'SV'].includes(profile.position ?? ''))
    const supervisor = isSuperuser && profile.position === 'Supervisor'
    const restrictSubregion = role === 'Manager' && profile.position === 'RSM'
    const globalRegionAccess = isAdmin || String(profile.position ?? '').trim().toUpperCase() === 'NSM'
    const restrictRegion = !globalRegionAccess && (weekly || role === 'Manager' || supervisor)

    setUserRole(role)
    setReviewPosition(profile.position ?? '')

    const profileRegionId =
      profile.region_id != null
        ? Number(profile.region_id)
        : null

    const profileSubregionId =
      profile.subregion_id != null
        ? Number(profile.subregion_id)
        : null


    setReviewAssignment({ region: profileRegionId, subregion: profileSubregionId })
    setViewerName(profile.full_name || '')

    if (!isAdmin && !isSuperuser && role !== 'Manager' && !(weekly && role === 'User')) {
      setError(weekly ? 'You do not have access to Weekly Sales.' : 'You do not have access to Approvals.')
      setSales([])
      setRegions(sortRegions([]))
      setSubregions([])
      setProducts([])
      setCustomers([])
      setSubmittedUsers({})
      return
    }

    if ((restrictRegion && profileRegionId === null) || (restrictSubregion && profileSubregionId === null)) {
      setError(restrictSubregion ? 'Your account needs an assigned region and subregion.' : 'Your account does not have an assigned region.')
      setSales([])
      setRegions(sortRegions([]))
      setSubregions([])
      setProducts([])
      setCustomers([])
      setSubmittedUsers({})
      return
    }

    // REGIONS

    let regionsQuery = (weekly ? supabase.rpc('get_weekly_sales_reporting_regions') : supabase.from('regions'))
      .select('id, name, code, is_active')
      .eq('is_active', true)
      .order('name')

    if (restrictRegion) {
      regionsQuery = regionsQuery.eq('id', profileRegionId)
    }

    // SUBREGIONS

    let subregionsQuery = (weekly ? supabase.rpc('get_weekly_sales_reporting_subregions') : supabase.from('subregions'))
      .select('id, name, region_id, is_active')
      .eq('is_active', true)
      .order('name')

    if (restrictRegion) {
      subregionsQuery = subregionsQuery.eq(
        'region_id',
        profileRegionId
      )

      if (restrictSubregion && profileSubregionId !== null) {
        subregionsQuery = subregionsQuery.eq(
          'id',
          profileSubregionId
        )
      }
    }

    // SALES RECORDS

    let salesQuery = (weekly ? supabase.rpc('get_weekly_sales_reporting') : supabase.from('forecasts'))
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
        submitted_by,
        endorsed_by
      `)
      .order('year', { ascending: false })
      .order('week', { ascending: false })
      .order('id', { ascending: false })

    if (weekly) {
      salesQuery = salesQuery.eq('status', 'Approved')
    } else {
      salesQuery = salesQuery.in('status', ['Pending', 'Endorsed'])
    }

    if (restrictRegion) {
      salesQuery = salesQuery.eq('region_id', profileRegionId)
      if (restrictSubregion) salesQuery = salesQuery.eq('subregion_id', profileSubregionId)
    }

    if (weekly && ownWeeklyRecords) salesQuery = salesQuery.eq('user_id', user.id)

    const [
      salesResult,
      regionsResult,
      subregionsResult,
      productsResult,
      customersResult,
    ] = await Promise.all([
      !weekly && role === 'Manager'
        ? supabase.rpc('get_forecast_review_queue')
            .order('year', { ascending: false })
            .order('week', { ascending: false })
            .order('id', { ascending: false })
            .abortSignal(AbortSignal.timeout(20000))
        : salesQuery.abortSignal(AbortSignal.timeout(20000)),
      regionsQuery.abortSignal(AbortSignal.timeout(20000)),
      subregionsQuery.abortSignal(AbortSignal.timeout(20000)),

      supabase
        .from('products')
        .select('id, code, name')
        .order('name')
        .abortSignal(AbortSignal.timeout(20000)),

      (weekly ? supabase.rpc('get_weekly_sales_reporting_customers') : supabase.from('customers'))
        .select('id, customer')
        .order('customer')
        .abortSignal(AbortSignal.timeout(20000)),
    ])

    const results = [
      salesResult,
      regionsResult,
      subregionsResult,
      productsResult,
      customersResult,
    ]

    const queryError = results.find((result) => result.error)

    if (queryError?.error) {
      setError(queryError.error.message)
      return
    }

    let salesData = ((salesResult.data ?? []) as SalesForecast[]).map((item) =>
      weekly && !item.submitted_by
        ? { ...item, submitted_by: item.user_id }
        : item
    )

    if (weekly) {
      const response = await fetch('/api/reporting-asms', { cache: 'no-store', signal: AbortSignal.timeout(20000) })
      const result = await response.json()
      if (!response.ok) { setError(result.error || 'Unable to load ASM assignments.'); return }
      salesData = salesData.map((item) => ({ ...item, ...asmForRegion(item.region_id, result.users) }))
      setAsmNames(Object.fromEntries(((regionsResult.data ?? []) as Region[]).map((region) => [region.id, asmForRegion(region.id, result.users).asm_name])))
    }
    setSales(salesData)
    window.dispatchEvent(new Event('forecast-workflow-changed'))
    setRegions(sortRegions((regionsResult.data ?? []) as Region[]))
    setSubregions((subregionsResult.data ?? []) as Subregion[])
    setProducts(productsResult.data ?? [])
    setCustomers((customersResult.data ?? []) as Customer[])

    setSelectedRegion(
      restrictRegion ? String(profileRegionId) : 'all'
    )

    // Monthly references load independently from the operational rows.
    async function loadReferences() {
      setTeamReferences(new Map())
      try {
        const references = await withReportingTimeout(loadMonthlyReferences(supabase, salesData.map((item) => item.id), weekly ? 'weekly' : 'approvals'), 'Loading monthly references', 45000)
        if (request !== referenceRequest.current) return
        setTeamReferences(references)
      } catch (error) {
        if (request === referenceRequest.current) {
          setReferencesError(true)
          setError(error instanceof Error ? error.message : 'Unable to load monthly references.')
        }
      } finally {
        if (request === referenceRequest.current) setReferencesLoading(false)
      }
    }
    void loadReferences()

    // SUBMITTED USERS

    async function loadReportingNames() {
      if ((weekly && ownWeeklyRecords) || !salesData.length) {
        setSubmittedUsers({})
        return
      }
      try {
        const response = await fetch('/api/reporting-names', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: weekly ? 'Weekly Sales' : 'Approvals', ids: salesData.map((item) => item.id) }),
          signal: AbortSignal.timeout(20000),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load reporting names.')
        if (request === referenceRequest.current) setSubmittedUsers(result.names)
      } catch (cause) {
        if (request === referenceRequest.current) {
          setSubmittedUsers({})
          setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'Loading reporting names timed out. Please refresh to try again.')
        }
      }
    }
    // Keep the initial hierarchy loading until its person labels are resolved.
    await loadReportingNames()

  }

  // -----------------------------------------
  // INITIAL LOAD
  // -----------------------------------------

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [])

  // -----------------------------------------
  // FILTERED SALES
  // -----------------------------------------

  const filteredSales = useMemo(() => {
    return sales.filter((item) => {
      const week = `${item.year}-W${String(item.week).padStart(2, '0')}`
      const matchesPeriod = (!fromWeek || week >= fromWeek) && (!toWeek || week <= toWeek)

      const matchesRegion =
        selectedRegion === 'all' ||
        item.region_id === Number(selectedRegion)

      const matchesStage = weekly || (isRsmReview
        ? item.status === 'Pending' || item.status === 'Endorsed' || item.status === 'Rejected'
        : item.status === stage)

      return matchesPeriod && matchesRegion && matchesStage
    })
  }, [sales, fromWeek, toWeek, selectedRegion, weekly, stage, isRsmReview])

  // -----------------------------------------
  // GROUPING
  // Weekly Sales groups by submitter before week, customer, and product.
  // -----------------------------------------

  function getReviewGroupId(item: SalesForecast) {
    return customerOnly ? null : groupByEndorser ? item.endorsed_by ?? null : item.submitted_by
  }

  function compareUsers(first: string | null, second: string | null) {
    return getSubmittedByName(first).localeCompare(getSubmittedByName(second)) ||
      (first ?? '').localeCompare(second ?? '')
  }

  const weekGroups = useMemo<WeekGroup[]>(() => {
    const weekMap = new Map<string, SalesForecast[]>()

    filteredSales.forEach((item) => {
      const weekKey = `${item.year}-W${item.week}`

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, [])
      }

      weekMap.get(weekKey)!.push(item)
    })

    return Array.from(
      weekMap.entries()
    )
      .map(([weekKey, weekItems]) => {
        const customerMap = new Map<
          string,
          SalesForecast[]
        >()

        weekItems.forEach((item) => {
          const customerKey = JSON.stringify([weeklyAsmLevel ? item.asm_id : null, getReviewGroupId(item), customerOnly ? null : item.submitted_by, item.customer_id, isRsmReview ? item.status : null])

          if (!customerMap.has(customerKey)) {
            customerMap.set(customerKey, [])
          }

          customerMap.get(customerKey)!.push(item)
        })

        const customerGroups: CustomerGroup[] =
          Array.from(customerMap.entries())
            .map(([customerKey, customerItems]) => {
              const productMap = new Map<
                string,
                SalesForecast[]
              >()

              customerItems.forEach((item) => {
                const productKey =
                  item.product_id == null
                    ? 'unassigned'
                    : String(item.product_id)

                if (!productMap.has(productKey)) {
                  productMap.set(productKey, [])
                }

                productMap.get(productKey)!.push(item)
              })

              const productGroups: ProductGroup[] =
                Array.from(productMap.entries())
                  .map(([productId, productItems]) => ({
                    key: `${weekKey}-${customerKey}-${productId}`,
                    product_id:
                      productId === 'unassigned'
                        ? null
                        : Number(productId),
                    items: productItems,
                    forecast: productItems.reduce(
                      (total, item) =>
                        total +
                        (Number(item.forecast) || 0),
                      0
                    ),
                    volume: productItems.reduce(
                      (total, item) =>
                        total +
                        (Number(item.volume) || 0),
                      0
                    ),
                  }))
                  .sort((a, b) =>
                    getProductName(a.product_id).localeCompare(
                      getProductName(b.product_id)
                    )
                  )

              return {
                key: `${weekKey}-${customerKey}`,
                customer_id: customerItems[0].customer_id,
                items: customerItems,
                products: productGroups,
                forecast: customerItems.reduce(
                  (total, item) =>
                    total +
                    (Number(item.forecast) || 0),
                  0
                ),
                volume: customerItems.reduce(
                  (total, item) =>
                    total +
                    (Number(item.volume) || 0),
                  0
                ),
              }
            })
            .sort((a, b) => {
              const first = getReviewGroupId(a.items[0])
              const second = getReviewGroupId(b.items[0])
              return (weeklyAsmLevel ? (a.items[0].asm_name ?? '').localeCompare(b.items[0].asm_name ?? '') : 0) || compareUsers(first, second) ||
                (groupByEndorser ? compareUsers(a.items[0].submitted_by, b.items[0].submitted_by) : 0) ||
                getCustomerName(a.customer_id).localeCompare(getCustomerName(b.customer_id))
            })

        const firstItem = weekItems[0]

        return {
          key: `${weekKey}`,
          year: firstItem.year,
          week: firstItem.week,
          customers: customerGroups,
        }
      })
      .sort((a, b) => {
        if (a.year !== b.year) {
          return b.year - a.year
        }

        return b.week - a.week
      })
  }, [
    filteredSales,
    customers,
    products,
    submittedUsers,
    weekly,
    isRsmReview,
    customerOnly,
    groupByEndorser,
    weeklyAsmLevel,
  ])

  // -----------------------------------------
  // GROUP EXPANSION
  // -----------------------------------------

  function getReviewGroupKey(weekKey: string, reviewGroupId: string | null, asmId?: string | null) {
    return JSON.stringify([weekKey, weeklyAsmLevel ? asmId : null, groupByEndorser, reviewGroupId])
  }

  function getKamGroupKey(weekKey: string, item: SalesForecast) {
    return JSON.stringify([weekKey, 'kam', weeklyAsmLevel ? item.asm_id : null, item.endorsed_by ?? null, item.submitted_by])
  }

  function getAsmGroupKey(weekKey: string, item: SalesForecast) {
    return JSON.stringify([weekKey, 'asm', item.asm_id ?? 'unassigned'])
  }

  const visibleGroupKeys = new Set(weekGroups.flatMap((weekGroup) =>
    weekGroup.customers.flatMap((customerGroup) => [
      ...(customerOnly ? [] : [getReviewGroupKey(weekGroup.key, getReviewGroupId(customerGroup.items[0]), customerGroup.items[0].asm_id)]),
      ...(weeklyAsmLevel ? [getAsmGroupKey(weekGroup.key, customerGroup.items[0])] : []),
      ...(nestedKamGroups ? [getKamGroupKey(weekGroup.key, customerGroup.items[0])] : []),
      customerGroup.key,
    ])
  ))
  const allGroupsExpanded = visibleGroupKeys.size > 0 &&
    Array.from(visibleGroupKeys).every((key) => expandedGroups.has(key))

  function toggleGroup(key: string) {
    setExpandedGroups((previous) => {
      const next = new Set(previous)

      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }

      return next
    })
  }

  // -----------------------------------------
  // OPEN ACTION MODAL
  // -----------------------------------------

  function canReviewItem(item: SalesForecast, action: ActionType) {
    if (userRole === 'Manager' && (
      reviewAssignment.region === null || item.region_id !== reviewAssignment.region ||
      (isRsmReview && (reviewAssignment.subregion === null || item.subregion_id !== reviewAssignment.subregion))
    )) return false

    if (isRsmReview) {
      return action === 'undo'
        ? item.status === 'Endorsed' && item.endorsed_by === userId
        : item.status === 'Pending'
    }
    return item.status === stage
  }

  function openBulkAction(items: SalesForecast[], action: ActionType, label: string) {
    if (!availableReviewActions.includes(action)) return

    const eligibleItems = items.filter((item) => canReviewItem(item, action))
    if (eligibleItems.length === 0) return

    setSelectedItems(eligibleItems)
    setActionType(action)
    setActionLabel(label)
    setRemarks('')
    setError('')
    setMessage('')
  }

  function closeModal() {
    if (processing) return

    setSelectedItems([])
    setActionType(null)
    setActionLabel('')
    setRemarks('')
  }

  async function handleApproval() {
    if (!actionType || !availableReviewActions.includes(actionType) || selectedItems.length === 0) return
    if (requiresReviewReason && !remarks.trim()) {
      setError('Please enter a reason for this decision.')
      return
    }

    setProcessing(true)
    setError('')
    setMessage('')

    try {
      const { data, error } = await supabase.rpc('transition_forecast_review', {
        p_ids: selectedItems.map((item) => item.id),
        p_action: actionType,
        p_remarks: remarks.trim() || null,
      })

      if (error) {
        setError(error.message)
        return
      }

      setSelectedItems([])
      setActionType(null)
      setActionLabel('')
      setRemarks('')
      await loadData()
      setMessage(String(data) + ' forecast record(s) ' + reviewActions[actionType].result + '.')
    } finally {
      setProcessing(false)
    }
  }

  // -----------------------------------------
  // TABLE COLUMNS
  // -----------------------------------------

  function ActionButtons({ items, label, allowUndo = true, level = 'customer' }: {
    items: SalesForecast[]
    label: string
    allowUndo?: boolean
    level?: 'customer' | 'kam' | 'rsm'
  }) {
    return (
      <div className="flex flex-nowrap items-center justify-center gap-1">
        {availableReviewActions.map((action) => {
          if (!allowUndo && action === 'undo') return null
          const eligibleItems = items.filter((item) => canReviewItem(item, action))
          if (!eligibleItems.length) return null
          const count = actionGroupCount(eligibleItems, level)
          const { label: actionName, icon: Icon, tone } = reviewActions[action]
          const buttonLabel = count > 1 ? `${actionName} (${count})` : actionName
          return (
            <button
              key={action}
              type="button"
              data-action-tone={tone}
              data-slot="table-action-button"
              data-compact-action=""
              onClick={() => openBulkAction(items, action, label)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title={`${buttonLabel} · ${label}`}
              aria-label={`${buttonLabel} · ${label}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span data-action-label>{buttonLabel}</span>
            </button>
          )
        })}
      </div>
    )
  }

  function reviewHierarchyRows(): SalesHierarchyRow[] {
    const result: SalesHierarchyRow[]=[]
    const rsmStatusAndAreaOnly = !weekly && stage === 'Endorsed'
    const statuses=(items:SalesForecast[])=>[...new Set(items.map(item=>item.status==='Rejected'?'Returned':item.status))].map(status=><StatusBadge key={status} status={status} compact />)
    const area=(items:SalesForecast[],region=false)=>[...new Set(items.map(item=>getAreaName(item.region_id,item.subregion_id,region?'region':'subregion')))].join(', ')
    const totals=(items:SalesForecast[],level:'asm'|'rsm'|'kam')=>{
      const scopes=[...new Map(items.map(item=>[JSON.stringify(level==='asm'?[item.region_id]:level==='rsm'?[item.region_id,item.endorsed_by??item.subregion_id]:[item.region_id,item.subregion_id,item.submitted_by]),item])).values()]
      return [items.reduce((sum,item)=>sum+Number(item.forecast||0),0),items.reduce((sum,item)=>sum+Number(item.volume||0),0),
        ...(['budget_volume','actual_volume','previous_actual_volume','forecast_volume'] as const).map(field=>scopes.reduce((sum,item)=>sum+Number(teamReferences.get(monthlyReferenceKey(item.id,level))?.[field]??NaN),0))]
    }
    for(const weekGroup of weekGroups){
      result.push({key:'week-'+weekGroup.key,kind:'week',label:<>Week {weekGroup.week}, {weekGroup.year} ({getWeekDateLabel(weekGroup.year,weekGroup.week)})</>})
      const seen=new Set<string>()
      const addGroup=(key:string,label:string,items:SalesForecast[],level:'asm'|'rsm'|'kam',depth:number,actions?:React.ReactNode)=>{
        if(!seen.has(key)){
          seen.add(key)
          const values=totals(items,level)
          const showStatusAndArea = !rsmStatusAndAreaOnly || level === 'rsm'
          const showArea = showStatusAndArea && !(weeklyAsmLevel && level === 'kam')
          result.push({key,kind:'group',depth,label,area:showArea?area(items,level==='asm'):'',status:showStatusAndArea?statuses(items):undefined,values,actions,
            expanded:expandedGroups.has(key),onToggle:()=>toggleGroup(key),referenceLoading:referencesLoading,referenceError:referencesError,
            volumeBudget:weeklyBudget(values[2],weekGroup.year,getMonthForWeek(weekGroup.year,weekGroup.week)),
          })
        }
        return expandedGroups.has(key)
      }
      for(const customer of weekGroup.customers){
        const item=customer.items[0]
        let depth=0
        if(weeklyAsmLevel){
          const key=getAsmGroupKey(weekGroup.key,item)
          const items=weekGroup.customers.filter(group=>group.items[0].asm_id===item.asm_id).flatMap(group=>group.items)
          if(!addGroup(key,'ASM: '+(item.asm_name||'Unassigned'),items,'asm',depth))continue
          depth++
        }
        const reviewerId=getReviewGroupId(item)
        if(!customerOnly){
          const key=getReviewGroupKey(weekGroup.key,reviewerId,item.asm_id)
          const items=weekGroup.customers.filter(group=>getReviewGroupId(group.items[0])===reviewerId&&(!weeklyAsmLevel||group.items[0].asm_id===item.asm_id)).flatMap(group=>group.items)
          const level=groupByEndorser?'rsm':'kam'
          const label=level==='rsm'&&reviewerId===null?'RSM: No endorsement recorded':(level==='rsm'?'RSM: ':'KAM: ')+getSubmittedByName(reviewerId)
          if(!addGroup(key,label,items,level,depth,canShowActions?<ActionButtons items={items} label={label} level={level}/>:null))continue
          depth++
        }
        if(nestedKamGroups){
          const key=getKamGroupKey(weekGroup.key,item)
          const items=weekGroup.customers.filter(group=>getReviewGroupId(group.items[0])===reviewerId&&group.items[0].submitted_by===item.submitted_by&&(!weeklyAsmLevel||group.items[0].asm_id===item.asm_id)).flatMap(group=>group.items)
          if(!addGroup(key,'KAM: '+getSubmittedByName(item.submitted_by),items,'kam',depth))continue
          depth++
        }
        const values=[customer.forecast,customer.volume,getCustomerMonthlyBudget(customer),getCustomerMonthlyActual(customer),getCustomerMonthlyActual(customer,true),getCustomerForecastMonthlyTotal(customer.customer_id,customer.items)]
        result.push({key:customer.key,kind:'group',depth,label:getCustomerName(customer.customer_id),area:!rsmStatusAndAreaOnly&&customerOnly?area(customer.items):'',status:rsmStatusAndAreaOnly?undefined:statuses(customer.items),values,
          actions:!weekly&&stage==='Pending'?<ActionButtons items={customer.items} label={'Customer: '+getCustomerName(customer.customer_id)}/>:null,
          expanded:expandedGroups.has(customer.key),onToggle:()=>toggleGroup(customer.key),referenceLoading:referencesLoading,referenceError:referencesError,
          volumeBudget:weeklyBudget(values[2],weekGroup.year,getMonthForWeek(weekGroup.year,weekGroup.week)),
        })
        if(!expandedGroups.has(customer.key))continue
        for(const product of customer.products){
          const first=product.items[0]
          const budget=getSavedBudgetVolume(first)
          result.push({key:product.key,kind:'product',depth:depth+1,label:getProductName(product.product_id),
            values:[product.forecast,product.volume,budget,getSavedActualMonthly(first),getSavedActualMonthly(first,true),getSavedForecastMonthly(first)],
            referenceLoading:referencesLoading,referenceError:referencesError,
            volumeBudget:weeklyBudget(budget,weekGroup.year,getMonthForWeek(weekGroup.year,weekGroup.week)),
          })
        }
      }
    }
    return result
  }

  // -----------------------------------------
  // RENDER
  // -----------------------------------------

  return (
    <div data-sales-review-page className="flex flex-col md:h-full md:min-h-0">

      {/* MESSAGES */}



      {/* PENDING SALES SUBMISSIONS */}

      <div className="flex flex-col rounded-xl border bg-card shadow-sm md:min-h-0 md:flex-[0_1_auto]">

        {/* HEADER, FILTERS AND BULK ACTIONS */}

        <div className="shrink-0 border-b">
          <div className="flex flex-col">

            {/* TITLE */}

            {!weekly && <div data-section-header="" data-aligned-toolbar="" className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 data-section-title="" className="text-base font-semibold"><HeadingClipboardCheck className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
                    {pageTitle}
                  </h2>


                </div>

              </div>

              <div data-action-toolbar="" className="flex flex-wrap items-center gap-2">
                {!weekly && authorization.can('Approvals', 'view') && <button type="button" data-action-tone="transfer"
                  disabled={loading || exporting || !filteredSales.length}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  onClick={async () => {
                    const request = ++excelRequest.current
                    excelBudgetMonth.current = undefined
                    setExcelPreview(null)
                    setExcelError('')
                    setExcelOpen(true)
                    setExporting(true)
                    try {
                      const approvalScope: ExportInput['approvalScope'] = isAsmReview || isRsmReview ? {
                        level: isRsmReview ? 'subregion' : 'region', regionId: reviewAssignment.region!, subregionId: reviewAssignment.subregion, viewerName,
                      } : undefined
                      if (approvalScope && (!approvalScope.regionId || (isRsmReview && !approvalScope.subregionId))) throw new Error('An assigned region/subregion is required to view this report.')
                      const input: ExportInput = { reportType: 'approvals', approvalStage: stage === 'Pending' ? 'rsm' : 'asm', approvalScope, sales: filteredSales, regions: regions.filter(region => selectedRegion === 'all' || region.id === Number(selectedRegion)), subregions, products, users: submittedUsers, asmNames, fromWeek, toWeek }
                      setExcelPreview(input)
                      const response = await fetch('/api/reporting-asms?module=Approvals', { cache: 'no-store', signal: AbortSignal.timeout(20000) })
                      const result = await response.json()
                      if (!response.ok) throw new Error(result.error || 'Unable to load assigned ASMs.')
                      if (request !== excelRequest.current) return
                      const assignments = Object.fromEntries(input.regions.map(region => [region.id, asmForRegion(region.id, result.users).asm_name]))
                      const rsmNames = Object.fromEntries(subregions.map(area => [rsmAssignmentKey(area.region_id, area.id), rsmForSubregion(area.region_id, area.id, result.rsms ?? [])]))
                      const assignedInput = { ...input, asmNames: assignments, rsmNames }
                      setAsmNames(assignments)
                      setExcelPreview(assignedInput)
                      const { loadWeeklySalesExportReferences } = await import('@/lib/weekly-sales-export')
                      if (request !== excelRequest.current) return
                      const references = await loadWeeklySalesExportReferences(supabase, assignedInput, (_rows, references) => {
                        if (request !== excelRequest.current) return
                        setExcelPreview({ ...assignedInput, ...references })
                      }, () => excelBudgetMonth.current)
                      if (request !== excelRequest.current) return
                      setExcelPreview({ ...assignedInput, ...references })
                    } catch (cause) { if (request === excelRequest.current) setExcelError(cause instanceof Error ? cause.message : 'Unable to open Excel report.') }
                    finally { if (request === excelRequest.current) setExporting(false) }
                  }}><FileSpreadsheet className="size-4" />Excel View</button>}
                  {!weekly && (userRole === 'Admin' || userRole === 'Superuser') && (
                    <button
                      type="button"
                      data-action-tone="neutral"
                      onClick={() => {
                        setReviewStage(stage === 'Endorsed' ? 'Pending' : 'Endorsed')
                        setExpandedGroups(new Set())
                      }}
                      className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition hover:bg-muted"
                    ><ActionArrowLeftRightIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
                      Switch to {stage === 'Endorsed' ? 'RSM' : 'ASM'}
                    </button>
                  )}

              </div>
            </div>

            }
            {/* FILTERS AND BULK ACTIONS */}

            <div data-filter-toolbar="" className="flex flex-wrap items-end justify-between gap-4 px-6 py-4">
              <div data-weekly-filter-fields="" className="min-w-0 max-w-full">
                {/* PERIOD AND REGION */}

                <div className="app-field-row">

                  <>
                    <div data-field-size="compact" className="space-y-1.5">
                      <label htmlFor="weekly-sales-from-week" className="block text-xs font-medium text-muted-foreground">
                        From week
                      </label>
                      <input id="weekly-sales-from-week" type="week" value={fromWeek}
                        onChange={(event) => {
                          const value = event.target.value
                          setFromWeek(value)
                          if (value && toWeek && value > toWeek) setToWeek(value)
                        }}
                        className="block h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div data-field-size="compact" className="space-y-1.5">
                      <label htmlFor="weekly-sales-to-week" className="block text-xs font-medium text-muted-foreground">
                        To week
                      </label>
                      <input id="weekly-sales-to-week" type="week" value={toWeek}
                        onChange={(event) => {
                          const value = event.target.value
                          setToWeek(value)
                          if (value && fromWeek && value < fromWeek) setFromWeek(value)
                        }}
                        className="block h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Region
                    </label>

                    <SelectionField value={selectedRegion}
                  loading={loading} loadingText="Loading region…"
                  onValueChange={(selectionValue) => setSelectedRegion(selectionValue)}
                  disabled={regionRestricted}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted"
                  aria-label="Region">
                      {!regionRestricted && (
                        <option value="all">
                          All Regions
                        </option>
                      )}

                      {regions.map((region) => (
                        <option
                          key={region.id}
                          value={region.id}
                        >
                          {region.name}
                        </option>
                      ))}
                    </SelectionField>
                  </div>
                </div>
              </div>

              {/* BULK ACTIONS */}

              <div data-action-toolbar="" data-weekly-filter-actions="" data-approval-filter-actions={!weekly ? '' : undefined} className="flex flex-wrap items-center gap-2">
{weekly && authorization.can('Weekly Sales', 'view') && authorization.can('Weekly Sales', 'export') && <button type="button" data-action-tone="transfer"
                  onClick={async () => {
                    setExporting(true)
                    try {
                      // Recheck saved grants at download time, including changes
                      // made by an administrator while this page was open.
                      const response = await fetch('/api/authorization', { cache: 'no-store' })
                      const access = await response.json()
                      if (!response.ok || !access.permissions?.['Weekly Sales']?.view || !access.permissions?.['Weekly Sales']?.export) {
                        throw new Error('Weekly Sales View and Export permissions are required to download this report.')
                      }
                      const { downloadWeeklySalesExport, loadWeeklySalesExportReferences } = await import('@/lib/weekly-sales-export')
                      const position = String(access.position ?? '').trim().toUpperCase()
                      const level: NonNullable<ExportInput['weeklyScope']>['level'] = access.role === 'User' || position === 'KAM' ? 'kam'
                        : access.role === 'Manager' && position === 'RSM' ? 'subregion'
                          : access.role === 'Manager' && position === 'ASM' ? 'region' : 'all'
                      const exportInput: ExportInput = { sales: filteredSales, regions: regions.filter((region) => selectedRegion === 'all' || region.id === Number(selectedRegion)), subregions, products,
                        users: { ...submittedUsers, [userId]: viewerName }, fromWeek, toWeek, asmNames,
                        weeklyScope: access.role === 'Superuser' ? undefined : { level, userId, regionId: access.regionId, subregionId: access.subregionId, viewerName } }
                      if (level !== 'kam') {
                        const assignmentsResponse = await fetch('/api/reporting-asms?module=Weekly%20Sales', { cache: 'no-store', signal: AbortSignal.timeout(20000) })
                        const assignments = await assignmentsResponse.json()
                        if (!assignmentsResponse.ok) throw new Error(assignments.error || 'Unable to load sales assignments.')
                        exportInput.asmNames = Object.fromEntries(exportInput.regions.map(region => [region.id, asmForRegion(region.id, assignments.users ?? []).asm_name]))
                        exportInput.rsmNames = Object.fromEntries(subregions.map(area => [rsmAssignmentKey(area.region_id, area.id), rsmForSubregion(area.region_id, area.id, assignments.rsms ?? [])]))
                        exportInput.kamAssignments = assignments.kams ?? []
                        for (const kam of exportInput.kamAssignments ?? []) if (kam.full_name?.trim()) exportInput.users[kam.id] = kam.full_name.trim()
                      }
                      if (level === 'subregion' && filteredSales.some(sale => !exportInput.users[sale.user_id || sale.submitted_by || ''])) {
                        for (let offset = 0; offset < filteredSales.length; offset += 10000) {
                          const namesResponse = await fetch('/api/reporting-names', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ module: 'Weekly Sales', ids: filteredSales.slice(offset, offset + 10000).map(sale => sale.id) }), signal: AbortSignal.timeout(20000) })
                          const result = await namesResponse.json()
                          if (!namesResponse.ok) throw new Error(result.error || 'Unable to load KAM names.')
                          Object.assign(exportInput.users, result.names)
                        }
                      }
                      const references = await loadWeeklySalesExportReferences(supabase, exportInput)
                      downloadWeeklySalesExport({ ...exportInput, ...references })
                    } catch (error) {
                      setError(error instanceof Error ? error.message : 'Unable to export Weekly Sales.')
                    } finally {
                      setExporting(false)
                    }
                  }} disabled={loading || exporting || filteredSales.length === 0}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <Download className="size-4" aria-hidden="true" />{exporting ? 'Exporting…' : 'Excel Export'}
                </button>}
{availableReviewActions.filter((action) => action !== 'undo').map((action) => {
                  const { label, icon: Icon, tone } = reviewActions[action]
                  return (
                    <button
                      key={action}
                      type="button"
                      data-action-tone={tone}
                      onClick={() => openBulkAction(filteredSales, action, 'All Filtered Submissions')}
                      disabled={loading || !filteredSales.some((item) => canReviewItem(item, action))}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {action === 'return' ? 'Return' : label} All
                    </button>
                  )
                })}

<button data-slot="expand-collapse-button" data-action-tone="neutral"
                  type="button"
                  aria-label={allGroupsExpanded ? 'Collapse all groups' : 'Expand all groups'}
                  title={allGroupsExpanded ? 'Collapse all groups' : 'Expand all groups'}
                  onClick={() =>
                    setExpandedGroups(allGroupsExpanded ? new Set() : visibleGroupKeys)
                  }
                  disabled={loading || visibleGroupKeys.size === 0}
                  className="h-9 rounded-md px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                ><ExpandCollapseIcon expanded={allGroupsExpanded} />
                  <span className="hidden md:inline">{allGroupsExpanded ? 'Collapse All' : 'Expand All'}</span>
                </button>
<button type="button" data-action-tone="neutral" aria-label="Refresh sales" title="Refresh sales" onClick={loadData} disabled={loading}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /><span className="hidden md:inline">Refresh</span>
                </button>
</div>
            </div>
          </div>
        </div>

        {/* APPROVAL TABLE */}

        <SalesHierarchyTable showActions={!weekly} showStatus={!weekly} rows={reviewHierarchyRows()} loading={loading} label={pageTitle+' table'}
          totalVolume={filteredSales.reduce((sum, item) => sum + (Number(item.volume) || 0), 0)}
          emptyMessage={weekly?'No weekly sales match the current filters.':'No forecasts awaiting review match the current filters.'}
          summary={summaryForLevel(filteredSales.length,weeklyAsmLevel?'asms':nestedKamGroups||(weekly&&groupByEndorser)?'rsms':customerOnly?'customers':'kams',filteredSales.map(row=>weeklyAsmLevel?row.asm_id:nestedKamGroups||(weekly&&groupByEndorser)?row.endorsed_by:customerOnly?row.customer_id:row.submitted_by??row.user_id))} />

      </div>

      {/* APPROVAL / REJECTION MODAL */}

      {!weekly && selectedItems.length > 0 && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div data-app-dialog role="dialog" aria-modal="true" aria-labelledby="forecast-review-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl">

            {/* MODAL HEADER */}

            <div className="shrink-0 border-b px-4 py-4 sm:px-6">
              <h2 id="forecast-review-title" className="text-lg font-semibold tracking-tight">{reviewActions[actionType].label} Forecasts</h2>
            </div>

            {/* MODAL CONTENT */}

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">

              {/* SUMMARY */}

              <ForecastConfirmationSummary records={selectedItems} scope={actionLabel}
                level={nestedKamGroups ? 'approve' : 'endorse'}
                customerName={getCustomerName} productName={getProductName} personName={getSubmittedByName} />

              {/* REMARKS */}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Remarks

                  {requiresReviewReason && (
                    <span className="text-destructive">
                      {' '}*
                    </span>
                  )}
                </label>

                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder={
                    requiresReviewReason ? 'Enter the reason for this decision' : 'Optional remarks'
                  }
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* MODAL ERROR */}



              {/* MODAL BUTTONS */}

            </div>
              <div data-action-toolbar="" className="flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-4 sm:flex-row sm:justify-end sm:px-6" data-dialog-footer="">
                <button data-action-tone="neutral"
                  type="button"
                  onClick={closeModal}
                  disabled={processing}
                  className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                ><ActionXIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleApproval}
                  data-action-tone={reviewActions[actionType].tone}
                  data-action-fill=""
                  disabled={processing}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                ><ReviewActionIcon className="size-4 shrink-0" aria-hidden="true" />
                  {processing ? 'Processing…' : reviewActions[actionType].label}
                </button>
              </div>
          </div>
        </div>
      )}
      {excelOpen && <ApprovalExcelDialog input={excelPreview} loading={exporting} error={excelError} canDownload={authorization.can('Approvals', 'export')} onBudgetMonthChange={month => { excelBudgetMonth.current = month }} onClose={() => {
        ++excelRequest.current
        setExcelOpen(false)
        setExcelPreview(null)
        setExporting(false)
      }} />}
    </div>
  )
}
