'use client'

import { useRef, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

export function RecordDialog({ open, onClose, title, busy = false, wide = false, contained = false, fitContent = false, maxWidth, stackLevel = 0, initialFocusSelector, children }: {
  open: boolean
  onClose: () => void
  title: string
  busy?: boolean
  wide?: boolean
  contained?: boolean
  fitContent?: boolean
  maxWidth?: string
  stackLevel?: number
  initialFocusSelector?: string
  children: ReactNode
}) {
  const popupRef = useRef<HTMLDivElement>(null)
  return <Dialog.Root open={open} onOpenChange={(nextOpen, details) => {
    if (nextOpen) return
    if (busy) { details.cancel(); return }
    onClose()
  }}>
    <Dialog.Portal>
      <Dialog.Backdrop style={{ zIndex: 100 + stackLevel * 2 }} className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" />
      <Dialog.Popup ref={popupRef} data-app-dialog data-record-dialog data-compact-editor={contained || undefined} aria-busy={busy} finalFocus
        initialFocus={(interaction) => initialFocusSelector ? popupRef.current?.querySelector<HTMLElement>(initialFocusSelector) ?? true : interaction === 'touch' ? popupRef.current : popupRef.current?.querySelector<HTMLInputElement>('input:not([type="checkbox"]):not([disabled])') ?? true}
        style={{ zIndex: 101 + stackLevel * 2, ...(contained ? { height: fitContent ? 'auto' : 'min(42rem, calc(100dvh - 2rem))', maxWidth: maxWidth ?? '56rem', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' } : maxWidth ? { maxWidth } : {}) }}
        className={'fixed top-1/2 left-1/2 z-[101] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-4 shadow-xl data-[nested-dialog-open]:blur-sm sm:p-6 ' + (wide ? 'max-w-5xl' : 'max-w-2xl')}>
        <Dialog.Title className="sr-only">{title}</Dialog.Title>
        <Dialog.Close data-record-dialog-close="" disabled={busy} aria-label={'Close ' + title.toLowerCase()} className="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50 sm:top-6 sm:right-6">
          <X className="size-4" aria-hidden="true" />
        </Dialog.Close>
        {contained
          ? <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
          : <fieldset disabled={busy} className="min-w-0 border-0 p-0">{children}</fieldset>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}
