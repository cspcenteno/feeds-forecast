
'use client'

import { UserPlus as ActionUserPlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Moon, Sun } from 'lucide-react'

import { createClient } from '@/lib/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const theme = localStorage.getItem('theme')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [])

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }

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
    <main className="relative min-h-svh bg-[#f5f6f2] text-slate-900 lg:grid lg:grid-cols-[1.05fr_1fr] dark:bg-[#111c19] dark:text-slate-100">
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#153f30] px-5 pt-6 pb-8 text-white sm:px-10 lg:min-h-svh lg:p-10 xl:p-14" aria-label="Vitarich Corporation Feed Sales Forecast">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -left-36 size-[42rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -left-20 size-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-20 size-96 rounded-full bg-[#bfa34f]/10 blur-3xl" />

        <div className="relative flex items-center gap-3 pr-36 lg:pr-0">
          <Image src="/vitarich-login-logo.png" alt="Vitarich Corporation" width={883} height={490} preload className="h-auto w-28 object-contain sm:w-36 lg:w-52" />
        </div>

        <div className="relative my-auto max-w-lg pt-6 lg:py-16">
          <div className="mb-5 h-1 w-12 rounded-full bg-[#bfa34f] lg:mb-7" />
          <h1 className="tracking-tight">
            <span className="block text-sm font-normal text-emerald-50/80 lg:text-lg">Welcome to</span>
            <span className="mt-2 block text-3xl leading-[1.1] font-bold sm:text-4xl xl:text-6xl">Feed Sales Forecast</span>
            <span className="mt-3 block text-sm font-normal text-emerald-50/80 lg:text-lg">of Vitarich Corporation</span>
          </h1>
          <p className="hidden mt-4 max-w-sm text-sm leading-relaxed text-emerald-50/75 lg:block lg:mt-6 lg:text-base">Bring your forecasts, approvals, and sales performance together in one workspace.</p>
          <div className="mt-5 hidden flex-wrap items-center gap-x-5 gap-y-3 text-xs text-emerald-100/80 lg:mt-10 lg:flex">
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Forecast</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Review</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Track performance</span>
          </div>
        </div>

      </section>

      <section className="flex flex-col items-center justify-start px-5 pt-8 pb-6 sm:px-10 sm:pb-10 lg:min-h-svh lg:justify-center lg:px-12 lg:pt-24">
        <button type="button" onClick={toggleTheme} aria-label="Toggle light or dark mode" className="absolute top-6 right-6 z-10 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          <Moon className="size-4 dark:hidden" aria-hidden="true" /><Sun className="hidden size-4 dark:block" aria-hidden="true" />
          <span className="dark:hidden">Dark Mode</span><span className="hidden dark:inline">Light Mode</span>
        </button>
        <div className="w-full max-w-sm">

          <h2 className="text-2xl leading-tight font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Sign in to manage your forecasts and keep your team moving forward.</p>

          <form data-login-form onSubmit={handleLogin} aria-busy={loading} className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm leading-5 font-medium">Email address</label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email address" autoComplete="username" required disabled={loading}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pr-4 pl-10 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-base dark:border-slate-700 dark:bg-slate-900 dark:focus:border-emerald-400" />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm leading-5 font-medium">Password</label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" autoComplete="current-password" required disabled={loading}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pr-12 pl-10 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-base dark:border-slate-700 dark:bg-slate-900 dark:focus:border-emerald-400" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                  className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-emerald-400">
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </button>
              </div>
            </div>

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

            <button data-action-tone="primary" data-action-fill="" type="submit" disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#174c36] px-4 text-base font-semibold text-white shadow-sm outline-none transition hover:bg-[#103b29] focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-700 dark:hover:bg-emerald-600">
              {loading ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Signing in…</> : <>Sign In<ArrowRight aria-hidden="true" className="size-4" /></>}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4 text-center text-sm text-slate-500 sm:mt-8 sm:pt-6 dark:border-slate-800 dark:text-slate-400">
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => router.push('/signup')} className="rounded-sm font-semibold text-[#174c36] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-400"><ActionUserPlusIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Sign Up</button>
          </div>
        </div>
      </section>
    </main>
  )
}
