import * as XLSX from 'xlsx'
import { actualTemplateColumns, budgetTemplateColumns, forecastTemplateColumns } from '@/lib/import-template-columns'

export function downloadImportTemplate(moduleName: 'Forecast' | 'Budget' | 'Actual') {
  const columns = moduleName === 'Forecast' ? forecastTemplateColumns : moduleName === 'Actual' ? actualTemplateColumns : budgetTemplateColumns
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([[...columns]])
  sheet['!cols'] = columns.map((column) => ({ wch: column === 'product_name' || column === 'customer' ? 32 : column === 'week' ? 24 : 18 }))
  XLSX.utils.book_append_sheet(workbook, sheet, moduleName + ' Import')
  XLSX.writeFile(workbook, moduleName.toLowerCase() + '-import-template.xlsx')
}
