import * as XLSX from 'xlsx'
import { actualTemplateColumns, budgetTemplateColumns, forecastTemplateColumns } from '@/lib/import-template-columns'

export function downloadImportTemplate(moduleName: 'Forecasts' | 'Budgets' | 'Actuals') {
  const columns = moduleName === 'Forecasts' ? forecastTemplateColumns : moduleName === 'Actuals' ? actualTemplateColumns : budgetTemplateColumns
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([columns.map((column) => column === 'kam' ? 'KAM' : column)])
  sheet['!cols'] = columns.map((column) => ({ wch: column === 'Description' ? 48 : ['product_name', 'customer', 'Salesperson', 'Partynme'].includes(column) ? 32 : column === 'week' ? 24 : 18 }))
  XLSX.utils.book_append_sheet(workbook, sheet, moduleName + ' Import')
  XLSX.writeFile(workbook, moduleName.toLowerCase() + '-import-template.xlsx')
}
