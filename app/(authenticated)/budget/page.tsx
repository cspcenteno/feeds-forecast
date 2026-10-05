"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"
import { createClient } from "@/lib/client"

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

type Budget = {
  id: number
  year: number
  month: number | null
  week: number | null
  region_id: number | null
  category_id: number | null
  product_id: number | null
  forecast: number
  budget: number
  last_year: number
}

type UserProfile = {
  role: string
  region_id: number | null
  is_active: boolean
}

const months = [
  { value: 1, name: "January" },
  { value: 2, name: "February" },
  { value: 3, name: "March" },
  { value: 4, name: "April" },
  { value: 5, name: "May" },
  { value: 6, name: "June" },
  { value: 7, name: "July" },
  { value: 8, name: "August" },
  { value: 9, name: "September" },
  { value: 10, name: "October" },
  { value: 11, name: "November" },
  { value: 12, name: "December" },
]

export default function BudgetPage() {
  const supabase = createClient()

  // =========================================================
  // DATA
  // =========================================================

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // =========================================================
  // USER
  // =========================================================

  const [userProfile, setUserProfile] =
    useState<UserProfile | null>(null)

  // =========================================================
  // FORM
  // =========================================================

  const [year, setYear] = useState(
    new Date().getFullYear()
  )

  const [month, setMonth] = useState("")

  const [week, setWeek] = useState("")

  const [regionId, setRegionId] = useState("")

  const [categoryId, setCategoryId] = useState("")

  const [productId, setProductId] = useState("")

  const [forecast, setForecast] = useState("")

  const [budget, setBudget] = useState("")

  const [lastYear, setLastYear] = useState("")

  // =========================================================
  // FILTERS
  // =========================================================

  const [filterYear, setFilterYear] = useState("")

  const [filterMonth, setFilterMonth] = useState("")

  const [filterWeek, setFilterWeek] = useState("")

  const [filterRegion, setFilterRegion] = useState("")

  const [filterCategory, setFilterCategory] = useState("")

  // =========================================================
  // UI
  // =========================================================

  const [editingId, setEditingId] =
    useState<number | null>(null)

  const [loading, setLoading] = useState(false)

  const [saving, setSaving] = useState(false)

  const [message, setMessage] = useState("")

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    setLoading(true)
    setMessage("")

    const {
      data: {
        user,
      },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage("User session not found.")
      setLoading(false)
      return
    }

    // =======================================================
    // LOAD USER PROFILE
    // =======================================================

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("users")
      .select(
        "role, region_id, is_active"
      )
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error(
        "Load User Profile Error:",
        profileError
      )

      setMessage(profileError.message)
      setLoading(false)
      return
    }

    if (!profile?.is_active) {
      setMessage(
        "Your account is inactive."
      )
      setLoading(false)
      return
    }

    setUserProfile(profile)

    // =======================================================
    // SET REGION
    // =======================================================

    if (
      profile.role ===
      "Region Manager"
    ) {
      if (profile.region_id) {
        setRegionId(
          profile.region_id.toString()
        )

        setFilterRegion(
          profile.region_id.toString()
        )
      } else {
        setMessage(
          "Your account does not have an assigned region."
        )
      }
    }

    // =======================================================
    // LOAD OTHER DATA
    // =======================================================

    await Promise.all([
      loadBudgets(
        profile.role,
        profile.region_id
      ),
      loadRegions(
        profile.role,
        profile.region_id
      ),
      loadCategories(),
      loadProducts(),
    ])

    setLoading(false)
  }

  // =========================================================
  // LOAD BUDGETS
  // =========================================================

  async function loadBudgets(
    role?: string,
    assignedRegionId?: number | null
  ) {
    let query = supabase
      .from("budgets")
      .select(
        `
        id,
        year,
        month,
        week,
        region_id,
        category_id,
        product_id,
        forecast,
        budget,
        last_year
        `
      )
      .order("year", {
        ascending: false,
      })
      .order("month", {
        ascending: false,
        nullsFirst: true,
      })
      .order("week", {
        ascending: false,
        nullsFirst: true,
      })
      .order("id", {
        ascending: false,
      })

    // Region Manager sees only assigned region.
    if (
      role === "Region Manager" &&
      assignedRegionId !== null &&
      assignedRegionId !== undefined
    ) {
      query = query.eq(
        "region_id",
        assignedRegionId
      )
    }

    const {
      data,
      error,
    } = await query

    if (error) {
      console.error(
        "Load Budgets Error:",
        {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        }
      )

      setMessage(
        `Load Budgets Error: ${error.message}`
      )

      return
    }

    setBudgets(
      data || []
    )
  }

  // =========================================================
  // LOAD REGIONS
  // =========================================================

  async function loadRegions(
    role?: string,
    assignedRegionId?: number | null
  ) {
    let query = supabase
      .from("regions")
      .select(
        "id, name, code"
      )
      .eq(
        "is_active",
        true
      )
      .order("name")

    // Region Manager only sees assigned region.
    if (
      role === "Region Manager" &&
      assignedRegionId !== null &&
      assignedRegionId !== undefined
    ) {
      query = query.eq(
        "id",
        assignedRegionId
      )
    }

    const {
      data,
      error,
    } = await query

    if (error) {
      console.error(
        "Load Regions Error:",
        {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        }
      )

      setMessage(
        `Load Regions Error: ${error.message}`
      )

      return
    }

    setRegions(
      data || []
    )
  }

  // =========================================================
  // LOAD CATEGORIES
  // =========================================================

  async function loadCategories() {
    const {
      data,
      error,
    } = await supabase
      .from("categories")
      .select(
        "id, code, name"
      )
      .eq(
        "is_active",
        true
      )
      .order("name")

    if (error) {
      console.error(
        "Load Categories Error:",
        {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        }
      )

      setMessage(
        `Load Categories Error: ${error.message}`
      )

      return
    }

    setCategories(
      data || []
    )
  }

  // =========================================================
  // LOAD PRODUCTS
  // =========================================================

  async function loadProducts() {
    const {
      data,
      error,
    } = await supabase
      .from("products")
      .select(
        "id, category_id, code, name"
      )
      .eq(
        "is_active",
        true
      )
      .order("name")

    if (error) {
      console.error(
        "Load Products Error:",
        {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        }
      )

      setMessage(
        `Load Products Error: ${error.message}`
      )

      return
    }

    setProducts(
      data || []
    )
  }

  // =========================================================
  // RESET FORM
  // =========================================================

  function resetForm() {
    setYear(
      new Date().getFullYear()
    )

    setMonth("")
    setWeek("")

    if (
      userProfile?.role ===
      "Region Manager"
    ) {
      setRegionId(
        userProfile.region_id?.toString() ||
          ""
      )
    } else {
      setRegionId("")
    }

    setCategoryId("")
    setProductId("")
    setForecast("")
    setBudget("")
    setLastYear("")
    setEditingId(null)
  }

  // =========================================================
  // MONTH CHANGE
  // =========================================================

  function handleMonthChange(
    value: string
  ) {
    setMonth(value)

    // Week must be selected again
    // when month changes.
    setWeek("")
  }

  // =========================================================
  // CATEGORY CHANGE
  // =========================================================

  function handleCategoryChange(
    value: string
  ) {
    setCategoryId(value)
    setProductId("")
  }

  // =========================================================
  // START EDIT
  // =========================================================

  function startEdit(
    item: Budget
  ) {
    setEditingId(
      item.id
    )

    setYear(
      item.year
    )

    setMonth(
      item.month?.toString() ||
        ""
    )

    setWeek(
      item.week?.toString() ||
        ""
    )

    // Admin can edit the selected region.
    // Region Manager always uses assigned region.
    if (
      userProfile?.role ===
      "Region Manager"
    ) {
      setRegionId(
        userProfile.region_id?.toString() ||
          ""
      )
    } else {
      setRegionId(
        item.region_id?.toString() ||
          ""
      )
    }

    setCategoryId(
      item.category_id?.toString() ||
        ""
    )

    setProductId(
      item.product_id?.toString() ||
        ""
    )

    setForecast(
      item.forecast?.toString() ||
        ""
    )

    setBudget(
      item.budget?.toString() ||
        ""
    )

    setLastYear(
      item.last_year?.toString() ||
        ""
    )

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })
  }

  // =========================================================
  // GET WEEKS IN MONTH
  // =========================================================

  function getWeeksInMonth(
    selectedYear: number,
    selectedMonth: number
  ) {
    const weeks = new Set<number>()

    const daysInMonth =
      new Date(
        selectedYear,
        selectedMonth,
        0
      ).getDate()

    for (
      let day = 1;
      day <= daysInMonth;
      day++
    ) {
      const date =
        new Date(
          selectedYear,
          selectedMonth - 1,
          day
        )

      const targetDate =
        new Date(
          Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          )
        )

      const dayNumber =
        targetDate.getUTCDay() || 7

      targetDate.setUTCDate(
        targetDate.getUTCDate() +
          4 -
          dayNumber
      )

      const yearStart =
        new Date(
          Date.UTC(
            targetDate.getUTCFullYear(),
            0,
            1
          )
        )

      const weekNumber =
        Math.ceil(
          (
            (
              targetDate.getTime() -
              yearStart.getTime()
            ) /
              86400000 +
            1
          ) /
            7
        )

      weeks.add(
        weekNumber
      )
    }

    return Array.from(
      weeks
    ).sort(
      (a, b) => a - b
    )
  }

  // =========================================================
  // AVAILABLE WEEKS
  // =========================================================

  const availableWeeks = useMemo(() => {
    if (!month) {
      return []
    }

    return getWeeksInMonth(
      year,
      Number(month)
    )
  }, [
    year,
    month,
  ])

  // =========================================================
  // CALCULATED ALLOCATION
  // =========================================================

  const allocation = useMemo(() => {
    const budgetAmount =
      Number(
        budget || 0
      )

    const lastYearAmount =
      Number(
        lastYear || 0
      )

    // Year only
    if (!month) {
      const monthlyBudget =
        budgetAmount / 12

      const monthlyLastYear =
        lastYearAmount / 12

      return {
        level: "Year",
        weeks: null,
        monthlyBudget,
        monthlyLastYear,
        weeklyBudget: null,
        weeklyLastYear: null,
      }
    }

    const weeks =
      getWeeksInMonth(
        year,
        Number(month)
      )

    const numberOfWeeks =
      weeks.length || 1

    // Year + Month
    const monthlyBudget =
      budgetAmount

    const monthlyLastYear =
      lastYearAmount

    const weeklyBudget =
      monthlyBudget /
      numberOfWeeks

    const weeklyLastYear =
      monthlyLastYear /
      numberOfWeeks

    return {
      level: week
        ? "Week"
        : "Month",

      weeks,

      monthlyBudget,

      monthlyLastYear,

      weeklyBudget,

      weeklyLastYear,
    }
  }, [
    year,
    month,
    week,
    budget,
    lastYear,
  ])

  // =========================================================
  // SAVE
  // =========================================================

  async function handleSave() {
    setMessage("")

    // =======================================================
    // VALIDATE USER PROFILE
    // =======================================================

    if (!userProfile) {
      setMessage(
        "User profile is not loaded."
      )
      return
    }

    if (!userProfile.is_active) {
      setMessage(
        "Your account is inactive."
      )
      return
    }

    // =======================================================
    // VALIDATE ROLE
    // =======================================================

    if (
      userProfile.role !== "Admin" &&
      userProfile.role !== "Region Manager"
    ) {
      setMessage(
        "You do not have permission to manage budgets."
      )
      return
    }

    // =======================================================
    // VALIDATE YEAR
    // =======================================================

    if (!year) {
      setMessage(
        "Year is required."
      )
      return
    }

    // =======================================================
    // DETERMINE REGION
    // =======================================================

    let saveRegionId: number | null = null

    if (
      userProfile.role === "Admin"
    ) {
      if (!regionId) {
        setMessage(
          "Region is required."
        )
        return
      }

      saveRegionId =
        Number(regionId)
    } else {
      // Region Manager ALWAYS uses
      // their assigned region.
      if (
        userProfile.region_id === null
      ) {
        setMessage(
          "Your account does not have an assigned region."
        )
        return
      }

      saveRegionId =
        userProfile.region_id
    }

    // =======================================================
    // VALIDATE CATEGORY
    // =======================================================

    if (!categoryId) {
      setMessage(
        "Category is required."
      )
      return
    }

    // =======================================================
    // VALIDATE PRODUCT
    // =======================================================

    if (!productId) {
      setMessage(
        "Product is required."
      )
      return
    }

    // =======================================================
    // VALIDATE WEEK
    // =======================================================

    if (
      week &&
      !month
    ) {
      setMessage(
        "Please select a month before selecting a week."
      )
      return
    }

    // =======================================================
    // PREPARE DATA
    // =======================================================

    const budgetData = {
      year: Number(year),

      month:
        month
          ? Number(month)
          : null,

      week:
        week
          ? Number(week)
          : null,

      region_id:
        saveRegionId,

      category_id:
        Number(categoryId),

      product_id:
        Number(productId),

      forecast:
        Number(
          forecast || 0
        ),

      budget:
        Number(
          budget || 0
        ),

      last_year:
        Number(
          lastYear || 0
        ),
    }

    console.log(
      "Budget data being saved:",
      budgetData
    )

    console.log(
      "Current user profile:",
      userProfile
    )

    setSaving(true)

    // =======================================================
    // UPDATE
    // =======================================================

    if (editingId) {
      const {
        data,
        error,
      } = await supabase
        .from("budgets")
        .update(
          budgetData
        )
        .eq(
          "id",
          editingId
        )
        .select()
        .single()

      if (error) {
        console.error(
          "Update Budget Error:",
          {
            message:
              error.message,
            details:
              error.details,
            hint:
              error.hint,
            code:
              error.code,
          }
        )

        setMessage(
          `Update Budget Error: ${
            error.message ||
            "Unknown error"
          }`
        )

        setSaving(false)
        return
      }

      console.log(
        "Budget updated:",
        data
      )

      setMessage(
        "Budget updated successfully."
      )
    }

    // =======================================================
    // INSERT
    // =======================================================

    else {
      const {
        data,
        error,
      } = await supabase
        .from("budgets")
        .insert(
          budgetData
        )
        .select()
        .single()

      if (error) {
        console.error(
          "Insert Budget Error:",
          {
            message:
              error.message,
            details:
              error.details,
            hint:
              error.hint,
            code:
              error.code,
          }
        )

        setMessage(
          `Insert Budget Error: ${
            error.message ||
            "Unknown error"
          }`
        )

        setSaving(false)
        return
      }

      console.log(
        "Budget inserted:",
        data
      )

      setMessage(
        "Budget added successfully."
      )
    }

    // =======================================================
    // RESET + RELOAD
    // =======================================================

    resetForm()

    await loadBudgets(
      userProfile.role,
      userProfile.region_id
    )

    setSaving(false)
  }

  // =========================================================
  // DELETE
  // =========================================================

  async function handleDelete(
    id: number
  ) {
    const confirmed =
      window.confirm(
        "Are you sure you want to delete this budget?"
      )

    if (!confirmed) {
      return
    }

    const {
      error,
    } = await supabase
      .from("budgets")
      .delete()
      .eq(
        "id",
        id
      )

    if (error) {
      console.error(
        "Delete Budget Error:",
        {
          message:
            error.message,
          details:
            error.details,
          hint:
            error.hint,
          code:
            error.code,
        }
      )

      setMessage(
        `Delete Budget Error: ${
          error.message ||
          "Unknown error"
        }`
      )

      return
    }

    setMessage(
      "Budget deleted successfully."
    )

    if (
      editingId === id
    ) {
      resetForm()
    }

    await loadBudgets(
      userProfile?.role,
      userProfile?.region_id
    )
  }

  // =========================================================
  // GET REGION NAME
  // =========================================================

  function getRegionName(
    id: number | null
  ) {
    return (
      regions.find(
        (region) =>
          region.id === id
      )?.name ||
      "-"
    )
  }

  // =========================================================
  // GET CATEGORY NAME
  // =========================================================

  function getCategoryName(
    id: number | null
  ) {
    const category =
      categories.find(
        (item) =>
          item.id === id
      )

    if (!category) {
      return "-"
    }

    return `${category.code} - ${category.name}`
  }

  // =========================================================
  // GET PRODUCT NAME
  // =========================================================

  function getProductName(
    id: number | null
  ) {
    const product =
      products.find(
        (item) =>
          item.id === id
      )

    if (!product) {
      return "-"
    }

    return `${product.code} - ${product.name}`
  }

  // =========================================================
  // FORMAT AMOUNT
  // =========================================================

  function formatAmount(
    value: number
  ) {
    return new Intl.NumberFormat(
      "en-PH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(
      value || 0
    )
  }

  // =========================================================
  // PERIOD DISPLAY
  // =========================================================

  function getPeriodName(
    item: Budget
  ) {
    if (
      item.month === null
    ) {
      return `${item.year}`
    }

    const monthName =
      months.find(
        (monthItem) =>
          monthItem.value ===
          item.month
      )?.name || ""

    if (
      item.week === null
    ) {
      return `${item.year} - ${monthName}`
    }

    return `${item.year} - ${monthName} - W${String(
      item.week
    ).padStart(
      2,
      "0"
    )}`
  }

  // =========================================================
  // FILTERED PRODUCTS
  // =========================================================

  const filteredProducts =
    products.filter(
      (product) =>
        !categoryId ||
        product.category_id ===
          Number(categoryId)
    )

  // =========================================================
  // FILTERED BUDGETS
  // =========================================================

  const filteredBudgets =
    budgets.filter(
      (item) => {
        const matchYear =
          !filterYear ||
          item.year ===
            Number(
              filterYear
            )

        const matchMonth =
          !filterMonth ||
          item.month ===
            Number(
              filterMonth
            )

        const matchWeek =
          !filterWeek ||
          item.week ===
            Number(
              filterWeek
            )

        const matchRegion =
          !filterRegion ||
          item.region_id ===
            Number(
              filterRegion
            )

        const matchCategory =
          !filterCategory ||
          item.category_id ===
            Number(
              filterCategory
            )

        return (
          matchYear &&
          matchMonth &&
          matchWeek &&
          matchRegion &&
          matchCategory
        )
      }
    )

  // =========================================================
  // FILTER WEEKS
  // =========================================================

  const filterWeeks =
    filterMonth
      ? getWeeksInMonth(
          filterYear
            ? Number(
                filterYear
              )
            : new Date().getFullYear(),
          Number(
            filterMonth
          )
        )
      : []

  // =========================================================
  // CLEAR FILTERS
  // =========================================================

  function clearFilters() {
    setFilterYear("")
    setFilterMonth("")
    setFilterWeek("")

    if (
      userProfile?.role ===
      "Region Manager"
    ) {
      setFilterRegion(
        userProfile.region_id?.toString() ||
          ""
      )
    } else {
      setFilterRegion("")
    }

    setFilterCategory("")
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="space-y-6">

      {/* ================================================= */}
      {/* FORM */}
      {/* ================================================= */}

      <div className="rounded-xl border bg-card p-5 shadow-sm">

        <div className="mb-5 flex items-center justify-between">

          <div>
            <h2 className="text-base font-semibold">
              {editingId
                ? "Edit Budget"
                : "Add Budget"}
            </h2>

            <p className="text-sm text-muted-foreground">
              {editingId
                ? "Update the selected budget."
                : "Add a new budget entry by year, month, or week."}
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={
                resetForm
              }
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
            >
              <X className="h-4 w-4" />

              Cancel
            </button>
          )}

        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

          {/* ================================================= */}
          {/* YEAR */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Year
            </label>

            <input
              type="number"
              value={year}
              onChange={(e) =>
                setYear(
                  Number(
                    e.target.value
                  )
                )
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

          </div>

          {/* ================================================= */}
          {/* MONTH */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Month
              <span className="ml-1 text-xs text-muted-foreground">
                Optional
              </span>
            </label>

            <select
              value={month}
              onChange={(e) =>
                handleMonthChange(
                  e.target.value
                )
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >

              <option value="">
                Whole Year
              </option>

              {months.map(
                (item) => (
                  <option
                    key={
                      item.value
                    }
                    value={
                      item.value
                    }
                  >
                    {item.name}
                  </option>
                )
              )}

            </select>

          </div>

          {/* ================================================= */}
          {/* WEEK */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Week
              <span className="ml-1 text-xs text-muted-foreground">
                Optional
              </span>
            </label>

            <select
              value={week}
              onChange={(e) =>
                setWeek(
                  e.target.value
                )
              }
              disabled={
                !month
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >

              <option value="">
                {month
                  ? "Whole Month"
                  : "Select month first"}
              </option>

              {availableWeeks.map(
                (weekNumber) => (
                  <option
                    key={
                      weekNumber
                    }
                    value={
                      weekNumber
                    }
                  >
                    W
                    {String(
                      weekNumber
                    ).padStart(
                      2,
                      "0"
                    )}
                  </option>
                )
              )}

            </select>

          </div>

          {/* ================================================= */}
          {/* REGION */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Region
            </label>

            {userProfile?.role ===
            "Admin" ? (
              <select
                value={
                  regionId
                }
                onChange={(e) =>
                  setRegionId(
                    e.target.value
                  )
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >

                <option value="">
                  Select region
                </option>

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
                      {region.code
                        ? `${region.code} - ${region.name}`
                        : region.name}
                    </option>
                  )
                )}

              </select>
            ) : (
              <input
                type="text"
                value={
                  getRegionName(
                    userProfile?.region_id ||
                      null
                  )
                }
                disabled
                className="h-10 w-full rounded-md border bg-muted px-3 text-sm"
              />
            )}

          </div>

          {/* ================================================= */}
          {/* CATEGORY */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Category
            </label>

            <select
              value={
                categoryId
              }
              onChange={(e) =>
                handleCategoryChange(
                  e.target.value
                )
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                    }{" "}
                    -{" "}
                    {
                      category.name
                    }
                  </option>
                )
              )}

            </select>

          </div>

          {/* ================================================= */}
          {/* PRODUCT */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Product
            </label>

            <select
              value={
                productId
              }
              onChange={(e) =>
                setProductId(
                  e.target.value
                )
              }
              disabled={
                !categoryId
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >

              <option value="">
                {categoryId
                  ? "Select product"
                  : "Select category first"}
              </option>

              {filteredProducts.map(
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
                    }{" "}
                    -{" "}
                    {
                      product.name
                    }
                  </option>
                )
              )}

            </select>

          </div>

          {/* ================================================= */}
          {/* FORECAST */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Forecast
            </label>

            <input
              type="number"
              step="0.01"
              min="0"
              value={
                forecast
              }
              onChange={(e) =>
                setForecast(
                  e.target.value
                )
              }
              placeholder="0.00"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

          </div>

          {/* ================================================= */}
          {/* BUDGET */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Budget
            </label>

            <input
              type="number"
              step="0.01"
              min="0"
              value={
                budget
              }
              onChange={(e) =>
                setBudget(
                  e.target.value
                )
              }
              placeholder="0.00"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

          </div>

          {/* ================================================= */}
          {/* LAST YEAR */}
          {/* ================================================= */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Last Year
            </label>

            <input
              type="number"
              step="0.01"
              min="0"
              value={
                lastYear
              }
              onChange={(e) =>
                setLastYear(
                  e.target.value
                )
              }
              placeholder="0.00"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

          </div>

          {/* ================================================= */}
          {/* SAVE */}
          {/* ================================================= */}

          <div className="flex items-end">

            <button
              type="button"
              onClick={
                handleSave
              }
              disabled={
                saving
              }
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >

              {editingId ? (
                <>
                  <Pencil className="h-4 w-4" />

                  {saving
                    ? "Updating..."
                    : "Update"}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />

                  {saving
                    ? "Adding..."
                    : "Add Budget"}
                </>
              )}

            </button>

          </div>

        </div>

        {/* ================================================= */}
        {/* ALLOCATION PREVIEW */}
        {/* ================================================= */}

        {(budget ||
          lastYear) && (
          <div className="mt-5 rounded-lg border bg-muted/30 p-4">

            <div className="mb-3">
              <h3 className="text-sm font-semibold">
                Budget Allocation
              </h3>

              <p className="text-xs text-muted-foreground">
                {allocation.level ===
                "Year"
                  ? "Annual values will be divided into 12 months, then distributed across the weeks of each month."
                  : allocation.level ===
                      "Month"
                    ? "Monthly values will be distributed across the weeks of the selected month."
                    : "Weekly values are assigned directly to the selected week."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

              <div>
                <p className="text-xs text-muted-foreground">
                  Monthly Budget
                </p>

                <p className="mt-1 font-medium">
                  {formatAmount(
                    allocation.monthlyBudget
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Monthly Last Year
                </p>

                <p className="mt-1 font-medium">
                  {formatAmount(
                    allocation.monthlyLastYear
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Weeks in Month
                </p>

                <p className="mt-1 font-medium">
                  {allocation.weeks
                    ? allocation.weeks.length
                    : "12-month allocation"}
                </p>
              </div>

              {allocation.weeklyBudget !==
                null && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Weekly Budget
                    </p>

                    <p className="mt-1 font-medium">
                      {formatAmount(
                        allocation.weeklyBudget
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Weekly Last Year
                    </p>

                    <p className="mt-1 font-medium">
                      {formatAmount(
                        allocation.weeklyLastYear ||
                          0
                      )}
                    </p>
                  </div>
                </>
              )}

            </div>

          </div>
        )}

        {message && (
          <div className="mt-4 rounded-md border bg-muted/50 px-3 py-2 text-sm">
            {message}
          </div>
        )}

      </div>

      {/* ================================================= */}
      {/* FILTERS + LIST */}
      {/* ================================================= */}

      <div className="rounded-xl border bg-card p-5 shadow-sm">

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <h2 className="text-base font-semibold">
              Budget List
            </h2>

            <p className="text-sm text-muted-foreground">
              Filter and manage budget entries.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              setLoading(true)

              await loadBudgets(
                userProfile?.role,
                userProfile?.region_id
              )

              setLoading(false)
            }}
            disabled={
              loading
            }
            className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >

            <RefreshCw
              className={`h-4 w-4 ${
                loading
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh

          </button>

        </div>

        {/* ================================================= */}
        {/* FILTER CONTROLS */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">

          {/* Year */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Year
            </label>

            <select
              value={
                filterYear
              }
              onChange={(e) => {
                setFilterYear(
                  e.target.value
                )
                setFilterMonth("")
                setFilterWeek("")
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >

              <option value="">
                All Years
              </option>

              {Array.from(
                new Set(
                  budgets.map(
                    (
                      item
                    ) =>
                      item.year
                  )
                )
              )
                .sort(
                  (a, b) =>
                    b - a
                )
                .map(
                  (
                    itemYear
                  ) => (
                    <option
                      key={
                        itemYear
                      }
                      value={
                        itemYear
                      }
                    >
                      {
                        itemYear
                      }
                    </option>
                  )
                )}

            </select>

          </div>

          {/* Month */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Month
            </label>

            <select
              value={
                filterMonth
              }
              onChange={(e) => {
                setFilterMonth(
                  e.target.value
                )
                setFilterWeek("")
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >

              <option value="">
                All Months
              </option>

              {months.map(
                (item) => (
                  <option
                    key={
                      item.value
                    }
                    value={
                      item.value
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                )
              )}

            </select>

          </div>

          {/* Week */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Week
            </label>

            <select
              value={
                filterWeek
              }
              onChange={(e) =>
                setFilterWeek(
                  e.target.value
                )
              }
              disabled={
                !filterMonth
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >

              <option value="">
                {filterMonth
                  ? "All Weeks"
                  : "Select month first"}
              </option>

              {filterWeeks.map(
                (
                  weekNumber
                ) => (
                  <option
                    key={
                      weekNumber
                    }
                    value={
                      weekNumber
                    }
                  >
                    W
                    {String(
                      weekNumber
                    ).padStart(
                      2,
                      "0"
                    )}
                  </option>
                )
              )}

            </select>

          </div>

          {/* Region */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Region
            </label>

            {userProfile?.role ===
            "Admin" ? (
              <select
                value={
                  filterRegion
                }
                onChange={(e) =>
                  setFilterRegion(
                    e.target.value
                  )
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >

                <option value="">
                  All Regions
                </option>

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
            ) : (
              <input
                type="text"
                value={
                  getRegionName(
                    userProfile?.region_id ||
                      null
                  )
                }
                disabled
                className="h-10 w-full rounded-md border bg-muted px-3 text-sm"
              />
            )}

          </div>

          {/* Category */}

          <div className="space-y-2">

            <label className="text-sm font-medium">
              Category
            </label>

            <select
              value={
                filterCategory
              }
              onChange={(e) =>
                setFilterCategory(
                  e.target.value
                )
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >

              <option value="">
                All Categories
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
                    }{" "}
                    -{" "}
                    {
                      category.name
                    }
                  </option>
                )
              )}

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
            Clear Filters
          </button>

        </div>

        {/* ================================================= */}
        {/* TABLE */}
        {/* ================================================= */}

        <div className="mt-5 w-full overflow-hidden rounded-lg border">

          <table className="w-full table-fixed text-sm">

            <thead className="bg-muted/50">

              <tr className="border-b">

                <th className="px-4 py-3 pl-6 text-left font-medium">
                  Period
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Region
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Category
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Product
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Forecast
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Budget
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Last Year
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {filteredBudgets.length ===
              0 ? (
                <tr>

                  <td
                    colSpan={
                      8
                    }
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No budget entries found.
                  </td>

                </tr>
              ) : (
                filteredBudgets.map(
                  (
                    item
                  ) => (
                    <tr
                      key={
                        item.id
                      }
                      className="border-b last:border-0 hover:bg-muted/30"
                    >

                      <td className="px-4 py-3 pl-6">

                        <div className="font-medium">
                          {
                            getPeriodName(
                              item
                            )
                          }
                        </div>

                        {item.month !==
                          null && (
                          <div className="text-xs text-muted-foreground">
                            {item.week !==
                            null
                              ? "Weekly"
                              : "Monthly"}
                          </div>
                        )}

                        {item.month ===
                          null && (
                          <div className="text-xs text-muted-foreground">
                            Annual
                          </div>
                        )}

                      </td>

                      <td className="px-4 py-3">
                        {
                          getRegionName(
                            item.region_id
                          )
                        }
                      </td>

                      <td className="px-4 py-3">
                        {
                          getCategoryName(
                            item.category_id
                          )
                        }
                      </td>

                      <td className="px-4 py-3">
                        {
                          getProductName(
                            item.product_id
                          )
                        }
                      </td>

                      <td className="px-4 py-3 text-right">
                        {
                          formatAmount(
                            item.forecast
                          )
                        }
                      </td>

                      <td className="px-4 py-3 text-right">
                        {
                          formatAmount(
                            item.budget
                          )
                        }
                      </td>

                      <td className="px-4 py-3 text-right">
                        {
                          formatAmount(
                            item.last_year
                          )
                        }
                      </td>

                      <td className="px-4 py-3">

                        <div className="flex items-center gap-1">

                          <button
                            type="button"
                            onClick={() =>
                              startEdit(
                                item
                              )
                            }
                            title="Edit"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDelete(
                                item.id
                              )
                            }
                            title="Delete"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>

                        </div>

                      </td>

                    </tr>
                  )
                )
              )}

            </tbody>

          </table>

        </div>

        <div className="mt-3 text-sm text-muted-foreground">
          {
            filteredBudgets.length
          }{" "}
          {filteredBudgets.length ===
          1
            ? "entry"
            : "entries"}
        </div>

      </div>

    </div>
  )
}