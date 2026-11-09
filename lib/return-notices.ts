type ReturnNotice = { reviewer: string; returnedBy: string | null; returnedAt: string | null; reason: string }

export function uniqueReturnNotices(notices: ReturnNotice[]) {
  const unique = new Map<string, ReturnNotice>()
  for (const notice of notices) {
    const key = JSON.stringify([notice.returnedBy ?? notice.reviewer, notice.returnedAt, notice.reason])
    if (!unique.has(key)) unique.set(key, notice)
  }
  return [...unique.values()]
}
