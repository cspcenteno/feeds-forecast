type ForecastIdentity = {
  id?: number | null; year: number; week: number; user_id: string
  region_id: number | null; subregion_id: number | null
  customer_id: number | null; product_id: number | null
}

export function findExistingForecast<T extends ForecastIdentity>(row: ForecastIdentity, saved: T[]) {
  return saved.find((record) => record.id !== row.id
    && record.user_id === row.user_id && record.year === row.year && record.week === row.week
    && record.region_id === row.region_id && record.subregion_id === row.subregion_id
    && record.customer_id === row.customer_id && record.product_id === row.product_id)
}
