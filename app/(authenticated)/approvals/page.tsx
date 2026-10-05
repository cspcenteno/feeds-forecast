'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  RefreshCw,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/client'

type Region = {
  id: number
  name: string
  code: string | null
  is_active?: boolean
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
  approved_at: string | null
  approved_by: string | null
  remarks: string | null
}

export default function ApprovalsPage() {
  const supabase = createClient()

  // -----------------------------------------
  // DATA
  // -----------------------------------------

  const [sales, setSales] = useState<
    SalesForecast[]
  >([])

  const [regions, setRegions] = useState<Region[]>(
    []
  )

  const [categories, setCategories] = useState<
    Category[]
  >([])

  const [products, setProducts] = useState<Product[]>(
    []
  )

  const [submittedUsers, setSubmittedUsers] =
    useState<Record<string, string>>({})

  // -----------------------------------------
  // USER ACCESS
  // -----------------------------------------

  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [assignedRegionId, setAssignedRegionId] =
    useState<number | null>(null)

  // -----------------------------------------
  // FILTERS
  // -----------------------------------------

  const [selectedWeekDate, setSelectedWeekDate] =
    useState('')

  const [selectedRegion, setSelectedRegion] =
    useState('all')

  const [selectedStatus, setSelectedStatus] =
    useState('Pending')

  // -----------------------------------------
  // MODAL
  // -----------------------------------------

  const [selectedItem, setSelectedItem] =
    useState<SalesForecast | null>(null)

  const [actionType, setActionType] = useState<
    'approve' | 'reject' | null
  >(null)

  const [remarks, setRemarks] = useState('')

  // -----------------------------------------
  // UI STATE
  // -----------------------------------------

  const [loading, setLoading] = useState(true)

  const [processing, setProcessing] =
    useState(false)

  const [error, setError] = useState('')

  const [message, setMessage] = useState('')

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
    setMessage('')

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

    setUserId(user.id)

    // -----------------------------------------
    // GET USER PROFILE
    // -----------------------------------------

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('users')
      .select(
        'role, is_active, region_id'
      )
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

    const role = profile.role ?? ''
    const admin = role === 'Admin'
    const regionManager =
      role === 'Region Manager'

    setUserRole(role)
    setIsAdmin(admin)

    const profileRegionId =
      profile.region_id !== null &&
      profile.region_id !== undefined
        ? Number(profile.region_id)
        : null

    setAssignedRegionId(
      profileRegionId
    )

    // -----------------------------------------
    // USER ROLE
    // -----------------------------------------
    //
    // Regular Users should not have access
    // to approval submissions.
    //

    if (
      !admin &&
      !regionManager
    ) {
      setError(
        'You do not have access to Approvals.'
      )
      setSales([])
      setRegions([])
      setCategories([])
      setProducts([])
      setSubmittedUsers({})
      setLoading(false)
      return
    }

    // -----------------------------------------
    // VALIDATE REGION MANAGER REGION
    // -----------------------------------------

    if (
      regionManager &&
      profileRegionId === null
    ) {
      setError(
        'Your account does not have an assigned region.'
      )
      setSales([])
      setRegions([])
      setCategories([])
      setProducts([])
      setSubmittedUsers({})
      setLoading(false)
      return
    }

    // -----------------------------------------
    // LOAD REGIONS
    // -----------------------------------------

    let regionsQuery = supabase
      .from('regions')
      .select(
        'id, name, code, is_active'
      )
      .eq('is_active', true)
      .order('name')

    // Region Manager can only see
    // their assigned region.
    if (regionManager) {
      regionsQuery =
        regionsQuery.eq(
          'id',
          profileRegionId
        )
    }

    // -----------------------------------------
    // LOAD SALES
    // -----------------------------------------

    let salesQuery = supabase
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
        submitted_at,
        approved_at,
        approved_by,
        remarks
        `
      )
      .order('year', {
        ascending: false,
      })
      .order('week', {
        ascending: false,
      })
      .order('id', {
        ascending: false,
      })

    // -----------------------------------------
    // REGION MANAGER REGION RESTRICTION
    // -----------------------------------------

    if (regionManager) {
      salesQuery =
        salesQuery.eq(
          'region_id',
          profileRegionId
        )
    }

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
        .select(
          'id, code, name'
        )
        .order('name'),

      supabase
        .from('products')
        .select(
          'id, category_id, code, name'
        )
        .order('name'),
    ])

    // -----------------------------------------
    // CHECK SALES
    // -----------------------------------------

    if (salesResult.error) {
      setError(
        salesResult.error.message
      )
      setLoading(false)
      return
    }

    // -----------------------------------------
    // CHECK REGIONS
    // -----------------------------------------

    if (regionsResult.error) {
      setError(
        regionsResult.error.message
      )
      setLoading(false)
      return
    }

    // -----------------------------------------
    // CHECK CATEGORIES
    // -----------------------------------------

    if (categoriesResult.error) {
      setError(
        categoriesResult.error.message
      )
      setLoading(false)
      return
    }

    // -----------------------------------------
    // CHECK PRODUCTS
    // -----------------------------------------

    if (productsResult.error) {
      setError(
        productsResult.error.message
      )
      setLoading(false)
      return
    }

    const salesData =
      (salesResult.data ??
        []) as SalesForecast[]

    const regionsData =
      regionsResult.data ?? []

    setSales(
      salesData
    )

    setRegions(
      regionsData
    )

    setCategories(
      categoriesResult.data ?? []
    )

    setProducts(
      productsResult.data ?? []
    )

    // -----------------------------------------
    // DEFAULT REGION FILTER
    // -----------------------------------------
    //
    // Admin:
    //     All regions
    //
    // Region Manager:
    //     Assigned region only
    //

    if (regionManager) {
      setSelectedRegion(
        String(profileRegionId)
      )
    } else {
      setSelectedRegion('all')
    }

    // -----------------------------------------
    // LOAD SUBMITTED USERS
    // -----------------------------------------

    const submittedByIds =
      Array.from(
        new Set(
          salesData
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

    if (
      submittedByIds.length > 0
    ) {
      const {
        data: usersData,
        error: usersError,
      } = await supabase
        .from('users')
        .select(
          'id, full_name'
        )
        .in(
          'id',
          submittedByIds
        )

      if (usersError) {
        setError(
          usersError.message
        )
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
            user.full_name
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
      // WEEK DATE FILTER
      // -----------------------------------------

      let matchesWeekDate = true

      if (selectedWeekDate) {
        const [
          selectedYear,
          selectedWeek,
        ] =
          selectedWeekDate.split(
            '-W'
          )

        matchesWeekDate =
          item.year ===
            Number(
              selectedYear
            ) &&
          item.week ===
            Number(
              selectedWeek
            )
      }

      // -----------------------------------------
      // REGION FILTER
      // -----------------------------------------

      const matchesRegion =
        selectedRegion ===
          'all' ||
        item.region_id ===
          Number(
            selectedRegion
          )

      // -----------------------------------------
      // STATUS FILTER
      // -----------------------------------------

      const matchesStatus =
        selectedStatus ===
          'all' ||
        item.status ===
          selectedStatus

      return (
        matchesWeekDate &&
        matchesRegion &&
        matchesStatus
      )
    })
  }, [
    sales,
    selectedWeekDate,
    selectedRegion,
    selectedStatus,
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
  // FORMAT DATE
  // -----------------------------------------

  function formatDate(
    value: string | null
  ) {
    if (!value) {
      return '-'
    }

    return new Date(
      value
    ).toLocaleString(
      'en-PH',
      {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }
    )
  }

  // -----------------------------------------
  // CLEAR FILTERS
  // -----------------------------------------

  function clearFilters() {
    setSelectedWeekDate('')

    if (
      userRole ===
      'Region Manager'
    ) {
      setSelectedRegion(
        String(
          assignedRegionId
        )
      )
    } else {
      setSelectedRegion('all')
    }

    setSelectedStatus(
      'Pending'
    )
  }

  // -----------------------------------------
  // OPEN APPROVE
  // -----------------------------------------

  function openApprove(
    item: SalesForecast
  ) {
    if (
      item.status !==
      'Pending'
    ) {
      return
    }

    setSelectedItem(item)
    setActionType(
      'approve'
    )
    setRemarks('')
    setError('')
    setMessage('')
  }

  // -----------------------------------------
  // OPEN REJECT
  // -----------------------------------------

  function openReject(
    item: SalesForecast
  ) {
    if (
      item.status !==
      'Pending'
    ) {
      return
    }

    setSelectedItem(item)
    setActionType(
      'reject'
    )
    setRemarks('')
    setError('')
    setMessage('')
  }

  // -----------------------------------------
  // CLOSE MODAL
  // -----------------------------------------

  function closeModal() {
    if (processing) {
      return
    }

    setSelectedItem(null)
    setActionType(null)
    setRemarks('')
  }

  // -----------------------------------------
  // PROCESS APPROVAL
  // -----------------------------------------

  async function handleApproval() {
    if (!selectedItem) {
      return
    }

    if (
      actionType ===
      'reject'
    ) {
      if (!remarks.trim()) {
        setError(
          'Please enter a reason for rejection.'
        )
        return
      }
    }

    setProcessing(true)
    setError('')
    setMessage('')

    // -----------------------------------------
    // UPDATE DATA
    // -----------------------------------------

    const updateData =
      actionType ===
      'approve'
        ? {
            status:
              'Approved',

            approved_at:
              new Date().toISOString(),

            approved_by:
              userId,

            remarks:
              remarks.trim() ||
              null,
          }
        : {
            status:
              'Rejected',

            approved_at:
              new Date().toISOString(),

            approved_by:
              userId,

            remarks:
              remarks.trim(),
          }

    const { error } =
      await supabase
        .from(
          'sales_forecasts'
        )
        .update(
          updateData
        )
        .eq(
          'id',
          selectedItem.id
        )

    setProcessing(false)

    if (error) {
      setError(
        error.message
      )
      return
    }

    setMessage(
      actionType ===
        'approve'
        ? 'Sales forecast approved successfully.'
        : 'Sales forecast rejected successfully.'
    )

    closeModal()

    await loadData()
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
        {/* Header */}

        <div className="border-b px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">
                Filters
              </h2>

              <p className="text-sm text-muted-foreground">
                Filter submissions by week date,
                region, and status.
              </p>
            </div>

            <button
              type="button"
              onClick={
                loadData
              }
              disabled={
                loading
              }
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
          <div className="grid gap-4 md:grid-cols-3">
            {/* Week Date */}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Week Date
              </label>

              <input
                type="week"
                value={
                  selectedWeekDate
                }
                onChange={(e) =>
                  setSelectedWeekDate(
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
                disabled={
                  userRole ===
                  'Region Manager'
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted"
              >
                {userRole ===
                'Admin' && (
                  <option value="all">
                    All Active Regions
                  </option>
                )}

                {regions.map(
                  (
                    region
                  ) => (
                    <option
                      key={
                        region.id
                      }
                      value={
                        region.id
                      }
                    >
                      {
                        region.name
                      }
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Status */}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Status
              </label>

              <select
                value={
                  selectedStatus
                }
                onChange={(e) =>
                  setSelectedStatus(
                    e.target.value
                  )
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">
                  All Statuses
                </option>

                <option value="Pending">
                  Pending
                </option>

                <option value="Approved">
                  Approved
                </option>

                <option value="Rejected">
                  Rejected
                </option>
              </select>
            </div>
          </div>

          {/* Clear */}

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
      {/* MESSAGES */}
      {/* ===================================== */}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border bg-muted px-4 py-3 text-sm">
          {message}
        </div>
      )}

      {/* ===================================== */}
      {/* APPROVAL TABLE */}
      {/* ===================================== */}

      <div className="rounded-xl border bg-card shadow-sm">
        {/* Header */}

        <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Sales Submissions
            </h2>

            <p className="text-sm text-muted-foreground">
              {userRole ===
              'Region Manager'
                ? 'Review submitted sales forecasts for your assigned region.'
                : 'Review submitted sales forecasts.'}
            </p>
          </div>

          <div className="w-fit rounded-md bg-muted px-3 py-1.5 text-xs font-medium">
            {
              filteredSales.length
            }{' '}
            {filteredSales.length ===
            1
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

                <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
                  Status
                </th>

                <th className="whitespace-nowrap px-6 py-3 text-left font-medium">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                  >
                    Loading submissions...
                  </td>
                </tr>
              ) : filteredSales.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                  >
                    No sales submissions
                    found.
                  </td>
                </tr>
              ) : (
                filteredSales.map(
                  (
                    item
                  ) => (
                    <tr
                      key={
                        item.id
                      }
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      {/* Year-Week + Submitted By */}

                      <td className="px-6 py-3">
                        <div className="font-medium">
                          {
                            item.year
                          }
                          -W
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

                      {/* Status */}

                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                          {
                            item.status
                          }
                        </span>
                      </td>

                      {/* Action */}

                      <td className="px-6 py-3">
                        {item.status ===
                        'Pending' ? (
                          <div className="flex items-center justify-start gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openApprove(
                                  item
                                )
                              }
                              className="inline-flex size-8 items-center justify-center rounded-md border transition hover:bg-muted"
                              title="Approve"
                            >
                              <Check className="size-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                openReject(
                                  item
                                )
                              }
                              className="inline-flex size-8 items-center justify-center rounded-md border transition hover:bg-muted"
                              title="Reject"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No action
                          </span>
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

      {/* ===================================== */}
      {/* APPROVAL / REJECTION MODAL */}
      {/* ===================================== */}

      {selectedItem &&
        actionType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl border bg-background shadow-lg">
              {/* Modal Header */}

              <div className="border-b px-6 py-4">
                <h2 className="text-lg font-semibold">
                  {actionType ===
                  'approve'
                    ? 'Approve Sales Forecast'
                    : 'Reject Sales Forecast'}
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {actionType ===
                  'approve'
                    ? 'Confirm that you want to approve this sales forecast.'
                    : 'Please provide a reason for rejecting this sales forecast.'}
                </p>
              </div>

              {/* Details */}

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Year-Week
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {
                        selectedItem.year
                      }
                      -W
                      {String(
                        selectedItem.week
                      ).padStart(
                        2,
                        '0'
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Region
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {getRegionName(
                        selectedItem.region_id
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Product
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {getProductName(
                        selectedItem.product_id
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Submitted By
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {getSubmittedByName(
                        selectedItem.submitted_by
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Forecast
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {formatNumber(
                        selectedItem.forecast
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Actual
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {formatNumber(
                        selectedItem.actual
                      )}
                    </p>
                  </div>
                </div>

                {/* Remarks */}

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Remarks
                    {actionType ===
                      'reject' && (
                      <span className="text-destructive">
                        {' '}
                        *
                      </span>
                    )}
                  </label>

                  <textarea
                    value={
                      remarks
                    }
                    onChange={(e) =>
                      setRemarks(
                        e.target.value
                      )
                    }
                    rows={4}
                    placeholder={
                      actionType ===
                      'approve'
                        ? 'Optional remarks'
                        : 'Enter reason for rejection'
                    }
                    className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Modal Error */}

                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {
                      error
                    }
                  </div>
                )}

                {/* Buttons */}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={
                      closeModal
                    }
                    disabled={
                      processing
                    }
                    className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleApproval
                    }
                    disabled={
                      processing
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionType ===
                    'approve' ? (
                      <Check className="size-4" />
                    ) : (
                      <X className="size-4" />
                    )}

                    {processing
                      ? 'Processing...'
                      : actionType ===
                          'approve'
                        ? 'Approve'
                        : 'Reject'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}