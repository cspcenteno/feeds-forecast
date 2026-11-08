
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'

import { createClient } from '@/lib/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()

    setLoading(true)
    setError('')

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (loginError) {
        setError(loginError.message)
        return
      }

      if (!data.user) {
        setError('Unable to verify your account. Please sign in again.')
        await supabase.auth.signOut()
        return
      }

      // Check whether the user must change their temporary password.
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('must_change_password')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile) {
        console.error('Unable to retrieve user profile:', profileError)

        setError(
          'Unable to verify your account settings. Please contact your administrator.'
        )

        await supabase.auth.signOut()
        return
      }

      // Require a password change before opening the dashboard.
      if (profile.must_change_password) {
        router.replace('/change-password')
        router.refresh()
        return
      }

      // Normal login.
      router.replace('/dashboard')
      router.refresh()
    } catch (err) {
      console.error('Login error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
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

          <p className="text-xs font-semibold tracking-[0.18em] text-[#527362] uppercase dark:text-emerald-400">Your sales workspace</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">Sign in to manage your forecasts and keep your team moving forward.</p>

          <form onSubmit={handleLogin} aria-busy={loading} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email address</label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" required disabled={loading}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pr-4 pl-10 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:focus:border-emerald-400" />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required disabled={loading}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pr-12 pl-10 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:focus:border-emerald-400" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                  className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-emerald-400">
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </button>
              </div>
            </div>

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

            <button data-action-tone="primary" data-action-fill="" type="submit" disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#174c36] px-4 text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-[#103b29] focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-700 dark:hover:bg-emerald-600">
              {loading ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Signing in…</> : <>Sign in<ArrowRight aria-hidden="true" className="size-4" /></>}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-200 pt-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => router.push('/signup')} className="rounded-sm font-semibold text-[#174c36] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-400">Sign up</button>
          </div>
          <p className="mt-8 text-center text-xs text-slate-400">Feed Sales Forecast · Vitarich Corporation</p>
        </div>
      </section>
    </main>
  )
}
