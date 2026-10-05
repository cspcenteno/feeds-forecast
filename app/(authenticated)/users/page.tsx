'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Trash2,
  RefreshCw,
} from 'lucide-react'

import { createClient } from '@/lib/client'

type User = {
  id: string
  email: string
  full_name: string | null
  role: string
  region_id: number | null
  is_active: boolean
  created_at: string
}

type Region = {
  id: number
  name: string
}

const roles = [
  'User',
  'Region Manager',
  'Admin',
]

export default function UsersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [users, setUsers] = useState<User[]>(
    []
  )

  const [regions, setRegions] = useState<
    Region[]
  >([])

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [deleting, setDeleting] =
    useState(false)

  const [refreshing, setRefreshing] =
    useState(false)

  const [isAdmin, setIsAdmin] =
    useState(false)

  const [selectedUser, setSelectedUser] =
    useState<User | null>(null)

  const [fullName, setFullName] =
    useState('')

  const [email, setEmail] =
    useState('')

  const [role, setRole] =
    useState('User')

  const [regionId, setRegionId] =
    useState<number | null>(null)

  const [isActive, setIsActive] =
    useState(false)

  useEffect(() => {
    checkAccess()
  }, [])

  async function checkAccess() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const {
      data: profile,
      error,
    } = await supabase
      .from('users')
      .select(
        'role, is_active'
      )
      .eq('id', user.id)
      .single()

    console.log(
      'Current profile:',
      profile
    )

    console.log(
      'Profile error:',
      error
    )

    if (
      error ||
      profile?.role !== 'Admin' ||
      !profile?.is_active
    ) {
      router.push('/dashboard')
      return
    }

    setIsAdmin(true)

    await Promise.all([
      loadUsers(),
      loadRegions(),
    ])

    setLoading(false)
  }

  async function loadUsers() {
    const {
      data,
      error,
    } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        role,
        region_id,
        is_active,
        created_at
      `)
      .order(
        'full_name',
        {
          ascending: true,
        }
      )

    if (error) {
      console.error(
        'Users Select Error:',
        error
      )

      return
    }

    setUsers(data ?? [])
  }

  async function loadRegions() {
    const {
      data,
      error,
    } = await supabase
      .from('regions')
      .select(
        'id, name'
      )
      .eq(
        'is_active',
        true
      )
      .order(
        'name',
        {
          ascending: true,
        }
      )

    if (error) {
      console.error(
        'Regions Select Error:',
        error
      )

      return
    }

    setRegions(data ?? [])
  }

  async function handleRefresh() {
    setRefreshing(true)

    await Promise.all([
      loadUsers(),
      loadRegions(),
    ])

    setRefreshing(false)
  }

  function selectUser(
    user: User
  ) {
    setSelectedUser(user)

    setFullName(
      user.full_name ?? ''
    )

    setEmail(user.email)

    setRole(user.role)

    setRegionId(
      user.region_id
    )

    setIsActive(
      user.is_active
    )
  }

  function clearSelection() {
    setSelectedUser(null)

    setFullName('')

    setEmail('')

    setRole('User')

    setRegionId(null)

    setIsActive(false)
  }

  async function handleSave() {
    if (!selectedUser) {
      return
    }

    if (!fullName.trim()) {
      alert(
        'Please enter the full name.'
      )

      return
    }

    if (!role) {
      alert(
        'Please select a role.'
      )

      return
    }

    /*
     * Admin:
     *     region_id = NULL
     *
     * Region Manager:
     *     assigned region required
     *
     * User:
     *     assigned region required
     */
    if (
      role !== 'Admin' &&
      regionId === null
    ) {
      alert(
        'Please select a region.'
      )

      return
    }

    setSaving(true)

    /*
     * Admin has no assigned region.
     *
     * Region Manager and User
     * must have an assigned region.
     */
    const assignedRegionId =
      role === 'Admin'
        ? null
        : regionId

    const {
      error,
    } = await supabase
      .from('users')
      .update({
        full_name:
          fullName.trim(),

        role,

        region_id:
          assignedRegionId,

        is_active:
          isActive,
      })
      .eq(
        'id',
        selectedUser.id
      )

    if (error) {
      console.error(
        'User Update Error:',
        error
      )

      alert(error.message)

      setSaving(false)

      return
    }

    await loadUsers()

    const updatedUser: User = {
      ...selectedUser,

      full_name:
        fullName.trim(),

      role,

      region_id:
        assignedRegionId,

      is_active:
        isActive,
    }

    setSelectedUser(
      updatedUser
    )

    setRegionId(
      assignedRegionId
    )

    setSaving(false)
  }

  async function handleDelete() {
    if (!selectedUser) {
      return
    }

    const confirmed =
      window.confirm(
        `Are you sure you want to delete ${
          selectedUser.full_name ||
          selectedUser.email
        }?`
      )

    if (!confirmed) {
      return
    }

    setDeleting(true)

    const {
      error,
    } = await supabase
      .from('users')
      .delete()
      .eq(
        'id',
        selectedUser.id
      )

    if (error) {
      console.error(
        'User Delete Error:',
        error
      )

      alert(error.message)

      setDeleting(false)

      return
    }

    clearSelection()

    await loadUsers()

    setDeleting(false)
  }

  function getRegionName(
    regionId: number | null
  ) {
    if (regionId === null) {
      return 'All Regions'
    }

    return (
      regions.find(
        (region) =>
          region.id === regionId
      )?.name || '—'
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">
          Loading users...
        </p>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">

      {/* Header */}

      <div className="flex items-center justify-between">

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Users
          </h1>

          <p className="text-sm text-muted-foreground">
            Manage user accounts, roles, regions, and status.
          </p>
        </div>

        <button
          type="button"
          onClick={
            handleRefresh
          }
          disabled={
            refreshing
          }
          className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >

          <RefreshCw
            className={`size-4 ${
              refreshing
                ? 'animate-spin'
                : ''
            }`}
          />

          {refreshing
            ? 'Refreshing...'
            : 'Refresh'}

        </button>

      </div>

      {/* Users Table */}

      <div className="rounded-xl border bg-background">

        <div className="border-b px-6 py-4">

          <h2 className="font-semibold">
            User Accounts
          </h2>

          <p className="text-sm text-muted-foreground">
            {users.length}{' '}
            user
            {users.length !== 1
              ? 's'
              : ''}
          </p>

        </div>

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead>

              <tr className="border-b bg-muted/40">

                <th className="px-6 py-3 text-left font-medium">
                  Full Name
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Email
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Role
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Region
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Status
                </th>

                <th className="px-4 py-3 text-left font-medium">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {users.length === 0 ? (

                <tr>

                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    No users found.
                  </td>

                </tr>

              ) : (

                users.map(
                  (user) => (

                    <tr
                      key={
                        user.id
                      }
                      className="border-b last:border-0"
                    >

                      <td className="px-6 py-3">
                        {
                          user.full_name ||
                          '—'
                        }
                      </td>

                      <td className="px-4 py-3">
                        {user.email}
                      </td>

                      <td className="px-4 py-3">
                        {user.role}
                      </td>

                      <td className="px-4 py-3">
                        {getRegionName(
                          user.region_id
                        )}
                      </td>

                      <td className="px-4 py-3">

                        {user.is_active ? (

                          <span className="text-sm">
                            Active
                          </span>

                        ) : (

                          <span className="text-sm text-muted-foreground">
                            Pending
                          </span>

                        )}

                      </td>

                      <td className="px-4 py-3">

                        <button
                          type="button"
                          onClick={() =>
                            selectUser(
                              user
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                        >

                          <Pencil className="size-4" />

                          Edit

                        </button>

                      </td>

                    </tr>

                  )
                )

              )}

            </tbody>

          </table>

        </div>

      </div>

      {/* Edit User */}

      {selectedUser && (

        <div className="rounded-xl border bg-background">

          <div className="border-b px-6 py-4">

            <h2 className="font-semibold">
              Edit User
            </h2>

            <p className="text-sm text-muted-foreground">
              Update the user's role, assigned region, and account status.
            </p>

          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2">

            {/* Full Name */}

            <div className="space-y-2">

              <label
                htmlFor="fullName"
                className="text-sm font-medium"
              >
                Full Name
              </label>

              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) =>
                  setFullName(
                    e.target.value
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />

            </div>

            {/* Email */}

            <div className="space-y-2">

              <label
                htmlFor="email"
                className="text-sm font-medium"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                value={email}
                disabled
                className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground"
              />

            </div>

            {/* Role */}

            <div className="space-y-2">

              <label
                htmlFor="role"
                className="text-sm font-medium"
              >
                Role
              </label>

              <select
                id="role"
                value={role}
                onChange={(e) => {

                  const newRole =
                    e.target.value

                  setRole(
                    newRole
                  )

                  /*
                   * Admin does not
                   * have an assigned
                   * region.
                   */
                  if (
                    newRole ===
                    'Admin'
                  ) {
                    setRegionId(
                      null
                    )
                  }

                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              >

                {roles.map(
                  (item) => (

                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>

                  )
                )}

              </select>

            </div>

            {/* Region */}

            <div className="space-y-2">

              <label
                htmlFor="region"
                className="text-sm font-medium"
              >
                Region
              </label>

              {role === 'Admin' ? (

                <div className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  All Regions
                </div>

              ) : (

                <select
                  id="region"
                  value={
                    regionId ?? ''
                  }
                  onChange={(e) => {

                    const value =
                      e.target.value

                    setRegionId(
                      value
                        ? Number(
                            value
                          )
                        : null
                    )

                  }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                >

                  <option value="">
                    Select region
                  </option>

                  {regions.map(
                    (region) => (

                      <option
                        key={
                          region.id
                        }
                        value={
                          region.id
                        }
                      >
                        {region.name}
                      </option>

                    )
                  )}

                </select>

              )}

              {role === 'Admin' && (

                <p className="text-xs text-muted-foreground">
                  Admin users have access to all regions.
                </p>

              )}

              {role === 'Region Manager' && (

                <p className="text-xs text-muted-foreground">
                  Region Manager access is limited to the assigned region.
                </p>

              )}

              {role === 'User' && (

                <p className="text-xs text-muted-foreground">
                  User access is limited to the assigned region.
                </p>

              )}

            </div>

            {/* Active */}

            <div className="flex items-center gap-3">

              <input
                id="isActive"
                type="checkbox"
                checked={
                  isActive
                }
                onChange={(e) =>
                  setIsActive(
                    e.target.checked
                  )
                }
                className="size-4"
              />

              <label
                htmlFor="isActive"
                className="text-sm font-medium"
              >
                Active
              </label>

            </div>

          </div>

          {/* Actions */}

          <div className="flex items-center justify-between border-t px-6 py-4">

            <button
              type="button"
              onClick={
                handleDelete
              }
              disabled={
                deleting
              }
              className="inline-flex items-center gap-2 rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >

              <Trash2 className="size-4" />

              {deleting
                ? 'Deleting...'
                : 'Delete'}

            </button>

            <div className="flex gap-2">

              <button
                type="button"
                onClick={
                  clearSelection
                }
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleSave
                }
                disabled={
                  saving
                }
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >

                {saving
                  ? 'Saving...'
                  : 'Save Changes'}

              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  )
}