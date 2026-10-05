'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/client'

type Region = {
  id: number
  name: string
  code: string | null
}

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
}

type SalesForecast = {
  id: number
  year: number
  week: number
  region_id: number | null
  category_id: number | null
  product_id: number | null
  forecast: number
  actual: number
  status: string
  submitted_by: string | null
  submitted_at: string | null
}

export default function WeeklySalesPage() {
  const supabase = createClient()

  // -----------------------------------------
  // DATA
  // -----------------------------------------

  const [sales, setSales] = useState<SalesForecast[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const [submittedUsers, setSubmittedUsers] = useState<
    Record<string, string>
  >({})

  // -----------------------------------------
  // FILTERS
  // -----------------------------------------

  const [selectedWeek, setSelectedWeek] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('all')

  // -----------------------------------------
  // UI STATE
  // -----------------------------------------

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // -----------------------------------------
  // INITIAL LOAD
  // -----------------------------------------

  useEffect(() => {
    loadData()
  }, [])

  // -----------------------------------------
  // LOAD DATA
  // -----------------------------------------

  async function loadData() {
    setLoading(true)
    setError('')

    // -----------------------------------------
    // GET CURRENT USER
    // -----------------------------------------

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('User session not found.')
      setLoading(false)
      return
    }

    // -----------------------------------------
    // GET USER PROFILE
    // -----------------------------------------

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('users')
      .select('is_active')
      .eq('id', user.id)
      .single()

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    if (!profile?.is_active) {
      setError('Your account is inactive.')
      setLoading(false)
      return
    }

    // -----------------------------------------
    // LOAD ALL APPROVED SALES
    // -----------------------------------------

    const salesQuery = supabase
      .from('sales_forecasts')
      .select(
        `
        id,
        year,
        week,
        region_id,
        category_id,
        product_id,
        forecast,
        actual,
        status,
        submitted_by,
        submitted_at
        `
      )
      .eq('status', 'Approved')
      .order('year', { ascending: false })
      .order('week', { ascending: false })
      .order('id', { ascending: false })

    // -----------------------------------------
    // LOAD ALL REGIONS
    // -----------------------------------------

    const regionsQuery = supabase
      .from('regions')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')

    // -----------------------------------------
    // LOAD OTHER DATA
    // -----------------------------------------

    const [
      salesResult,
      regionsResult,
      categoriesResult,
      productsResult,
    ] = await Promise.all([
      salesQuery,

      regionsQuery,

      supabase
        .from('categories')
        .select('id, code, name')
        .order('name'),

      supabase
        .from('products')
        .select(
          'id, category_id, code, name'
        )
        .order('name'),
    ])

    if (salesResult.error) {
      setError(salesResult.error.message)
      setLoading(false)
      return
    }

    if (regionsResult.error) {
      setError(regionsResult.error.message)
      setLoading(false)
      return
    }

    if (categoriesResult.error) {
      setError(categoriesResult.error.message)
      setLoading(false)
      return
    }

    if (productsResult.error) {
      setError(productsResult.error.message)
      setLoading(false)
      return
    }

    const approvedSales =
      (salesResult.data ?? []) as SalesForecast[]

    setSales(approvedSales)
    setRegions(regionsResult.data ?? [])
    setCategories(categoriesResult.data ?? [])
    setProducts(productsResult.data ?? [])

    // -----------------------------------------
    // LOAD SUBMITTED USERS
    // -----------------------------------------

    const submittedByIds = Array.from(
      new Set(
        approvedSales
          .map(
            (item) =>
              item.submitted_by
          )
          .filter(
            (
              id
            ): id is string =>
              !!id
          )
      )
    )

    if (submittedByIds.length > 0) {
      const {
        data: usersData,
        error: usersError,
      } = await supabase
        .from('users')
        .select('id, full_name')
        .in(
          'id',
          submittedByIds
        )

      if (usersError) {
        setError(usersError.message)
        setLoading(false)
        return
      }

      const userMap: Record<
        string,
        string
      > = {}

      ;(usersData || []).forEach(
        (user) => {
          userMap[user.id] =
            user.full_name || '-'
        }
      )

      setSubmittedUsers(
        userMap
      )
    } else {
      setSubmittedUsers({})
    }

    setLoading(false)
  }

  // -----------------------------------------
  // FILTER SALES
  // -----------------------------------------

  const filteredSales = useMemo(() => {
    return sales.filter((item) => {
      // -----------------------------------------
      // WEEK FILTER
      // -----------------------------------------

      let matchesWeek = true

      if (selectedWeek) {
        const [
          selectedYear,
          selectedWeekNumber,
        ] = selectedWeek.split('-W')

        matchesWeek =
          item.year ===
            Number(selectedYear) &&
          item.week ===
            Number(selectedWeekNumber)
      }

      // -----------------------------------------
      // REGION FILTER
      // -----------------------------------------

      const matchesRegion =
        selectedRegion === 'all' ||
        item.region_id ===
          Number(selectedRegion)

      return (
        matchesWeek &&
        matchesRegion
      )
    })
  }, [
    sales,
    selectedWeek,
    selectedRegion,
  ])

  // -----------------------------------------
  // GET REGION NAME
  // -----------------------------------------

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

  // -----------------------------------------
  // GET CATEGORY NAME
  // -----------------------------------------

  function getCategoryName(
    id: number | null
  ) {
    const category =
      categories.find(
        (item) =>
          item.id === id
      )

    if (!category) {
      return '-'
    }

    return `${category.code} - ${category.name}`
  }

  // -----------------------------------------
  // GET PRODUCT NAME
  // -----------------------------------------

  function getProductName(
    id: number | null
  ) {
    const product =
      products.find(
        (item) =>
          item.id === id
      )

    if (!product) {
      return '-'
    }

    return `${product.code} - ${product.name}`
  }

  // -----------------------------------------
  // GET SUBMITTED BY NAME
  // -----------------------------------------

  function getSubmittedByName(
    submittedBy: string | null
  ) {
    if (!submittedBy) {
      return '-'
    }

    return (
      submittedUsers[
        submittedBy
      ] || '-'
    )
  }

  // -----------------------------------------
  // GET ENTRY
  // -----------------------------------------

  function getEntry(
    item: SalesForecast
  ) {
    const submittedBy =
      getSubmittedByName(
        item.submitted_by
      )

    return `${item.year}-W${String(
      item.week
    ).padStart(2, '0')} • ${submittedBy}`
  }

  // -----------------------------------------
  // CLEAR FILTERS
  // -----------------------------------------

  function clearFilters() {
    setSelectedWeek('')
    setSelectedRegion('all')
  }

  // -----------------------------------------
  // FORMAT NUMBER
  // -----------------------------------------

  function formatNumber(
    value: number
  ) {
    return Number(
      value ?? 0
    ).toLocaleString(
      'en-PH',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )
  }

  // -----------------------------------------
  // RENDER
  // -----------------------------------------

  return (
    <div className="space-y-6">

      {/* ===================================== */}
      {/* FILTER CARD */}
      {/* ===================================== */}

      <div className="rounded-xl border bg-card shadow-sm">

        {/* Filter Header */}

        <div className="border-b px-6 py-4">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <h2 className="text-base font-semibold">
                Filters
              </h2>

              <p className="text-sm text-muted-foreground">
                Filter approved weekly sales by week
                and region.
              </p>
            </div>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >

              <RefreshCw
                className={`size-4 ${
                  loading
                    ? 'animate-spin'
                    : ''
                }`}
              />

              Refresh

            </button>

          </div>

        </div>

        {/* Filters */}

        <div className="p-6">

          <div className="grid gap-4 md:grid-cols-2">

            {/* Week */}

            <div className="space-y-2">

              <label className="text-sm font-medium">
                Week
              </label>

              <input
                type="week"
                value={selectedWeek}
                onChange={(e) =>
                  setSelectedWeek(
                    e.target.value
                  )
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />

            </div>

            {/* Region */}

            <div className="space-y-2">

              <label className="text-sm font-medium">
                Region
              </label>

              <select
                value={
                  selectedRegion
                }
                onChange={(e) =>
                  setSelectedRegion(
                    e.target.value
                  )
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >

                <option value="all">
                  All Regions
                </option>

                {regions.map(
                  (region) => (

                    <option
                      key={
                        region.id
                      }
                      value={
                        region.id
                      }
                    >
                      {region.name}
                    </option>

                  )
                )}

              </select>

            </div>

          </div>

          {/* Clear Filters */}

          <div className="mt-4 flex justify-end">

            <button
              type="button"
              onClick={
                clearFilters
              }
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>

          </div>

        </div>

      </div>

      {/* ===================================== */}
      {/* ERROR */}
      {/* ===================================== */}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ===================================== */}
      {/* SALES TABLE */}
      {/* ===================================== */}

      <div className="rounded-xl border bg-card shadow-sm">

        {/* Table Header */}

        <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <h2 className="text-base font-semibold">
              Weekly Sales
            </h2>

            <p className="text-sm text-muted-foreground">
              Showing approved sales records
              across all regions.
            </p>

          </div>

          <div className="w-fit rounded-md bg-muted px-3 py-1.5 text-xs font-medium">
            {filteredSales.length}{' '}
            {filteredSales.length === 1
              ? 'Entry'
              : 'Entries'}
          </div>

        </div>

        {/* Table */}

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead>

              <tr className="border-b bg-muted/40">

                <th className="whitespace-nowrap px-6 py-3 text-left font-medium">
                  Entry
                </th>

                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  Region
                </th>

                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  Category
                </th>

                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  Product
                </th>

                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                  Forecast
                </th>

                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                  Actual
                </th>

              </tr>

            </thead>

            <tbody>

              {loading ? (

                <tr>

                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                  >
                    Loading weekly sales...
                  </td>

                </tr>

              ) : filteredSales.length ===
                0 ? (

                <tr>

                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                  >
                    No approved weekly sales
                    records found.
                  </td>

                </tr>

              ) : (

                filteredSales.map(
                  (item) => (

                    <tr
                      key={
                        item.id
                      }
                      className="border-b last:border-0 hover:bg-muted/30"
                    >

                      {/* Entry */}

                      <td className="px-6 py-3">

                        <div className="font-medium">
                          {item.year}-W
                          {String(
                            item.week
                          ).padStart(
                            2,
                            '0'
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {getSubmittedByName(
                            item.submitted_by
                          )}
                        </div>

                      </td>

                      {/* Region */}

                      <td className="px-4 py-3">
                        {getRegionName(
                          item.region_id
                        )}
                      </td>

                      {/* Category */}

                      <td className="px-4 py-3">
                        {getCategoryName(
                          item.category_id
                        )}
                      </td>

                      {/* Product */}

                      <td className="px-4 py-3">
                        {getProductName(
                          item.product_id
                        )}
                      </td>

                      {/* Forecast */}

                      <td className="px-4 py-3 text-right font-medium">
                        {formatNumber(
                          item.forecast
                        )}
                      </td>

                      {/* Actual */}

                      <td className="px-4 py-3 text-right font-medium">
                        {formatNumber(
                          item.actual
                        )}
                      </td>

                    </tr>

                  )
                )

              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  )
}