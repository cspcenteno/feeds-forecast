export type ForecastWorkspaceRow = {
  tempId: string; id: number | null; category_id: string; product_id: string
  product_search: string; forecast: string; status: string
}

export type ForecastWorkspace = {
  version: 1; ownerId: string; year: number; week: number; selectedWeek: string
  selectedMonth: number; selectedRegionId: string; selectedSubregionId: string
  selectedCustomerId: string; rows: ForecastWorkspaceRow[]
}

type WorkspaceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const keyFor = (ownerId: string) => `forecast-input:workspace:v1:${ownerId}`

export function readForecastWorkspace(storage: WorkspaceStorage, ownerId: string): ForecastWorkspace | null {
  const raw = storage.getItem(keyFor(ownerId))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as ForecastWorkspace
    if (value.version !== 1 || value.ownerId !== ownerId
      || !Number.isInteger(value.year) || value.year < 2020 || value.year > 2100
      || !Number.isInteger(value.week) || value.week < 1 || value.week > 53
      || value.selectedWeek !== `${value.year}-W${String(value.week).padStart(2, '0')}`
      || !Number.isInteger(value.selectedMonth) || value.selectedMonth < 1 || value.selectedMonth > 12
      || ![value.selectedRegionId, value.selectedSubregionId, value.selectedCustomerId].every((item) => typeof item === 'string')
      || !Array.isArray(value.rows) || !value.rows.length
      || !value.rows.every((row) => row && (row.id === null || (Number.isInteger(row.id) && row.id > 0))
        && [row.tempId, row.category_id, row.product_id, row.product_search, row.forecast, row.status].every((item) => typeof item === 'string'))) {
      return null
    }
    return value
  } catch { return null }
}

export function writeForecastWorkspace(storage: WorkspaceStorage, value: ForecastWorkspace) {
  const hasWork = value.selectedCustomerId || value.rows.some((row) => row.id !== null || row.category_id || row.product_id || row.forecast || row.product_search)
  if (hasWork) storage.setItem(keyFor(value.ownerId), JSON.stringify(value))
  else storage.removeItem(keyFor(value.ownerId))
}
