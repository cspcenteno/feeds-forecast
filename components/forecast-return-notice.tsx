'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { MessageSquare } from 'lucide-react'
import { uniqueReturnNotices } from '@/lib/return-notices'

export function ForecastReturnNotice({ notices }: {
  notices: ReturnType<typeof uniqueReturnNotices>
}) {
  const [open, setOpen] = useState(true)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const acknowledgeRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const form = triggerRef.current?.closest<HTMLElement>('[data-record-dialog]')
    if (!form) return
    const wasInert = form.inert
    form.inert = true
    acknowledgeRef.current?.focus()
    return () => { form.inert = wasInert }
  }, [open])

  return <Dialog.Root open={open} modal disablePointerDismissal onOpenChange={(nextOpen, details) => {
    if (!nextOpen && details.reason !== 'close-press') {
      details.cancel()
      return
    }
    setOpen(nextOpen)
  }}>
    <Dialog.Trigger ref={triggerRef} data-return-reason-trigger data-action-tone="caution" className="inline-flex items-center gap-2 px-3 text-sm">
      <MessageSquare className="size-4" aria-hidden="true" />
      Return reason
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop forceRender className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" />
      <Dialog.Popup data-app-dialog initialFocus={acknowledgeRef} finalFocus
        className="fixed top-1/2 left-1/2 z-[201] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-card p-5 shadow-xl">
        <Dialog.Title className="font-semibold">Forecast returned</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">
          Review the reason before updating and resubmitting this forecast.
        </Dialog.Description>
        <div className="mt-4 space-y-3">
          {notices.map((notice, index) => <div key={index} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 wrap-anywhere dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-medium">Returned by {notice.reviewer}{notice.returnedAt ? ` · ${new Date(notice.returnedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })}` : ''}</p>
            <p className="mt-1"><span className="font-medium">Reason:</span> {notice.reason}</p>
          </div>)}
        </div>
        <div className="mt-4 flex justify-end">
          <Dialog.Close ref={acknowledgeRef} data-action-tone="neutral" className="px-4">Got it</Dialog.Close>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}
