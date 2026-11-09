
'use client'

import { usePopupError, useStatusNotification } from '@/components/action-dialogs'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react'

import { createClient } from '@/lib/client'

export default function ChangePasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [, setError] = usePopupError()
  const setSuccess = useStatusNotification()

  useEffect(() => {
    let active = true

    async function checkAccount() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (!active) return

        if (authError || !user) {
          router.replace('/login')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('must_change_password')
          .eq('id', user.id)
          .single()

        if (!active) return

        if (profileError || !profile) {
          setError(
            'Unable to verify your account. Please contact your administrator.',
          )
          return
        }

        if (!profile.must_change_password) {
          router.replace('/dashboard')
          return
        }
      } catch {
        if (active) {
          setError('Unable to verify your account. Please try again.')
        }
      } finally {
        if (active) setChecking(false)
      }
    }

    checkAccount()

    return () => {
      active = false
    }
  }, [router, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    setError('')
    setSuccess('')

    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters long.')
      return
    }

    if (newPassword.length > 128) {
      setError('Your new password must not exceed 128 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Unable to change your password.')
        return
      }

      setSuccess('Password changed successfully. Redirecting to dashboard...')

      router.replace('/dashboard')
      router.refresh()
    } catch {
      setError('Unable to connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div role="status" aria-label="Loading your workspace" className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background p-6">
        <Image src="/vitarich-logo.png" alt="Vitarich Corporation" width={96} height={96} loading="eager" className="size-24 object-contain" />
        <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-emerald-600 motion-reduce:animate-none dark:text-emerald-400" />
        <span className="sr-only">Verifying your account…</span>
      </div>
    )
  }

  return (
    <main className="min-h-svh bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr] ">
      <section className="relative hidden min-h-svh flex-col justify-between overflow-hidden bg-[#153f30] p-10 text-white lg:flex xl:p-14" aria-label="Vitarich Corporation Feed Sales Forecast">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -left-36 size-[42rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -left-20 size-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-20 size-96 rounded-full bg-[#bfa34f]/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <Image src="/vitarich-logo.png" alt="Vitarich Corporation" width={56} height={56} preload className="size-14 object-contain" />
          <div>
            <p className="text-xl font-semibold tracking-tight">Vitarich Corporation</p>
            <p className="mt-0.5 text-xs tracking-wide text-emerald-100/70">Feed Sales Forecast</p>
          </div>
        </div>

        <div className="relative max-w-lg py-16">
          <div className="mb-4 h-1 w-12 rounded-full bg-[#bfa34f]" />
          <p className="mb-5 text-xs font-semibold tracking-[0.2em] text-emerald-100/70 uppercase">Plan with perspective</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">A clearer view of<br />what comes next.</h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-emerald-50/75">Bring your forecasts, approvals, and sales performance together in one workspace.</p>
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-emerald-100/80">
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Forecast</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Review</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Track performance</span>
          </div>
        </div>

        <p className="relative text-xs text-emerald-100/50">Vitarich Corporation · Feed Sales Forecast</p>
      </section>

      <section className="flex min-h-svh flex-col items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Image src="/vitarich-logo.png" alt="Vitarich Corporation" width={48} height={48} loading="eager" className="size-12 object-contain" />
            <div>
              <p className="text-lg font-semibold tracking-tight">Vitarich Corporation</p>
              <p className="text-xs text-muted-foreground">Feed Sales Forecast</p>
            </div>
          </div>

        <div className="mb-4">
          <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-accent-foreground">
            <LockKeyhole className="size-5" />
          </div>

          <h1 className="text-lg leading-tight font-semibold tracking-tight">
            Set your new password
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            For your security, set a new password before continuing to Feed Sales Forecast.
          </p>
        </div>

        <form data-auth-form onSubmit={handleSubmit} aria-busy={loading} className="space-y-4">
          {/* New password */}
          <div className="space-y-1.5">
            <label htmlFor="newPassword" className="block text-sm leading-5 font-medium">
              New Password
            </label>

            <div className="relative">
              <input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
                disabled={loading}
                minLength={8}
                maxLength={128}
                required
                className="h-11 w-full rounded-md border border-input bg-card sm:h-10 pr-12 pl-4 text-base outline-none transition placeholder:text-muted-foreground focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:focus:border-emerald-400"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-emerald-400"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Use at least 8 characters.
            </p>
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-sm leading-5 font-medium">
              Confirm New Password
            </label>

            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                disabled={loading}
                maxLength={128}
                required
                className="h-11 w-full rounded-md border border-input bg-card sm:h-10 pr-12 pl-4 text-base outline-none transition placeholder:text-muted-foreground focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:focus:border-emerald-400"
              />

              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword(!showConfirmPassword)
                }
                aria-label={
                  showConfirmPassword ? 'Hide password' : 'Show password'
                }
                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-emerald-400"
              >
                {showConfirmPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>





          <button data-action-tone="primary" data-action-fill=""
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#174c36] px-4 text-sm font-semibold text-white outline-none transition hover:bg-[#103b29] focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            {loading ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Updating password…</> : <>Update password<ArrowRight aria-hidden="true" className="size-4" /></>}
          </button>
        </form>
          <p className="mt-8 text-center text-xs text-slate-400">Feed Sales Forecast · Vitarich Corporation</p>
        </div>
      </section>
    </main>
  )
}
