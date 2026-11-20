import * as XLSX from 'xlsx'
import * as CFB from 'cfb'
import template from './weekly-sales-template.json' with { type: 'json' }
import logo from './weekly-sales-logo.json' with { type: 'json' }
import { monthlyBudgetReference } from '@/lib/monthly-budget-reference'
import { withReportingTimeout } from '@/lib/reporting-load'
import { rsmAssignmentKey } from '@/lib/rsm-reporting'

type Sale = {
  year: number; week: number; region_id: number | null; subregion_id: number | null
  product_id: number | null; forecast: number; volume: number | null; asm_name?: string
  endorsed_by?: string | null; submitted_by?: string | null; user_id?: string | null
}
type Lookup = { id: number; name: string }
type Budget = { year: number; month: number | null; region_id: number | null; subregion_id: number | null; customer_id: number | null; product_id: number | null; volume: number; kam_id?: string | null }
type Actual = { actual_date: string; region_id: number | null; subregion_id: number | null; product_id: number | null; volume: number; kam_id?: string | null }
export type ExportInput = {
  reportType?: 'approvals'; approvalStage?: 'rsm' | 'asm'; budgetMonth?: number
  approvalScope?: { level: 'region' | 'subregion'; regionId: number; subregionId?: number | null; viewerName: string }
  sales: Sale[]; regions: Lookup[]; subregions: Lookup[]
  products: (Lookup & { code: string })[]; users: Record<string, string>
  fromWeek?: string; toWeek?: string; asmNames?: Record<number, string>; rsmNames?: Record<string, string>
  budgets?: Budget[]; actuals?: Actual[]
}

const xml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
const column = (index: number) => XLSX.utils.encode_col(index)
function monday(year: number, week: number) {
  const date = new Date(Date.UTC(year, 0, 4))
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7) + 1 + (week - 1) * 7)
  return date
}
function weekLabel(year: number, week: number) {
  const start = monday(year, week), end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const format = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${format(start)} - ${format(end)} (${start.getUTCFullYear()}${end.getUTCFullYear() !== start.getUTCFullYear() ? `/${end.getUTCFullYear()}` : ''})`
}

function isoWeek(date: Date) {
  const thursday = new Date(date)
  thursday.setUTCDate(thursday.getUTCDate() + 3)
  const year = thursday.getUTCFullYear()
  return { year, week: 1 + Math.round((date.getTime() - monday(year, 1).getTime()) / 604800000) }
}

function exportWeeks(input: ExportInput) {
  const recorded = [...new Map(input.sales.map((sale) => [`${sale.year}-${sale.week}`, { year: sale.year, week: sale.week }])).values()]
    .sort((a, b) => a.year - b.year || a.week - b.week)
  const parse = (value: string) => {
    const match = /^(\d{4})-W(\d{2})$/.exec(value)
    if (!match) throw new Error('Choose a valid week range.')
    const year = Number(match[1]), week = Number(match[2]), date = monday(year, week)
    const actual = isoWeek(date)
    if (actual.year !== year || actual.week !== week) throw new Error('Choose a valid week range.')
    return date
  }
  const first = input.fromWeek ? parse(input.fromWeek) : recorded.length ? monday(recorded[0].year, recorded[0].week) : null
  const final = recorded[recorded.length - 1]
  const last = input.toWeek ? parse(input.toWeek) : final ? monday(final.year, final.week) : null
  if (!first || !last) return []
  const count = Math.round((last.getTime() - first.getTime()) / 604800000) + 1
  if (count < 1 || count > 8183) throw new Error('Choose a valid week range within Excel’s column limit.')
  return Array.from({ length: count }, (_, i) => isoWeek(new Date(first.getTime() + i * 604800000)))
}

type ReferenceRequest = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  abortSignal?: (signal: AbortSignal) => ReferenceRequest
  in?: (column: string, values: number[]) => ReferenceRequest
  or?: (filter: string) => ReferenceRequest
}
type ReferenceQuery = {
  range: (from: number, to: number) => ReferenceRequest
  eq?: (column: string, value: string) => ReferenceQuery
  or?: (filter: string) => ReferenceQuery
}
export async function loadWeeklySalesExportReferences(client: { rpc: (name: string, args: object) => {
  order: (field: string) => { order: (field: string) => ReferenceQuery }
} }, input: ExportInput, onProgress?: (rows: number, references: { budgets: Budget[]; actuals: Actual[] }) => void, preferredBudgetMonth?: () => number | undefined) {
  const weeks = exportWeeks(input)
  if (!weeks.length) throw new Error('Choose weeks to export.')
  const first = monday(weeks[0].year, weeks[0].week)
  const last = monday(weeks.at(-1)!.year, weeks.at(-1)!.week)
  last.setUTCDate(last.getUTCDate() + 6)
  const rows: (Budget & Actual & { record_type: string; id: number })[] = []
  const query = () => client.rpc(input.reportType === 'approvals' ? 'get_approval_excel_volume_rows' : 'get_weekly_sales_export_volume_rows', {
      p_from: first.toISOString().slice(0,10), p_to: last.toISOString().slice(0,10),
    }).order('record_type').order('id')
  async function loadPage(from: number, kind?: 'budget' | 'actual', pageSize = 500, monthFilter?: string) {
    let pageQuery = query()
    if (kind && pageQuery.eq) pageQuery = pageQuery.eq('record_type', kind)
    let request = pageQuery.range(from, from + pageSize - 1)
    if (input.reportType === 'approvals' && request.in) {
      const regions = input.approvalScope ? [input.approvalScope.regionId] : input.regions.map(region => region.id)
      if (regions.length) request = request.in('region_id', regions)
    }
    const filters: string[] = []
    if (input.approvalScope?.level === 'subregion') filters.push(`or(subregion_id.eq.${input.approvalScope.subregionId},subregion_id.is.null)`)
    if (monthFilter) filters.push(monthFilter)
    if (filters.length && request.or) request = request.or(`and(${filters.join(',')})`)
    if (request.abortSignal) request = request.abortSignal(AbortSignal.timeout(20000))
    const { data, error } = await withReportingTimeout(request, 'Loading Excel budget and sales figures')
    if (error) throw new Error('Unable to load export budget and sales figures. ' + error.message)
    return (data ?? []) as typeof rows
  }
  if (input.reportType === 'approvals' && query().eq) {
    // Independent streams let budgets appear while actuals are still arriving,
    // rather than waiting behind all actual records in record_type order.
    const received = { budget: [] as typeof rows, actual: [] as typeof rows }
    const monthPriority = Boolean(query().or)
    const firstThursday = new Date(first)
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 3)
    const defaultMonth = input.budgetMonth ?? firstThursday.getUTCMonth() + 1
    async function loadStream(kind: 'budget' | 'actual') {
      if (kind === 'budget' && monthPriority) {
        const budgets = new Map<number, (typeof rows)[number]>()
        const completed = new Set<number>()
        const offsets = new Map<number, number>()
        const batches = new Map<number, number>()
        let remainingOffset = 0
        while (true) {
          const wanted = preferredBudgetMonth?.() ?? defaultMonth
          const month = Number.isInteger(wanted) && wanted >= 1 && wanted <= 12 ? wanted : defaultMonth
          const priority = !completed.has(month)
          const from = priority ? offsets.get(month) ?? 0 : remainingOffset
          const batch = priority ? batches.get(month) ?? 0 : 3
          const size = [25, 100, 250][batch] ?? 500
          const filter = priority ? `or(month.eq.${month},month.is.null)` : `month.not.in.(${[...completed].join(',')})`
          const page = await loadPage(from, kind, size, filter)
          for (const row of page) budgets.set(row.id, row)
          received.budget = [...budgets.values()]
          onProgress?.(received.budget.length + received.actual.length, { budgets: [...received.budget], actuals: [...received.actual] })
          if (onProgress && typeof window !== 'undefined') await new Promise<void>(resolve => setTimeout(resolve, 16))
          if (priority) {
            offsets.set(month, from + size)
            batches.set(month, batch + 1)
            if (page.length < size) { completed.add(month); remainingOffset = 0 }
          } else {
            if (page.length < size && (preferredBudgetMonth?.() ?? defaultMonth) === month) return
            remainingOffset += size
          }
        }
      }
      let from = 0
      for (let batch = 0; ; batch++) {
        // Small first responses expose real subtotals even for filtered reports
        // with fewer than 500 rows; grow later pages to retain throughput.
        const pageSize = [25, 100, 250][batch] ?? 500
        const page = await loadPage(from, kind, pageSize)
        received[kind].push(...page)
        onProgress?.(received.budget.length + received.actual.length, {
          budgets: [...received.budget], actuals: [...received.actual],
        })
        // Give React and the browser a paint opportunity before the next batch.
        if (onProgress && typeof window !== 'undefined') await new Promise<void>(resolve => setTimeout(resolve, 16))
        if (page.length < pageSize) return
        from += pageSize
      }
    }
    await Promise.all([loadStream('budget'), loadStream('actual')])
    return { budgets: received.budget, actuals: received.actual }
  }
  // Probe the first page; larger approval reports fetch at most three pages concurrently.
  let pages = [await loadPage(0)]
  let from = 500
  while (true) {
    let complete = false
    for (const page of pages) {
      rows.push(...page)
      if (page.length < 500) { complete = true; break }
    }
    onProgress?.(rows.length, { budgets: rows.filter(row => row.record_type === 'budget'), actuals: rows.filter(row => row.record_type === 'actual') })
    if (complete) break
    const count = input.reportType === 'approvals' ? 3 : 1
    pages = await Promise.all(Array.from({ length: count }, (_, index) => loadPage(from + index * 500)))
    from += count * 500
  }
  return { budgets: rows.filter(row => row.record_type === 'budget'), actuals: rows.filter(row => row.record_type === 'actual') }
}

// Template layout/styles are extracted from the supplied workbook. No sample
// figures, personnel names, or external-workbook formulas are carried forward.
export function buildWeeklySalesExport(input: ExportInput): Uint8Array {
  const weeks = exportWeeks(input)
  if (!weeks.length || (!input.sales.length && !input.regions.length)) throw new Error('No Weekly Sales records to export.')
  const selectedWeeks = new Set(weeks.map((week) => `${week.year}-${week.week}`))
  const scope = input.approvalScope
  if (scope && (!scope.regionId || (scope.level === 'subregion' && !scope.subregionId))) throw new Error('An assigned region/subregion is required.')
  const selectedSales = input.sales.filter((sale) => selectedWeeks.has(`${sale.year}-${sale.week}`) && (!scope || (sale.region_id === scope.regionId && (scope.level === 'region' || sale.subregion_id === scope.subregionId))))
  const workbook = XLSX.utils.book_new()
  const productsById = new Map(input.products.map(product => [product.id, product]))
  const productsByCode = new Map(input.products.map(product => [product.code, product]))
  const sheets: string[] = []
  const usedNames = new Set<string>()
  function addSheet(label: string, sales: Sale[], region: string, area: boolean, regionId: number | null, areaId: number | null = null, kamId?: string) {
    const base = label.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Unassigned'
    let name = base, suffix = 1
    while (usedNames.has(name.toLowerCase())) { const tail = ` (${++suffix})`; name = base.slice(0, 31 - tail.length) + tail }
    usedNames.add(name.toLowerCase())
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), name)
    const width = weeks.length, forecastTotal = width + 3, salesStart = width + 4, lastIndex = 2 * width + 4, last = column(lastIndex)
    const firstThursday = monday(weeks[0].year, weeks[0].week)
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 3)
    const budgetYear = firstThursday.getUTCFullYear(), budgetMonth = input.budgetMonth ?? firstThursday.getUTCMonth() + 1
    const budgetRows = (input.budgets ?? []).filter(row => row.region_id === regionId && (!area || row.subregion_id === areaId || row.subregion_id === null) && (!kamId || row.kam_id === kamId))
    const actualRows = (input.actuals ?? []).filter(row => row.region_id === regionId && (!area || row.subregion_id === areaId) && (!kamId || row.kam_id === kamId))
    const budgetsByProduct = new Map<number | null, Budget[]>()
    for (const budget of budgetRows) {
      if (budget.year !== budgetYear) continue
      const group = budgetsByProduct.get(budget.product_id)
      if (group) group.push(budget)
      else budgetsByProduct.set(budget.product_id, [budget])
    }
    const rows = template.rows.map((row) => ({ ...row }))
    const known = new Set(rows.filter((row) => row.name).map((row) => row.code))
    const extras = [...new Set([...sales, ...actualRows, ...budgetRows].map((sale) => sale.product_id))].map((id) => {
      const product = id == null ? undefined : productsById.get(id)
      return { code: product?.code || `UNASSIGNED-${id ?? 'NONE'}`, name: product?.name || `Product unavailable (${id ?? 'unassigned'})` }
    }).filter((row) => !known.has(row.code)).sort((a, b) => a.code.localeCompare(b.code))
    if (extras.length) rows.push({ code: 'OTHER PRODUCTS', name: '' }, ...extras)
    const forecastVolumes = new Map<string, number>()
    for (const sale of sales) {
      const product = sale.product_id == null ? undefined : productsById.get(sale.product_id)
      const code = product?.code || `UNASSIGNED-${sale.product_id ?? 'NONE'}`
      const key = `${code}/${sale.year}-${sale.week}`
      forecastVolumes.set(key, (forecastVolumes.get(key) || 0) + (Number(sale.volume) || 0))
    }
    const actualVolumes = new Map<string, number>()
    for (const actual of actualRows) {
      const date = new Date(actual.actual_date.slice(0,10) + 'T00:00:00Z')
      if (!Number.isFinite(date.getTime())) continue
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7) + 1)
      const week = isoWeek(date)
      if (!selectedWeeks.has(week.year + '-' + week.week)) continue
      const product = actual.product_id == null ? undefined : productsById.get(actual.product_id)
      const code = product?.code || 'UNASSIGNED-' + (actual.product_id ?? 'NONE')
      const key = code + '/' + week.year + '-' + week.week
      actualVolumes.set(key, (actualVolumes.get(key) || 0) + (Number(actual.volume) || 0))
    }
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    const budgetStart = lastIndex + 1, budgetEnd = lastIndex + 12
    const monthlyBudgets = rows.map(item => {
      const product = productsByCode.get(item.code)
      const productBudgets = product ? budgetsByProduct.get(product.id) ?? [] : []
      return months.map((_, monthIndex) => {
        const month = monthIndex + 1
        const matching = productBudgets.filter(row => row.month === month || row.month === null)
        const detailed = matching.some(row => row.customer_id !== null)
        const customerIds = [...new Set(matching.filter(row => !detailed || row.customer_id !== null).map(row => row.customer_id))]
        return item.name && product ? customerIds.reduce<number>((sum, customer) => sum + monthlyBudgetReference(matching, budgetYear, month, regionId, area ? areaId : null, customer, product.id), 0) : 0
      })
    })
    const values = rows.map((item, index) => {
      const forecast = weeks.map(week => item.name ? forecastVolumes.get(item.code + '/' + week.year + '-' + week.week) || 0 : 0)
      const actual = weeks.map(week => item.name ? actualVolumes.get(item.code + '/' + week.year + '-' + week.week) || 0 : 0)
      const budget = monthlyBudgets[index][budgetMonth - 1]
      return [budget, ...forecast, forecast.reduce((sum,value)=>sum+value,0), ...actual, actual.reduce((sum,value)=>sum+value,0)]
    })
    for (let i = 0; i < rows.length; i++) if (!rows[i].name) {
      for (let j = i + 1; j < rows.length && rows[j].name; j++) values[j].forEach((value, c) => { values[i][c] += value })
    }
    const text = (ref: string, value: string, style: number) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
    const number = (ref: string, value: number, style: number, formula?: string) => `<c r="${ref}" s="${style}">${formula ? `<f>${formula}</f>` : ''}<v>${value}</v></c>`
    const row = (r: number, content: string, height = 18.45) => `<row r="${r}" ht="${height}" customHeight="1">${content}</row>`
    const names = (items: (string | undefined)[]) => [...new Set(items.filter(Boolean))].join(', ')
    const asm = (regionId == null ? undefined : input.asmNames?.[regionId]) || names(sales.map((sale) => sale.asm_name)) || (scope?.level === 'region' ? scope.viewerName : '') || (input.reportType === 'approvals' ? 'Unassigned ASM' : 'Name unavailable')
    const rsm = input.rsmNames?.[rsmAssignmentKey(regionId, areaId)] || (scope?.level === 'subregion' ? scope.viewerName : '') || names(sales.map((sale) => sale.endorsed_by ? input.users[sale.endorsed_by] : undefined)) || (input.reportType === 'approvals' ? 'Unassigned RSM' : 'Name unavailable')
    const approval = input.reportType === 'approvals'
    const asmSubregion = approval && input.approvalStage === 'asm' && area && !kamId
    const subregionName = input.subregions.find(item => item.id === areaId)?.name || 'Unassigned subregion'
    let body = row(1, text('B1', input.reportType === 'approvals' ? 'WEEKLY FORECAST APPROVAL' : 'WEEKLY FORECAST', 25), 22) + row(2, '', 22)
    body += row(3, text('A3', kamId ? 'KAM:' : area ? 'RSM:' : 'ASM:', 4) + text('B3', kamId ? input.users[kamId] || 'Name unavailable' : area ? rsm : asm, 5), 24)
    body += row(4, text('A4', kamId ? 'RSM:' : asmSubregion ? 'ASM:' : area ? approval ? 'SUBREGION:' : 'ASM:' : 'REGION:', 4) + text('B4', kamId ? rsm : asmSubregion ? asm : area ? approval ? subregionName : asm : region, 6), 24)
    if (area && approval && (kamId || asmSubregion)) body += row(5, text('A5', 'SUBREGION:', 4) + text('B5', subregionName, 6))
    else if (area && !approval) body += row(5, text('A5', 'REGION:', 4) + text('B5', region, 6))
    const monthLabel = months[budgetMonth - 1]
    const dates = weeks.map(week => {
      const label = weekLabel(week.year, week.week)
      return label.replace(week.year === budgetYear && !label.includes('/') ? / \([^)]*\)$/ : /$^/, '').replace(' - ', ' -\n')
    })
    body += row(6, text('A6','BP CODE',26)+text('B6','ITEM DESCRIPTION',26)+text('C6',monthLabel,30)
      +text('D6','WEEKLY FORECAST',27)+text(column(salesStart)+'6','SALES PER WEEK',26)
      +months.map((month,i)=>text(column(budgetStart+i)+'6',month,30)).join(''),22)
    body += row(7, text('C7','BUDGET\n'+budgetYear,29)
      +dates.map((label,i)=>text(column(i+3)+'7',label,28)).join('')+text(column(forecastTotal)+'7','TOTAL',27)
      +dates.map((label,i)=>text(column(i+salesStart)+'7',label,26)).join('')+text(last+'7','TOTAL',26),40)
    const groups = rows.flatMap((item,i)=>item.name?[]:[i+9])
    const totals = Array.from({length:2*width+3},(_,c)=>values.reduce((sum,nums,i)=>sum+(rows[i].name?nums[c]:0),0))
    const sumFormula = (r:number,c:number) => c === forecastTotal ? 'SUM(D'+r+':'+column(forecastTotal-1)+r+')'
      : c === lastIndex ? 'SUM('+column(salesStart)+r+':'+column(lastIndex-1)+r+')' : undefined
    body += row(8,text('A8','GRAND TOTAL',12)+totals.map((value,c)=>number(column(c+2)+'8',value,c===0?33:14,
      sumFormula(8,c+2)??'SUM('+groups.map(r=>column(c+2)+r).join(',')+')')).join(''))
    rows.forEach((item,i)=>{
      const r=i+9,group=!item.name
      let end=i+1
      while(end<rows.length&&rows[end].name)end++
      const budgetFormula = 'INDEX($'+column(budgetStart)+r+':$'+column(budgetEnd)+r+',1,MATCH($C$6,$'+column(budgetStart)+'$6:$'+column(budgetEnd)+'$6,0))'
      body+=row(r,text('A'+r,item.code,group?16:20)+text('B'+r,group?'TOTAL':item.name,group?17:20)
        +values[i].map((value,c)=>number(column(c+2)+r,value,c===0?(group?32:31):group?19:21,
          c===0&&!group?budgetFormula:sumFormula(r,c+2)??(group?'SUM('+column(c+2)+(r+1)+':'+column(c+2)+(end+8)+')':undefined))).join('')
        +monthlyBudgets[i].map((value,m)=>number(column(budgetStart+m)+r,value,21)).join(''))
    })
    const merges=['A1:A2','B1:B2','A6:A7','B6:B7','D6:'+column(forecastTotal)+'6',column(salesStart)+'6:'+last+'6','A8:B8']
    sheets.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:'+column(budgetEnd)+(rows.length+8)+'"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="7" topLeftCell="C8" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18.45"/><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="61" customWidth="1"/><col min="3" max="'+(lastIndex+1)+'" width="13" customWidth="1"/><col min="'+(budgetStart+1)+'" max="'+(budgetEnd+1)+'" hidden="1" width="13" customWidth="1"/></cols><sheetData>'+body+'</sheetData><mergeCells count="'+merges.length+'">'+merges.map(ref=>'<mergeCell ref="'+ref+'"/>').join('')+'</mergeCells><dataValidations count="1"><dataValidation type="list" allowBlank="0" showErrorMessage="1" errorTitle="Choose a budget month" error="Select one of the listed months." sqref="C6"><formula1>"'+months.join(',')+'"</formula1></dataValidation></dataValidations><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/><ignoredErrors><ignoredError sqref="A1:XFD1048576" formula="1"/></ignoredErrors><drawing r:id="rId1"/></worksheet>')

  }
  if (scope?.level === 'subregion') {
    const region = input.regions.find(row => row.id === scope.regionId)?.name || 'Assigned region'
    const area = input.subregions.find(row => row.id === scope.subregionId)?.name || 'Assigned subregion'
    addSheet(area, selectedSales, region, true, scope.regionId, scope.subregionId)
    for (const owner of new Set(selectedSales.map(sale => sale.submitted_by || sale.user_id).filter((id): id is string => Boolean(id)))) {
      addSheet(input.users[owner] || 'KAM', selectedSales.filter(sale => (sale.submitted_by || sale.user_id) === owner), region, true, scope.regionId, scope.subregionId, owner)
    }
  } else for (const regionId of new Set(scope ? [scope.regionId] : selectedSales.length ? selectedSales.map((sale) => sale.region_id) : input.regions.map((region) => region.id))) {
    const sales = selectedSales.filter((sale) => sale.region_id === regionId)
    const name = input.regions.find((region) => region.id === regionId)?.name || 'Unassigned region'
    const rsmSheets = input.reportType === 'approvals' && input.approvalStage === 'rsm'
    if (!rsmSheets) addSheet(name, sales, name, false, regionId)
    for (const areaId of new Set(sales.map((sale) => sale.subregion_id))) {
      const areaSales = sales.filter(sale => sale.subregion_id === areaId)
      addSheet(input.subregions.find((area) => area.id === areaId)?.name || `${name} - Unassigned`, areaSales, name, true, regionId, areaId)
      if (rsmSheets) for (const owner of new Set(areaSales.map(sale => sale.submitted_by || sale.user_id).filter((id): id is string => Boolean(id)))) {
        addSheet(input.users[owner] || 'KAM', areaSales.filter(sale => (sale.submitted_by || sale.user_id) === owner), name, true, regionId, areaId, owner)
      }
    }
  }
  // Replace generated XML in the XLSX archive to preserve the template's native
  // fills/fonts/number formats, which SheetJS community edition does not write.
  const archive = CFB.read(new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), { type: 'array' })
  const replace = (path: string, content: string) => {
    const index = archive.FullPaths.findIndex((item: string) => item.endsWith(`/${path}`))
    if (index < 0) throw new Error(`Missing export part: ${path}`)
    archive.FileIndex[index].content = new TextEncoder().encode(content)
    archive.FileIndex[index].size = archive.FileIndex[index].content.length
  }
  const styles = template.styles.replace('<fonts count="11"', '<fonts count="12"')
    .replace('</fonts>', '<font><b/><sz val="18"/><color rgb="FF144B33"/><name val="Aptos Narrow"/></font></fonts>')
    .replace('<cellXfs count="25"', '<cellXfs count="26"')
    .replace('</cellXfs>', '<xf numFmtId="0" fontId="11" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>')
  const headerFills = ['FFD9EFD1','FFCAEDFA','FFFFFFCC','FF7030A0','FFE4D7F5','FFD2B8E8'].map(color=>'<fill><patternFill patternType="solid"><fgColor rgb="'+color+'"/><bgColor indexed="64"/></patternFill></fill>').join('')
  const headerStyles = [9,10,11,12,13].map((fill,i)=>'<xf numFmtId="0" fontId="'+(i===3?3:9)+'" fillId="'+fill+'" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>').join('')
  const budgetStyles = [[13,4],[14,4],[12,3]].map(([fill,font])=>'<xf numFmtId="165" fontId="'+font+'" fillId="'+fill+'" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>').join('')
  replace('xl/styles.xml', styles.replace('<fills count="9"','<fills count="15"').replace('</fills>',headerFills+'</fills>')
    .replace('<cellXfs count="26"','<cellXfs count="34"').replace('</cellXfs>',headerStyles+budgetStyles+'</cellXfs>'))
  const workbookPart = archive.FileIndex[archive.FullPaths.findIndex((path: string) => path.endsWith('/xl/workbook.xml'))]
  const workbookXml = new TextDecoder().decode(Uint8Array.from(workbookPart.content))
  replace('xl/workbook.xml', workbookXml.replace(/<calcPr[^>]*\/>/g, '').replace('</workbook>', '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>'))
  replace('xl/theme/theme1.xml', template.theme)
  sheets.forEach((sheet, i) => replace(`xl/worksheets/sheet${i + 1}.xml`, sheet))
  const add = (path: string, content: string) => CFB.utils.cfb_add(archive, `/${path}`, new TextEncoder().encode(content))
  const relationships = (target: string, type: string) => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`
  sheets.forEach((_, i) => add(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, relationships('../drawings/drawing1.xml', 'drawing')))
  const imageWidth = 224 * 9525, imageHeight = Math.round(imageWidth * logo.height / logo.width)
  add('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${imageWidth}" cy="${imageHeight}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Vitarich Feeds logo" descr="Vitarich Feeds — Alagang Vitarich, Alagang Panalo!"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${imageWidth}" cy="${imageHeight}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`)
  add('xl/drawings/_rels/drawing1.xml.rels', relationships('../media/weekly-sales-logo.png', 'image'))
  CFB.utils.cfb_add(archive, '/xl/media/weekly-sales-logo.png', Uint8Array.from(atob(logo.base64), (char) => char.charCodeAt(0)))
  const contentTypesIndex = archive.FullPaths.findIndex((path: string) => path.endsWith('/[Content_Types].xml'))
  const contentTypes = new TextDecoder().decode(Uint8Array.from(archive.FileIndex[contentTypesIndex].content))
  replace('[Content_Types].xml', contentTypes.replace('</Types>', `${contentTypes.includes('Extension="png"') ? '' : '<Default Extension="png" ContentType="image/png"/>'}<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`))
  return new Uint8Array(CFB.write(archive, { type: 'array', fileType: 'zip', compression: true }))
}

export function weeklySalesExportFilename(input: ExportInput) {
  const weeks = exportWeeks(input)
  const first = weeks[0], last = weeks[weeks.length - 1]
  if (!first || !last) throw new Error('Choose weeks to export.')
  const start = monday(first.year, first.week), end = monday(last.year, last.week)
  end.setUTCDate(end.getUTCDate() + 6)
  const format = (date: Date, includeYear: boolean) => date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
  })
  const range = `${format(start, start.getUTCFullYear() !== end.getUTCFullYear())} - ${format(end, true)}`
  const region = input.regions.length === 1 ? input.regions[0].name : 'All Regions'
  return `${region} Weekly Forecast${input.reportType === 'approvals' ? ' Approval' : ''} (${range})`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-') + '.xlsx'
}

export function downloadWeeklySalesExport(input: ExportInput) {
  const bytes = buildWeeklySalesExport(input)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = weeklySalesExportFilename(input)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
