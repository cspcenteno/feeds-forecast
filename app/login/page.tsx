
'use client'

import { usePopupError } from '@/components/action-dialogs'

import { UserPlus as ActionUserPlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Moon, Sun } from 'lucide-react'

import { createClient } from '@/lib/client'
import { AuthLogo } from '@/components/auth-logo'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [, setError] = usePopupError()

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
    <main className="relative min-h-svh bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr] ">
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#153f30] px-5 pt-6 pb-8 text-white sm:px-10 lg:min-h-svh lg:p-10 xl:p-14" aria-label="Vitarich Corporation Feeds Forecast">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -left-36 size-[42rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -left-20 size-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-20 size-96 rounded-full bg-[#bfa34f]/10 blur-3xl" />

        <div className="relative flex items-center gap-3 pr-36 lg:pr-0">
          <Image src="/vitarich-login-logo.png" alt="Vitarich Corporation" width={883} height={490} preload className="h-auto w-28 object-contain sm:w-36 lg:w-52" />
        </div>

        <div className="relative my-auto max-w-lg pt-6 lg:py-16">
          <div className="mb-5 h-1 w-12 rounded-full bg-[#bfa34f] lg:mb-4" />
          <h1 className="tracking-tight">
            <span className="mt-2 block text-3xl leading-tight font-semibold xl:text-4xl">Feeds Forecast</span>
          </h1>
          <p className="hidden mt-4 max-w-sm text-sm leading-relaxed text-emerald-50/75 lg:block lg:mt-6 lg:text-base">Plan and track forecasts in one place.</p>
          <div className="mt-5 hidden flex-wrap items-center gap-x-5 gap-y-3 text-xs text-emerald-100/80 lg:mt-10 lg:flex">
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Forecast</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Review</span>
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#cfb65f]" />Track</span>
          </div>
        </div>

      </section>

      <section className="flex flex-col items-center justify-start px-5 pt-8 pb-6 sm:px-10 sm:pb-10 lg:min-h-svh lg:justify-center lg:px-12 lg:pt-24">
        <button type="button" onClick={toggleTheme} aria-label="Toggle light or dark mode" className="absolute top-6 right-6 z-10 inline-flex items-center justify-center gap-2 max-md:size-11 max-md:p-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          <Moon className="size-4 dark:hidden" aria-hidden="true" /><Sun className="hidden size-4 dark:block" aria-hidden="true" />
          <span className="hidden md:inline dark:md:hidden">Dark Mode</span><span className="hidden dark:md:inline">Light Mode</span>
        </button>
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 sm:p-6">

          <div className="flex items-center gap-3">
            <AuthLogo />
            <div className="min-w-0">
              <h2 className="text-lg leading-tight font-semibold tracking-tight">Sign in</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Access your account.</p>
            </div>
          </div>

          <form data-login-form data-auth-form onSubmit={handleLogin} aria-busy={loading} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm leading-5 font-medium">Email address <span className="text-destructive" aria-hidden="true">*</span></label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" autoComplete="username" required disabled={loading}
                  className="h-11 w-full rounded-md border border-input bg-card sm:h-10 pr-4 pl-10 text-base outline-none transition placeholder:text-muted-foreground focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:focus:border-emerald-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm leading-5 font-medium">Password <span className="text-destructive" aria-hidden="true">*</span></label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required disabled={loading}
                  className="h-11 w-full rounded-md border border-input bg-card sm:h-10 pr-12 pl-10 text-base outline-none transition placeholder:text-muted-foreground focus:border-emerald-700 focus:ring-3 focus:ring-emerald-700/10 disabled:opacity-60 sm:text-sm dark:focus:border-emerald-400" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                  className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-emerald-400">
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </button>
              </div>
            </div>



            <button data-action-tone="primary" data-action-fill="" type="submit" disabled={loading}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#174c36] px-4 text-sm font-semibold text-white outline-none transition hover:bg-[#103b29] focus-visible:ring-3 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-700 dark:hover:bg-emerald-600">
              {loading ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Signing in…</> : <>Sign In<ArrowRight aria-hidden="true" className="size-4" /></>}
            </button>
          </form>

          <div className="mt-4 border-t border-border pt-4 text-center text-sm text-slate-500   dark:text-slate-400">
            New here?{' '}
            <button type="button" onClick={() => router.push('/signup')} className="rounded-sm font-semibold text-[#174c36] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-400"><ActionUserPlusIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Sign Up</button>
          </div>
        </div>
      </section>
    </main>
  )
}
