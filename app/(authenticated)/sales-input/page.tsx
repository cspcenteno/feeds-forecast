'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Save,
  Trash2,
  Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'

type Region = {
  id: number
  name: string
  code: string | null
}
type Subregion = { id: number; name: string; region_id: number }

type Category = {
  id: number
  code: string
  name: string
}

type Product = {
  id: number
  category_id: number | null
  code: string
  name: string
  unit_price: number
}

type BudgetRecord = {
  id: number
  year: number
  month: number | null
  week: number | null
  region_id: number | null
  subregion_id: number | null
  category_id: number | null
  product_id: number | null
  forecast: number
  budget: number
  last_year: number
}

type SalesForecast = {
  id: number
  year: number
  week: number
  region_id: number | null
  subregion_id: number | null
  category_id: number | null
  product_id: number | null
  forecast: number
  budget: number
  last_year: number
  actual: number
  status: string
  user_id: string
}

type SalesRow = {
  tempId: string
  id: number | null
  category_id: string
  product_id: string
  forecast: string
  actual: string
  status: string
}

type UserAccess = {
  userId: string
  role: string
  isAdmin: boolean
  assignedRegionId: number | null
  assignedSubregionId: number | null
}

export default function SalesInputPage() {
  const supabase = createClient()
  const authorization = useAuthorization()
  const currentYear = new Date().getFullYear()

  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<Subregion[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [forecasts, setForecasts] = useState<SalesForecast[]>([])

  const [userId, setUserId] = useState('')
  const [userFullName, setUserFullName] = useState('')
  const [assignedRegionId, setAssignedRegionId] = useState<number | null>(null)
  const [assignedSubregionId, setAssignedSubregionId] = useState<number | null>(null)
  const [assignedRegionName, setAssignedRegionName] = useState('')
  const [role, setRole] = useState('')
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
      forecast: '',
      actual: '',
      status: 'Draft',
    },
  ])

  const [weekStatus, setWeekStatus] = useState('Open')
  const [checkingWeekLock, setCheckingWeekLock] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function initialize() {
      const access = await loadUserAccess()

      if (!access) return

      await loadInitialData(access.assignedRegionId)
      await loadForecasts(access)
    }

    initialize()
  }, [])

  useEffect(() => {
    if (!selectedWeek) {
      const now = new Date()

      const date = new Date(
        Date.UTC(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        )
      )

      const day = date.getUTCDay() || 7

      date.setUTCDate(
        date.getUTCDate() + 4 - day
      )

      const isoYear = date.getUTCFullYear()

      const yearStart = new Date(
        Date.UTC(isoYear, 0, 1)
      )

      const weekNumber = Math.ceil(
        (((date.getTime() -
          yearStart.getTime()) /
          86400000) +
          1) /
          7
      )

      const formattedWeek =
        `${isoYear}-W${String(
          weekNumber
        ).padStart(2, '0')}`

      setSelectedWeek(formattedWeek)
      setYear(isoYear)
      setWeek(weekNumber)
    }
  }, [selectedWeek])

  useEffect(() => {
    if (!selectedWeek) return

    const [
      selectedYear,
      selectedWeekNumber,
    ] = selectedWeek.split('-W')

    const selectedYearNumber =
      Number(selectedYear)

    const selectedWeekNumberValue =
      Number(selectedWeekNumber)

    if (
      !selectedYearNumber ||
      !selectedWeekNumberValue
    ) {
      return
    }

    checkWeekLock(
      selectedYearNumber,
      selectedWeekNumberValue
    )
  }, [selectedWeek])

  async function handleWeekChange(
    value: string
  ) {
    setSelectedWeek(value)

    if (!value) {
      setWeekStatus('Open')
      setCheckingWeekLock(false)
      return
    }

    const [
      selectedYear,
      selectedWeekNumber,
    ] = value.split('-W')

    const newYear = Number(selectedYear)
    const newWeek = Number(selectedWeekNumber)

    setYear(newYear)
    setWeek(newWeek)

    setRows([
      {
        tempId: crypto.randomUUID(),
        id: null,
        category_id: '',
        product_id: '',
        forecast: '',
        actual: '',
        status: 'Draft',
      },
    ])

    setError('')
    setMessage('')
    setCheckingWeekLock(true)

    const { data, error } = await supabase
      .from('week_locks')
      .select('status')
      .eq('year', newYear)
      .eq('week', newWeek)
      .maybeSingle()

    if (error) {
      setCheckingWeekLock(false)
      setWeekStatus('Open')
      setError(error.message)
      return
    }

    const status =
      data?.status ?? 'Open'

    setWeekStatus(status)
    setCheckingWeekLock(false)
  }

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

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('users')
      .select(
        'full_name, role, is_active, region_id, subregion_id'
      )
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

    const profileRole =
      profile.role ?? ''

    const profileAssignedRegionId =
      profile.region_id
        ? Number(profile.region_id)
        : null
    const profileAssignedSubregionId = profile.subregion_id == null ? null : Number(profile.subregion_id)

    const fullName =
      profile.full_name ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'User'

    setRole(profileRole)
    setAssignedSubregionId(profileAssignedSubregionId)
    setSelectedSubregionId(profileAssignedSubregionId == null ? '' : String(profileAssignedSubregionId))
    setUserFullName(fullName)

    if (profileRole === 'Admin') {
      setIsAdmin(true)
      setAssignedRegionId(null)
      setAssignedRegionName('All Regions')
      setSelectedRegionId('')

      return {
        userId: user.id,
        role: profileRole,
        isAdmin: true,
        assignedRegionId: null,
        assignedSubregionId: null,
      }
    }

    if (
      profileRole === 'Manager' ||
      profileRole === 'User'
    ) {
      setIsAdmin(false)

      setAssignedRegionId(
        profileAssignedRegionId
      )

      setSelectedRegionId(
        profileAssignedRegionId
          ? String(profileAssignedRegionId)
          : ''
      )
      setSelectedSubregionId(profileAssignedSubregionId == null ? '' : String(profileAssignedSubregionId))

      return {
        userId: user.id,
        role: profileRole,
        isAdmin: false,
        assignedRegionId:
          profileAssignedRegionId,
        assignedSubregionId: profileAssignedSubregionId,
      }
    }

    setIsAdmin(false)

    setAssignedRegionId(
      profileAssignedRegionId
    )

    setSelectedRegionId(
      profileAssignedRegionId
        ? String(profileAssignedRegionId)
        : ''
    )

    return {
      userId: user.id,
      role: profileRole,
      isAdmin: false,
      assignedRegionId:
        profileAssignedRegionId,
      assignedSubregionId: profileAssignedSubregionId,
    }
  }

  async function loadInitialData(
    profileAssignedRegionId: number | null
  ) {
    setError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('User session not found.')
      return
    }

    const {
      data: loadedRegions,
      error: regionsError,
    } = await supabase
      .from('regions')
      .select(
        'id, name, code'
      )
      .eq('is_active', true)
      .order('name')

    if (regionsError) {
      setError(regionsError.message)
      return
    }

    setRegions(
      loadedRegions ?? []
    )
    const { data: loadedSubregions, error: subregionsError } = await supabase
      .from('subregions').select('id, name, region_id').eq('is_active', true).order('name')
    if (subregionsError) { setError(subregionsError.message); return }
    setSubregions((loadedSubregions ?? []) as Subregion[])

    if (
      profileAssignedRegionId !== null
    ) {
      const assignedRegion =
        loadedRegions?.find(
          (region) =>
            region.id ===
            profileAssignedRegionId
        )

      setAssignedRegionName(
        assignedRegion?.name ?? ''
      )
    }

    const {
      data: loadedCategories,
      error: categoriesError,
    } = await supabase
      .from('categories')
      .select(
        'id, code, name'
      )
      .eq('is_active', true)
      .order('name')

    if (categoriesError) {
      setError(categoriesError.message)
      return
    }

    setCategories(
      loadedCategories ?? []
    )

    const {
      data: loadedProducts,
      error: productsError,
    } = await supabase
      .from('products')
      .select(
        'id, category_id, code, name, unit_price'
      )
      .eq('is_active', true)
      .order('name')

    if (productsError) {
      setError(productsError.message)
      return
    }

    setProducts(
      loadedProducts ?? []
    )

    const {
      data: loadedBudgets,
      error: budgetsError,
    } = await supabase
      .from('budgets')
      .select(`
        id,
        year,
        month,
        week,
        region_id,
        subregion_id,
        category_id,
        product_id,
        forecast,
        budget,
        last_year
      `)
      .eq('year', currentYear)

    if (budgetsError) {
      setError(budgetsError.message)
      return
    }

    setBudgets(
      loadedBudgets ?? []
    )
  }

  const availableRegions = useMemo(() => {
    if (role === 'Admin' || role === 'Superuser') {
      return regions
    }

    return regions.filter(
      (region) =>
        region.id === assignedRegionId
    )
  }, [
    regions,
    role,
    assignedRegionId,
  ])

  async function loadForecasts(
    access: UserAccess
  ) {
    setError('')

    let forecastsQuery =
      supabase
        .from('sales_forecasts')
        .select(`
          id,
          year,
          week,
          region_id,
          subregion_id,
          category_id,
          product_id,
          forecast,
          budget,
          last_year,
          actual,
          status,
          user_id
        `)
        .order('year', {
          ascending: false,
        })
        .order('week', {
          ascending: false,
        })
        .order('id', {
          ascending: false,
        })

    if (access.isAdmin) {
      // Admin can see all forecasts.
    } else if (access.role === 'Superuser') {
      // Superusers have global read access.
    } else if (
      access.role === 'Manager'
    ) {
      if (
        access.assignedRegionId === null
      ) {
        setForecasts([])
        setError(
          'Your account does not have an assigned region.'
        )
        return
      }

      forecastsQuery = access.assignedSubregionId !== null
        ? forecastsQuery.eq('subregion_id', access.assignedSubregionId)
        : forecastsQuery.eq('region_id', access.assignedRegionId)
    } else {
      forecastsQuery =
        forecastsQuery.eq(
          'user_id',
          access.userId
        )
    }

    const {
      data,
      error,
    } = await forecastsQuery

    if (error) {
      setError(error.message)
      return
    }

    setForecasts(data ?? [])
  }

  async function checkWeekLock(
    checkYear = year,
    checkWeek = week
  ): Promise<boolean> {
    setCheckingWeekLock(true)

    const {
      data,
      error,
    } = await supabase
      .from('week_locks')
      .select('status')
      .eq('year', checkYear)
      .eq('week', checkWeek)
      .maybeSingle()

    if (error) {
      setCheckingWeekLock(false)
      setError(error.message)
      return false
    }

    const status =
      data?.status ?? 'Open'

    setWeekStatus(status)
    setCheckingWeekLock(false)

    return status === 'Locked'
  }

  function getProductsForCategory(
    categoryId: string
  ) {
    if (!categoryId) return []

    return products.filter(
      (product) =>
        product.category_id ===
        Number(categoryId)
    )
  }

  function getISOWeekStart(
    selectedYear: number,
    selectedWeek: number
  ) {
    const january4 = new Date(
      Date.UTC(
        selectedYear,
        0,
        4
      )
    )

    const day =
      january4.getUTCDay() || 7

    const monday = new Date(
      january4
    )

    monday.setUTCDate(
      january4.getUTCDate() -
        day +
        1 +
        (selectedWeek - 1) * 7
    )

    return monday
  }

  function getMonthForWeek(
    selectedYear: number,
    selectedWeek: number
  ) {
    const weekStart =
      getISOWeekStart(
        selectedYear,
        selectedWeek
      )

    const thursday =
      new Date(
        weekStart
      )

    thursday.setUTCDate(
      weekStart.getUTCDate() + 3
    )

    return (
      thursday.getUTCMonth() + 1
    )
  }

  function getWeeksInMonth(
    selectedYear: number,
    selectedMonth: number
  ) {
    const weeks = new Set<number>()

    const daysInMonth =
      new Date(
        Date.UTC(
          selectedYear,
          selectedMonth,
          0
        )
      ).getUTCDate()

    for (
      let day = 1;
      day <= daysInMonth;
      day++
    ) {
      const date = new Date(
        Date.UTC(
          selectedYear,
          selectedMonth - 1,
          day
        )
      )

      const weekday =
        date.getUTCDay() || 7

      const thursday =
        new Date(
          date
        )

      thursday.setUTCDate(
        date.getUTCDate() +
          4 -
          weekday
      )

      const isoYear =
        thursday.getUTCFullYear()

      const yearStart =
        new Date(
          Date.UTC(
            isoYear,
            0,
            1
          )
        )

      const weekNumber =
        Math.ceil(
          (((thursday.getTime() -
            yearStart.getTime()) /
            86400000) +
            1) /
            7
        )

      if (
        isoYear === selectedYear
      ) {
        weeks.add(
          weekNumber
        )
      }
    }

    return Math.max(
      weeks.size,
      1
    )
  }

  function getBudgetForRow(
    categoryId: string,
    productId: string,
    regionId: string
  ) {
    if (
      !categoryId ||
      !productId ||
      !regionId
    ) {
      return {
        budget: 0,
        lastYear: 0,
      }
    }

    const category =
      Number(categoryId)

    const product =
      Number(productId)

    const region =
      Number(regionId)

    const selectedMonth =
      getMonthForWeek(
        year,
        week
      )

    const targetSubregionId = selectedSubregionId
      ? Number(selectedSubregionId)
      : assignedSubregionId
    const scopedBudgets = budgets.filter(
        (item) =>
          item.year === year &&
          item.region_id === region &&
          item.category_id === category &&
          item.product_id === product
      )
    const matchingBudgets = targetSubregionId === null
      ? scopedBudgets.filter((item) => item.subregion_id === null)
      : scopedBudgets.filter((item) => item.subregion_id === targetSubregionId)

    const weeklyBudget =
      matchingBudgets.find(
        (item) =>
          item.week === week
      )

    if (weeklyBudget) {
      return {
        budget:
          Number(
            weeklyBudget.budget
          ) || 0,
        lastYear:
          Number(
            weeklyBudget.last_year
          ) || 0,
      }
    }

    const monthlyBudget =
      matchingBudgets.find(
        (item) =>
          item.month ===
            selectedMonth &&
          item.week === null
      )

    if (monthlyBudget) {
      const weeksInMonth =
        getWeeksInMonth(
          year,
          selectedMonth
        )

      return {
        budget:
          (Number(
            monthlyBudget.budget
          ) || 0) /
          weeksInMonth,

        lastYear:
          (Number(
            monthlyBudget.last_year
          ) || 0) /
          weeksInMonth,
      }
    }

    const yearlyBudget =
      matchingBudgets.find(
        (item) =>
          item.month === null &&
          item.week === null
      )

    if (yearlyBudget) {
      const weeksInMonth =
        getWeeksInMonth(
          year,
          selectedMonth
        )

      return {
        budget:
          ((Number(
            yearlyBudget.budget
          ) || 0) /
            12) /
          weeksInMonth,

        lastYear:
          ((Number(
            yearlyBudget.last_year
          ) || 0) /
            12) /
          weeksInMonth,
      }
    }

    return {
      budget: 0,
      lastYear: 0,
    }
  }

  function getRowBudget(
    row: SalesRow
  ) {
    return getBudgetForRow(
      row.category_id,
      row.product_id,
      selectedRegionId
    )
  }

  function addRow() {
    if (!authorization.can('Sales Input', 'add')) return
    setRows([
      ...rows,
      {
        tempId: crypto.randomUUID(),
        id: null,
        category_id: '',
        product_id: '',
        forecast: '',
        actual: '',
        status: 'Draft',
      },
    ])
  }

  function removeRow(
    tempId: string
  ) {
    if (rows.length === 1) {
      setRows([
        {
          tempId: crypto.randomUUID(),
          id: null,
          category_id: '',
          product_id: '',
          forecast: '',
          actual: '',
          status: 'Draft',
        },
      ])

      return
    }

    setRows(
      rows.filter(
        (row) =>
          row.tempId !== tempId
      )
    )
  }

  function updateRow(
    tempId: string,
    field: keyof SalesRow,
    value: string
  ) {
    setRows(
      rows.map((row) => {
        if (
          row.tempId !== tempId
        ) {
          return row
        }

        if (
          field === 'category_id'
        ) {
          return {
            ...row,
            category_id: value,
            product_id: '',
          }
        }

        return {
          ...row,
          [field]: value,
        }
      })
    )
  }

  function getRegionName(
    id: number | null
  ) {
    return (
      regions.find(
        (region) =>
          region.id === id
      )?.name ?? '-'
    )
  }

  function getCategoryName(
    id: number | null
  ) {
    const category =
      categories.find(
        (item) =>
          item.id === id
      )

    if (!category) return '-'

    return `${category.code} - ${category.name}`
  }

  function getProductName(
    id: number | null
  ) {
    const product =
      products.find(
        (item) =>
          item.id === id
      )

    if (!product) return '-'

    return `${product.code} - ${product.name}`
  }

  const totalForecast =
    rows.reduce(
      (total, row) =>
        total +
        (Number(row.forecast) || 0),
      0
    )

  const totalBudget =
    rows.reduce(
      (total, row) =>
        total +
        getRowBudget(row).budget,
      0
    )

  const totalLastYear =
    rows.reduce(
      (total, row) =>
        total +
        getRowBudget(row).lastYear,
      0
    )

  const totalActual =
    rows.reduce(
      (total, row) =>
        total +
        (Number(row.actual) || 0),
      0
    )

  function validateRows() {
    if (!selectedRegionId) {
      setError(
        'Please select a region.'
      )

      return false
    }

    if (
      role !== 'Admin'
    ) {
      if (
        !assignedRegionId ||
        Number(selectedRegionId) !==
          assignedRegionId
      ) {
        setError(
          'You can only use your assigned region.'
        )

        return false
      }
    }

    for (
      let index = 0;
      index < rows.length;
      index++
    ) {
      const row = rows[index]
      const rowNumber =
        index + 1

      if (!row.category_id) {
        setError(
          `Please select a category for row ${rowNumber}.`
        )

        return false
      }

      if (!row.product_id) {
        setError(
          `Please select a product for row ${rowNumber}.`
        )

        return false
      }

      if (
        row.forecast.trim() === '' ||
        Number.isNaN(
          Number(row.forecast)
        ) ||
        Number(row.forecast) < 0
      ) {
        setError(
          `Please enter a valid forecast for row ${rowNumber}.`
        )

        return false
      }

      if (
        row.actual.trim() === '' ||
        Number.isNaN(
          Number(row.actual)
        ) ||
        Number(row.actual) < 0
      ) {
        setError(
          `Please enter a valid actual value for row ${rowNumber}.`
        )

        return false
      }
    }

    for (
      let i = 0;
      i < rows.length;
      i++
    ) {
      for (
        let j = i + 1;
        j < rows.length;
        j++
      ) {
        if (
          rows[i].category_id ===
            rows[j].category_id &&
          rows[i].product_id ===
            rows[j].product_id
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

  async function handleSave(
    submitAfterSave = false
  ) {
    if ((rows.some((row) => row.id === null) && !authorization.can('Sales Input', 'add')) ||
        (rows.some((row) => row.id !== null) && !authorization.can('Sales Input', 'edit'))) return
    setError('')
    setMessage('')

    const locked =
      await checkWeekLock(
        year,
        week
      )

    if (locked) {
      setError(
        `Week ${week} - ${year} is locked and cannot be modified.`
      )

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
      setError(
        'Please select a valid week.'
      )

      return
    }

    if (!validateRows()) {
      return
    }

    setLoading(true)

    const regionId =
      role === 'Admin' || role === 'Superuser'
        ? Number(selectedRegionId)
        : assignedRegionId
    const subregionId = role === 'Admin' || role === 'Superuser'
      ? (selectedSubregionId ? Number(selectedSubregionId) : null)
      : assignedSubregionId

    if (!regionId) {
      setLoading(false)

      setError(
        'No region is assigned to this account.'
      )

      return
    }

    const payload =
      rows.map((row) => {
        const rowBudget =
          getBudgetForRow(
            row.category_id,
            row.product_id,
            String(regionId)
          )

        return {
          ...(row.id !== null
            ? { id: row.id }
            : {}),

          year,

          week,

          region_id:
            regionId,
          subregion_id: subregionId,

          category_id:
            Number(row.category_id),

          product_id:
            Number(row.product_id),

          forecast:
            Number(row.forecast),

          budget:
            Number(
              rowBudget.budget.toFixed(2)
            ),

          last_year:
            Number(
              rowBudget.lastYear.toFixed(2)
            ),

          actual:
            Number(row.actual),

          status: 'Draft',

          user_id:
            userId,
        }
      })

    const {
      data: savedRows,
      error: saveError,
    } = await supabase
      .from('sales_forecasts')
      .upsert(
        payload,
        {
          onConflict: 'id',
        }
      )
      .select('id')

    if (saveError) {
      setLoading(false)
      setError(saveError.message)
      return
    }

    if (
      submitAfterSave &&
      savedRows &&
      savedRows.length > 0
    ) {
      const savedIds =
        savedRows.map(
          (item) => item.id
        )

      let submitQuery =
        supabase
          .from('sales_forecasts')
          .update({
            status: 'Pending',
            submitted_by:
              userId,
            submitted_at:
              new Date().toISOString(),
          })
          .in(
            'id',
            savedIds
          )

      if (!isAdmin) {
        submitQuery =
          submitQuery.eq(
            'user_id',
            userId
          )
      }

      const {
        error: submitError,
      } = await submitQuery

      if (submitError) {
        setLoading(false)

        setError(
          submitError.message
        )

        return
      }
    }

    setMessage(
      submitAfterSave
        ? 'Forecasts submitted for approval successfully.'
        : 'Forecasts saved successfully.'
    )

    setRows([
      {
        tempId:
          crypto.randomUUID(),
        id: null,
        category_id: '',
        product_id: '',
        forecast: '',
        actual: '',
        status: 'Draft',
      },
    ])

    setLoading(false)

    const currentAccess:
      UserAccess = {
      userId,
      role,
      isAdmin,
      assignedRegionId,
      assignedSubregionId,
    }

    await loadForecasts(
      currentAccess
    )
  }

  async function handleEdit(
    item: SalesForecast
  ) {
    if (!authorization.can('Sales Input', 'edit')) return
    if (
      item.status === 'Approved'
    ) {
      setError(
        'Approved forecasts cannot be edited.'
      )

      return
    }

    if (
      role === 'Manager' &&
      item.region_id !==
        assignedRegionId
    ) {
      setError(
        'You can only edit forecasts from your assigned region.'
      )

      return
    }

    if (
      role === 'User' &&
      item.user_id !== userId
    ) {
      setError(
        'You can only edit your own forecasts.'
      )

      return
    }

    const locked =
      await checkWeekLock(
        item.year,
        item.week
      )

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

    setSelectedWeek(
      `${item.year}-W${String(
        item.week
      ).padStart(2, '0')}`
    )

    setSelectedRegionId(
      item.region_id
        ? String(item.region_id)
        : ''
    )

    setRows([
      {
        tempId:
          crypto.randomUUID(),

        id: item.id,

        category_id:
          String(
            item.category_id ?? ''
          ),

        product_id:
          String(
            item.product_id ?? ''
          ),

        forecast:
          String(
            item.forecast ?? ''
          ),

        actual:
          String(
            item.actual ?? ''
          ),

        status:
          item.status,
      },
    ])

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  async function handleSubmit(
    id: number
  ) {
    if (!authorization.can('Sales Input', 'edit')) return
    setError('')
    setMessage('')

    const item =
      forecasts.find(
        (forecast) =>
          forecast.id === id
      )

    if (!item) return

    if (
      item.status !== 'Draft'
    ) {
      return
    }

    if (
      role === 'Manager' &&
      item.region_id !==
        assignedRegionId
    ) {
      setError(
        'You can only submit forecasts from your assigned region.'
      )

      return
    }

    if (
      role === 'User' &&
      item.user_id !== userId
    ) {
      setError(
        'You can only submit your own forecasts.'
      )

      return
    }

    const locked =
      await checkWeekLock(
        item.year,
        item.week
      )

    if (locked) {
      setError(
        `Week ${item.week} - ${item.year} is locked and cannot be modified.`
      )

      return
    }

    const confirmed =
      window.confirm(
        'Are you sure you want to submit this forecast for approval?'
      )

    if (!confirmed) return

    let submitQuery =
      supabase
        .from('sales_forecasts')
        .update({
          status: 'Pending',
          submitted_by:
            userId,
          submitted_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          id
        )

    if (!isAdmin) {
      submitQuery =
        submitQuery.eq(
          'user_id',
          userId
        )
    }

    const {
      error,
    } = await submitQuery

    if (error) {
      setError(error.message)
      return
    }

    setMessage(
      'Forecast submitted for approval successfully.'
    )

    const currentAccess:
      UserAccess = {
      userId,
      role,
      isAdmin,
      assignedRegionId,
      assignedSubregionId,
    }

    await loadForecasts(
      currentAccess
    )
  }

  async function handleDelete(
    id: number
  ) {
    if (!authorization.can('Sales Input', 'delete')) return
    setError('')
    setMessage('')

    const item =
      forecasts.find(
        (forecast) =>
          forecast.id === id
      )

    if (!item) return

    if (
      item.status === 'Approved'
    ) {
      setError(
        'Approved forecasts cannot be deleted.'
      )

      return
    }

    if (
      role === 'Manager' &&
      item.region_id !==
        assignedRegionId
    ) {
      setError(
        'You can only delete forecasts from your assigned region.'
      )

      return
    }

    if (
      role === 'User' &&
      item.user_id !== userId
    ) {
      setError(
        'You can only delete your own forecasts.'
      )

      return
    }

    const locked =
      await checkWeekLock(
        item.year,
        item.week
      )

    if (locked) {
      setError(
        `Week ${item.week} - ${item.year} is locked and cannot be modified.`
      )

      return
    }

    const confirmed =
      window.confirm(
        'Are you sure you want to delete this forecast?'
      )

    if (!confirmed) return

    let deleteQuery =
      supabase
        .from('sales_forecasts')
        .delete()
        .eq(
          'id',
          id
        )

    if (!isAdmin) {
      deleteQuery =
        deleteQuery.eq(
          'user_id',
          userId
        )
    }

    const {
      error,
    } = await deleteQuery

    if (error) {
      setError(error.message)
      return
    }

    setMessage(
      'Forecast deleted successfully.'
    )

    const currentAccess:
      UserAccess = {
      userId,
      role,
      isAdmin,
      assignedRegionId,
      assignedSubregionId,
    }

    await loadForecasts(
      currentAccess
    )
  }

  const displayedForecasts =
    forecasts.filter(
      (item) =>
        item.year === year &&
        item.week === week
    )

  const isLocked =
    weekStatus === 'Locked'

  const isFormDisabled =
    isLocked ||
    checkingWeekLock ||
    loading ||
    (!authorization.can('Sales Input', 'add') && !authorization.can('Sales Input', 'edit'))

  function formatNumber(
    value: number
  ) {
    return Number(
      value || 0
    ).toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )
  }

  return (
    <div className="space-y-6">

      {/* USER INFORMATION */}

      <div className="rounded-lg border bg-card px-4 py-3">

        <div>
          <p className="text-sm font-medium">
            {userFullName}
          </p>

          <p className="text-xs text-muted-foreground">
            {role} -{' '}
            {role === 'Admin'
              ? 'All Regions'
              : assignedRegionName ||
                'Not Assigned'}
          </p>
        </div>

      </div>

      {/* ADD FORECAST */}

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
              {checkingWeekLock
                ? 'Checking...'
                : weekStatus}
            </div>

          </div>

        </div>

        <div className="p-6">

          <div className="mb-6 grid gap-4 md:grid-cols-2">

            {/* WEEK */}

            <div className="space-y-2">

              <label className="text-sm font-medium">
                Week Date
              </label>

              <input
                type="week"
                value={selectedWeek}
                onChange={(e) =>
                  handleWeekChange(
                    e.target.value
                  )
                }
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
                value={
                  selectedRegionId
                }
                onChange={(e) =>
                  (setSelectedRegionId(e.target.value), setSelectedSubregionId(''))
                }
                disabled={
                  isFormDisabled ||
                  (role !== 'Admin' && role !== 'Superuser')
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >

                <option value="">
                  Select region
                </option>

                {availableRegions.map(
                  (region) => (
                    <option
                      key={region.id}
                      value={region.id}
                    >
                      {region.name}
                    </option>
                  )
                )}

              </select>

              {role === 'Admin' && (
                <p className="text-xs text-muted-foreground">
                  All active regions are available.
                </p>
              )}

              {role === 'Manager' && (
                <p className="text-xs text-muted-foreground">
                  Region is based on your assigned region.
                </p>
              )}

              {role === 'User' && (
                <p className="text-xs text-muted-foreground">
                  Region is based on your assigned region.
                </p>
              )}

            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Subregion</label>
              <select
                value={selectedSubregionId}
                onChange={(e) => setSelectedSubregionId(e.target.value)}
                disabled={isFormDisabled || (role !== 'Admin' && role !== 'Superuser')}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">No subregion</option>
                {subregions.filter((item) => item.region_id === Number(selectedRegionId)).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

          </div>

          {/* FORECAST INPUT TABLE */}

          <div className="w-full overflow-x-auto rounded-lg border">

            <table className="w-full min-w-[1050px] text-sm">

              <thead>
  <tr className="border-b bg-muted/40">
    <th className="w-[4%] px-2 py-3 text-center font-medium">
      #
    </th>

    <th className="w-[20%] px-2 py-3 text-left font-medium">
      Category
    </th>

    <th className="w-[22%] px-2 py-3 text-left font-medium">
      Product
    </th>

    <th className="w-[12%] px-2 py-3 text-right font-medium">
      Forecast
    </th>

    <th className="w-[12%] px-2 py-3 text-right font-medium">
      Budget
    </th>

    <th className="w-[12%] px-2 py-3 text-right font-medium">
      Last Year
    </th>

    <th className="w-[12%] px-2 py-3 text-right font-medium">
      Actual
    </th>

    <th className="w-[6%] px-2 py-3 text-center font-medium whitespace-nowrap">
      Action
    </th>
  </tr>
</thead>

              <tbody>

                {rows.map(
                  (
                    row,
                    index
                  ) => {

                    const rowProducts =
                      getProductsForCategory(
                        row.category_id
                      )

                    const rowBudget =
                      getRowBudget(row)

                    return (
                      <tr
                        key={
                          row.tempId
                        }
                        className="border-b last:border-0"
                      >

                        <td className="px-2 py-3 text-center text-muted-foreground">
                          {index + 1}
                        </td>

                        <td className="px-2 py-3">

                          <select
                            value={
                              row.category_id
                            }
                            onChange={(e) =>
                              updateRow(
                                row.tempId,
                                'category_id',
                                e.target.value
                              )
                            }
                            disabled={
                              isFormDisabled
                            }
                            className="h-10 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >

                            <option value="">
                              Select category
                            </option>

                            {categories.map(
                              (
                                category
                              ) => (
                                <option
                                  key={
                                    category.id
                                  }
                                  value={
                                    category.id
                                  }
                                >
                                  {
                                    category.code
                                  }{' '}
                                  -{' '}
                                  {
                                    category.name
                                  }
                                </option>
                              )
                            )}

                          </select>

                        </td>

                        <td className="px-2 py-3">

                          <select
                            value={
                              row.product_id
                            }
                            onChange={(e) =>
                              updateRow(
                                row.tempId,
                                'product_id',
                                e.target.value
                              )
                            }
                            disabled={
                              !row.category_id ||
                              isFormDisabled
                            }
                            className="h-10 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >

                            <option value="">
                              {!row.category_id
                                ? 'Select category first'
                                : 'Select product'}
                            </option>

                            {rowProducts.map(
                              (
                                product
                              ) => (
                                <option
                                  key={
                                    product.id
                                  }
                                  value={
                                    product.id
                                  }
                                >
                                  {
                                    product.code
                                  }{' '}
                                  -{' '}
                                  {
                                    product.name
                                  }
                                </option>
                              )
                            )}

                          </select>

                        </td>

                        <td className="px-2 py-3">

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                              row.forecast
                            }
                            onChange={(e) =>
                              updateRow(
                                row.tempId,
                                'forecast',
                                e.target.value
                              )
                            }
                            disabled={
                              isFormDisabled
                            }
                            placeholder="0.00"
                            className="h-10 w-full rounded-md border bg-background px-2 text-right text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          />

                        </td>

                        <td className="px-2 py-3 text-right font-medium whitespace-nowrap">
                          {row.category_id &&
                          row.product_id
                            ? formatNumber(
                                rowBudget.budget
                              )
                            : '-'}
                        </td>

                        <td className="px-2 py-3 text-right font-medium whitespace-nowrap">
                          {row.category_id &&
                          row.product_id
                            ? formatNumber(
                                rowBudget.lastYear
                              )
                            : '-'}
                        </td>

                        <td className="px-2 py-3">

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                              row.actual
                            }
                            onChange={(e) =>
                              updateRow(
                                row.tempId,
                                'actual',
                                e.target.value
                              )
                            }
                            disabled={
                              isFormDisabled
                            }
                            placeholder="0.00"
                            className="h-10 w-full rounded-md border bg-background px-2 text-right text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          />

                        </td>

                        <td className="px-2 py-3 text-center">

                          <button
                            type="button"
                            onClick={() =>
                              removeRow(
                                row.tempId
                              )
                            }
                            disabled={
                              isFormDisabled
                            }
                            className="inline-flex size-8 items-center justify-center rounded-md border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                            title="Remove row"
                          >

                            <Trash2 className="size-4" />

                          </button>

                        </td>

                      </tr>
                    )
                  }
                )}

              </tbody>

              <tfoot>

                <tr className="border-t bg-muted/30">

                  {/* ADD ANOTHER ROW */}

                  <td
                    colSpan={2}
                    className="px-2 py-4 text-left"
                  >

                    <button
                      type="button"
                      onClick={addRow}
                      disabled={
                        isFormDisabled || !authorization.can('Sales Input', 'add')
                      }
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >

                      <Plus className="size-4" />

                      Add Another Row

                    </button>

                  </td>

                  {/* TOTAL */}

                  <td className="px-2 py-4 text-right font-semibold">
                    Total
                  </td>

                  <td className="px-2 py-4 text-right font-semibold whitespace-nowrap">
                    {formatNumber(
                      totalForecast
                    )}
                  </td>

                  <td className="px-2 py-4 text-right font-semibold whitespace-nowrap">
                    {formatNumber(
                      totalBudget
                    )}
                  </td>

                  <td className="px-2 py-4 text-right font-semibold whitespace-nowrap">
                    {formatNumber(
                      totalLastYear
                    )}
                  </td>

                  <td className="px-2 py-4 text-right font-semibold whitespace-nowrap">
                    {formatNumber(
                      totalActual
                    )}
                  </td>

                  <td />

                </tr>

              </tfoot>

            </table>

          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">

            <button
              type="button"
              onClick={() =>
                handleSave(false)
              }
              disabled={
                isFormDisabled || (!authorization.can('Sales Input', 'add') && !authorization.can('Sales Input', 'edit'))
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >

              <Save className="size-4" />

              {loading
                ? 'Saving...'
                : 'Save Draft'}

            </button>

            <button
              type="button"
              onClick={() =>
                handleSave(true)
              }
              disabled={
                isFormDisabled || !authorization.can('Sales Input', 'edit')
              }
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Submit
            </button>

          </div>

          {/* WEEK LOCK */}

          {isLocked && (
            <div className="mt-5 rounded-lg border bg-muted/40 px-4 py-3">

              <p className="text-sm font-medium">
                Week {week} - {year} is locked.
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Forecast entries cannot be added,
                edited, or submitted for this week.
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

      {/* SALES FORECASTS */}

      <div className="rounded-xl border bg-card shadow-sm">

        <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <h2 className="text-base font-semibold">
              Sales Forecasts
            </h2>

            <p className="text-sm text-muted-foreground">
              Forecast entries for{' '}
              {year}-W
              {String(week).padStart(
                2,
                '0'
              )}
              .
            </p>

          </div>

          <div className="w-fit rounded-md bg-muted px-3 py-1.5 text-xs font-medium">

            {
              displayedForecasts.length
            }{' '}

            {displayedForecasts.length ===
            1
              ? 'Entry'
              : 'Entries'}

          </div>

        </div>

        <div className="w-full overflow-x-auto">

          <table className="w-full min-w-[1150px] table-fixed text-sm">

    <colgroup>
      <col className="w-[9%]" />
      <col className="w-[8%]" />
      <col className="w-[9%]" />
      <col className="w-[13%]" />
      <col className="w-[10%]" />
      <col className="w-[10%]" />
      <col className="w-[10%]" />
      <col className="w-[10%]" />
      <col className="w-[9%]" />
      <col className="w-[12%]" />
    </colgroup>

    <thead>
      <tr className="border-b bg-muted/40">

        <th className="px-2 py-3 text-left font-medium whitespace-nowrap">
          Year-Week
        </th>

        <th className="px-2 py-3 text-left font-medium">
          Region
        </th>

        <th className="px-2 py-3 text-left font-medium">
          Category
        </th>

        <th className="px-2 py-3 text-left font-medium">
          Product
        </th>

        <th className="px-2 py-3 text-right font-medium">
          Forecast
        </th>

        <th className="px-2 py-3 text-right font-medium">
          Budget
        </th>

        <th className="px-2 py-3 text-right font-medium">
          Last Year
        </th>

        <th className="px-2 py-3 text-right font-medium">
          Actual
        </th>

        <th className="px-2 py-3 text-center font-medium">
          Status
        </th>

        <th className="px-2 py-3 text-center font-medium whitespace-nowrap">
          Action
        </th>

      </tr>
    </thead>

    <tbody>

      {displayedForecasts.length === 0 ? (

        <tr>

          <td
            colSpan={10}
            className="px-4 py-10 text-center text-sm text-muted-foreground"
          >
            No forecast entries found for{' '}
            {year}-W
            {String(week).padStart(2, "0")}.
          </td>

        </tr>

      ) : (

        displayedForecasts.map((item) => (

          <tr
            key={item.id}
            className="border-b last:border-0 hover:bg-muted/30"
          >

            {/* YEAR-WEEK */}

            <td className="px-2 py-3 font-medium whitespace-nowrap">
              {item.year}-W
              {String(item.week).padStart(2, "0")}
            </td>

            {/* REGION */}

            <td
              className="max-w-0 px-2 py-3 truncate"
              title={getRegionName(item.region_id)}
            >
              {getRegionName(item.region_id)}
            </td>

            {/* CATEGORY */}

            <td
              className="max-w-0 px-2 py-3 truncate"
              title={getCategoryName(item.category_id)}
            >
              {getCategoryName(item.category_id)}
            </td>

            {/* PRODUCT */}

            <td
              className="max-w-0 px-2 py-3 truncate"
              title={getProductName(item.product_id)}
            >
              {getProductName(item.product_id)}
            </td>

            {/* FORECAST */}

            <td className="px-2 py-3 text-right font-medium whitespace-nowrap">
              {formatNumber(item.forecast)}
            </td>

            {/* BUDGET */}

            <td className="px-2 py-3 text-right font-medium whitespace-nowrap">
              {formatNumber(item.budget)}
            </td>

            {/* LAST YEAR */}

            <td className="px-2 py-3 text-right font-medium whitespace-nowrap">
              {formatNumber(item.last_year)}
            </td>

            {/* ACTUAL */}

            <td className="px-2 py-3 text-right font-medium whitespace-nowrap">
              {formatNumber(item.actual)}
            </td>

            {/* STATUS */}

            <td className="px-2 py-3 text-center">

              <span className="inline-block rounded-full bg-muted px-2 py-1 text-xs font-medium whitespace-nowrap">
                {item.status}
              </span>

            </td>

            {/* ACTION */}

            <td className="px-2 py-3 whitespace-nowrap">

              <div className="flex items-center justify-center gap-1">

                {item.status === "Draft" && (

                  <button
                    type="button"
                    onClick={() =>
                      handleSubmit(item.id)
                    }
                    disabled={
                      isLocked ||
                      checkingWeekLock
                    }
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Submit
                  </button>

                )}

                <button
                  type="button"
                  onClick={() =>
                    handleEdit(item)
                  }
                  disabled={
                    isLocked ||
                    checkingWeekLock ||
                    item.status === "Approved"
                  }
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  title="Edit"
                >
                  <Pencil className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDelete(item.id)
                  }
                  disabled={
                    isLocked ||
                    checkingWeekLock ||
                    item.status === "Approved"
                  }
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </button>

              </div>

            </td>

          </tr>

        ))

      )}

    </tbody>

  </table>

        </div>

      </div>

    </div>
  )
}
