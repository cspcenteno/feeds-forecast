export const dashboardTypes = ['system', 'powerbi', 'both'] as const
export type DashboardType = (typeof dashboardTypes)[number]

export function isDashboardType(value: unknown): value is DashboardType {
  return typeof value === 'string' && dashboardTypes.includes(value as DashboardType)
}

export function dashboardTypeOrDefault(value: unknown): DashboardType {
  return isDashboardType(value) ? value : 'system'
}

export const dashboardTypeLabels: Record<DashboardType, string> = {
  system: 'System Dashboard',
  powerbi: 'Power BI Dashboard',
  both: 'Both',
}
