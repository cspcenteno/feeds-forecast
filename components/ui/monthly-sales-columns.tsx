const monthlySalesColumns = [
  ['Forecast', '(Qty.)'],
  ['Volume', '(50kg)'],
  ['Budget', '(Vol.)'],
  ['Actual', '(Cum. Vol.)'],
  ['Actual', '(Prev. Mo.)'],
  ['Forecast', '(Cum. Vol.)'],
] as const

export function MonthlySalesHeaders() {
  return monthlySalesColumns.map(([title, unit], index) => (
    <th key={title + unit} scope="col" data-monthly-sales-column={index}
      className={'px-2 py-3 text-right font-semibold ' + (index >= 2 ? 'bg-muted/50 text-muted-foreground ' : '') + (index === 2 ? 'border-l border-solid border-border' : '')}>
      <span className="block w-full text-right whitespace-nowrap">{title}</span>
      <span className="block w-full text-right whitespace-nowrap">{unit}</span>
    </th>
  ))
}
