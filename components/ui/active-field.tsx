import type { ComponentProps } from 'react'

export function ActiveField({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <label data-active-field="" className="flex w-fit flex-col gap-1.5 self-end text-sm font-medium">
      <span>Active</span>
      <span className="flex size-10 items-center justify-center rounded-lg border bg-background">
        <input {...props} type="checkbox" className={'size-4 disabled:cursor-not-allowed disabled:opacity-50 ' + (className ?? '')} />
      </span>
    </label>
  )
}
