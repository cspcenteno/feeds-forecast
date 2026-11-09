const regionOrder = ['LUZON', 'VISAYAS', 'MINDANAO']

export function compareRegionNames(first: string, second: string) {
  const rank = (name: string) => {
    const index = regionOrder.indexOf(name.replace(/^region:\s*/i, '').trim().toUpperCase())
    return index < 0 ? regionOrder.length : index
  }
  return rank(first) - rank(second) || first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' })
}

export function sortRegions<T extends { name: string }>(regions: readonly T[]): T[] {
  return [...regions].sort((a, b) => compareRegionNames(a.name, b.name))
}
