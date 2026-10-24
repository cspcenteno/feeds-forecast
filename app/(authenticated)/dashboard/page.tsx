"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode, ElementType } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  DollarSign,
  Package,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";

type Tab = "Overview" | "Regions" | "Product" | "Team";
type Comparison = "MoM" | "WoW" | "QoQ" | "YoY";

type Forecast = {
  id: string;
  year: number;
  week: number;
  region_id: string;
  subregion_id: number | null;
  category_id: string;
  product_id: string;
  forecast: number;
  actual: number | null;
  budget: number | null;
  last_year: number | null;
  status: string;
  user_id: string;
  created_at: string;
};

type Region = {
  id: string;
  name: string;
  code?: string | null;
  is_active?: boolean | null;
};

type Product = {
  id: string;
  name: string;
  is_active?: boolean | null;
};

type Category = {
  id: string;
  name: string;
};

type UserProfile = {
  id: string;
  role: string;
  region_id: string | null;
  subregion_id: number | null;
  is_active: boolean;
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
};

type WeekLock = {
  id: string;
  year: number;
  week: number;
  status: string;
  locked_at: string | null;
  created_at: string;
};

const supabase = createClient();

const CURRENCY = "PHP";

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(1)}%`;
}

function getISOWeek(date: Date) {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );

  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));

  return Math.ceil(
    (((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7
  );
}

function getISOWeekYear(date: Date) {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );

  target.setUTCDate(
    target.getUTCDate() + 4 - (target.getUTCDay() || 7)
  );

  return target.getUTCFullYear();
}

function getISOWeekStart(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;

  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);

  return monday;
}

function getPeriodKey(year: number, week: number) {
  const start = getISOWeekStart(year, week);

  return {
    date: start,
    month: start.getUTCMonth(),
    calendarYear: start.getUTCFullYear(),
    quarter: Math.floor(start.getUTCMonth() / 3),
  };
}

function getPreviousWeek(year: number, week: number) {
  const previousMonday = getISOWeekStart(year, week);
  previousMonday.setUTCDate(previousMonday.getUTCDate() - 7);

  return {
    year: getISOWeekYear(previousMonday),
    week: getISOWeek(previousMonday),
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function actualRows(rows: Forecast[]) {
  return rows.filter(
    (row) => row.actual !== null && Number.isFinite(Number(row.actual))
  );
}

function accuracyForRows(rows: Forecast[]) {
  const evaluated = actualRows(rows);
  const totalActual = sum(evaluated.map((row) => Number(row.actual ?? 0)));

  if (evaluated.length === 0 || totalActual <= 0) {
    return null;
  }

  const totalAbsoluteError = sum(
    evaluated.map((row) =>
      Math.abs(Number(row.forecast ?? 0) - Number(row.actual ?? 0))
    )
  );

  return Math.max(0, (1 - totalAbsoluteError / totalActual) * 100);
}

function getAchievement(actual: number, target: number) {
  if (target <= 0) return null;
  return (actual / target) * 100;
}

function getForecastError(forecast: number, actual: number) {
  if (actual <= 0) return null;
  return ((forecast - actual) / actual) * 100;
}

function getComparison(
  rows: Forecast[],
  comparison: Comparison,
  currentDate: Date
) {
  const currentYear = getISOWeekYear(currentDate);
  const currentWeek = getISOWeek(currentDate);
  const currentPeriod = getPeriodKey(currentYear, currentWeek);

  let currentRows: Forecast[] = [];
  let previousRows: Forecast[] = [];

  if (comparison === "WoW") {
    const previous = getPreviousWeek(currentYear, currentWeek);

    currentRows = rows.filter(
      (row) => row.year === currentYear && row.week === currentWeek
    );

    previousRows = rows.filter(
      (row) => row.year === previous.year && row.week === previous.week
    );
  } else if (comparison === "MoM") {
    const previousMonthDate = new Date(
      Date.UTC(
        currentPeriod.calendarYear,
        currentPeriod.month - 1,
        1
      )
    );

    currentRows = rows.filter((row) => {
      const period = getPeriodKey(row.year, row.week);

      return (
        period.calendarYear === currentPeriod.calendarYear &&
        period.month === currentPeriod.month
      );
    });

    previousRows = rows.filter((row) => {
      const period = getPeriodKey(row.year, row.week);

      return (
        period.calendarYear === previousMonthDate.getUTCFullYear() &&
        period.month === previousMonthDate.getUTCMonth()
      );
    });
  } else if (comparison === "QoQ") {
    const previousQuarterDate = new Date(
      Date.UTC(
        currentPeriod.calendarYear,
        currentPeriod.quarter * 3 - 3,
        1
      )
    );

    currentRows = rows.filter((row) => {
      const period = getPeriodKey(row.year, row.week);

      return (
        period.calendarYear === currentPeriod.calendarYear &&
        period.quarter === currentPeriod.quarter
      );
    });

    previousRows = rows.filter((row) => {
      const period = getPeriodKey(row.year, row.week);

      return (
        period.calendarYear === previousQuarterDate.getUTCFullYear() &&
        period.quarter ===
          Math.floor(previousQuarterDate.getUTCMonth() / 3)
      );
    });
  } else {
    const previousYear = currentPeriod.calendarYear - 1;

    currentRows = rows.filter(
      (row) =>
        getPeriodKey(row.year, row.week).calendarYear ===
        currentPeriod.calendarYear
    );

    previousRows = rows.filter(
      (row) =>
        getPeriodKey(row.year, row.week).calendarYear === previousYear
    );
  }

  const currentActual = sum(
    actualRows(currentRows).map((row) => Number(row.actual ?? 0))
  );

  const previousActual = sum(
    actualRows(previousRows).map((row) => Number(row.actual ?? 0))
  );

  if (previousActual <= 0) {
    return {
      currentActual,
      previousActual,
      change: null as number | null,
    };
  }

  return {
    currentActual,
    previousActual,
    change: ((currentActual - previousActual) / previousActual) * 100,
  };
}

function getStatusColor(status: string) {
  const value = status.toLowerCase();

  if (value.includes("approved") || value.includes("submitted")) {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  if (value.includes("reject")) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (value.includes("draft")) {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

/**
 * Returns true for forecasts awaiting approval.
 * Handles status values such as "Pending", "Pending Approval",
 * and "Submitted".
 */
function isPendingApprovalStatus(status: string) {
  const value = String(status ?? "").trim().toLowerCase();

  return value.includes("pending") || value.includes("submitted");
}

/**
 * Shared dark-mode styling for the dashboard.
 * It responds to the .dark class toggled by the sidebar.
 */
function DashboardThemeStyles() {
  return (
    <style jsx global>{`
      .dark .dashboard-theme {
        background-color: #0b1120 !important;
        color: #e2e8f0;
        color-scheme: dark;
      }

      .dark .dashboard-theme .bg-white {
        background-color: #111c2f !important;
      }

      .dark .dashboard-theme .bg-slate-50,
      .dark .dashboard-theme .bg-slate-50\\/70 {
        background-color: #0b1120 !important;
      }

      .dark .dashboard-theme .bg-slate-100 {
        background-color: #1e293b !important;
      }

      .dark .dashboard-theme .bg-slate-200 {
        background-color: #334155 !important;
      }

      .dark .dashboard-theme .border-slate-200,
      .dark .dashboard-theme .border-slate-100,
      .dark .dashboard-theme .divide-slate-100 > :not(:first-child) {
        border-color: #334155 !important;
      }

      .dark .dashboard-theme .text-slate-900,
      .dark .dashboard-theme .text-slate-800 {
        color: #f1f5f9 !important;
      }

      .dark .dashboard-theme .text-slate-700,
      .dark .dashboard-theme .text-slate-600 {
        color: #cbd5e1 !important;
      }

      .dark .dashboard-theme .text-slate-500 {
        color: #94a3b8 !important;
      }

      .dark .dashboard-theme .hover\\:bg-slate-50:hover {
        background-color: #1e293b !important;
      }

      .dark .dashboard-theme .hover\\:bg-slate-100:hover {
        background-color: #273449 !important;
      }

      .dark .dashboard-theme select,
      .dark .dashboard-theme input {
        background-color: #111c2f;
        color: #e2e8f0;
        border-color: #475569;
      }

      .dark .dashboard-theme select option {
        background-color: #111c2f;
        color: #e2e8f0;
      }

      .dark .dashboard-theme .bg-blue-50 {
        background-color: #172554 !important;
      }

      .dark .dashboard-theme .text-blue-700 {
        color: #93c5fd !important;
      }

      .dark .dashboard-theme .ring-blue-200 {
        --tw-ring-color: #1e40af !important;
      }

      .dark .dashboard-theme .bg-emerald-50 {
        background-color: #052e2b !important;
      }

      .dark .dashboard-theme .text-emerald-700 {
        color: #6ee7b7 !important;
      }

      .dark .dashboard-theme .bg-amber-50 {
        background-color: #422006 !important;
      }

      .dark .dashboard-theme .text-amber-700 {
        color: #fcd34d !important;
      }

      .dark .dashboard-theme .border-amber-200 {
        border-color: #92400e !important;
      }

      .dark .dashboard-theme .bg-red-50 {
        background-color: #450a0a !important;
      }

      .dark .dashboard-theme .text-red-800,
      .dark .dashboard-theme .text-red-700 {
        color: #fca5a5 !important;
      }

      .dark .dashboard-theme .border-red-200 {
        border-color: #7f1d1d !important;
      }

      .dark .dashboard-theme .bg-violet-50 {
        background-color: #2e1065 !important;
      }

      .dark .dashboard-theme .text-violet-700 {
        color: #c4b5fd !important;
      }

      .dark .dashboard-theme table thead tr,
      .dark .dashboard-theme table tbody tr {
        border-color: #334155 !important;
      }

      .dark .dashboard-theme table tbody tr:hover {
        background-color: #1e293b !important;
      }

      .dark .dashboard-theme svg line[stroke="#e2e8f0"] {
        stroke: #334155 !important;
      }

      .dark .dashboard-theme svg text[fill="#64748b"] {
        fill: #94a3b8 !important;
      }

      .dark .dashboard-theme .animate-pulse {
        background-color: #1e293b !important;
      }
    `}</style>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

function SectionTitle({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: ElementType;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {Icon && (
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
          <Icon size={19} />
        </div>
      )}

      <div>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  accent = "slate",
  footer,
}: {
  title: string;
  value: string;
  description?: string;
  icon: ElementType;
  accent?: "slate" | "blue" | "green" | "amber" | "violet";
  footer?: ReactNode;
}) {
  const accentStyles = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>

          <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>

          {description && (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {description}
            </p>
          )}
        </div>

        <div className={`rounded-xl p-3 ${accentStyles[accent]}`}>
          <Icon size={21} />
        </div>
      </div>

      {footer && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {footer}
        </div>
      )}
    </Card>
  );
}

function HorizontalBarChart({
  data,
  valueKey,
  labelKey = "name",
  color = "bg-blue-600",
  valueFormatter = formatCurrency,
}: {
  data: Record<string, string | number>[];
  valueKey: string;
  labelKey?: string;
  color?: string;
  valueFormatter?: (value: number) => string;
}) {
  const maxValue = Math.max(
    1,
    ...data.map((item) => Number(item[valueKey] ?? 0))
  );

  if (!data.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No data available for this period.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {data.map((item, index) => {
        const value = Number(item[valueKey] ?? 0);
        const width = Math.max(0, (value / maxValue) * 100);

        return (
          <div key={`${String(item[labelKey])}-${index}`}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-slate-700">
                {String(item[labelKey])}
              </span>

              <span className="shrink-0 font-semibold text-slate-900">
                {valueFormatter(value)}
              </span>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${color}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DualBarChart({
  data,
}: {
  data: {
    name: string;
    forecast: number;
    actual: number;
  }[];
}) {
  const maxValue = Math.max(
    1,
    ...data.flatMap((item) => [item.forecast, item.actual])
  );

  if (!data.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No product data available.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
          Forecast
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Actual
        </div>
      </div>

      <div className="space-y-6">
        {data.map((item) => (
          <div key={item.name}>
            <div className="mb-2 truncate text-sm font-medium text-slate-700">
              {item.name}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-slate-500">
                  Forecast
                </span>

                <div className="h-3 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-blue-600"
                    style={{
                      width: `${(item.forecast / maxValue) * 100}%`,
                    }}
                  />
                </div>

                <span className="w-24 shrink-0 text-right text-xs font-medium text-slate-700">
                  {formatCurrency(item.forecast)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-slate-500">
                  Actual
                </span>

                <div className="h-3 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-emerald-500"
                    style={{
                      width: `${(item.actual / maxValue) * 100}%`,
                    }}
                  />
                </div>

                <span className="w-24 shrink-0 text-right text-xs font-medium text-slate-700">
                  {formatCurrency(item.actual)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({
  data,
}: {
  data: { label: string; forecast: number; actual: number | null }[];
}) {
  const width = 720;
  const height = 270;
  const left = 58;
  const right = 18;
  const top = 20;
  const bottom = 45;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const maxValue = Math.max(
    1,
    ...data.flatMap((item) => [item.forecast, item.actual ?? 0])
  );

  const x = (index: number) =>
    data.length <= 1
      ? left + plotWidth / 2
      : left + (index / (data.length - 1)) * plotWidth;

  const y = (value: number) =>
    top + plotHeight - (value / maxValue) * plotHeight;

  const forecastPoints = data
    .map((item, index) => `${x(index)},${y(item.forecast)}`)
    .join(" ");

  const actualPoints = data
    .map((item, index) =>
      item.actual === null ? null : `${x(index)},${y(item.actual)}`
    )
    .filter(Boolean)
    .join(" ");

  if (!data.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No weekly data available.
      </p>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-5 bg-blue-600" />
          Forecast
        </div>

        <div className="flex items-center gap-2">
          <span className="h-0.5 w-5 bg-emerald-500" />
          Actual
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[520px] w-full"
          role="img"
          aria-label="Weekly forecast versus actual sales line chart"
        >
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = (maxValue / 4) * tick;
            const tickY = y(value);

            return (
              <g key={tick}>
                <line
                  x1={left}
                  y1={tickY}
                  x2={width - right}
                  y2={tickY}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />

                <text
                  x={left - 8}
                  y={tickY + 4}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="10"
                >
                  {value >= 1000000
                    ? `${(value / 1000000).toFixed(1)}M`
                    : value >= 1000
                    ? `${(value / 1000).toFixed(0)}k`
                    : Math.round(value)}
                </text>
              </g>
            );
          })}

          <polyline
            points={forecastPoints}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          <polyline
            points={actualPoints}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {data.map((item, index) => (
            <g key={`${item.label}-${index}`}>
              <circle
                cx={x(index)}
                cy={y(item.forecast)}
                r="3.5"
                fill="#2563eb"
              />

              {item.actual !== null && (
                <circle
                  cx={x(index)}
                  cy={y(item.actual)}
                  r="3.5"
                  fill="#10b981"
                />
              )}

              <text
                x={x(index)}
                y={height - 17}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
              >
                {item.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function PerformanceTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number | ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index} className="hover:bg-slate-50">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-4 py-3.5 text-slate-700"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-10 text-center text-slate-500"
              >
                No data available for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [comparison, setComparison] = useState<Comparison>("MoM");

  // Approved forecasts are used for dashboard calculations.
  const [forecasts, setForecasts] = useState<Forecast[]>([]);

  // Pending/submitted forecasts are displayed separately.
  const [pendingForecasts, setPendingForecasts] = useState<Forecast[]>([]);

  const [regions, setRegions] = useState<Region[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [weekLocks, setWeekLocks] = useState<WeekLock[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const today = new Date();
  const currentYear = getISOWeekYear(today);
  const currentWeek = getISOWeek(today);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const authResult = await supabase.auth.getUser();

        if (authResult.error) throw authResult.error;

        const authUser = authResult.data.user;

        if (!authUser) {
          throw new Error("You must be signed in to view the dashboard.");
        }

        const profileResult = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();

        if (profileResult.error) throw profileResult.error;

        const profile = profileResult.data as UserProfile | null;

        if (!profile) {
          throw new Error("Your user profile could not be found.");
        }

        const [
          forecastsResult,
          regionsResult,
          productsResult,
          categoriesResult,
          usersResult,
          locksResult,
        ] = await Promise.all([
          supabase.from("sales_forecasts").select("*"),
          supabase.from("regions").select("*"),
          supabase.from("products").select("*"),
          supabase.from("categories").select("*"),
          supabase.from("users").select("*"),
          supabase.from("week_locks").select("*"),
        ]);

        const results = [
          forecastsResult,
          regionsResult,
          productsResult,
          categoriesResult,
          usersResult,
          locksResult,
        ];

        const failed = results.find((result) => result.error);

        if (failed?.error) throw failed.error;

        let forecastData = (forecastsResult.data ?? []) as Forecast[];
        const regionData = (regionsResult.data ?? []) as Region[];
        const productData = (productsResult.data ?? []) as Product[];
        const categoryData = (categoriesResult.data ?? []) as Category[];
        const userData = (usersResult.data ?? []) as UserProfile[];
        const lockData = (locksResult.data ?? []) as WeekLock[];

        // Preserve the existing role-based forecast visibility.
        const role = String(profile.role ?? "").trim().toLowerCase();

        if (role === "user") {
          forecastData = forecastData.filter(
            (row) => row.user_id === profile.id
          );
        } else if (role === "manager") {
          if (profile.subregion_id) {
            forecastData = forecastData.filter((row) => row.subregion_id === profile.subregion_id);
          } else if (profile.region_id) {
            forecastData = forecastData.filter(
              (row) => row.region_id === profile.region_id
            );
          } else {
            forecastData = forecastData.filter(
              (row) => row.user_id === profile.id
            );
          }
        }

        // Capture pending forecasts before filtering the approved records.
        const pendingForecastData = forecastData.filter((row) =>
          isPendingApprovalStatus(row.status)
        );

        // Dashboard analytics include approved forecasts only.
        const approvedForecastData = forecastData.filter(
          (row) =>
            String(row.status ?? "").trim().toLowerCase() === "approved"
        );

        if (cancelled) return;

        setCurrentUser(profile);
        setForecasts(approvedForecastData);
        setPendingForecasts(pendingForecastData);
        setRegions(regionData);
        setProducts(productData);
        setCategories(categoryData);
        setUsers(userData);
        setWeekLocks(lockData);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load dashboard data."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const regionMap = useMemo(
    () => new Map(regions.map((item) => [item.id, item.name])),
    [regions]
  );

  const productMap = useMemo(
    () => new Map(products.map((item) => [item.id, item.name])),
    [products]
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((item) => [item.id, item.name])),
    [categories]
  );

  const userMap = useMemo(() => {
    return new Map(
      users.map((user) => [
        user.id,
        user.full_name ||
          user.display_name ||
          user.email ||
          user.id,
      ])
    );
  }, [users]);

  // All dashboard calculations below use approved forecasts only.
  const currentYearRows = useMemo(
    () => forecasts.filter((row) => row.year === currentYear),
    [forecasts, currentYear]
  );

  const thisWeekRows = useMemo(
    () =>
      forecasts.filter(
        (row) => row.year === currentYear && row.week === currentWeek
      ),
    [forecasts, currentYear, currentWeek]
  );

  const totalForecast = sum(
    currentYearRows.map((row) => Number(row.forecast ?? 0))
  );

  const totalActual = sum(
    actualRows(currentYearRows).map((row) => Number(row.actual ?? 0))
  );

  const totalBudget = sum(
    currentYearRows.map((row) => Number(row.budget ?? 0))
  );

  const totalEntries = currentYearRows.length;

  const accuracy = accuracyForRows(currentYearRows);
  const forecastError = getForecastError(totalForecast, totalActual);
  const salesAchievement = getAchievement(totalActual, totalForecast);
  const budgetAchievement = getAchievement(totalActual, totalBudget);

  const biasAmount = totalForecast - totalActual;
  const biasPercentage = getForecastError(totalForecast, totalActual);

  const activeProductIds = new Set(
    currentYearRows.map((row) => row.product_id)
  );

  const activeProductCount = products.filter((product) => {
    const isActive = product.is_active !== false;
    return isActive && activeProductIds.has(product.id);
  }).length;

  const comparisonData = getComparison(forecasts, comparison, today);

  const weeklyData = useMemo(() => {
    const rowsByWeek = new Map<
      string,
      { year: number; week: number; forecast: number; actual: number | null }
    >();

    currentYearRows.forEach((row) => {
      const key = `${row.year}-W${row.week}`;

      const existing = rowsByWeek.get(key) ?? {
        year: row.year,
        week: row.week,
        forecast: 0,
        actual: 0,
      };

      existing.forecast += Number(row.forecast ?? 0);

      if (row.actual !== null && row.actual !== undefined) {
        existing.actual =
          Number(existing.actual ?? 0) + Number(row.actual);
      }

      rowsByWeek.set(key, existing);
    });

    return Array.from(rowsByWeek.values())
      .sort((a, b) => a.week - b.week)
      .map((item) => ({
        label: `W${item.week}`,
        forecast: item.forecast,
        actual: item.actual,
      }))
      .slice(-12);
  }, [currentYearRows]);

  const regionPerformance = useMemo(() => {
    const groups = new Map<string, Forecast[]>();

    currentYearRows.forEach((row) => {
      const key = row.region_id;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });

    return Array.from(groups.entries())
      .map(([id, rows]) => {
        const forecast = sum(rows.map((row) => Number(row.forecast ?? 0)));
        const evaluated = actualRows(rows);
        const actual = sum(evaluated.map((row) => Number(row.actual ?? 0)));

        return {
          id,
          name: regionMap.get(id) ?? "Unknown Region",
          forecast,
          actual,
          entries: rows.length,
          accuracy: accuracyForRows(rows),
          achievement: getAchievement(actual, forecast),
        };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [currentYearRows, regionMap]);

  const productPerformance = useMemo(() => {
    const groups = new Map<string, Forecast[]>();

    currentYearRows.forEach((row) => {
      groups.set(row.product_id, [
        ...(groups.get(row.product_id) ?? []),
        row,
      ]);
    });

    return Array.from(groups.entries())
      .map(([id, rows]) => {
        const forecast = sum(rows.map((row) => Number(row.forecast ?? 0)));
        const actual = sum(
          actualRows(rows).map((row) => Number(row.actual ?? 0))
        );

        return {
          id,
          name: productMap.get(id) ?? "Unknown Product",
          forecast,
          actual,
          entries: rows.length,
          accuracy: accuracyForRows(rows),
          achievement: getAchievement(actual, forecast),
        };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [currentYearRows, productMap]);

  const teamPerformance = useMemo(() => {
    const groups = new Map<string, Forecast[]>();

    currentYearRows.forEach((row) => {
      groups.set(row.user_id, [
        ...(groups.get(row.user_id) ?? []),
        row,
      ]);
    });

    return Array.from(groups.entries())
      .map(([id, rows]) => {
        const forecast = sum(rows.map((row) => Number(row.forecast ?? 0)));
        const actual = sum(
          actualRows(rows).map((row) => Number(row.actual ?? 0))
        );

        return {
          id,
          name: userMap.get(id) ?? id,
          forecast,
          actual,
          entries: rows.length,
          accuracy: accuracyForRows(rows),
          achievement: getAchievement(actual, forecast),
        };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [currentYearRows, userMap]);

  // All approved activity records, newest first.
  const recentActivity = useMemo(() => {
    return [...forecasts].sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );
  }, [forecasts]);

  // All pending/submitted records, newest first.
  const pendingActivity = useMemo(() => {
    return [...pendingForecasts].sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );
  }, [pendingForecasts]);

  const currentWeekForecast = sum(
    thisWeekRows.map((row) => Number(row.forecast ?? 0))
  );

  const currentWeekActual = sum(
    actualRows(thisWeekRows).map((row) => Number(row.actual ?? 0))
  );

  const currentWeekBudget = sum(
    thisWeekRows.map((row) => Number(row.budget ?? 0))
  );

  const currentWeekAccuracy = accuracyForRows(thisWeekRows);

  const currentWeekLock = weekLocks.find(
    (lock) => lock.year === currentYear && lock.week === currentWeek
  );

  const tabs: Tab[] = ["Overview", "Regions", "Product", "Team"];

  if (loading) {
    return (
      <main className="dashboard-theme min-h-screen space-y-6 bg-slate-50/70 p-4 text-slate-900 transition-colors duration-200 md:p-8">
        <DashboardThemeStyles />

        <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-2xl bg-slate-100"
            />
          ))}
        </div>

        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="dashboard-theme min-h-screen bg-slate-50/70 p-4 text-slate-900 md:p-8">
        <DashboardThemeStyles />

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="font-semibold text-red-800">
            Unable to load dashboard
          </h2>

          <p className="mt-2 text-sm text-red-700">{error}</p>

          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-theme min-h-screen space-y-6 bg-slate-50/70 p-4 text-slate-900 transition-colors duration-200 md:p-8">
      <DashboardThemeStyles />

      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CalendarDays size={16} />
            <span>
              ISO Week {currentWeek}, {currentYear}
            </span>
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Sales Forecast Dashboard
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Monitor approved forecast performance, actual sales, budget
            achievement, and team results.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 sm:self-auto">
          <Users size={16} />
          <span className="capitalize">{currentUser?.role ?? "User"}</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Forecast"
          value={formatCurrency(totalForecast)}
          description={`${formatNumber(totalEntries)} approved entries · ${currentYear}`}
          icon={ClipboardList}
          accent="blue"
          footer={
            <div className="flex justify-between gap-3 text-xs text-slate-500">
              <span>Approved forecasts</span>
              <span>{currentYear}</span>
            </div>
          }
        />

        <MetricCard
          title="Actual Sales"
          value={formatCurrency(totalActual)}
          description={`Year-to-date actual sales from approved forecasts · ${currentYear}`}
          icon={DollarSign}
          accent="green"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                value={comparison}
                onChange={(event) =>
                  setComparison(event.target.value as Comparison)
                }
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"
                aria-label="Actual sales comparison period"
              >
                <option value="MoM">Month over Month</option>
                <option value="WoW">Week over Week</option>
                <option value="QoQ">Quarter over Quarter</option>
                <option value="YoY">Year over Year</option>
              </select>

              <span
                className={`flex items-center gap-1 text-xs font-semibold ${
                  comparisonData.change === null
                    ? "text-slate-500"
                    : comparisonData.change >= 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {comparisonData.change !== null &&
                  (comparisonData.change >= 0 ? (
                    <TrendingUp size={14} />
                  ) : (
                    <TrendingDown size={14} />
                  ))}

                {formatPercent(comparisonData.change)}
              </span>
            </div>
          }
        />

        <MetricCard
          title="Forecast Accuracy"
          value={formatPercent(accuracy)}
          description="Based on actual sales for approved forecasts"
          icon={Target}
          accent="violet"
          footer={
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">Performance status</span>

              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  accuracy === null
                    ? "bg-slate-100 text-slate-600"
                    : accuracy >= 90
                    ? "bg-emerald-50 text-emerald-700"
                    : accuracy >= 80
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {accuracy === null
                  ? "No Data"
                  : accuracy >= 90
                  ? "Good"
                  : accuracy >= 80
                  ? "Monitor"
                  : "Warning"}
              </span>
            </div>
          }
        />

        <MetricCard
          title="Sales Achievement"
          value={formatPercent(salesAchievement)}
          description="Actual sales compared with approved forecasts"
          icon={Activity}
          accent="amber"
          footer={
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500">Forecast bias</span>

              <span
                className={`font-semibold ${
                  biasPercentage === null
                    ? "text-slate-500"
                    : biasPercentage > 0
                    ? "text-amber-700"
                    : biasPercentage < 0
                    ? "text-blue-700"
                    : "text-emerald-700"
                }`}
              >
                {biasPercentage === null
                  ? "—"
                  : `${biasPercentage > 0 ? "+" : ""}${formatPercent(
                      biasPercentage
                    )}`}
              </span>
            </div>
          }
        />
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`w-full rounded-lg px-2 py-2.5 text-center text-sm font-medium transition ${
              activeTab === tab
                ? "bg-slate-900 text-white shadow-sm dark:bg-blue-600 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "Overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Budget Achievement"
              value={formatPercent(budgetAchievement)}
              description="Actual sales against budget from approved forecasts"
              icon={Target}
              accent="green"
              footer={
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Actual</span>
                    <span className="font-medium text-slate-800">
                      {formatCurrency(totalActual)}
                    </span>
                  </div>

                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Budget</span>
                    <span className="font-medium text-slate-800">
                      {formatCurrency(totalBudget)}
                    </span>
                  </div>
                </div>
              }
            />

            <MetricCard
              title="Forecast Error"
              value={
                forecastError === null
                  ? "—"
                  : `${forecastError > 0 ? "+" : ""}${formatPercent(
                      forecastError
                    )}`
              }
              description={
                forecastError === null
                  ? "Requires actual sales greater than zero"
                  : forecastError > 0
                  ? "Over-forecasted relative to actual sales"
                  : forecastError < 0
                  ? "Actual sales exceeded the forecast"
                  : "Forecast matched actual sales"
              }
              icon={
                forecastError !== null && forecastError < 0
                  ? TrendingDown
                  : TrendingUp
              }
              accent={
                forecastError === null
                  ? "slate"
                  : forecastError > 0
                  ? "amber"
                  : "blue"
              }
              footer={
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-slate-500">Forecast − actual</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(biasAmount)}
                  </span>
                </div>
              }
            />

            <MetricCard
              title="Active Products"
              value={formatNumber(activeProductCount)}
              description="Active products with approved forecast entries this year"
              icon={Package}
              accent="violet"
            />

            <MetricCard
              title="Actual Sales Entries"
              value={formatNumber(actualRows(currentYearRows).length)}
              description="Approved forecast entries with actual sales recorded this year"
              icon={CheckCircle2}
              accent="blue"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <SectionTitle
                title="Weekly Forecast vs Actual"
                subtitle={`Last ${weeklyData.length} weeks with approved entries in ${currentYear}`}
                icon={TrendingUp}
              />

              <LineChart data={weeklyData} />
            </Card>

            <Card>
              <SectionTitle
                title="Current Week Summary"
                subtitle={`Week ${currentWeek}, ${currentYear}`}
                icon={CalendarDays}
              />

              <div className="space-y-4">
                {[
                  {
                    label: "Approved Forecast",
                    amount: currentWeekForecast,
                    color: "text-blue-700",
                  },
                  {
                    label: "Actual Sales",
                    amount: currentWeekActual,
                    color: "text-emerald-700",
                  },
                  {
                    label: "Budget",
                    amount: currentWeekBudget,
                    color: "text-violet-700",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="text-sm text-slate-500">
                      {item.label}
                    </span>

                    <span className={`text-sm font-semibold ${item.color}`}>
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="mb-2 flex justify-between text-xs text-slate-500">
                    <span>Weekly sales achievement</span>
                    <span>
                      {formatPercent(
                        getAchievement(
                          currentWeekActual,
                          currentWeekForecast
                        )
                      )}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            getAchievement(
                              currentWeekActual,
                              currentWeekForecast
                            ) ?? 0
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Week status</span>

                  <span
                    className={`rounded-full px-2.5 py-1 font-medium ${
                      currentWeekLock
                        ? getStatusColor(currentWeekLock.status)
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {currentWeekLock?.status ?? "No lock record"}
                  </span>
                </div>

                {currentWeekAccuracy !== null && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-500">Weekly accuracy</span>
                    <span className="font-semibold text-slate-800">
                      {formatPercent(currentWeekAccuracy)}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle
              title="Region Performance"
              subtitle="Actual sales by geographic region for the current year, using approved forecasts"
              icon={BarChart3}
            />

            <HorizontalBarChart
              data={regionPerformance.map((item) => ({
                name: item.name,
                actual: item.actual,
              }))}
              valueKey="actual"
              color="bg-blue-600"
            />
          </Card>

          {/* Recent Approved Forecast Activity */}
          <Card>
            <SectionTitle
              title="Recent Approved Forecast Activity"
              subtitle={`Latest approved forecast entries available to your account (${recentActivity.length} total)`}
              icon={ClipboardList}
            />

            <div className="max-h-[360px] overflow-y-auto overscroll-contain rounded-xl border border-slate-100">
              <PerformanceTable
                headers={[
                  "Week",
                  "Region",
                  "Product",
                  "Category",
                  "Forecast",
                  "Actual",
                  "Status",
                ]}
                rows={recentActivity.map((row) => [
                  `W${row.week}, ${row.year}`,
                  regionMap.get(row.region_id) ?? "Unknown",
                  productMap.get(row.product_id) ?? "Unknown",
                  categoryMap.get(row.category_id) ?? "Unknown",
                  formatCurrency(Number(row.forecast ?? 0)),
                  row.actual === null
                    ? "—"
                    : formatCurrency(Number(row.actual)),
                  <span
                    key={row.id}
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(
                      row.status
                    )}`}
                  >
                    {row.status || "Unknown"}
                  </span>,
                ])}
              />
            </div>
          </Card>

          {/* Forecasts Pending Approval */}
          <Card className="border-amber-200 bg-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                  <Clock size={22} />
                </div>

                <div>
                  <h2 className="font-semibold text-slate-900">
                    Forecasts Pending Approval
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {pendingActivity.length > 0
                      ? `${formatNumber(
                          pendingActivity.length
                        )} forecast${
                          pendingActivity.length === 1 ? "" : "s"
                        } awaiting approval. Review the records below or open the Approvals page.`
                      : "There are no forecasts currently awaiting approval."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push("/approvals")}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Go to Approvals
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="mt-5 max-h-[360px] overflow-y-auto overscroll-contain rounded-xl border border-slate-100">
              <PerformanceTable
                headers={[
                  "Week",
                  "Region",
                  "Product",
                  "Category",
                  "Forecast",
                  "Actual",
                  "Status",
                ]}
                rows={pendingActivity.map((row) => [
                  `W${row.week}, ${row.year}`,
                  regionMap.get(row.region_id) ?? "Unknown",
                  productMap.get(row.product_id) ?? "Unknown",
                  categoryMap.get(row.category_id) ?? "Unknown",
                  formatCurrency(Number(row.forecast ?? 0)),
                  row.actual === null
                    ? "—"
                    : formatCurrency(Number(row.actual)),
                  <span
                    key={row.id}
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(
                      row.status
                    )}`}
                  >
                    {row.status || "Unknown"}
                  </span>,
                ])}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Regions */}
      {activeTab === "Regions" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Regions with Sales"
              value={formatNumber(
                regionPerformance.filter((item) => item.actual > 0).length
              )}
              description="Regions with actual sales recorded"
              icon={Activity}
              accent="blue"
            />

            <MetricCard
              title="Regional Actual Sales"
              value={formatCurrency(totalActual)}
              description="Combined actual sales from approved forecasts for the year"
              icon={DollarSign}
              accent="green"
            />

            <MetricCard
              title="Overall Forecast Accuracy"
              value={formatPercent(accuracy)}
              description="Weighted accuracy across approved records visible to your account"
              icon={Target}
              accent="violet"
            />
          </div>

          <Card>
            <SectionTitle
              title="Region Summary Performance"
              subtitle="Geographic breakdown of approved forecasts, actual sales, achievement, and accuracy"
              icon={BarChart3}
            />

            <PerformanceTable
              headers={[
                "Geographic Region",
                "Forecast",
                "Actual Amount",
                "Achievement",
                "Accuracy",
                "Entries",
              ]}
              rows={regionPerformance.map((item) => [
                <span key={item.id} className="font-medium text-slate-900">
                  {item.name}
                </span>,
                formatCurrency(item.forecast),
                <span key={`${item.id}-actual`} className="font-semibold">
                  {formatCurrency(item.actual)}
                </span>,
                formatPercent(item.achievement),
                <span
                  key={`${item.id}-accuracy`}
                  className={`font-semibold ${
                    item.accuracy === null
                      ? "text-slate-500"
                      : item.accuracy >= 90
                      ? "text-emerald-700"
                      : item.accuracy >= 80
                      ? "text-amber-700"
                      : "text-red-700"
                  }`}
                >
                  {formatPercent(item.accuracy)}
                </span>,
                formatNumber(item.entries),
              ])}
            />
          </Card>

          <Card>
            <SectionTitle
              title="Actual Sales by Region"
              subtitle="Compare sales contribution across geographic regions"
              icon={BarChart3}
            />

            <HorizontalBarChart
              data={regionPerformance.map((item) => ({
                name: item.name,
                actual: item.actual,
              }))}
              valueKey="actual"
              color="bg-emerald-500"
            />
          </Card>
        </div>
      )}

      {/* Product */}
      {activeTab === "Product" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Products with Forecasts"
              value={formatNumber(productPerformance.length)}
              description="Products represented in approved current-year records"
              icon={Package}
              accent="blue"
            />

            <MetricCard
              title="Product Actual Sales"
              value={formatCurrency(totalActual)}
              description="Actual sales across visible approved product forecasts"
              icon={DollarSign}
              accent="green"
            />

            <MetricCard
              title="Product Forecast Accuracy"
              value={formatPercent(accuracy)}
              description="Accuracy across visible approved product forecasts"
              icon={Target}
              accent="violet"
            />
          </div>

          <Card>
            <SectionTitle
              title="Product Performance: Forecast vs Actual"
              subtitle="Side-by-side comparison of approved forecasts and actual sales by product"
              icon={BarChart3}
            />

            <DualBarChart
              data={productPerformance.map((item) => ({
                name: item.name,
                forecast: item.forecast,
                actual: item.actual,
              }))}
            />
          </Card>

          <Card>
            <SectionTitle
              title="Product Performance Details"
              subtitle="Actual amount, forecast accuracy, and achievement per product"
              icon={Package}
            />

            <PerformanceTable
              headers={[
                "Product",
                "Forecast",
                "Actual Amount",
                "Achievement",
                "Accuracy",
                "Entries",
              ]}
              rows={productPerformance.map((item) => [
                <span key={item.id} className="font-medium text-slate-900">
                  {item.name}
                </span>,
                formatCurrency(item.forecast),
                formatCurrency(item.actual),
                formatPercent(item.achievement),
                formatPercent(item.accuracy),
                formatNumber(item.entries),
              ])}
            />
          </Card>
        </div>
      )}

      {/* Team */}
      {activeTab === "Team" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Team Members with Entries"
              value={formatNumber(teamPerformance.length)}
              description="Users with visible approved forecast records"
              icon={Users}
              accent="blue"
            />

            <MetricCard
              title="Team Actual Sales"
              value={formatCurrency(totalActual)}
              description="Combined actual sales from visible approved forecasts"
              icon={DollarSign}
              accent="green"
            />

            <MetricCard
              title="Team Forecast Accuracy"
              value={formatPercent(accuracy)}
              description="Accuracy across visible approved team forecasts"
              icon={Target}
              accent="violet"
            />
          </div>

          <Card>
            <SectionTitle
              title="Team Performance by User / Sales Admin"
              subtitle="Actual sales amount and forecast accuracy for each user"
              icon={Users}
            />

            <PerformanceTable
              headers={[
                "User / Sales Admin",
                "Forecast",
                "Actual Amount",
                "Achievement",
                "Accuracy",
                "Entries",
              ]}
              rows={teamPerformance.map((item) => [
                <span
                  key={item.id}
                  className="font-medium text-slate-900"
                >
                  {item.name}
                </span>,
                formatCurrency(item.forecast),
                <span key={`${item.id}-actual`} className="font-semibold">
                  {formatCurrency(item.actual)}
                </span>,
                formatPercent(item.achievement),
                <span
                  key={`${item.id}-accuracy`}
                  className={`font-semibold ${
                    item.accuracy === null
                      ? "text-slate-500"
                      : item.accuracy >= 90
                      ? "text-emerald-700"
                      : item.accuracy >= 80
                      ? "text-amber-700"
                      : "text-red-700"
                  }`}
                >
                  {formatPercent(item.accuracy)}
                </span>,
                formatNumber(item.entries),
              ])}
            />
          </Card>

          <Card>
            <SectionTitle
              title="Team Actual Sales Ranking"
              subtitle="Sales contribution by user / sales admin"
              icon={BarChart3}
            />

            <HorizontalBarChart
              data={teamPerformance.map((item) => ({
                name: item.name,
                actual: item.actual,
              }))}
              valueKey="actual"
              color="bg-violet-600"
            />
          </Card>
        </div>
      )}

      <footer className="flex flex-col justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row">
        <span>Feed Sales Forecast · Dashboard</span>
        <span>
          Metrics are based on approved forecast records visible to your
          account.
        </span>
      </footer>
    </main>
  );
}
