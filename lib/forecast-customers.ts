type Viewer = { role: string | null; position: string | null; full_name: string | null }
export function isKamCustomerScope(viewer: Viewer) {
  return viewer.role === 'User' && viewer.position?.trim().toUpperCase() === 'KAM'
}

export function assignedForecastCustomers<Row extends { salesman: string | null }>(rows: Row[], viewer: Viewer) {
  if (!isKamCustomerScope(viewer)) return rows
  const normalize = (value: string | null) => (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-PH')
  const name = normalize(viewer.full_name)
  return name ? rows.filter((row) => normalize(row.salesman) === name) : []
}
