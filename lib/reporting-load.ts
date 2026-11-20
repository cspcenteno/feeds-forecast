// Auth and non-abortable RPC promises must not leave reporting screens spinning forever.
export async function withReportingTimeout<T>(request: PromiseLike<T>, label: string, timeout = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out. Please refresh to try again.`)), timeout)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
