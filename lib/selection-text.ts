export function selectionText(label = 'option') {
  const field = label.replace(/[*:]/g, '').trim().toLowerCase()
  const nouns: Array<[RegExp, string, string]> = [
    [/subregion/, 'subregion', 'subregions'],
    [/region/, 'region', 'regions'],
    [/salesman|salesperson|\bkam\b/, 'salesman', 'salesmen'],
    [/customer/, 'customer', 'customers'],
    [/product line/, 'product line', 'product lines'],
    [/product/, 'product', 'products'],
    [/species/, 'species', 'species'],
    [/categor/, 'category', 'categories'],
    [/status/, 'status', 'statuses'],
    [/position/, 'sales position', 'sales positions'],
    [/year/, 'year', 'years'],
    [/month/, 'month', 'months'],
    [/week/, 'week', 'weeks'],
    [/role/, 'role', 'roles'],
    [/segment/, 'segment', 'segments'],
    [/module/, 'module', 'modules'],
    [/action/, 'action', 'actions'],
  ]
  const [, singular, plural] = nouns.find(([pattern]) => pattern.test(field)) ?? [null, 'option', 'options']
  return {
    select: `Select ${singular}…`,
    loading: `Loading ${plural}…`,
    empty: `No ${plural} available`,
    noMatches: `No matching ${plural}`,
  }
}

export function normalizeSelectionPrompt(text: string) {
  return /^(select|choose|loading)\b/i.test(text.trim())
    ? text.trim().replace(/^choose\s+(?:an?\s+)?/i, 'Select ').replace(/^select\s+an?\s+/i, 'Select ').replace(/[.…]+$/, '') + '…'
    : text
}
