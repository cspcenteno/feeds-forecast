'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type User = {
  id: string
  full_name: string | null
  email: string
}

type WeekLock = {
  id: number
  year: number
  week: number
  status: string
  locked_by: string | null
  locked_at: string | null
  created_at: string
  user: User | null
}

const statuses = ['Open', 'Locked']

export default function WeekLocksPage() {
  const supabase = createClient()

  // DATA
  const [weekLocks, setWeekLocks] = useState<WeekLock[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  // FORM
  const [selectedWeek, setSelectedWeek] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [week, setWeek] = useState(1)
  const [status, setStatus] = useState('Open')

  // EDIT
  const [editingId, setEditingId] = useState<number | null>(null)

  // UI STATE
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // GET CURRENT USER
  const getCurrentUser = useCallback(async () => {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      setError('Unable to identify the logged-in user.')
      return
    }

    const { data, error: userError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', authUser.id)
      .single()

    if (userError || !data) {
      setError(
        userError?.message ||
          'Your user profile was not found.'
      )
      return
    }

    setCurrentUser(data as User)
  }, [supabase])

  // LOAD WEEK LOCKS
  const getWeekLocks = useCallback(async () => {
    setError('')

    const { data, error: queryError } = await supabase
      .from('week_locks')
      .select(`
        id,
        year,
        week,
        status,
        locked_by,
        locked_at,
        created_at,
        user:users!week_locks_locked_by_fkey (
          id,
          full_name,
          email
        )
      `)
      .order('year', { ascending: false })
      .order('week', { ascending: false })

    if (queryError) {
      setError(queryError.message)
      return
    }

    const normalizedLocks: WeekLock[] = (data ?? []).map(
      (lock: any) => {
        const relatedUser = lock.user

        return {
          id: lock.id,
          year: lock.year,
          week: lock.week,
          status: lock.status,
          locked_by: lock.locked_by,
          locked_at: lock.locked_at,
          created_at: lock.created_at,
          user: Array.isArray(relatedUser)
            ? relatedUser[0] ?? null
            : relatedUser ?? null,
        }
      }
    )

    setWeekLocks(normalizedLocks)
  }, [supabase])

  // INITIAL LOAD
  useEffect(() => {
    async function loadPage() {
      setLoading(true)

      try {
        await Promise.all([
          getCurrentUser(),
          getWeekLocks(),
        ])
      } finally {
        setLoading(false)
      }
    }

    loadPage()
  }, [getCurrentUser, getWeekLocks])

  // HANDLE WEEK CHANGE
  function handleWeekChange(value: string) {
    setSelectedWeek(value)

    if (!value) return

    const [selectedYear, selectedWeekNumber] =
      value.split('-W')

    setYear(Number(selectedYear))
    setWeek(Number(selectedWeekNumber))

    setError('')
    setMessage('')
  }

  // SAVE WEEK LOCK
  async function saveWeekLock() {
    setError('')
    setMessage('')

    if (!selectedWeek) {
      setError('Please select a week.')
      return
    }

    const selectedYear = Number(year)
    const selectedWeekNumber = Number(week)

    if (
      !selectedYear ||
      selectedYear < 2020 ||
      selectedYear > 2100
    ) {
      setError('Please select a valid year.')
      return
    }

    if (
      !selectedWeekNumber ||
      selectedWeekNumber < 1 ||
      selectedWeekNumber > 53
    ) {
      setError('Please select a valid week.')
      return
    }

    if (!currentUser) {
      setError('Unable to identify the logged-in user.')
      return
    }

    setLoading(true)

    try {
      // CHECK DUPLICATE WEEK
      const {
        data: existingLock,
        error: existingError,
      } = await supabase
        .from('week_locks')
        .select('id')
        .eq('year', selectedYear)
        .eq('week', selectedWeekNumber)
        .neq('id', editingId ?? 0)
        .maybeSingle()

      if (existingError) {
        setError(existingError.message)
        return
      }

      if (existingLock) {
        setError(
          'A week lock already exists for this week.'
        )
        return
      }

      // LOCKED BY
      const isLocked = status === 'Locked'

      const lockData = {
        year: selectedYear,
        week: selectedWeekNumber,
        status,
        locked_by: isLocked ? currentUser.id : null,
        locked_at: isLocked
          ? new Date().toISOString()
          : null,
      }

      // UPDATE EXISTING WEEK LOCK
      if (editingId !== null) {
        const {
          data,
          error: updateError,
        } = await supabase
          .from('week_locks')
          .update(lockData)
          .eq('id', editingId)
          .select('id')

        if (updateError) {
          setError(updateError.message)
          return
        }

        if (!data || data.length === 0) {
          setError(
            'No week lock was updated. Check your RLS UPDATE policy.'
          )
          return
        }

        setMessage('Week lock updated successfully.')
      } else {
        // INSERT NEW WEEK LOCK
        const {
          data,
          error: insertError,
        } = await supabase
          .from('week_locks')
          .insert(lockData)
          .select('id')

        if (insertError) {
          setError(insertError.message)
          return
        }

        if (!data || data.length === 0) {
          setError('Week lock was not added.')
          return
        }

        setMessage('Week lock added successfully.')
      }

      // REFRESH TABLE
      await getWeekLocks()
      clearForm()
    } finally {
      setLoading(false)
    }
  }

  // EDIT WEEK LOCK
  function editWeekLock(lock: WeekLock) {
    setEditingId(lock.id)
    setYear(lock.year)
    setWeek(lock.week)

    setSelectedWeek(
      `${lock.year}-W${String(lock.week).padStart(2, '0')}`
    )

    setStatus(lock.status)
    setError('')
    setMessage('')

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  // DELETE WEEK LOCK
  async function deleteWeekLock(id: number) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this week lock?'
    )

    if (!confirmed) return

    setError('')
    setMessage('')
    setLoading(true)

    try {
      const { error: deleteError } = await supabase
        .from('week_locks')
        .delete()
        .eq('id', id)

      if (deleteError) {
        setError(deleteError.message)
        return
      }

      if (editingId === id) {
        clearForm()
      }

      await getWeekLocks()
      setMessage('Week lock deleted successfully.')
    } finally {
      setLoading(false)
    }
  }

  // CLEAR FORM
  function clearForm() {
    setEditingId(null)
    setSelectedWeek('')
    setYear(new Date().getFullYear())
    setWeek(1)
    setStatus('Open')
    setError('')
  }

  // GET LOCKED BY NAME
  function getLockedByName(lock: WeekLock) {
    if (lock.status !== 'Locked' || !lock.locked_by) {
      return '—'
    }

    return (
      lock.user?.full_name ||
      lock.user?.email ||
      lock.locked_by
    )
  }

  // RENDER
  return (
    <main className="space-y-8">
      {/* FORM */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="font-semibold">
            {editingId !== null
              ? 'Edit Week Lock'
              : 'Add Week Lock'}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {editingId !== null
              ? 'Update the selected week.'
              : 'Create a new week lock.'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* WEEK */}
          <div className="space-y-2">
            <label
              htmlFor="week"
              className="text-sm font-medium"
            >
              Week
            </label>

            <input
              id="week"
              type="week"
              value={selectedWeek}
              onChange={(e) =>
                handleWeekChange(e.target.value)
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            />

            {selectedWeek && (
              <p className="text-xs text-muted-foreground">
                Year: {year} · Week: {week}
              </p>
            )}
          </div>

          {/* STATUS */}
          <div className="space-y-2">
            <label
              htmlFor="status"
              className="text-sm font-medium"
            >
              Status
            </label>

            <select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setError('')
                setMessage('')
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* BUTTONS */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={saveWeekLock}
            disabled={loading || !selectedWeek}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Update Week'
                : 'Add Week'}
          </button>

          {editingId !== null && (
            <button
              type="button"
              onClick={clearForm}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>

        {/* ERROR */}
        {error && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* SUCCESS */}
        {message && (
          <div className="mt-4 rounded-md border bg-muted px-4 py-3 text-sm">
            {message}
          </div>
        )}
      </section>

      {/* WEEK LOCK TABLE */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <h2 className="font-semibold">
            Week Lock Schedule
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            List of weeks and their current lock status.
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] pl-6">
                  Year
                </TableHead>

                <TableHead className="w-[140px]">
                  Week
                </TableHead>

                <TableHead className="w-[160px]">
                  Status
                </TableHead>

                <TableHead className="w-[220px]">
                  Locked By
                </TableHead>

                <TableHead className="w-[220px]">
                  Locked At
                </TableHead>

                <TableHead className="w-[180px] text-left">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {weekLocks.length > 0 ? (
                weekLocks.map((lock) => (
                  <TableRow key={lock.id}>
                    <TableCell className="pl-6 font-medium">
                      {lock.year}
                    </TableCell>

                    <TableCell>
                      W{String(lock.week).padStart(2, '0')}
                    </TableCell>

                    <TableCell>
                      {lock.status}
                    </TableCell>

                    <TableCell>
                      {getLockedByName(lock)}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {lock.locked_at
                        ? new Date(
                            lock.locked_at
                          ).toLocaleString('en-PH', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-start gap-2">
                        <button
                          type="button"
                          onClick={() => editWeekLock(lock)}
                          disabled={loading}
                          className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteWeekLock(lock.id)}
                          disabled={loading}
                          className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {loading
                      ? 'Loading week locks...'
                      : 'No week locks found.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  )
}