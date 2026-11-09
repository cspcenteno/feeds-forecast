
'use client'

import { ClipboardCheck as HeadingClipboardCheck } from 'lucide-react'

import { useStatusNotification } from '@/components/action-dialogs'

import { uniqueCount } from '@/components/ui/table-summary'
import { ExpandCollapseIcon } from '@/components/ui/expand-collapse-icon'
import { ArrowLeftRight as ActionArrowLeftRightIcon, X as ActionXIcon } from 'lucide-react'
import { SelectionField } from '@/components/ui/selection-field'
import { Table } from '@/components/ui/table'
import { MonthlySalesHeaders } from '@/components/ui/monthly-sales-columns'
import { LoadingSpinner, TableLoadingRow } from '@/components/ui/loading-spinner'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  RefreshCw,
  Undo2,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/client'
import { loadSalesReferenceBudgets } from '@/lib/sales-reference-records'
import { monthlyBudgetReference } from '@/lib/monthly-budget-reference'
import { loadActualRecords, type ActualRecord } from '@/lib/actual-records'
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

type ReviewReference = {
  forecast_id: number
  budget_volume: number
  actual_volume: number
  prior_year_actual_volume: number
  approved_forecast_volume: number
  customer_approved_forecast_volume: number
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
  return: { label: 'Return for Revision', icon: X, result: 'returned for revision', tone: 'caution' },
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
  const [lookupForecasts, setLookupForecasts] = useState<SalesForecast[]>([])
  const [actualRecords, setActualRecords] = useState<Omit<ActualRecord, 'category_id'>[]>([])
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [reviewReferences, setReviewReferences] = useState<Map<number, ReviewReference> | null>(null)
  const [weeklyBudgetVolumes, setWeeklyBudgetVolumes] = useState<Map<number, number> | null>(null)

  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<Subregion[]>([])
  const [products, setProducts] = useState<Product[]>([])
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

  const [selectedMonth, setSelectedMonth] = useState('')
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
  const [error, setError] = useState('')
  const setMessage = useStatusNotification()

  const isAdminReview = !weekly && userRole === 'Admin'
  const isAsmReview = userRole === 'Manager' && reviewPosition === 'ASM'
  const isRsmReview = !weekly && userRole === 'Manager' && reviewPosition === 'RSM'
  const stage = isAsmReview ? 'Endorsed' : reviewStage ?? 'Pending'
  const customerOnly = weekly && userRole === 'User'
  const groupByEndorser = !customerOnly && (weekly || stage === 'Endorsed')
  const showKamSummary = !weekly && stage === 'Pending'
  const showWeekDateColumn = !weekly && !groupByEndorser && !showKamSummary
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
  const regionRestricted = customerOnly || userRole === 'Manager' ||
    (userRole === 'Superuser' && reviewPosition === 'Supervisor')
  const canShowActions = availableReviewActions.length > 0
  const requiresReviewReason = actionType === 'return' || actionType === 'reject'
  const ReviewActionIcon = actionType ? reviewActions[actionType].icon : Check
  const selectedCustomerProducts = useMemo(() => {
    const groups = new Map<string, { customerId: number | null; productId: number | null; volume: number }>()
    for (const item of selectedItems) {
      const key = JSON.stringify([item.customer_id, item.product_id])
      const group = groups.get(key)
      if (group) group.volume += Number(item.volume) || 0
      else groups.set(key, {
        customerId: item.customer_id,
        productId: item.product_id,
        volume: Number(item.volume) || 0,
      })
    }
    return [...groups.entries()]
  }, [selectedItems])

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

  function getSalesMonth(item: SalesForecast) {
    const month = getMonthForWeek(item.year, item.week)

    return `${item.year}-${String(month).padStart(2, '0')}`
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
    if (!id) return 'Unknown User'

    return submittedUsers[id] || 'Unknown User'
  }

  // Display whole numbers without decimal places.
  function formatNumber(value: number) {
    return Number(value ?? 0).toLocaleString('en-PH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  // -----------------------------------------
  // BUDGET REFERENCE
  // -----------------------------------------

  function getSavedBudgetVolume(item: SalesForecast) {
    if (reviewReferences) return Number(reviewReferences.get(item.id)?.budget_volume ?? 0)
    if (weeklyBudgetVolumes) return weeklyBudgetVolumes.get(item.id) ?? 0

    return monthlyBudgetReference(budgets, item.year, getMonthForWeek(item.year, item.week),
      item.region_id, item.subregion_id, item.customer_id, item.product_id)
  }

  function getSavedActualMonthly(
    item: SalesForecast,
    targetYear = item.year
  ) {
    if (reviewReferences) {
      const reference = reviewReferences.get(item.id)
      return Number((targetYear === item.year ? reference?.actual_volume : reference?.prior_year_actual_volume) ?? 0)
    }

    if (
      item.product_id == null ||
      item.customer_id == null ||
      item.region_id == null
    ) {
      return 0
    }

    const targetMonth = getMonthForWeek(item.year, item.week)

    return actualRecords
      .filter((actual) => {
        return (
          actual.customer_id === item.customer_id &&
          actual.region_id === item.region_id &&
          actual.product_id === item.product_id &&
          actual.year === targetYear &&
          actual.month === targetMonth
        )
      })
      .reduce(
        (total, actual) =>
          total + (Number(actual.volume) || 0),
        0
      )
  }

  // -----------------------------------------
  // FORECAST VOLUME - PRODUCT LEVEL
  // -----------------------------------------

  function getSavedForecastMonthly(item: SalesForecast) {
    if (reviewReferences) return Number(reviewReferences.get(item.id)?.approved_forecast_volume ?? 0)

    if (
      item.product_id == null ||
      item.customer_id == null ||
      item.region_id == null
    ) {
      return 0
    }

    const targetMonth = getMonthForWeek(item.year, item.week)

    return lookupForecasts
      .filter((forecast) => {
        return (
          forecast.year === item.year &&
          forecast.region_id === item.region_id &&
          forecast.customer_id === item.customer_id &&
          forecast.product_id === item.product_id &&
          getMonthForWeek(forecast.year, forecast.week) === targetMonth
        )
      })
      .reduce(
        (total, forecast) =>
          total + (Number(forecast.volume) || 0),
        0
      )
  }

  // -----------------------------------------
  // CUSTOMER-LEVEL LOOKUP TOTALS
  // -----------------------------------------

  function getCustomerLookupTotal(
    customerGroup: CustomerGroup,
    getValue: (item: SalesForecast) => number
  ) {
    return customerGroup.products.reduce(
      (total, productGroup) => {
        const representative = productGroup.items[0]

        return (
          total +
          (representative ? getValue(representative) : 0)
        )
      },
      0
    )
  }

  // -----------------------------------------
  // CUSTOMER-LEVEL FORECAST VOLUME TOTAL
  //
  // Sum all products belonging to THIS customer.
  // Do not include forecasts belonging to other customers.
  // -----------------------------------------

  function getCustomerForecastMonthlyTotal(
    customerId: number | null,
    items: SalesForecast[]
  ) {
    if (customerId === null || items.length === 0) return 0

    const referenceItem = items[0]
    if (reviewReferences) return Number(reviewReferences.get(referenceItem.id)?.customer_approved_forecast_volume ?? 0)

    const targetYear = referenceItem.year
    const targetMonth = getMonthForWeek(
      referenceItem.year,
      referenceItem.week
    )

    // Get only the regions associated with this customer group.
    const customerRegionIds = Array.from(
      new Set(
        items
          .map((item) => item.region_id)
          .filter((id): id is number => id !== null)
      )
    )

    if (customerRegionIds.length === 0) {
      return 0
    }

    // Sum all products for this customer, within its regions.
    // Other customers are excluded by customer_id.
    return lookupForecasts
      .filter((forecast) => {
        return (
          forecast.year === targetYear &&
          forecast.customer_id === customerId &&
          forecast.region_id !== null &&
          customerRegionIds.includes(forecast.region_id) &&
          getMonthForWeek(forecast.year, forecast.week) === targetMonth
        )
      })
      .reduce(
        (total, forecast) =>
          total + (Number(forecast.volume) || 0),
        0
      )
  }

  // -----------------------------------------
  // LOAD DATA
  // -----------------------------------------

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
    setReviewReferences(null)
    setWeeklyBudgetVolumes(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

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
      .select('role, is_active, region_id, subregion_id, position')
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
    const supervisor = isSuperuser && profile.position === 'Supervisor'
    const restrictSubregion = supervisor || (role === 'Manager' && profile.position === 'RSM')
    const restrictRegion = role === 'Manager' || supervisor || (weekly && role === 'User')

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

    if (!isAdmin && !isSuperuser && role !== 'Manager' && !(weekly && role === 'User')) {
      setError(weekly ? 'You do not have access to Weekly Sales.' : 'You do not have access to Approvals.')
      setSales([])
      setLookupForecasts([])
      setActualRecords([])
      setBudgets([])
      setRegions([])
      setSubregions([])
      setProducts([])
      setCustomers([])
      setSubmittedUsers({})
      return
    }

    if ((restrictRegion && profileRegionId === null) || (restrictSubregion && profileSubregionId === null)) {
      setError(restrictSubregion ? 'Your account needs an assigned region and subregion.' : 'Your account does not have an assigned region.')
      setSales([])
      setLookupForecasts([])
      setActualRecords([])
      setBudgets([])
      setRegions([])
      setSubregions([])
      setProducts([])
      setCustomers([])
      setSubmittedUsers({})
      return
    }

    // REGIONS

    let regionsQuery = supabase
      .from('regions')
      .select('id, name, code, is_active')
      .eq('is_active', true)
      .order('name')

    if (restrictRegion) {
      regionsQuery = regionsQuery.eq('id', profileRegionId)
    }

    // SUBREGIONS

    let subregionsQuery = supabase
      .from('subregions')
      .select('id, name, region_id, is_active')
      .eq('is_active', true)
      .order('name')

    if (restrictRegion) {
      subregionsQuery = subregionsQuery.eq(
        'region_id',
        profileRegionId
      )

      if (supervisor && profileSubregionId !== null) {
        subregionsQuery = subregionsQuery.eq(
          'id',
          profileSubregionId
        )
      }
    }

    // SALES RECORDS

    let salesQuery = supabase
      .from('sales_forecasts')
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

    if (weekly && role === 'User') salesQuery = salesQuery.eq('user_id', user.id)

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

      supabase
        .from('customers')
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

    const salesData = ((salesResult.data ?? []) as SalesForecast[]).map((item) =>
      weekly && !item.submitted_by
        ? { ...item, submitted_by: item.user_id }
        : item
    )

    setSales(salesData)
    window.dispatchEvent(new Event('forecast-workflow-changed'))
    setRegions(regionsResult.data ?? [])
    setSubregions((subregionsResult.data ?? []) as Subregion[])
    setProducts(productsResult.data ?? [])
    setCustomers((customersResult.data ?? []) as Customer[])

    setSelectedRegion(
      restrictRegion ? String(profileRegionId) : 'all'
    )

    // Monthly references load independently from the operational rows.
    async function loadReferences() {
      try {
    // LOOKUP DATA

    const lookupYears = Array.from(
      new Set(
        salesData.flatMap((item) => [
          item.year,
          item.year - 1,
        ])
      )
    )

    if (!weekly && role === 'Manager') {
      const references = new Map<number, ReviewReference>()
      if (salesData.length > 0) {
        const { data, error } = await supabase.rpc('get_forecast_review_reference', {
          p_ids: salesData.map((item) => item.id),
        })

        if (request !== referenceRequest.current) return
        if (error) {
          setReferencesError(true)
          setError('Unable to load review reference volumes. ' + error.message)
        } else {
          for (const reference of (data ?? []) as ReviewReference[]) {
            references.set(reference.forecast_id, reference)
          }
        }
      }
      setReviewReferences(references)
    } else if (lookupYears.length > 0) {
      const useScopedWeeklyBudgets = weekly && role === 'Manager'
      const referenceRegionIds = [...new Set(salesData.flatMap((item) => item.region_id == null ? [] : [item.region_id]))]
      const referenceCustomerIds = [...new Set(salesData.flatMap((item) => item.customer_id == null ? [] : [item.customer_id]))]
      let forecastLookupQuery = supabase
        .from('sales_forecasts')
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
          submitted_by
        `)
        .in('year', lookupYears)
        .eq('status', 'Approved')
        .in('region_id', referenceRegionIds)
        .in('customer_id', referenceCustomerIds)

      if (restrictRegion) {
        forecastLookupQuery =
          supervisor && profileSubregionId !== null
            ? forecastLookupQuery.eq(
                'subregion_id',
                profileSubregionId
              )
            : forecastLookupQuery.eq(
                'region_id',
                profileRegionId
              )
      }

      async function loadApprovedForecastReferences() {
        const records: SalesForecast[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await forecastLookupQuery.order('id').range(from, from + 999)
            .abortSignal(AbortSignal.timeout(20000))
          if (error) return { data: null, error }
          const page = (data ?? []) as SalesForecast[]
          records.push(...page)
          if (page.length < 1000) return { data: records, error: null }
        }
      }

      const [
        forecastLookupResult,
        actualResult,
        budgetResult,
      ] = await Promise.all([
        loadApprovedForecastReferences(),

        weekly
          ? supabase.rpc('get_weekly_sales_monthly_actuals', { p_ids: salesData.map((item) => item.id) })
              .abortSignal(AbortSignal.timeout(20000))
          : loadActualRecords(supabase, lookupYears, {
              regionIds: referenceRegionIds,
              customerIds: referenceCustomerIds,
            }),

        useScopedWeeklyBudgets
          ? supabase.rpc('get_weekly_sales_monthly_budgets', { p_ids: salesData.map((item) => item.id) })
              .abortSignal(AbortSignal.timeout(20000))
          : loadSalesReferenceBudgets(supabase, salesData),
      ])

      if (request !== referenceRequest.current) return
      const lookupError = [
        { source: 'approved forecast', error: forecastLookupResult.error },
        { source: 'actual sales', error: actualResult.error },
        { source: 'budget', error: budgetResult.error },
      ].find((result) => result.error)

      if (lookupError?.error) {
        setReferencesError(true)
        setError('Unable to load ' + lookupError.source + ' reference volumes. ' + lookupError.error.message)
      }

      setLookupForecasts(
        (forecastLookupResult.data ?? []) as SalesForecast[]
      )

      setActualRecords(
        (actualResult.data ?? []) as Omit<ActualRecord, 'category_id'>[]
      )

      if (useScopedWeeklyBudgets) {
        const rows = (budgetResult.data ?? []) as { forecast_id: number; budget_volume: number }[]
        setWeeklyBudgetVolumes(new Map(rows.map((row) => [row.forecast_id, Number(row.budget_volume)])))
      } else {
        setBudgets((budgetResult.data ?? []) as BudgetRecord[])
      }
    } else {
      setLookupForecasts([])
      setActualRecords([])
      setBudgets([])
    }

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

    const submittedByIds = Array.from(
      new Set(
        salesData
          .flatMap((item) => [item.submitted_by, item.endorsed_by])
          .filter((id): id is string => !!id)
      )
    )

    if (weekly && role === 'User') {
      setSubmittedUsers({})
    } else if (weekly && (role === 'Manager' || isSuperuser) && submittedByIds.length > 0) {
      const { data, error } = await supabase.rpc('get_weekly_sales_reviewer_names', {
        p_ids: salesData.map((item) => item.id),
      }).abortSignal(AbortSignal.timeout(20000))
      setSubmittedUsers(Object.fromEntries((data ?? []).map((person: { user_id: string; full_name: string }) =>
        [person.user_id, person.full_name]
      )))
      if (error) setError('Unable to load Weekly Sales names. ' + error.message)
    } else if (!weekly && role === 'Manager') {
      const names = Object.fromEntries(salesData.flatMap((item) =>
        item.submitted_by && item.submitter_name ? [[item.submitted_by, item.submitter_name]] : []
      ))
      if (profile.position === 'ASM' && salesData.some((item) => item.endorsed_by)) {
        const { data, error } = await supabase.rpc('get_forecast_review_endorser_names', {
          p_ids: salesData.map((item) => item.id),
        })

        if (error) {
          setError('Unable to load RSM names. ' + error.message)
        } else {
          for (const endorser of data ?? []) {
            names[endorser.endorser_id] = endorser.full_name
          }
        }
      }
      setSubmittedUsers(names)
    } else if (submittedByIds.length > 0) {
      const {
        data: usersData,
        error: usersError,
      } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', submittedByIds)

      if (usersError) {
        setError(usersError.message)
        return
      }

      const userMap: Record<string, string> = {}

      ;(usersData ?? []).forEach((item) => {
        userMap[item.id] = item.full_name
      })

      setSubmittedUsers(userMap)
    } else {
      setSubmittedUsers({})
    }

  }

  // -----------------------------------------
  // INITIAL LOAD
  // -----------------------------------------

  useEffect(() => {
    loadData()
  }, [])

  // -----------------------------------------
  // FILTERED SALES
  // -----------------------------------------

  const filteredSales = useMemo(() => {
    return sales.filter((item) => {
      const matchesMonth =
        !selectedMonth ||
        getSalesMonth(item) === selectedMonth

      const matchesRegion =
        selectedRegion === 'all' ||
        item.region_id === Number(selectedRegion)

      const matchesStage = weekly || (isRsmReview
        ? item.status === 'Pending' || item.status === 'Endorsed' || item.status === 'Rejected'
        : item.status === stage)

      return matchesMonth && matchesRegion && matchesStage
    })
  }, [sales, selectedMonth, selectedRegion, weekly, stage, isRsmReview])

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
          const customerKey = JSON.stringify([getReviewGroupId(item), customerOnly ? null : item.submitted_by, item.customer_id, isRsmReview ? item.status : null])

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
              return compareUsers(first, second) ||
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
  ])

  // -----------------------------------------
  // GROUP EXPANSION
  // -----------------------------------------

  function getReviewGroupKey(weekKey: string, reviewGroupId: string | null) {
    return JSON.stringify([weekKey, groupByEndorser, reviewGroupId])
  }

  const visibleGroupKeys = new Set(weekGroups.flatMap((weekGroup) =>
    weekGroup.customers.flatMap((customerGroup) => [
      ...(customerOnly ? [] : [getReviewGroupKey(weekGroup.key, getReviewGroupId(customerGroup.items[0]))]),
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

  const columnCount = 10 + Number(canShowActions) + Number(showWeekDateColumn) + Number(groupByEndorser)

  function renderReviewToggle(key: string, label: string) {
    const expanded = expandedGroups.has(key)
    const Chevron = expanded ? ChevronDown : ChevronRight
    return (
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => toggleGroup(key)}
        className="flex w-full items-center gap-2 text-left font-semibold"
      >
        <Chevron className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </button>
    )
  }

  function renderReviewHeading(key: string, label: string) {
    return (
      <tr key={key} className="border-b bg-muted/60">
        <td colSpan={columnCount} className="px-3 py-2">
          {renderReviewToggle(key, label)}
        </td>
      </tr>
    )
  }

  function formatReference(value: number) {
    if (referencesLoading) return <LoadingSpinner label="monthly sales reference" />
    return referencesError ? '—' : formatNumber(value)
  }

  function renderApprovalSummary(key: string, reviewerId: string | null, items: SalesForecast[]) {
    const isRsmSummary = groupByEndorser
    const areas = Array.from(new Set(items.map((item) => getAreaName(item.region_id, item.subregion_id, isRsmSummary ? 'region' : 'subregion'))))
    const salesmanCount = new Set(items.map((item) => item.submitted_by).filter(Boolean)).size
    const customerCount = new Set(items.map((item) => item.customer_id).filter((id) => id !== null)).size
    const productCount = new Set(items.map((item) => item.product_id).filter((id) => id !== null)).size
    const budgetItems = new Map<string, SalesForecast>()
    const actualItems = new Map<string, SalesForecast>()
    const customerItems = new Map<string, SalesForecast>()

    for (const item of items) {
      budgetItems.set(JSON.stringify([item.region_id, item.subregion_id, item.customer_id, item.product_id]), item)
      actualItems.set(JSON.stringify([item.region_id, item.customer_id, item.product_id]), item)
      customerItems.set(JSON.stringify([item.region_id, item.customer_id]), item)
    }

    const totals = [
      items.reduce((total, item) => total + (Number(item.forecast) || 0), 0),
      items.reduce((total, item) => total + (Number(item.volume) || 0), 0),
      Array.from(budgetItems.values()).reduce((total, item) => total + getSavedBudgetVolume(item), 0),
      Array.from(actualItems.values()).reduce((total, item) => total + getSavedActualMonthly(item), 0),
      Array.from(actualItems.values()).reduce((total, item) => total + getSavedActualMonthly(item, item.year - 1), 0),
      Array.from(customerItems.values()).reduce((total, item) =>
        total + getCustomerForecastMonthlyTotal(item.customer_id, [item]), 0),
    ]

    const label = isRsmSummary && reviewerId === null
      ? 'RSM: No endorsement recorded'
      : (isRsmSummary ? 'RSM: ' : 'KAM: ') + getSubmittedByName(reviewerId)
    const statuses = Array.from(new Set(items.map((item) =>
      item.status === 'Rejected' ? 'Returned' : item.status
    )))
    return (
      <Fragment key={key}>
        {renderReviewHeading(key, label)}
        <tr className="border-b bg-muted/30 font-semibold">
          {canShowActions && (
            <td data-action-column="review" className="px-2 py-2"><ActionButtons items={items} label={label} /></td>
          )}
          <td className="px-2 py-2 text-center">
            <div className="flex flex-wrap justify-center gap-1">
              {statuses.map((status) => (
                <span key={status} className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{status}</span>
              ))}
            </div>
          </td>
          <td className="px-2 py-2">{areas.join(', ') || '—'}</td>
          {groupByEndorser && (
            <td className="px-2 py-2">
              {formatNumber(salesmanCount)} {salesmanCount === 1 ? 'Salesman' : 'Salesmen'}
            </td>
          )}
          <td className="px-2 py-2">{formatNumber(customerCount)} {customerCount === 1 ? 'Customer' : 'Customers'}</td>
          <td className="px-2 py-2">{formatNumber(productCount)} {productCount === 1 ? 'Product' : 'Products'}</td>
          {totals.map((total, index) => (
            <td key={index} className="px-2 py-2 text-right tabular-nums">{index >= 2 ? formatReference(total) : formatNumber(total)}</td>
          ))}
        </tr>
      </Fragment>
    )
  }

  // -----------------------------------------
  // ACTION BUTTONS
  // -----------------------------------------

  function ActionButtons({ items, label, allowUndo = true }: {
    items: SalesForecast[]
    label: string
    allowUndo?: boolean
  }) {
    return (
      <div className="flex flex-nowrap items-center justify-center gap-1">
        {availableReviewActions.map((action) => {
          if (!allowUndo && action === 'undo') return null
          if (!items.some((item) => canReviewItem(item, action))) return null
          const { label: actionName, icon: Icon, tone } = reviewActions[action]
          return (
            <button
              key={action}
              type="button"
              data-action-tone={tone}
              data-slot="table-action-button"
              onClick={() => openBulkAction(items, action, label)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title={actionName + ' · ' + label}
              aria-label={actionName + ' · ' + label}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span data-action-label>{action === 'return' ? 'Return' : actionName}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // -----------------------------------------
  // RENDER
  // -----------------------------------------

  return (
    <div className="space-y-6">

      {/* MESSAGES */}

      {error && !selectedItems.length && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* PENDING SALES SUBMISSIONS */}

      <div className="rounded-xl border bg-card shadow-sm">

        {/* HEADER, FILTERS AND BULK ACTIONS */}

        <div className="border-b">
          <div className="flex flex-col">

            {/* TITLE */}

            {!weekly && <div data-section-header="" className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 data-section-title="" className="text-base font-semibold"><HeadingClipboardCheck className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
                    {pageTitle}
                  </h2>


                </div>

              </div>

              <div data-action-toolbar="" className="flex flex-wrap items-center gap-2">
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
              <button data-action-tone="neutral"
                type="button"
                onClick={loadData}
                disabled={loading}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-4 ${
                    loading ? 'animate-spin' : ''
                  }`}
                />
                Refresh
              </button>
              </div>
            </div>

            }
            {/* FILTERS AND BULK ACTIONS */}

            <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-4">
              <div className="min-w-0 max-w-full">
                {/* MONTH AND REGION */}

                <div className="app-field-row">

                  <div data-field-size="compact" className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Month
                    </label>

                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) =>
                        setSelectedMonth(e.target.value)
                      }
                      className="block h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Region
                    </label>

                    <SelectionField value={selectedRegion}
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

              <div data-action-toolbar="" className="flex flex-wrap items-center gap-2">


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

                {weekly && <button type="button" data-action-tone="neutral" onClick={loadData} disabled={loading}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
                </button>}
                <button data-slot="expand-collapse-button" data-action-tone="neutral"
                  type="button"
                  onClick={() =>
                    setExpandedGroups(allGroupsExpanded ? new Set() : visibleGroupKeys)
                  }
                  disabled={loading || visibleGroupKeys.size === 0}
                  className="h-9 rounded-md px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                ><ExpandCollapseIcon expanded={allGroupsExpanded} />
                  {allGroupsExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* APPROVAL TABLE */}

        <Table summary={{ records: filteredSales.length, customers: uniqueCount(filteredSales.map((row) => row.customer_id)), products: uniqueCount(filteredSales.map((row) => row.product_id)) }} data-volume-layout="review"
          className="min-w-[1600px] table-fixed"
          containerProps={{ className: "max-h-[min(32rem,65vh)] w-full overflow-auto", tabIndex: 0, role: "region", "aria-label": pageTitle + ' table' }}
        >

            <colgroup>
              {canShowActions && (
                <col data-action-column="review" />
              )}

              <col data-volume-column="status" className="w-[6%]" />
              {showWeekDateColumn && <col data-volume-column="date" className="w-[9%]" />}
              <col data-volume-column="area" className="w-[10%]" />
              {groupByEndorser && <col data-volume-column="person" className="w-[10%]" />}
              {/* Flexible description columns absorb spare width instead of Action. */}
              <col data-volume-column="customer" />
              <col data-volume-column="product" />
              {Array.from({ length: 6 }, (_, index) => <col key={index} data-volume-column="number" className="w-[6%]" />)}
            </colgroup>

            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b bg-muted/40">

                {canShowActions && (
                  <th data-action-column="review" className="whitespace-nowrap px-2 py-3 text-center font-medium">
                    Action
                  </th>
                )}

                <th className="px-2 py-3 text-center font-medium">
                  Status
                </th>

                {showWeekDateColumn && (
                  <th className="whitespace-nowrap px-2 py-3 text-left font-medium">Week Date</th>
                )}

                <th className="px-2 py-3 text-left font-medium">
                  Area
                </th>

                {groupByEndorser && <th data-fixed-column="person" className="px-2 py-3 text-left font-medium">KAM / Salesman</th>}

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
              {loading ? (
                <TableLoadingRow columns={columnCount} label={weekly ? 'weekly sales' : 'submissions'} />
              ) : weekGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={columnCount}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {weekly ? 'No weekly sales match the current filters.' : 'No forecasts awaiting review match the current filters.'}
                  </td>
                </tr>
              ) : (
                weekGroups.map((weekGroup) => (
                  <Fragment key={weekGroup.key}>

                    {/* WEEK GROUP */}

                    <tr className="border-b bg-muted/30">
                      <td
                        colSpan={columnCount}
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
                      const item = customerGroup.items[0]
                      const previousItem = weekGroup.customers[index - 1]?.items[0]
                      const reviewGroupId = getReviewGroupId(item)
                      const startsReviewGroup = (
                        !previousItem || getReviewGroupId(previousItem) !== reviewGroupId
                      )
                      const reviewGroupKey = getReviewGroupKey(weekGroup.key, reviewGroupId)
                      const reviewGroupExpanded = customerOnly || expandedGroups.has(reviewGroupKey)
                      const reviewGroupRow = !customerOnly && startsReviewGroup
                        ? groupByEndorser || showKamSummary
                          ? renderApprovalSummary(
                              reviewGroupKey,
                              reviewGroupId,
                              weekGroup.customers.flatMap((group) =>
                                getReviewGroupId(group.items[0]) === reviewGroupId ? group.items : []
                              )
                            )
                          : renderReviewHeading(reviewGroupKey, 'KAM: ' + getSubmittedByName(reviewGroupId))
                        : null

                      if (!reviewGroupExpanded) return reviewGroupRow
                      const isExpanded =
                        expandedGroups.has(customerGroup.key)

                      return (
                        <Fragment key={customerGroup.key}>
                          {reviewGroupRow}

                          {/* CUSTOMER SUMMARY */}

                          <tr className="border-b bg-background hover:bg-muted/30">

                            {canShowActions && (
                              <td data-action-column="review" className="px-2 py-2">
                                {!groupByEndorser && !showKamSummary && <ActionButtons
                                  items={customerGroup.items}
                                  label="Customer"
                                />}
                              </td>
                            )}

                            <td className="px-2 py-3 text-center">
                              {!groupByEndorser && !showKamSummary && <span className="inline-block whitespace-nowrap rounded-full bg-muted px-2 py-1 text-xs font-medium">
                                {weekly ? 'Approved' : Array.from(new Set(customerGroup.items.map((item) =>
                                  item.status === 'Rejected' ? 'Returned' : item.status
                                ))).join(' / ')}
                              </span>}
                            </td>

                            {showWeekDateColumn && (
                              <td className="whitespace-nowrap px-2 py-3 font-medium">
                                Week {weekGroup.week}, {weekGroup.year}
                              </td>
                            )}

                            <td className="px-2 py-3 align-top">
                              {groupByEndorser && Array.from(new Set(customerGroup.items.map((record) =>
                                getAreaName(record.region_id, record.subregion_id)
                              ))).join(', ')}
                            </td>

                            {groupByEndorser && (
                              <td className="px-2 py-3 align-top">{getSubmittedByName(item.submitted_by)}</td>
                            )}

                            {/* FULL CUSTOMER NAME */}

                            <td className="px-2 py-3 align-top">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() =>
                                  toggleGroup(
                                    customerGroup.key
                                  )
                                }
                                className="flex w-full min-w-0 items-start gap-2 text-left font-semibold hover:text-primary"
                                title={
                                  isExpanded
                                    ? 'Collapse customer'
                                    : 'Expand customer'
                                }
                              >
                                {isExpanded ? (
                                  <ChevronDown className="mt-0.5 size-4 shrink-0" />
                                ) : (
                                  <ChevronRight className="mt-0.5 size-4 shrink-0" />
                                )}

                                <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
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
                              {formatNumber(
                                customerGroup.forecast
                              )}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold">
                              {formatNumber(
                                customerGroup.volume
                              )}
                            </td>

                            {/* CUSTOMER BUDGET TOTAL */}

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold">
                              {formatReference(
                                getCustomerLookupTotal(
                                  customerGroup,
                                  getSavedBudgetVolume
                                )
                              )}
                            </td>

                            {/* CUSTOMER ACTUAL VOLUME TOTAL */}

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold">
                              {formatReference(
                                getCustomerLookupTotal(
                                  customerGroup,
                                  (item) =>
                                    getSavedActualMonthly(item)
                                )
                              )}
                            </td>

                            {/* CUSTOMER LAST YEAR ACTUAL TOTAL */}

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold">
                              {formatReference(
                                getCustomerLookupTotal(
                                  customerGroup,
                                  (item) =>
                                    getSavedActualMonthly(
                                      item,
                                      item.year - 1
                                    )
                                )
                              )}
                            </td>

                            {/* CUSTOMER FORECAST VOLUME TOTAL */}

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold">
                              {formatReference(
                                getCustomerForecastMonthlyTotal(customerGroup.customer_id, customerGroup.items)
                              )}
                            </td>
                          </tr>

                          {/* EXPANDED PRODUCT ROWS */}

                          {isExpanded &&
                            customerGroup.products.map(
                              (productGroup) => {
                                const referenceItem =
                                  productGroup.items[0]

                                return (
                                  <tr
                                    key={productGroup.key}
                                    className="border-b bg-muted/20 hover:bg-muted/40"
                                  >

                                    {canShowActions && (
                                      <td data-action-column="review" className="px-2 py-2">
                                        {!groupByEndorser && <ActionButtons
                                          items={productGroup.items}
                                          label="Product"
                                          allowUndo={false}
                                        />}
                                      </td>
                                    )}

                                    <td className="px-2 py-2" />

                                    {showWeekDateColumn && <td className="px-2 py-2" />}

                                    {/* AREA HIDDEN */}

                                    <td className="px-2 py-2" />

                                    {groupByEndorser && <td />}

                                    {/* CUSTOMER HIDDEN */}

                                    <td className="px-2 py-2" />

                                    {/* FULL PRODUCT NAME */}

                                    <td className="px-2 py-2 align-top">
                                      <div className="flex min-w-0 items-start gap-2">
                                        <span className="shrink-0 text-muted-foreground">
                                          ↳
                                        </span>

                                        <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] text-xs">
                                          {getProductName(
                                            productGroup.product_id
                                          )}
                                        </span>
                                      </div>
                                    </td>

                                    {/* FORECAST */}

                                    <td className="whitespace-nowrap px-2 py-2 text-right">
                                      {formatNumber(
                                        productGroup.forecast
                                      )}
                                    </td>

                                    {/* VOLUME */}

                                    <td className="whitespace-nowrap px-2 py-2 text-right">
                                      {formatNumber(
                                        productGroup.volume
                                      )}
                                    </td>

                                    {/* BUDGET */}

                                    <td className="whitespace-nowrap px-2 py-2 text-right">
                                      {formatReference(
                                        getSavedBudgetVolume(
                                          referenceItem
                                        )
                                      )}
                                    </td>

                                    {/* ACTUAL VOLUME */}

                                    <td className="whitespace-nowrap px-2 py-2 text-right">
                                      {formatReference(
                                        getSavedActualMonthly(
                                          referenceItem
                                        )
                                      )}
                                    </td>

                                    {/* ACTUAL LAST YEAR */}

                                    <td className="whitespace-nowrap px-2 py-2 text-right">
                                      {formatReference(
                                        getSavedActualMonthly(
                                          referenceItem,
                                          referenceItem.year - 1
                                        )
                                      )}
                                    </td>

                                    {/* FORECAST VOLUME */}

                                    <td className="whitespace-nowrap px-2 py-2 text-right">
                                      {formatReference(
                                        getSavedForecastMonthly(
                                          referenceItem
                                        )
                                      )}
                                    </td>
                                  </tr>
                                )
                              }
                            )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
        </Table>
      </div>

      {/* APPROVAL / REJECTION MODAL */}

      {!weekly && selectedItems.length > 0 && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border bg-background shadow-lg">

            {/* MODAL HEADER */}

            <div data-section-header="" className="border-b px-4 py-4 wrap-anywhere sm:px-6">
              <h2 data-section-title="" className="text-lg font-semibold"><HeadingClipboardCheck className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />{reviewActions[actionType].label} Sales Forecasts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedItems.length} forecast record(s) for {actionLabel}.
              </p>
            </div>

            {/* MODAL CONTENT */}

            <div className="space-y-4 p-4 sm:p-6">

              {/* SUMMARY */}

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid grid-cols-2 gap-4 wrap-anywhere [&>div]:min-w-0">

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Action Scope
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {actionLabel}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Customers
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {new Set(
                        selectedItems.map((item) =>
                          item.customer_id ?? 'unassigned'
                        )
                      ).size}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Products
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {new Set(selectedItems.map((item) => item.product_id)).size}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Total Volume (50kg)
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {formatNumber(
                        selectedItems.reduce(
                          (total, item) =>
                            total +
                            (Number(item.volume) || 0),
                          0
                        )
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t pt-3">
                  <div className="flex justify-between gap-4 text-xs text-muted-foreground">
                    <span>Customer / Product</span>
                    <span className="shrink-0">Volume (50kg)</span>
                  </div>

                  <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-sm font-medium">
                    {selectedCustomerProducts.map(([key, group]) => (
                      <div key={key} className="flex justify-between gap-4">
                        <span className="min-w-0 whitespace-normal break-words text-xs [overflow-wrap:anywhere]">
                          {getCustomerName(group.customerId)} — {getProductName(group.productId)}
                        </span>
                        <span className="shrink-0 text-right tabular-nums">{formatNumber(group.volume)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

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
                  rows={4}
                  placeholder={
                    requiresReviewReason ? 'Enter the reason for this decision' : 'Optional remarks'
                  }
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* MODAL ERROR */}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* MODAL BUTTONS */}

              <div data-action-toolbar="" className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
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
                  {processing ? 'Processing...' : reviewActions[actionType].label + ' (' + selectedItems.length + ')'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
