'use client'

import { LogIn as ActionLogInIcon } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { createClient } from '@/lib/client'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()

    setError('')
    setMessage('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // If email confirmation is disabled
    if (data.session) {
      router.push('/dashboard')
      router.refresh()
      return
    }

    setMessage(
      'Account created successfully. Please check your email to confirm your account.'
    )

    setLoading(false)
  }

  return (
    <main className="min-h-svh bg-[#f5f6f2] text-slate-900 lg:grid lg:grid-cols-[1.05fr_1fr] dark:bg-slate-950 dark:text-slate-100">
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
          <div className="mb-7 h-1 w-12 rounded-full bg-[#bfa34f]" />
          <p className="mb-5 text-xs font-semibold tracking-[0.2em] text-emerald-100/70 uppercase">Plan with perspective</p>
          <h1 className="text-4xl leading-[1.15] font-semibold tracking-tight xl:text-5xl">A clearer view of<br />what comes next.</h1>
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
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <Image src="/vitarich-logo.png" alt="Vitarich Corporation" width={48} height={48} loading="eager" className="size-12 object-contain" />
            <div>
              <p className="text-lg font-semibold tracking-tight">Vitarich Corporation</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Feed Sales Forecast</p>
            </div>
          </div>

        <div className="mb-7">
          <h1 className="text-3xl font-semibold tracking-tight">
            Create your account
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Join your team in the Vitarich Corporation sales workspace.
          </p>
        </div>

        <form onSubmit={handleSignup} aria-busy={loading} className="space-y-4">

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Full Name
            </label>

            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter full name"
              required
              className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:focus:border-emerald-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              required
              className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:focus:border-emerald-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:focus:border-emerald-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Confirm Password
            </label>

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
              className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:focus:border-emerald-400"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {message && (
            <div role="status" className="rounded-md bg-primary/10 p-3 text-sm text-primary">
              {message}
            </div>
          )}

          <button data-action-tone="primary" data-action-fill=""
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#174c36] px-4 text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-[#103b29] focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            {loading ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Creating account…</> : <>Create account<ArrowRight aria-hidden="true" className="size-4" /></>}
          </button>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="font-semibold text-[#174c36] hover:underline dark:text-emerald-400"
          ><ActionLogInIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
            Sign In
          </button>
        </div>
          <p className="mt-8 text-center text-xs text-slate-400">Feed Sales Forecast · Vitarich Corporation</p>
        </div>
      </section>
    </main>
  )
}
