'use client'

import { usePopupError, useStatusNotification } from '@/components/action-dialogs'

import { LogIn as ActionLogInIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Moon, Sun, UserRound } from 'lucide-react'
import { createClient } from '@/lib/client'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [, setError] = usePopupError()
  const setMessage = useStatusNotification()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const theme = localStorage.getItem('theme')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [])

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }

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
    <main className="relative min-h-svh bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#153f30] px-5 pt-6 pb-8 text-white sm:px-10 lg:min-h-svh lg:p-10 xl:p-14" aria-label="Vitarich Corporation Feed Sales Forecast">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -left-36 size-[42rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -left-20 size-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-20 size-96 rounded-full bg-[#bfa34f]/10 blur-3xl" />

        <div className="relative flex items-center gap-3 pr-36 lg:pr-0">
          <Image src="/vitarich-login-logo.png" alt="Vitarich Corporation" width={883} height={490} preload className="h-auto w-28 object-contain sm:w-36 lg:w-52" />
        </div>

        <div className="relative my-auto max-w-lg pt-6 lg:py-16">
          <div className="mb-5 h-1 w-12 rounded-full bg-[#bfa34f] lg:mb-4" />
          <h1 className="tracking-tight">
            <span className="mt-2 block text-3xl leading-tight font-semibold xl:text-4xl">Feed Sales Forecast</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-emerald-50/75 lg:mt-6 lg:text-base">Plan and track sales forecasts in one place.</p>
          <div className="mt-5 hidden flex-wrap items-center gap-x-5 gap-y-3 text-xs text-emerald-100/80 lg:mt-10 lg:flex">
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Forecast</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Review</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Track</span>
          </div>
        </div>

      </section>

      <section className="relative flex flex-col items-center justify-start px-5 pt-8 pb-6 sm:px-10 sm:pb-10 lg:min-h-svh lg:justify-center lg:px-12 lg:pt-24">
        <button type="button" onClick={toggleTheme} aria-label="Toggle light or dark mode" className="absolute top-6 right-6 z-10 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          <Moon className="size-4 dark:hidden" aria-hidden="true" /><Sun className="hidden size-4 dark:block" aria-hidden="true" />
          <span className="dark:hidden">Dark Mode</span><span className="hidden dark:inline">Light Mode</span>
        </button>
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 sm:p-6">

        <div className="mb-3">
          <h1 className="text-lg leading-tight font-semibold tracking-tight">
            Create account
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Enter your details to get started.
          </p>
        </div>

        <form data-auth-form onSubmit={handleSignup} aria-busy={loading} className="space-y-3 sm:space-y-4">

          <div className="space-y-1.5">
            <label htmlFor="fullName" className="block text-sm leading-5 font-medium">
              Full Name
            </label>

            <div className="relative">
            <UserRound aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              required
              disabled={loading}
              className="h-11 w-full rounded-md border border-input bg-card sm:h-10 pr-4 pl-10 text-base outline-none transition placeholder:text-muted-foreground focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:focus:border-emerald-400"
            />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm leading-5 font-medium">
              Email
            </label>

            <div className="relative">
            <Mail aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoComplete="email"
              disabled={loading}
              className="h-11 w-full rounded-md border border-input bg-card sm:h-10 pr-4 pl-10 text-base outline-none transition placeholder:text-muted-foreground focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:focus:border-emerald-400"
            />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm leading-5 font-medium">
              Password
            </label>

            <div className="relative">
            <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              autoComplete="new-password"
              disabled={loading}
              className="h-11 w-full rounded-md border border-input bg-card sm:h-10 pr-12 pl-10 text-base outline-none transition placeholder:text-muted-foreground focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:focus:border-emerald-400"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-emerald-400">
              {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
            </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-sm leading-5 font-medium">
              Confirm Password
            </label>

            <div className="relative">
            <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
              autoComplete="new-password"
              disabled={loading}
              className="h-11 w-full rounded-md border border-input bg-card sm:h-10 pr-12 pl-10 text-base outline-none transition placeholder:text-muted-foreground focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:focus:border-emerald-400"
            />
            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} aria-pressed={showConfirmPassword} className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-emerald-400">
              {showConfirmPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
            </button>
            </div>
          </div>





          <button data-action-tone="primary" data-action-fill=""
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#174c36] px-4 text-sm font-semibold text-white outline-none transition hover:bg-[#103b29] focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            {loading ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Signing up…</> : <>Sign up<ArrowRight aria-hidden="true" className="size-4" /></>}
          </button>
        </form>

        <div className="mt-3 border-t border-border pt-3 text-center text-sm text-slate-500 sm:mt-4 sm:pt-4 dark:text-slate-400">
          Have an account?{' '}
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="font-semibold text-[#174c36] hover:underline dark:text-emerald-400"
          ><ActionLogInIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
            Sign In
          </button>
        </div>
        </div>
      </section>
    </main>
  )
}
