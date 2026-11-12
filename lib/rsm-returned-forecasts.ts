export type RsmReturnedForecast = {
  id: number; user_id: string; region_id: number | null; subregion_id: number | null
  customer_id: number | null; year: number; week: number; product_id: number | null
  forecast: number; volume: number | null; status: string; returned_at: string | null
}

export function isReturnedForecast(item: { status: string; returned_at: string | null }) {
  return item.status === 'Rejected' || (item.status === 'Draft' && item.returned_at !== null)
}

export function canReviseRsmForecast(item: RsmReturnedForecast, actor: {
  role: string; position: string; regionId: number | null; subregionId: number | null
}) {
  return actor.role === 'Manager' && actor.position.trim().toUpperCase() === 'RSM'
    && actor.regionId !== null && actor.subregionId !== null
    && item.region_id === actor.regionId && item.subregion_id === actor.subregionId
    && isReturnedForecast(item)
}

export function rsmRevisionPayload(items: RsmReturnedForecast[], edits: { id: number; product_id: number; forecast: number }[]) {
  return edits.map((edit) => {
    const original = items.find((item) => item.id === edit.id)
    if (!original) throw new Error('Forecast unavailable. Refresh and try again.')
    return { ...edit, original: { product_id: original.product_id, forecast: original.forecast, status: original.status } }
  })
}
