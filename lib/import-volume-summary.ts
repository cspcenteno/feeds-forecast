export function importVolumeSummary(rows: readonly { volume: number | null; status: string; source?: { savedActual?: boolean } }[]) {
  return rows.reduce((totals, row) => {
    const value = Number.isFinite(row.volume) ? row.volume ?? 0 : 0
    totals.total += value
    if (row.status === 'Ready' && !row.source?.savedActual) totals.ready += value
    else if (row.status === 'Invalid') totals.invalid += value
    else if (row.status === 'Already imported') totals.alreadyImported += value
    return totals
  }, { total: 0, ready: 0, invalid: 0, alreadyImported: 0 })
}
