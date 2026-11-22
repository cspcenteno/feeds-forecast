'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { ForecastConfirmationSummary } from '@/components/forecast-confirmation-summary'
import { AlertTriangle, Ban, CheckCircle2, LoaderCircle, Send, X } from 'lucide-react'
import { confirmationPresentation, createConfirmationController, type ConfirmationOptions, type ConfirmationTicket, type ConfirmationView } from '@/lib/action-confirmation'

type Notice = { id: number; message: string; success: boolean }
type DialogService = {
  confirmAction: (options: ConfirmationOptions) => Promise<ConfirmationTicket | null>
  notify: (message: string, options?: { success?: boolean }) => void
}
const Context = createContext<DialogService | null>(null)

export function ActionDialogsProvider({ children }: { children: ReactNode }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const noticeId = useRef(0)
  const [view, setView] = useState<ConfirmationView | null>(null)
  const [controller] = useState(() => createConfirmationController(setView))
  const [notices, setNotices] = useState<Notice[]>([])
  const noticeTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => noticeTimers.current.forEach(clearTimeout), [])

  useEffect(() => () => controller.dispose(), [controller])

  const confirmAction = useCallback((options: ConfirmationOptions) => controller.request(options), [controller])

  const notify = useCallback((message: string, options?: { success?: boolean }) => {
    if (!message.trim()) return
    const notice = { id: ++noticeId.current, message: message.trim(), success: options?.success ?? /successfully/i.test(message) }
    // Concurrent loaders can report the same issue; keep one visible notice.
    setNotices((current) => current.some((item) => item.message === notice.message && item.success === notice.success)
      ? current
      : [...current.slice(-2), notice])
    const timer = setTimeout(() => {
      setNotices((current) => current.filter((item) => item.id !== notice.id))
      noticeTimers.current = noticeTimers.current.filter((item) => item !== timer)
    }, 6000)
    noticeTimers.current.push(timer)
  }, [])

  const service = useMemo(() => ({ confirmAction, notify }), [confirmAction, notify])
  const presentation = confirmationPresentation(view?.options.message ?? '')
  const tone = view?.options.tone ?? presentation.tone
  const hasSummary = Boolean(view?.options.forecastSummary || view?.options.details?.length || view?.options.items?.length)

  return (
    <Context.Provider value={service}>
      {children}
      <AlertDialog.Root open={view !== null} onOpenChange={(open, details) => {
        if (open) return
        if (controller.isBusy()) { details.cancel(); return }
        controller.cancel()
      }}>
        {view && <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" />
          <AlertDialog.Popup data-app-dialog initialFocus={cancelRef} finalFocus aria-busy={view.busy}
            className="flex flex-col fixed top-1/2 left-1/2 z-[201] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-background shadow-xl">
            <div className="shrink-0 border-b px-4 py-4 sm:px-6">
              <AlertDialog.Title data-dialog-title className="text-lg font-semibold tracking-tight">{view.options.title ?? presentation.title}</AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground wrap-anywhere">{view.options.message}</AlertDialog.Description>
            </div>
            {(hasSummary || presentation.irreversible) && <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
              {view.options.forecastSummary ? <ForecastConfirmationSummary {...view.options.forecastSummary} /> : hasSummary && <div className="rounded-lg border bg-muted/30 p-4">
                {view.options.details && <dl className="grid grid-cols-2 gap-4">
                  {view.options.details.map((detail) => <div key={detail.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{detail.label}</dt>
                    <dd className="mt-1 text-sm font-semibold wrap-anywhere">{detail.value}</dd>
                  </div>)}
                </dl>}
                {view.options.items && <div className={view.options.details?.length ? 'mt-4 border-t pt-3' : ''}>
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-x-4 text-xs text-muted-foreground"><span>Customer / Product</span><span className="text-right whitespace-nowrap">Volume (50kg)</span></div>
                  <div className="mt-1 max-h-28 space-y-1 overflow-y-auto">
                    {view.options.items.map((item, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-x-4 text-xs font-medium"><span className="min-w-0 wrap-anywhere">{item.label}</span><span className="text-right whitespace-nowrap tabular-nums">{item.volume}</span></div>)}
                  </div>
                </div>}
              </div>}
              {presentation.irreversible && !/cannot be undone|permanent/i.test(view.options.message) && <p className={hasSummary ? 'mt-3 text-xs text-muted-foreground' : 'text-xs text-muted-foreground'}>This action cannot be undone.</p>}
            </div>}
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
              <AlertDialog.Close ref={cancelRef} disabled={view.busy} data-action-tone="neutral" className="h-10 rounded-md border px-4 text-sm"><X className="size-4 shrink-0" aria-hidden="true" /><span>Cancel</span></AlertDialog.Close>
              <button type="button" disabled={view.busy} onClick={() => controller.proceed()} data-action-tone={tone} data-action-fill="" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium">
                {view.busy && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {view.options.layout === 'review' && !view.busy && (view.options.forecastSummary?.level === 'void' ? <Ban className="size-4" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />)}
                {view.busy ? 'Processing…' : view.options.confirmLabel ?? presentation.confirmLabel}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>}
      </AlertDialog.Root>
      <div className="fixed top-4 right-4 z-[220] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        {notices.map((notice) => <div key={notice.id} role={notice.success ? 'status' : 'alert'}
          className={'flex items-start gap-3 rounded-xl border bg-background p-4 shadow-lg ' + (notice.success ? 'border-emerald-300 dark:border-emerald-800' : 'border-red-300 dark:border-red-900')}>
          {notice.success ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />}
          <p className="min-w-0 flex-1 text-sm wrap-anywhere">{notice.message}</p>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>)}
      </div>
    </Context.Provider>
  )
}

export function useActionDialogs() {
  const service = useContext(Context)
  if (!service) throw new Error('ActionDialogsProvider is required.')
  return service
}

export function useStatusNotification() {
  const { notify } = useActionDialogs()
  return useCallback((message: string) => {
    if (message.trim()) notify(message, { success: true })
  }, [notify])
}

export function usePopupError() {
  const [message, setMessage] = useState('')
  const { notify } = useActionDialogs()
  const report = useCallback((next: string | null) => {
    setMessage(next ?? '')
    if (next?.trim()) notify(next, { success: false })
  }, [notify])
  return [message, report] as const
}
