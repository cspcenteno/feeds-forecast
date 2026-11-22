export type ConfirmationTone = 'primary' | 'positive' | 'transfer' | 'caution' | 'danger'
export type ConfirmationDetail = { label: string; value: string }
export type ConfirmationOptions = {
  message: string
  title?: string
  confirmLabel?: string
  tone?: ConfirmationTone
  details?: ConfirmationDetail[]
  layout?: 'review'
  items?: { label: string; volume: string }[]
  forecastSummary?: import('../components/forecast-confirmation-summary').ForecastConfirmationSummaryProps
}

export type ConfirmationTicket = { finish: () => void }
export type ConfirmationView = { options: ConfirmationOptions; busy: boolean }

export function createConfirmationController(publish: (view: ConfirmationView | null) => void) {
  let pending: { options: ConfirmationOptions; busy: boolean; resolve: (ticket: ConfirmationTicket | null) => void } | null = null
  return {
    request(options: ConfirmationOptions) {
      return new Promise<ConfirmationTicket | null>((resolve) => {
        if (pending) { resolve(null); return }
        pending = { options, busy: false, resolve }
        publish({ options, busy: false })
      })
    },
    isBusy() { return pending?.busy === true },
    cancel() {
      if (!pending || pending.busy) return
      const request = pending
      pending = null
      publish(null)
      request.resolve(null)
    },
    proceed() {
      const request = pending
      if (!request || request.busy) return
      request.busy = true
      publish({ options: request.options, busy: true })
      request.resolve({ finish() {
        if (pending !== request) return
        pending = null
        publish(null)
      } })
    },
    dispose() {
      pending?.resolve(null)
      pending = null
    },
  }
}

export function confirmationPresentation(message: string) {
  const text = message.trim()
  if (/^discard\b/i.test(text)) return { title: 'Discard uploaded records?', confirmLabel: 'Discard', tone: 'danger' as const, irreversible: true }
  if (/^(delete|remove)\b|^are you sure.*\bdelete\b/i.test(text)) return { title: 'Delete records?', confirmLabel: 'Delete', tone: 'danger' as const, irreversible: true }
  if (/^submit\b/i.test(text)) return { title: 'Submit forecasts for review?', confirmLabel: 'Submit', tone: 'transfer' as const, irreversible: false }
  if (/^import\b/i.test(text)) return { title: 'Import these records?', confirmLabel: 'Import', tone: 'transfer' as const, irreversible: false }
  if (/^create\b/i.test(text)) return { title: 'Create user accounts?', confirmLabel: 'Create accounts', tone: 'primary' as const, irreversible: false }
  if (/^add\b/i.test(text)) return { title: 'Add this customer?', confirmLabel: 'Add customer', tone: 'primary' as const, irreversible: false }
  if (/^reopen\b/i.test(text)) return { title: 'Reopen this week?', confirmLabel: 'Reopen', tone: 'positive' as const, irreversible: false }
  if (/^lock\b/i.test(text)) return { title: 'Lock this week?', confirmLabel: 'Lock week', tone: 'caution' as const, irreversible: false }
  if (/^restore the automatic rule\b/i.test(text)) return { title: 'Restore automatic week access?', confirmLabel: 'Restore rule', tone: 'caution' as const, irreversible: false }
  return { title: 'Change week access?', confirmLabel: 'Apply changes', tone: 'caution' as const, irreversible: false }
}

export function confirmationRecordDetails(records: readonly { volume?: number | string | null }[], volumeLabel = 'Total volume'): ConfirmationDetail[] {
  const total = records.reduce((sum, record) => {
    const volume = Number(record.volume)
    return sum + (Number.isFinite(volume) ? volume : 0)
  }, 0)
  return [
    { label: 'Records', value: records.length.toLocaleString('en-PH') },
    { label: volumeLabel, value: total.toLocaleString('en-PH', { maximumFractionDigits: 2 }) },
  ]
}
