import * as XLSX from 'xlsx'
import * as CFB from 'cfb'
import template from './weekly-sales-template.json' with { type: 'json' }
import logo from './weekly-sales-logo.json' with { type: 'json' }

type Sale = {
  year: number; week: number; region_id: number | null; subregion_id: number | null
  product_id: number | null; forecast: number; asm_name?: string
  endorsed_by?: string | null
}
type Lookup = { id: number; name: string }
type ExportInput = {
  sales: Sale[]; regions: Lookup[]; subregions: Lookup[]
  products: (Lookup & { code: string })[]; users: Record<string, string>
  fromWeek?: string; toWeek?: string; asmNames?: Record<number, string>
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
  if (count < 1 || count > 16381) throw new Error('Choose a valid week range within Excel’s column limit.')
  return Array.from({ length: count }, (_, i) => isoWeek(new Date(first.getTime() + i * 604800000)))
}

// Template layout/styles are extracted from the supplied workbook. No sample
// figures, personnel names, or external-workbook formulas are carried forward.
export function buildWeeklySalesExport(input: ExportInput): Uint8Array {
  const weeks = exportWeeks(input)
  if (!weeks.length || (!input.sales.length && !input.regions.length)) throw new Error('No Weekly Sales records to export.')
  const selectedWeeks = new Set(weeks.map((week) => `${week.year}-${week.week}`))
  const selectedSales = input.sales.filter((sale) => selectedWeeks.has(`${sale.year}-${sale.week}`))
  const workbook = XLSX.utils.book_new()
  const sheets: string[] = []
  const usedNames = new Set<string>()
  function addSheet(label: string, sales: Sale[], region: string, area: boolean, regionId: number | null) {
    const base = label.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Unassigned'
    let name = base, suffix = 1
    while (usedNames.has(name.toLowerCase())) { const tail = ` (${++suffix})`; name = base.slice(0, 31 - tail.length) + tail }
    usedNames.add(name.toLowerCase())
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), name)
    const width = weeks.length, last = column(width + 2)
    const rows = template.rows.map((row) => ({ ...row }))
    const known = new Set(rows.filter((row) => row.name).map((row) => row.code))
    const extras = [...new Set(sales.map((sale) => sale.product_id))].map((id) => {
      const product = input.products.find((item) => item.id === id)
      return { code: product?.code || `UNASSIGNED-${id ?? 'NONE'}`, name: product?.name || `Product unavailable (${id ?? 'unassigned'})` }
    }).filter((row) => !known.has(row.code)).sort((a, b) => a.code.localeCompare(b.code))
    if (extras.length) rows.push({ code: 'OTHER PRODUCTS', name: '' }, ...extras)
    const quantities = new Map<string, number>()
    for (const sale of sales) {
      const product = input.products.find((item) => item.id === sale.product_id)
      const code = product?.code || `UNASSIGNED-${sale.product_id ?? 'NONE'}`
      const key = `${code}/${sale.year}-${sale.week}`
      quantities.set(key, (quantities.get(key) || 0) + (Number(sale.forecast) || 0))
    }
    const values = rows.map((row) => Array.from({ length: width }, (_, i) => row.name && weeks[i] ? quantities.get(`${row.code}/${weeks[i].year}-${weeks[i].week}`) || 0 : 0))
    for (let i = 0; i < rows.length; i++) if (!rows[i].name) {
      for (let j = i + 1; j < rows.length && rows[j].name; j++) values[j].forEach((value, w) => { values[i][w] += value })
    }
    const text = (ref: string, value: string, style: number) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
    const number = (ref: string, value: number, style: number, formula?: string) => `<c r="${ref}" s="${style}">${formula ? `<f>${formula}</f>` : ''}<v>${value}</v></c>`
    const row = (r: number, content: string, height = 18.45) => `<row r="${r}" ht="${height}" customHeight="1">${content}</row>`
    const names = (items: (string | undefined)[]) => [...new Set(items.filter(Boolean))].join(', ')
    const asm = (regionId == null ? undefined : input.asmNames?.[regionId]) || names(sales.map((sale) => sale.asm_name)) || 'Name unavailable'
    const rsm = names(sales.map((sale) => sale.endorsed_by ? input.users[sale.endorsed_by] : undefined)) || 'Name unavailable'
    let body = row(1, text('B1', 'WEEKLY FORECASTS', 25), 22) + row(2, '', 22)
    body += row(3, text('A3', area ? 'RSM:' : 'ASM:', 4) + text('B3', area ? rsm : asm, 5), 24)
    body += row(4, text('A4', area ? 'ASM:' : 'REGION:', 4) + text('B4', area ? asm : region, 6), 24)
    if (area) body += row(5, text('A5', 'REGION:', 4) + text('B5', region, 6))
    body += row(7, text('A7', 'BP CODE', 9) + text('B7', 'ITEM DESCRIPTION', 9) + Array.from({ length: width }, (_, i) => text(`${column(i + 2)}7`, weeks[i] ? weekLabel(weeks[i].year, weeks[i].week) : '', 10)).join('') + text(`${last}7`, 'TOTAL', 11), 42)
    const groups = rows.flatMap((item, i) => item.name ? [] : [i + 9])
    const totals = Array.from({ length: width }, (_, w) => values.reduce((sum, nums, i) => sum + (rows[i].name ? nums[w] : 0), 0))
    body += row(8, text('A8', 'GRAND TOTAL', 12) + totals.map((value, w) => number(`${column(w + 2)}8`, value, 14, `SUM(${groups.map((r) => `${column(w + 2)}${r}`).join(',')})`)).join('') + number(`${last}8`, totals.reduce((a, b) => a + b, 0), 15, `SUM(C8:${column(width + 1)}8)`))
    rows.forEach((item, i) => {
      const r = i + 9, group = !item.name
      let end = i + 1
      while (end < rows.length && rows[end].name) end++
      body += row(r, text(`A${r}`, item.code, group ? 16 : 20) + text(`B${r}`, item.name, group ? 17 : 20) + values[i].map((value, w) => number(`${column(w + 2)}${r}`, value, group ? 19 : 21, group ? `SUM(${column(w + 2)}${r + 1}:${column(w + 2)}${end + 8})` : undefined)).join('') + number(`${last}${r}`, values[i].reduce((a, b) => a + b, 0), group ? 18 : 22, `SUM(C${r}:${column(width + 1)}${r})`))
    })
    sheets.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${last}${rows.length + 8}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18.45"/><cols><col min="1" max="1" width="33" customWidth="1"/><col min="2" max="2" width="61" customWidth="1"/><col min="3" max="${width + 3}" width="23" customWidth="1"/></cols><sheetData>${body}</sheetData><mergeCells count="3"><mergeCell ref="A1:A2"/><mergeCell ref="B1:B2"/><mergeCell ref="A8:B8"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/><drawing r:id="rId1"/></worksheet>`)
  }
  for (const regionId of new Set(selectedSales.length ? selectedSales.map((sale) => sale.region_id) : input.regions.map((region) => region.id))) {
    const sales = selectedSales.filter((sale) => sale.region_id === regionId)
    const name = input.regions.find((region) => region.id === regionId)?.name || 'Unassigned region'
    addSheet(name, sales, name, false, regionId)
    for (const areaId of new Set(sales.map((sale) => sale.subregion_id))) {
      addSheet(input.subregions.find((area) => area.id === areaId)?.name || `${name} - Unassigned`, sales.filter((sale) => sale.subregion_id === areaId), name, true, regionId)
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
  replace('xl/styles.xml', styles)
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
  return `${region} Weekly Forecast (${range})`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-') + '.xlsx'
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
