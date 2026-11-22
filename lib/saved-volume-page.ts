type PageError = { code?: string; message: string }

// Retrying a cancelled SELECT is safe: retain its cursor until a page succeeds.
// Smaller batches reduce the permission checks performed by each statement.
export async function readSavedVolumePage<T>(
  read: (size: number) => PromiseLike<{ data: T[] | null; error: PageError | null }>,
  initialSize: number,
  signal: AbortSignal,
) {
  let size = initialSize
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    const result = await read(size)
    signal.throwIfAborted()
    const timeout = result.error?.code === '57014' || /canceling statement due to statement timeout/i.test(result.error?.message ?? '')
    if (!timeout || attempt >= 2 || size <= 50) return { ...result, size }
    size = Math.max(50, Math.floor(size / 2))
  }
}
