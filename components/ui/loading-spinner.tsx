import { LoaderCircle } from 'lucide-react'

export function LoadingSpinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center justify-center align-middle text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">Loading {label}…</span>
    </span>
  )
}

export function TableLoadingRow({ columns, label }: { columns: number; label: string }) {
  return (
    <tr>
      <td colSpan={columns} className="px-0 py-10 text-center">
        <div className="sticky left-0 flex w-[100cqw] max-w-full justify-center">
          <LoadingSpinner label={label} />
        </div>
      </td>
    </tr>
  )
}
