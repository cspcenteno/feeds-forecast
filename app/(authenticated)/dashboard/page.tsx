"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  TrendingUp,
  FileText,
  CalendarDays,
} from "lucide-react"

import { createClient } from "@/lib/client"

type UserProfile = {
  id: string
  role: string
  region_id: string | null
  is_active: boolean
}

type Forecast = {
  id: string
  year: number
  week: number
  region_id: string
  category_id: string
  product_id: string
  forecast: number
  actual: number | null
  budget: number | null
  last_year: number | null
  status: string
  user_id: string
  created_at: string
}

type WeekLock = {
  id: string
  year: number
  week: number
  status: string
  locked_at: string | null
  created_at: string
}

type Region = {
  id: string
  name: string
}

type Product = {
  id: string
  name: string
}

type Category = {
  id: string
  name: string
}

type ActivityItem = {
  id: string
  year: number
  week: number
  forecast: number
  status: string
  created_at: string
  regionName: string
  productName: string
  categoryName: string
}

export default function DashboardPage() {
  const supabase = createClient()

  const [profile, setProfile] =
    useState<UserProfile | null>(null)

  const [forecasts, setForecasts] =
    useState<Forecast[]>([])

  const [weekLocks, setWeekLocks] =
    useState<WeekLock[]>([])

  const [regions, setRegions] =
    useState<Region[]>([])

  const [products, setProducts] =
    useState<Product[]>([])

  const [categories, setCategories] =
    useState<Category[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState<string | null>(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    try {
      setLoading(true)
      setError(null)

      /*
       * Get signed-in user
       */
      const {
        data: {
          user,
        },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) {
        throw authError
      }

      if (!user) {
        throw new Error("You are not signed in.")
      }

      /*
       * Get user profile
       */
      const {
        data: userProfile,
        error: profileError,
      } = await supabase
        .from("users")
        .select(
          "id, role, region_id, is_active"
        )
        .eq("id", user.id)
        .single()

      if (profileError) {
        throw profileError
      }

      setProfile(userProfile)

      /*
       * Get forecasts
       *
       * We intentionally do not depend on
       * Supabase nested relationships here.
       * This avoids the relationship errors you
       * encountered earlier.
       */
      let forecastQuery = supabase
        .from("sales_forecasts")
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
            budget,
            last_year,
            status,
            user_id,
            created_at
          `
        )
        .order("created_at", {
          ascending: false,
        })

      /*
       * Apply the dashboard visibility rules.
       */
      if (
        userProfile.role ===
        "Region Manager"
      ) {
        if (userProfile.region_id) {
          forecastQuery =
            forecastQuery.eq(
              "region_id",
              userProfile.region_id
            )
        } else {
          /*
           * A Region Manager without an assigned
           * region should not see other regions.
           */
          forecastQuery =
            forecastQuery.eq(
              "user_id",
              user.id
            )
        }
      } else if (
        userProfile.role === "User"
      ) {
        /*
         * Users see their own forecast records.
         */
        forecastQuery =
          forecastQuery.eq(
            "user_id",
            user.id
          )
      }

      const {
        data: forecastData,
        error: forecastError,
      } = await forecastQuery

      if (forecastError) {
        throw forecastError
      }

      setForecasts(
        (forecastData ?? []) as Forecast[]
      )

      /*
       * Week locks
       *
       * These are visible to authenticated
       * users according to your current policy.
       */
      const {
        data: lockData,
        error: lockError,
      } = await supabase
        .from("week_locks")
        .select(
          `
            id,
            year,
            week,
            status,
            locked_at,
            created_at
          `
        )
        .order("year", {
          ascending: false,
        })
        .order("week", {
          ascending: false,
        })

      if (lockError) {
        throw lockError
      }

      setWeekLocks(
        (lockData ?? []) as WeekLock[]
      )

      /*
       * Regions
       */
      const {
        data: regionData,
        error: regionError,
      } = await supabase
        .from("regions")
        .select("id, name")
        .order("name")

      if (regionError) {
        throw regionError
      }

      setRegions(
        (regionData ?? []) as Region[]
      )

      /*
       * Products
       */
      const {
        data: productData,
        error: productError,
      } = await supabase
        .from("products")
        .select("id, name")
        .order("name")

      if (productError) {
        throw productError
      }

      setProducts(
        (productData ?? []) as Product[]
      )

      /*
       * Categories
       */
      const {
        data: categoryData,
        error: categoryError,
      } = await supabase
        .from("categories")
        .select("id, name")
        .order("name")

      if (categoryError) {
        throw categoryError
      }

      setCategories(
        (categoryData ?? []) as Category[]
      )
    } catch (err) {
      console.error(
        "Dashboard error:",
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load dashboard."
      )
    } finally {
      setLoading(false)
    }
  }

  /*
   * Current ISO year
   */
  const currentYear =
    getISOWeekYear(new Date())

  /*
   * Forecasts for current year
   */
  const currentYearForecasts =
    useMemo(() => {
      return forecasts.filter(
        (item) =>
          item.year === currentYear
      )
    }, [
      forecasts,
      currentYear,
    ])

  /*
   * KPI: Total Forecast
   */
  const totalForecast =
    useMemo(() => {
      return currentYearForecasts.reduce(
        (total, item) =>
          total +
          Number(item.forecast || 0),
        0
      )
    }, [currentYearForecasts])

  /*
   * KPI: Pending Approval
   */
  const pendingApproval =
    useMemo(() => {
      return forecasts.filter(
        (item) =>
          item.status === "Pending"
      ).length
    }, [forecasts])

  /*
   * KPI: Approved
   */
  const approved =
    useMemo(() => {
      return forecasts.filter(
        (item) =>
          item.status === "Approved"
      ).length
    }, [forecasts])

  /*
   * KPI: Locked Weeks
   */
  const lockedWeeks =
    useMemo(() => {
      return weekLocks.filter(
        (item) =>
          item.status === "Locked"
      ).length
    }, [weekLocks])

  /*
   * Current week
   */
  const currentWeek =
    getISOWeek(new Date())

  /*
   * Forecast grouped by week.
   *
   * We only show the latest 8 weeks that
   * contain forecast data.
   */
  const weeklyForecast =
    useMemo(() => {
      const grouped =
        new Map<number, number>()

      currentYearForecasts.forEach(
        (item) => {
          const current =
            grouped.get(item.week) ?? 0

          grouped.set(
            item.week,
            current +
              Number(
                item.forecast || 0
              )
          )
        }
      )

      return Array.from(
        grouped.entries()
      )
        .sort(
          ([weekA], [weekB]) =>
            weekA - weekB
        )
        .slice(-8)
        .map(
          ([week, value]) => ({
            week,
            value,
          })
        )
    }, [currentYearForecasts])

  /*
   * Maximum value for chart scaling.
   */
  const maxWeeklyForecast =
    Math.max(
      ...weeklyForecast.map(
        (item) => item.value
      ),
      1
    )

  /*
   * Recent activity
   */
  const recentActivity =
    useMemo<ActivityItem[]>(() => {
      return forecasts
        .slice(0, 6)
        .map((item) => ({
          id: item.id,
          year: item.year,
          week: item.week,
          forecast: Number(
            item.forecast || 0
          ),
          status: item.status,
          created_at:
            item.created_at,
          regionName:
            regions.find(
              (region) =>
                region.id ===
                item.region_id
            )?.name ??
            "Unknown Region",
          productName:
            products.find(
              (product) =>
                product.id ===
                item.product_id
            )?.name ??
            "Unknown Product",
          categoryName:
            categories.find(
              (category) =>
                category.id ===
                item.category_id
            )?.name ??
            "Unknown Category",
        }))
    }, [
      forecasts,
      regions,
      products,
      categories,
    ])

  /*
   * Assigned region
   */
  const assignedRegion =
    profile?.region_id
      ? regions.find(
          (region) =>
            region.id ===
            profile.region_id
        )?.name
      : profile?.role === "Admin"
        ? "All Regions"
        : "No Region Assigned"

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="font-semibold text-destructive">
          Unable to load dashboard
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Dashboard Context */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {currentYear} • Week{" "}
          {currentWeek}
        </p>

        <p className="text-sm text-muted-foreground">
          {profile?.role} •{" "}
          {assignedRegion}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <DashboardCard
          title="Total Forecast"
          value={formatNumber(
            totalForecast
          )}
          description={`${currentYear} forecast`}
          icon={TrendingUp}
        />

        <DashboardCard
          title="Pending Approval"
          value={pendingApproval.toLocaleString()}
          description="Awaiting approval"
          icon={Clock3}
        />

        <DashboardCard
          title="Approved"
          value={approved.toLocaleString()}
          description="Approved forecasts"
          icon={CheckCircle2}
        />

        <DashboardCard
          title="Locked Weeks"
          value={lockedWeeks.toLocaleString()}
          description="Currently locked"
          icon={LockKeyhole}
        />

      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Forecast Overview */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <BarChart3 className="h-5 w-5" />
            </div>

            <div>
              <h2 className="font-semibold">
                Forecast Overview
              </h2>

              <p className="text-sm text-muted-foreground">
                Weekly forecast for{" "}
                {currentYear}
              </p>
            </div>

          </div>

          {weeklyForecast.length === 0 ? (
            <div className="mt-8 flex h-48 items-center justify-center rounded-lg border border-dashed">
              <div className="text-center">
                <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/50" />

                <p className="mt-2 text-sm text-muted-foreground">
                  No forecast data available.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-8 space-y-4">

              {weeklyForecast.map(
                (item) => (
                  <div
                    key={item.week}
                    className="space-y-1.5"
                  >

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        W{String(
                          item.week
                        ).padStart(
                          2,
                          "0"
                        )}
                      </span>

                      <span className="text-muted-foreground">
                        {formatNumber(
                          item.value
                        )}
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${
                            (item.value /
                              maxWeeklyForecast) *
                            100
                          }%`,
                        }}
                      />
                    </div>

                  </div>
                )
              )}

            </div>
          )}

        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-5 w-5" />
            </div>

            <div>
              <h2 className="font-semibold">
                Recent Activity
              </h2>

              <p className="text-sm text-muted-foreground">
                Latest forecast entries
              </p>
            </div>

          </div>

          {recentActivity.length ===
          0 ? (
            <div className="mt-6 flex h-48 items-center justify-center rounded-lg border border-dashed">
              <div className="text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />

                <p className="mt-2 text-sm text-muted-foreground">
                  No recent activity.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 divide-y">

              {recentActivity.map(
                (item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >

                    <div className="min-w-0">

                      <div className="flex items-center gap-2">

                        <p className="truncate text-sm font-medium">
                          {item.productName}
                        </p>

                        <StatusBadge
                          status={
                            item.status
                          }
                        />

                      </div>

                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.categoryName}{" "}
                        •{" "}
                        {item.regionName}
                      </p>

                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />

                        W
                        {String(
                          item.week
                        ).padStart(
                          2,
                          "0"
                        )}
                        -
                        {item.year}
                      </p>

                    </div>

                    <div className="shrink-0 text-right">

                      <p className="text-sm font-semibold">
                        {formatNumber(
                          item.forecast
                        )}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(
                          item.created_at
                        )}
                      </p>

                    </div>

                  </div>
                )
              )}

            </div>
          )}

        </div>

      </div>

      {/* Current Week Summary */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">

        <div className="flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <TrendingUp className="h-5 w-5" />
          </div>

          <div>
            <h2 className="font-semibold">
              Current Week
            </h2>

            <p className="text-sm text-muted-foreground">
              Week {currentWeek}{" "}
              forecast summary
            </p>
          </div>

        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">

          <SummaryItem
            label="Forecast"
            value={formatNumber(
              forecasts
                .filter(
                  (item) =>
                    item.year ===
                      currentYear &&
                    item.week ===
                      currentWeek
                )
                .reduce(
                  (total, item) =>
                    total +
                    Number(
                      item.forecast ||
                        0
                    ),
                  0
                )
            )}
          />

          <SummaryItem
            label="Actual"
            value={formatNumber(
              forecasts
                .filter(
                  (item) =>
                    item.year ===
                      currentYear &&
                    item.week ===
                      currentWeek
                )
                .reduce(
                  (total, item) =>
                    total +
                    Number(
                      item.actual ||
                        0
                    ),
                  0
                )
            )}
          />

          <SummaryItem
            label="Budget"
            value={formatNumber(
              forecasts
                .filter(
                  (item) =>
                    item.year ===
                      currentYear &&
                    item.week ===
                      currentWeek
                )
                .reduce(
                  (total, item) =>
                    total +
                    Number(
                      item.budget ||
                        0
                    ),
                  0
                )
            )}
          />

        </div>

      </div>

    </div>
  )
}

function DashboardCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: string
  description: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">

      <div className="flex items-center justify-between">

        <p className="text-sm font-medium text-muted-foreground">
          {title}
        </p>

        <Icon className="h-5 w-5 text-muted-foreground" />

      </div>

      <div className="mt-3">

        <p className="text-2xl font-semibold tracking-tight">
          {value}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          {description}
        </p>

      </div>

    </div>
  )
}

function SummaryItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">

      <p className="text-xs font-medium text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-lg font-semibold">
        {value}
      </p>

    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: string
}) {
  const normalized =
    status.toLowerCase()

  let className =
    "bg-muted text-muted-foreground"

  if (normalized === "approved") {
    className =
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
  } else if (
    normalized === "pending"
  ) {
    className =
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
  } else if (
    normalized === "draft"
  ) {
    className =
      "bg-muted text-muted-foreground"
  } else if (
    normalized === "rejected"
  ) {
    className =
      "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${className}`}
    >
      {status}
    </span>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl border bg-muted/40"
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[400px] animate-pulse rounded-xl border bg-muted/40" />

        <div className="h-[400px] animate-pulse rounded-xl border bg-muted/40" />
      </div>
    </>
  )
}

function formatNumber(
  value: number
) {
  return new Intl.NumberFormat(
    "en-PH",
    {
      maximumFractionDigits: 2,
    }
  ).format(value)
}

function formatDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "en-PH",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  ).format(new Date(value))
}

function getISOWeek(
  date: Date
) {
  const target =
    new Date(date.valueOf())

  const dayNr =
    (date.getDay() + 6) % 7

  target.setDate(
    target.getDate() -
      dayNr +
      3
  )

  const firstThursday =
    new Date(
      target.getFullYear(),
      0,
      4
    )

  return (
    1 +
    Math.round(
      (
        (target.getTime() -
          firstThursday.getTime()) /
          86400000 -
          3 +
          (
            firstThursday.getDay() +
            6
          ) %
            7
      ) /
        7
    )
  )
}

function getISOWeekYear(
  date: Date
) {
  const target =
    new Date(date.valueOf())

  const dayNr =
    (date.getDay() + 6) % 7

  target.setDate(
    target.getDate() -
      dayNr +
      3
  )

  return target.getFullYear()
}