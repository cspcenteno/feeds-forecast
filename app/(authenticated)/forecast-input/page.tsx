'use client'

import { Table } from '@/components/ui/table'
import { ForecastExcelImport } from '@/components/forecast-excel-import'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Save,
  Trash2,
  Pencil,
  Send,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/client'
import { loadActualRecords, type ActualRecord } from '@/lib/actual-records'
import { useAuthorization } from '@/lib/authorization'
import { loadForecastWeekStates } from '@/lib/forecast-week-locks'

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
  actualLastYear: number
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
const savedStatusLabels = {
  Draft: 'Draft',
  Pending: 'Pending',
  Endorsed: 'Endorsed',
  Rejected: 'Returned',
} as const

function isEditableForecast(item: SalesForecast) {
  return item.status === 'Draft' || item.status === 'Rejected'
}

export default function SalesInputPage() {
  const supabase = createClient()
  const authorization = useAuthorization()
  const currentYear = new Date().getFullYear()

  const [subregions, setSubregions] = useState<{ id: number; name: string }[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [actualRecords, setActualRecords] = useState<ActualRecord[]>([])
  const [savedActualRecords, setSavedActualRecords] = useState<ActualRecord[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [products, setProducts] = useState<Product[]>([])
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [budgetLoadError, setBudgetLoadError] = useState('')
  const [forecasts, setForecasts] = useState<SalesForecast[]>([])
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set()
  )

  const [userId, setUserId] = useState('')
  const [assignedRegionId, setAssignedRegionId] = useState<number | null>(null)
  const [assignedSubregionId, setAssignedSubregionId] = useState<number | null>(null)
  const [role, setRole] = useState('')
  const [salesPosition, setSalesPosition] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

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
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [removedForecastCount, setRemovedForecastCount] = useState(0)
  const [submittedForecastCount, setSubmittedForecastCount] = useState(0)
  const [savedStatusFilter, setSavedStatusFilter] = useState('')

  useEffect(() => {
    async function initialize() {
      const access = await loadUserAccess()

      if (!access) return

      await loadInitialData()
      await loadForecasts(access.userId)
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
    setCustomerSearch('')

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
      if (!selectedRegionId || !selectedCustomerId) {
        setActualRecords([])
        return
      }

      const { data, error } = await loadActualRecords(supabase, [year, year - 1], {
        regionId: Number(selectedRegionId),
        customerId: Number(selectedCustomerId),
      })

      if (cancelled) return

      if (error) {
        setActualRecords([])
        setError(error.message)
        return
      }

      setActualRecords(data ?? [])
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('User session not found.')
      return
    }

    const { data: loadedRegions, error: regionsError } = await supabase
      .from('regions')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')

    if (regionsError) {
      setError(regionsError.message)
      return
    }

    setRegions(loadedRegions ?? [])

    const { data: loadedSubregions, error: subregionsError } = await supabase
      .from('subregions')
      .select('id, name')

    if (subregionsError) {
      setError(subregionsError.message)
    }
    setSubregions(loadedSubregions ?? [])

    const { data: loadedCategories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, code, name')
      .eq('is_active', true)
      .order('name')

    if (categoriesError) {
      setError(categoriesError.message)
      return
    }

    setCategories(loadedCategories ?? [])

    const { data: loadedCustomers, error: customersError } = await supabase
      .from('customers')
      .select('id, customer, region_id')
      .eq('is_active', true)
      .order('customer')

    if (customersError) {
      setError(customersError.message)
      return
    }

    setCustomers((loadedCustomers ?? []) as Customer[])

    const { data: loadedProducts, error: productsError } = await supabase
      .from('products')
      .select('id, category_id, code, name, weight')
      .eq('is_active', true)
      .order('name')

    if (productsError) {
      setError(productsError.message)
      return
    }

    setProducts(loadedProducts ?? [])

    const loadedBudgets: BudgetRecord[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error } = await supabase
        .from('budgets')
        .select('id, year, month, region_id, subregion_id, customer_id, product_id, volume')
        .order('id')
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        setBudgetLoadError(error.message)
        return
      }

      loadedBudgets.push(...page)
      if (page.length < PAGE_SIZE) break
    }

    setBudgets(loadedBudgets)
  }

  const canChooseRegion = role === 'Admin' || (role === 'Superuser' && salesPosition !== 'Supervisor')
  const availableRegions = useMemo(() => {
    if (canChooseRegion) {
      return regions
    }

    return regions.filter((region) => region.id === assignedRegionId)
  }, [regions, canChooseRegion, assignedRegionId])

  async function loadForecasts(ownerId: string) {
    setError('')

    const baseQuery = supabase
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
        remarks
      `)
      .eq('user_id', ownerId)
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
        setError(error.message)
        return
      }

      const page = (data ?? []) as SalesForecast[]
      allForecasts.push(...page)

      if (page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    setForecasts(allForecasts)

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

    const { data, error } = await loadActualRecords(supabase, lookupYears)
    if (error) {
      setSavedActualRecords([])
      setError(error.message)
      return
    }

    setSavedActualRecords(data ?? [])
  }

  async function checkWeekLock(
    checkYear = year,
    checkWeek = week
  ): Promise<boolean> {
    setCheckingWeekLock(true)
    try {
      const states = await loadForecastWeekStates(supabase, [{ year: checkYear, week: checkWeek }])
      const status = states[0].status
      setWeekStatus(status)
      return status !== 'Open'
    } catch (error) {
      setWeekStatus('Locked')
      setError(error instanceof Error ? error.message : 'Unable to verify the week lock.')
      return true
    } finally { setCheckingWeekLock(false) }
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

  function getWeeksInMonth(
    selectedYear: number,
    selectedMonth: number
  ) {
    const weeks = new Set<number>()

    const daysInMonth = new Date(
      Date.UTC(selectedYear, selectedMonth, 0)
    ).getUTCDate()

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        Date.UTC(selectedYear, selectedMonth - 1, day)
      )

      const weekday = date.getUTCDay() || 7
      const thursday = new Date(date)

      thursday.setUTCDate(date.getUTCDate() + 4 - weekday)

      const isoYear = thursday.getUTCFullYear()
      const yearStart = new Date(Date.UTC(isoYear, 0, 1))

      const weekNumber = Math.ceil(
        ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
      )

      if (isoYear === selectedYear) {
        weeks.add(weekNumber)
      }
    }

    return Math.max(weeks.size, 1)
  }

  function addRow() {
    if (!authorization.can('Forecast Input', 'add')) return

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

  function getAreaName(regionId: number | null, subregionId: number | null) {
    const region = regions.find((item) => item.id === regionId)
    const subregion = subregions.find((item) => item.id === subregionId)
    return [region?.code?.trim() || region?.name, subregion?.name].filter(Boolean).join(' - ') || '-'
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
    targetYear = year
  ) {
    if (!row.product_id || !selectedCustomerId) return 0

    return actualRecords
      .filter(
        (item) =>
          item.customer_id === Number(selectedCustomerId) &&
          item.region_id === Number(selectedRegionId) &&
          item.year === targetYear &&
          item.month === selectedMonth &&
          item.product_id === Number(row.product_id)
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
    if (!regionId || !productId) return 0

    const matching = budgets.filter((item) =>
      item.year === targetYear &&
      item.region_id === regionId &&
      item.product_id === productId &&
      (item.customer_id === customerId || item.customer_id === null) &&
      (item.subregion_id === subregionId || item.subregion_id === null)
    )

    const scopes = [
      matching.filter((item) => item.customer_id === customerId && item.subregion_id === subregionId),
      matching.filter((item) => item.customer_id === customerId && item.subregion_id === null),
      matching.filter((item) => item.customer_id === null && item.subregion_id === subregionId),
      matching.filter((item) => item.customer_id === null && item.subregion_id === null),
    ]

    const scoped = scopes.find((items) =>
      items.some((item) => item.month === targetMonth || item.month === null)
    )
    if (!scoped) return 0

    const monthly = scoped.find((item) => item.month === targetMonth)
    if (monthly) return Number(monthly.volume) || 0

    const yearly = scoped.find((item) => item.month === null)
    return (Number(yearly?.volume) || 0) / 12
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
    if (!row.product_id || !selectedCustomerId) return 0

    return forecasts
      .filter(
        (item) =>
          item.status === 'Approved' &&
          item.year === year &&
          item.region_id === Number(selectedRegionId) &&
          item.customer_id === Number(selectedCustomerId) &&
          item.product_id === Number(row.product_id) &&
          getMonthForWeek(item.year, item.week) === selectedMonth
      )
      .reduce((total, item) => total + Number(item.volume || 0), 0)
  }

  // Saved forecast reference values are calculated from lookup records.

  function getSavedActualMonthly(
    item: SalesForecast,
    targetYear = item.year
  ) {
    if (
      !item.product_id ||
      !item.customer_id ||
      !item.region_id
    ) {
      return 0
    }

    const targetMonth = getMonthForWeek(item.year, item.week)

    return savedActualRecords
      .filter(
        (actual) =>
          actual.customer_id === item.customer_id &&
          actual.region_id === item.region_id &&
          actual.product_id === item.product_id &&
          actual.year === targetYear &&
          actual.month === targetMonth
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

  function getSavedForecastMonthly(item: SalesForecast) {
    if (
      !item.product_id ||
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
          forecast.product_id === item.product_id &&
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
            `Duplicate Category and Product found in rows ${i + 1} and ${j + 1}.`
          )
          return false
        }
      }
    }

    return true
  }

  async function handleSave() {
    if (
      (rows.some((row) => row.id === null) &&
        !authorization.can('Forecast Input', 'add')) ||
      (rows.some((row) => row.id !== null) &&
        !authorization.can('Forecast Input', 'edit'))
    ) {
      return
    }

    setError('')
    setMessage('')

    const locked = await checkWeekLock(year, week)

    if (locked) {
      setError(`Week ${week} - ${year} is locked and cannot be modified.`)
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
        user_id: userId,
      }))

    const { error: saveError } = await supabase
      .from('sales_forecasts')
      .upsert(payload, { onConflict: 'id' })

    if (saveError) {
      setPendingAction(null)
      setError(saveError.message)
      return
    }

    setMessage('Forecasts saved successfully.')
    setSelectedCustomerId('')
    setCustomerSearch('')

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

    await loadForecasts(userId)
  }

  async function handleEdit(item: SalesForecast) {
    if (!authorization.can('Forecast Input', 'edit')) return

    if (!isEditableForecast(item)) {
      setError('Only draft or returned forecasts can be edited.')
      return
    }

    if (role === 'Manager' && item.region_id !== assignedRegionId) {
      setError('You can only edit forecasts from your assigned region.')
      return
    }

    if (item.user_id !== userId) {
      setError('You can only edit your own forecasts.')
      return
    }

    const locked = await checkWeekLock(item.year, item.week)

    if (locked) {
      setError(
        `Week ${item.week} - ${item.year} is locked. This forecast cannot be edited.`
      )
      return
    }

    setError('')
    setMessage('')

    setYear(item.year)
    setWeek(item.week)
    setSelectedMonth(getMonthForWeek(item.year, item.week))

    setSelectedWeek(
      `${item.year}-W${String(item.week).padStart(2, '0')}`
    )

    setSelectedRegionId(
      item.region_id ? String(item.region_id) : ''
    )

    setSelectedSubregionId(
      item.subregion_id ? String(item.subregion_id) : ''
    )

    setSelectedCustomerId(String(item.customer_id ?? ''))
    setCustomerSearch(getCustomerName(item.customer_id))

    const selectedProduct = products.find(
      (product) => product.id === item.product_id
    )

    setRows([
      {
        tempId: crypto.randomUUID(),
        id: item.id,
        category_id: String(item.category_id ?? ''),
        product_id: String(item.product_id ?? ''),
        product_search: selectedProduct
          ? `${selectedProduct.code} - ${selectedProduct.name}`
          : '',
        forecast: String(item.forecast ?? ''),
        status: item.status,
      },
    ])

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleEditCustomer(items: SalesForecast[]) {
    if (!authorization.can('Forecast Input', 'edit') || items.length === 0) return
    const first = items[0]
    if (items.some((item) => item.region_id !== first.region_id || item.subregion_id !== first.subregion_id)) {
      setError('This customer has forecasts across multiple areas. Edit the products individually.')
      return
    }
    for (const item of items) {
      if (!isEditableForecast(item) || (role === 'Manager' && item.region_id !== assignedRegionId) || item.user_id !== userId) {
        setError('You can only edit eligible forecasts from your assigned area or account.')
        return
      }
      if (await checkWeekLock(item.year, item.week)) {
        setError(`Week ${item.week} - ${item.year} is locked. These forecasts cannot be edited.`)
        return
      }
    }

    setError('')
    setMessage('')
    setYear(first.year)
    setWeek(first.week)
    setSelectedMonth(getMonthForWeek(first.year, first.week))
    setSelectedWeek(`${first.year}-W${String(first.week).padStart(2, '0')}`)
    setSelectedRegionId(first.region_id ? String(first.region_id) : '')
    setSelectedSubregionId(first.subregion_id ? String(first.subregion_id) : '')
    setSelectedCustomerId(String(first.customer_id ?? ''))
    setCustomerSearch(getCustomerName(first.customer_id))
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function canSubmitItem(item: SalesForecast) {
    return item.status === 'Draft' && item.user_id === userId &&
      item.region_id !== null &&
      (isAdmin || (item.region_id === assignedRegionId && item.subregion_id === assignedSubregionId))
  }

  async function handleSubmitCustomer(items: SalesForecast[]) {
    if (!canSubmitForecasts) return
    const eligibleItems = items.filter(canSubmitItem)
    if (eligibleItems.length === 0) {
      setError('There are no eligible forecasts for this customer.')
      return
    }
    for (const item of eligibleItems) {
      if (await checkWeekLock(item.year, item.week)) {
        setError(`Week ${item.week} - ${item.year} is locked. These forecasts cannot be submitted.`)
        return
      }
    }
    if (!window.confirm(`Submit all ${eligibleItems.length} forecast record(s) for this customer?`)) return
    setSubmittedForecastCount(0)
    setPendingAction('submit')
    setError('')
    setMessage('')
    const { data, error } = await supabase.rpc('transition_forecast_review', {
      p_ids: eligibleItems.map((item) => item.id),
      p_action: 'submit',
    })
    setPendingAction(null)
    if (error) {
      setError(error.message)
      return
    }
    setSubmittedForecastCount(Number(data))
    await loadForecasts(userId)
  }

  async function handleDeleteMany(items: SalesForecast[], scope: 'customer' | 'product' = 'customer') {
    if (!authorization.can('Forecast Input', 'delete') || items.length === 0) return
    for (const item of items) {
      if (!isEditableForecast(item) || (role === 'Manager' && item.region_id !== assignedRegionId) || item.user_id !== userId) {
        setError('You can only delete eligible forecasts from your assigned area or account.')
        return
      }
      if (await checkWeekLock(item.year, item.week)) {
        setError(`Week ${item.week} - ${item.year} is locked. These forecasts cannot be deleted.`)
        return
      }
    }
    const confirmed = window.confirm(`Remove ${items.length} forecast record(s) ${scope === 'customer' ? 'for this customer' : 'for this product'}?`)
    if (!confirmed) return
    setRemovedForecastCount(0)
    const { error } = await supabase.from('sales_forecasts').delete().in('id', items.map((item) => item.id)).eq('user_id', userId)
    if (error) {
      setError(error.message)
      return
    }
    setRemovedForecastCount(items.length)
    await loadForecasts(userId)
  }

  async function handleSubmitAll() {
    if (!canSubmitForecasts) return

    setError('')
    setMessage('')
    setSubmittedForecastCount(0)

    const draftForecasts = forecasts.filter(canSubmitItem)

    if (draftForecasts.length === 0) {
      setError('There are no eligible forecasts to submit.')
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
      setError(error instanceof Error ? error.message : 'Unable to verify forecast week locks.')
      return
    }

    const lockedWeeks = lockResults.filter(
      (item) => item.status === 'Locked'
    )

    if (lockedWeeks.length > 0) {
      setPendingAction(null)
      setError(
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

    const confirmed = window.confirm(
      `Submit all ${draftForecasts.length} forecast record(s) across all weeks?`
    )

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
      setError(submitError.message)
      return
    }

    setSubmittedForecastCount(Number(data))

    setPendingAction(null)

    await loadForecasts(userId)
  }

  const visibleSavedForecasts = useMemo(() => forecasts.filter((item) =>
    Object.hasOwn(savedStatusLabels, item.status) &&
    (!savedStatusFilter || item.status === savedStatusFilter)
  ), [forecasts, savedStatusFilter])

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
      const customerKey = `${item.customer_id ?? 'no-customer'}-${item.status}`

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
      customers: Array.from(weekGroup.customers.values()).map(
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
                  actualLastYear: getSavedActualMonthly(
                    first,
                    first.year - 1
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
  }, [visibleSavedForecasts, forecasts, budgets, savedActualRecords])

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
        year: 'numeric',
        timeZone: 'UTC',
      })

    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`
  }

  const canSubmitForecasts =
    authorization.can('Forecast Input', 'edit') &&
    (isAdmin || (
      (salesPosition === 'KAM' || salesPosition === 'Supervisor') &&
      assignedRegionId !== null && assignedSubregionId !== null
    ))
  const eligibleSubmissionCount = forecasts.filter(canSubmitItem).length

  const savedCustomers = savedWeekGroups.flatMap((group) => group.customers)
  const totalSavedCustomers = new Set(savedCustomers.map((customer) => customer.customer_id)).size
  const totalSavedProducts = new Set(
    savedCustomers.flatMap((customer) => customer.products.map((product) => product.product_id))
  ).size
  const allSavedCustomersExpanded = savedCustomers.length > 0 &&
    savedCustomers.every((customer) => expandedCustomers.has(customer.key))

  const isLocked = weekStatus === 'Locked'

  const isFormDisabled =
    isLocked ||
    checkingWeekLock ||
    loading ||
    (!authorization.can('Forecast Input', 'add') &&
      !authorization.can('Forecast Input', 'edit'))

  function formatNumber(value: number) {
    return Number(value || 0).toLocaleString('en-PH', {
      maximumFractionDigits: 2,
    })
  }

  const canShowActions =
    authorization.can('Forecast Input', 'edit') ||
    authorization.can('Forecast Input', 'delete')
  const showReturnRemarks = visibleSavedForecasts.some((item) => item.status === 'Rejected')
  const savedColumnCount = 10 + Number(canShowActions) + Number(showReturnRemarks)

  return (
    <div className="space-y-6">
      {budgetLoadError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Unable to load budget values. {budgetLoadError}
        </div>
      )}

      {/* ADD FORECAST */}

      {userId && role === 'Admin' && authorization.can('Forecast Input', 'add') && (
        <ForecastExcelImport
          key={userId}
          userId={userId}
          isAdmin={role === 'Admin'}
          scope={{ allRegions: canChooseRegion, regionId: assignedRegionId, subregionId: assignedSubregionId }}
          blocked={pendingAction !== null}
          onBusyChange={setImportBusy}
          onImported={() => loadForecasts(userId)}
        />
      )}

      {authorization.can('Forecast Input', 'add') ||
      authorization.can('Forecast Input', 'edit') ? (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">
                  Add Forecast
                </h2>

                <p className="text-sm text-muted-foreground">
                  Enter multiple forecast rows for the selected week.
                </p>
              </div>

              <div
                className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
                  checkingWeekLock
                    ? 'bg-muted text-muted-foreground'
                    : isLocked
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/10 text-primary'
                }`}
              >
                Week {week} · {year} ·{' '}
                {checkingWeekLock ? 'Checking...' : weekStatus}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* WEEK */}

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Week Date
                  </label>

                  <input
                    type="week"
                    value={selectedWeek}
                    onChange={(e) => handleWeekChange(e.target.value)}
                    disabled={loading}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {/* REGION */}

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Region
                  </label>

                  <select
                    value={selectedRegionId}
                    onChange={(e) => {
                      setSelectedRegionId(e.target.value)
                      setSelectedSubregionId('')
                      setSelectedCustomerId('')
                      setCustomerSearch('')
                    }}
                    disabled={
                      isFormDisabled ||
                      (role !== 'Admin' && role !== 'Superuser')
                    }
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select region</option>

                    {availableRegions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* CUSTOMER */}

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Customer
                  </label>

                  <input
                    type="text"
                    list="forecast-customer-options"
                    value={
                      selectedCustomerId
                        ? availableCustomers.find(
                            (item) =>
                              String(item.id) === selectedCustomerId
                          )?.customer ?? customerSearch
                        : customerSearch
                    }
                    onChange={(e) => {
                      const value = e.target.value

                      const match = availableCustomers.find(
                        (item) =>
                          item.customer.toLowerCase() ===
                          value.trim().toLowerCase()
                      )

                      setCustomerSearch(value)
                      setSelectedCustomerId(
                        match ? String(match.id) : ''
                      )
                    }}
                    onBlur={() => {
                      const match = availableCustomers.find(
                        (item) =>
                          item.customer.toLowerCase() ===
                          customerSearch.trim().toLowerCase()
                      )

                      if (match) {
                        setSelectedCustomerId(String(match.id))
                        setCustomerSearch(match.customer)
                      } else if (!selectedCustomerId) {
                        setCustomerSearch('')
                      }
                    }}
                    disabled={isFormDisabled || !selectedRegionId}
                    placeholder={
                      selectedRegionId
                        ? 'Search customer...'
                        : 'Select region first'
                    }
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />

                  <datalist id="forecast-customer-options">
                    {availableCustomers.map((item) => (
                      <option key={item.id} value={item.customer} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* FORECAST INPUT TABLE */}

            <Table
              className="min-w-[900px] table-fixed"
              containerProps={{ className: "w-full overflow-x-auto rounded-lg border" }}
            >
                <colgroup>{[
                  'w-[5%]',
                  'w-[5%]',
                  'w-[30%]',
                  'w-[10%]',
                  'w-[10%]',
                  'w-[10%]',
                  'w-[10%]',
                  'w-[10%]',
                  'w-[10%]',
                ].map((width, index) => (
                  <col key={index} className={width} />
                ))}</colgroup>

    <thead>
      <tr className="border-b bg-muted/30">
        <th
          colSpan={5}
          className="px-2 py-2 text-left text-sm font-semibold"
        >
          Forecast details
        </th>

        <th
          colSpan={4}
          className="border-l-2 border-dashed border-muted-foreground/30 bg-muted/70 px-2 py-2 text-left text-sm font-semibold text-muted-foreground"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Sales reference</span>

            <div className="flex items-center gap-2">
              <label
                htmlFor="row-input-month-filter"
                className="whitespace-nowrap text-xs font-medium"
              >
                Month:
              </label>

              <select
                id="row-input-month-filter"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                disabled={isFormDisabled}
                className="h-8 w-28 rounded-md border bg-background px-2 text-xs font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {new Date(2000, index, 1).toLocaleString('en', {
                      month: 'long',
                    })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </th>
      </tr>

      <tr className="border-b bg-muted/40">
        <th className="whitespace-nowrap px-0 py-3 text-center font-medium">
          Action
        </th>

        <th className="whitespace-nowrap px-0 py-3 text-center font-medium">
          #
        </th>

        <th className="break-words px-1 py-3 text-left font-medium">
          Product
        </th>

        <th className="break-words px-1 py-3 text-right font-medium">
          Forecast<br />(Qty.)
        </th>

        <th className="break-words px-1 py-3 text-right font-medium">
          Volume<br />(50kg)
        </th>

        <th className="break-words border-l-2 border-dashed border-muted-foreground/30 bg-muted/50 px-1 py-3 text-right font-medium text-muted-foreground">
          Budget<br />(Vol.)
        </th>

        <th className="break-words bg-muted/50 px-1 py-3 text-right font-medium text-muted-foreground">
          Actual<br />(Vol.)
        </th>

        <th className="break-words bg-muted/50 px-1 py-3 text-right font-medium text-muted-foreground">
          Actual (Last<br />Year Vol.)
        </th>

        <th className="break-words bg-muted/50 px-1 py-3 text-right font-medium text-muted-foreground">
          Forecast<br />(Vol.)
        </th>
      </tr>
    </thead>

    <tbody>
      {rows.map((row, index) => {
        const rowVolume = getRowVolume(row)
        const rowMonthlyBudget = getMonthlyBudgetForRow(row)
        const rowActualMonthly = getActualMonthlyForRow(row)
        const rowActualLastYear = getActualMonthlyForRow(row, year - 1)
        const rowForecastMonthly = getForecastMonthlyForRow(row)

        return (
          <tr key={row.tempId} className="border-b last:border-0">
            <td className="px-0 py-3 text-center">
              <button data-action-tone="danger"
                type="button"
                onClick={() => removeRow(row.tempId)}
                disabled={isFormDisabled || !selectedCustomerId}
                className="inline-flex size-4 items-center justify-center rounded-md border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                title="Remove row"
              >
                <Trash2 className="size-3.5" />
              </button>
            </td>

            <td className="px-0 py-3 text-center text-muted-foreground">
              {index + 1}
            </td>

            <td className="px-1 py-3">
              <input
                type="text"
                list={`product-options-${row.tempId}`}
                value={row.product_search}
                onChange={(e) =>
                  updateRow(row.tempId, 'product_search', e.target.value)
                }
                disabled={isFormDisabled || !selectedCustomerId}
                placeholder="Search product by code or name..."
                autoComplete="off"
                className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />

              <datalist id={`product-options-${row.tempId}`}>
                {products.map((product) => (
                  <option
                    key={product.id}
                    value={`${product.code} - ${product.name}`}
                  />
                ))}
              </datalist>
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
              {rowVolume === null ? '—' : formatNumber(rowVolume)}
            </td>

            <td className="break-words border-l-2 border-dashed border-muted-foreground/30 bg-muted/30 px-1 py-3 text-right font-medium text-muted-foreground">
              {formatNumber(rowMonthlyBudget)}
            </td>

            <td className="break-words bg-muted/30 px-1 py-3 text-right font-medium text-muted-foreground">
              {formatNumber(rowActualMonthly)}
            </td>

            <td className="break-words bg-muted/30 px-1 py-3 text-right font-medium text-muted-foreground">
              {formatNumber(rowActualLastYear)}
            </td>

            <td className="break-words bg-muted/30 px-1 py-3 text-right font-medium text-muted-foreground">
              {formatNumber(rowForecastMonthly)}
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
              !selectedCustomerId ||
              !authorization.can('Forecast Input', 'add')
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

        <td className="border-l-2 border-dashed border-muted-foreground/30 bg-muted/30 px-1 py-4" />
        <td className="bg-muted/30 px-1 py-4" />
        <td className="bg-muted/30 px-1 py-4" />
        <td className="bg-muted/30 px-1 py-4" />
      </tr>
    </tfoot>
            </Table>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button data-action-tone="primary" data-action-fill=""
                type="button"
                onClick={handleSave}
                disabled={
                  isFormDisabled ||
                  (!authorization.can('Forecast Input', 'add') &&
                    !authorization.can('Forecast Input', 'edit'))
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="size-4" />
                {pendingAction === 'save' ? 'Saving...' : 'Save Draft'}
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

            {checkingWeekLock && (
              <div className="mt-5 rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Checking week lock status...
                </p>
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {message && (
              <div className="mt-5 rounded-lg border bg-muted px-4 py-3 text-sm">
                {message}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* SAVED FORECASTS */}

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Saved Forecasts
            </h2>

            <p className="text-sm text-muted-foreground">
              Track drafts, pending reviews, endorsements, and returns by week and customer.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              Status
              <select
                value={savedStatusFilter}
                onChange={(event) => setSavedStatusFilter(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All open statuses</option>
                {Object.entries(savedStatusLabels).map(([status, label]) => (
                  <option key={status} value={status}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* SAVED FORECAST TABLE */}

        <Table saved
          className="table-fixed"
          containerProps={{ className: "max-h-[min(32rem,65vh)] w-full overflow-auto", tabIndex: 0, role: "region", "aria-label": "Saved Forecasts table" }}
        >
            <colgroup>
              {canShowActions && <col className="w-[5%]" />}
              <col className="w-[6%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[6%]"/>
              <col className="w-[6%]"/>
              <col className="w-[6%]"/>
              <col className="w-[6%]"/>
              <col className="w-[6%]"/>
              <col className="w-[6%]"/>
              {showReturnRemarks && <col className="w-52" />}
            </colgroup>

            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b bg-muted/40">
                {canShowActions && (
                  <th className="whitespace-nowrap px-2 py-3 text-center font-medium">
                    Action
                  </th>
                )}

                <th className="px-2 py-3 text-center font-medium">
                  Status
                </th>

                <th className="px-2 py-3 text-left font-medium">
                  Area
                </th>

                <th className="px-2 py-3 text-left font-medium">
                  Customer
                </th>

                <th className="px-2 py-3 text-left font-medium">
                  Product
                </th>

                <th className="px-2 py-3 text-right font-medium">
                  Forecast<br />(Qty.)
                </th>

                <th className="px-2 py-3 text-right font-medium">
                  Volume<br />(50kg)
                </th>

                <th className="px-2 py-3 text-right font-medium">
                  Budget<br />(Vol.)
                </th>

                <th className="px-2 py-3 text-right font-medium">
                  Actual<br />(Vol.)
                </th>

                <th className="px-2 py-3 text-right font-medium">
                  Actual (Last<br />Year Vol.)
                </th>

                <th className="px-2 py-3 text-right font-medium">
                  Forecast<br />(Vol.)
                </th>
                {showReturnRemarks && <th scope="col" className="px-2 py-3 text-left font-medium">Remarks</th>}
              </tr>
            </thead>

            <tbody>
              {removedForecastCount > 0 && (
                <tr className="border-b bg-muted/50">
                  <td colSpan={savedColumnCount} className="px-4 py-3 text-sm">
                    <span role="status">{removedForecastCount} forecast record(s) removed.</span>
                  </td>
                </tr>
              )}
              {savedWeekGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={savedColumnCount}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No saved forecasts found.
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

                    {weekGroup.customers.map((customerGroup) => {
                      const isExpanded = expandedCustomers.has(
                        customerGroup.key
                      )

                      const allItems = customerGroup.items
                      const uniqueAreas = Array.from(
                        new Set(
                          allItems.map((item) => getAreaName(item.region_id, item.subregion_id))
                        )
                      )

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

                      // Reference values are summed once per unique product,
                      // rather than once per saved record.
                      const customerBudget = customerGroup.products.reduce(
                        (total, item) => total + item.budget,
                        0
                      )

                      const customerActualMonthly =
                        customerGroup.products.reduce(
                          (total, item) => total + item.actualMonthly,
                          0
                        )

                      const customerActualLastYear =
                        customerGroup.products.reduce(
                          (total, item) => total + item.actualLastYear,
                          0
                        )

                      const customerForecastMonthly =
                        customerGroup.products.reduce(
                          (total, item) => total + item.forecastMonthly,
                          0
                        )

                      const returnReasons = Array.from(new Set(allItems.flatMap((item) =>
                        item.status === 'Rejected' && item.remarks ? [item.remarks] : []
                      )))

                      const status = allItems[0].status as keyof typeof savedStatusLabels
                      const customerStatus = savedStatusLabels[status]
                      const editable = isEditableForecast(allItems[0])

                      const customerCanEdit =
                        editable && authorization.can('Forecast Input', 'edit')

                      const customerCanDelete =
                        editable && authorization.can('Forecast Input', 'delete')
                      const customerCanSubmit =
                        canSubmitForecasts &&
                        allItems.some(canSubmitItem)

                      return (
                        <Fragment key={customerGroup.key}>
                          {/* CUSTOMER SUMMARY ROW */}

                          <tr className="border-b bg-background hover:bg-muted/30">
                            {canShowActions && (
                              <td className="px-2 py-3 text-center">
                                <div className="flex flex-wrap items-center justify-center gap-1">
                                  {customerCanEdit && <button data-action-tone="caution" type="button" onClick={() => handleEditCustomer(allItems)} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40" title="Edit customer forecasts"><Pencil className="size-4" /></button>}
                                  {customerCanDelete && <button data-action-tone="danger" type="button" onClick={() => handleDeleteMany(allItems)} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40" title="Delete customer forecasts"><Trash2 className="size-4" /></button>}
                                  {customerCanSubmit && <button data-action-tone="transfer" type="button" onClick={() => handleSubmitCustomer(allItems)} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40" title="Submit customer forecasts"><Send className="size-4" /></button>}
                                </div>
                              </td>
                            )}

                            <td className="px-2 py-3 text-center">
                              <span className="inline-block whitespace-nowrap rounded-full bg-muted px-2 py-1 text-xs font-medium">
                                {customerStatus}
                              </span>
                            </td>

                            <td
                              className="px-2 py-3"
                              title={uniqueAreas.join(', ')}
                            >
                              {uniqueAreas.join(', ')}
                            </td>

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
                              {formatNumber(customerVolume)}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-muted-foreground">
                              {formatNumber(customerBudget)}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-muted-foreground">
                              {formatNumber(customerActualMonthly)}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-muted-foreground">
                              {formatNumber(customerActualLastYear)}
                            </td>

                            <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-muted-foreground">
                              {formatNumber(customerForecastMonthly)}
                            </td>
                            {showReturnRemarks && (
                              <td className="space-y-1 px-2 py-3 text-xs text-muted-foreground">
                                {returnReasons.map((reason) => <p key={reason}>{reason}</p>)}
                              </td>
                            )}
                          </tr>

                          {/* EXPANDED PRODUCT ROWS */}

                          {isExpanded &&
                            customerGroup.products.map((productGroup) => {
                              const singleItem =
                                productGroup.items.length === 1
                                  ? productGroup.items[0]
                                  : null

                              return (
                                <tr
                                  key={productGroup.key}
                                  className="border-b bg-muted/20 last:border-0 hover:bg-muted/40"
                                >
                                  {canShowActions && (
                                    <td className="whitespace-nowrap px-2 py-2">
                                      <div className="flex items-center justify-center gap-1">
                                        {singleItem && (
                                          <>
                                          {customerCanEdit && (
                                            <button data-action-tone="caution"
                                              type="button"
                                              onClick={() =>
                                                handleEdit(singleItem)
                                              }
                                              disabled={
                                                loading ||
                                                singleItem.status ===
                                                  'Approved'
                                              }
                                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                              title="Edit"
                                            >
                                              <Pencil className="size-4" />
                                            </button>
                                          )}

                                          {customerCanDelete && (
                                            <button data-action-tone="danger"
                                              type="button"
                                              onClick={() => handleDeleteMany(productGroup.items, 'product')}
                                              disabled={
                                                loading ||
                                                singleItem.status ===
                                                  'Approved'
                                              }
                                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                              title="Remove product forecasts"
                                            >
                                              <Trash2 className="size-4" />
                                            </button>
                                          )}
                                          </>
                                        )}
                                        {customerCanDelete && !singleItem && (
                                          <button data-action-tone="danger" type="button" onClick={() => handleDeleteMany(productGroup.items, 'product')} disabled={loading} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition hover:bg-muted disabled:opacity-40" title="Remove product forecasts"><Trash2 className="size-4" /></button>
                                        )}
                                        </div>
                                    </td>
                                  )}

                                  <td className="px-2 py-2" />

                                  {/* Area is shown once on the customer row. */}

                                  <td className="px-2 py-2" />

                                  {/* Customer is shown once on the customer row. */}

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
                                    {formatNumber(productGroup.volume)}
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                                    {formatNumber(productGroup.budget)}
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                                    {formatNumber(
                                      productGroup.actualMonthly
                                    )}
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                                    {formatNumber(
                                      productGroup.actualLastYear
                                    )}
                                  </td>

                                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                                    {formatNumber(
                                      productGroup.forecastMonthly
                                    )}
                                  </td>
                                  {showReturnRemarks && <td />}
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
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          {canSubmitForecasts &&
            (!savedStatusFilter || savedStatusFilter === 'Draft') &&
            eligibleSubmissionCount > 0 && (
              <button data-action-tone="transfer" data-action-fill=""
                type="button"
                onClick={handleSubmitAll}
                disabled={loading}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
                {pendingAction === 'submitAll' ? 'Submitting...' : 'Submit All'}
              </button>
            )}
          <button
            type="button"
            data-action-tone="neutral"
            onClick={() => setExpandedCustomers(new Set(
              allSavedCustomersExpanded ? [] : savedCustomers.map((customer) => customer.key)
            ))}
            disabled={savedCustomers.length === 0}
            className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {allSavedCustomersExpanded ? 'Collapse All' : 'Expand All'}
          </button>
          <span className="text-sm text-muted-foreground">
            {totalSavedCustomers} {totalSavedCustomers === 1 ? 'Customer' : 'Customers'}
            {' · '}
            {totalSavedProducts} {totalSavedProducts === 1 ? 'Product' : 'Products'}
          </span>
        </div>
        {submittedForecastCount > 0 && (
          <div role="status" className="border-t bg-muted/50 px-4 py-3 text-sm">
            {submittedForecastCount} forecast record(s) submitted for RSM review.
          </div>
        )}
      </div>
    </div>
  )
}
