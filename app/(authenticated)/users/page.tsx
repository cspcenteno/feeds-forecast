
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Trash2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import { createClient } from '@/lib/client'

type User = {
  id: string
  email: string
  full_name: string | null
  role: string
  region_id: number | null
  subregion_id: number | null
  position: string | null
  is_active: boolean
  created_at: string
}

type Region = {
  id: number
  name: string
}

type Subregion = {
  id: number
  name: string
  region_id: number
}

const roles = ['User', 'Superuser', 'Manager', 'Admin'] as const

const modules = [
  'Dashboard',
  'Sales Input',
  'Weekly Sales',
  'Approvals',
  'Budget',
  'Categories',
  'Products',
  'Regions',
  'Subregions',
  'Users',
  'Week Locks',
] as const

type ModuleName = (typeof modules)[number]

type PermissionField =
  | 'can_view'
  | 'can_add'
  | 'can_edit'
  | 'can_delete'

type ModulePermission = {
  module: ModuleName
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_delete: boolean
}

const permissionFields: {
  field: PermissionField
  label: string
}[] = [
  { field: 'can_view', label: 'View' },
  { field: 'can_add', label: 'Add' },
  { field: 'can_edit', label: 'Edit' },
  { field: 'can_delete', label: 'Delete' },
]

/**
 * Permissions that must never be enabled.
 *
 * Dashboard: Add, Edit, Delete disabled.
 * Weekly Sales: Add, Edit, Delete disabled.
 * Approvals: Add and Delete disabled.
 */
const disabledPermissions: Record<
  ModuleName,
  PermissionField[]
> = {
  Dashboard: ['can_add', 'can_edit', 'can_delete'],
  'Sales Input': [],
  'Weekly Sales': ['can_add', 'can_edit', 'can_delete'],
  Approvals: ['can_add', 'can_delete'],
  Budget: [],
  Categories: [],
  Products: [],
  Regions: [],
  Subregions: [],
  Users: [],
  'Week Locks': [],
}

function createDefaultPermissions(): ModulePermission[] {
  return modules.map((module) => ({
    module,
    can_view: false,
    can_add: false,
    can_edit: false,
    can_delete: false,
  }))
}

function isPermissionDisabled(
  module: ModuleName,
  field: PermissionField
) {
  return disabledPermissions[module].includes(field)
}

function normalizePermission(
  permission: ModulePermission
): ModulePermission {
  const normalized = { ...permission }

  for (const field of permissionFields) {
    if (isPermissionDisabled(permission.module, field.field)) {
      normalized[field.field] = false
    }
  }

  return normalized
}

/**
 * Creates default permissions for a role.
 * Prohibited permissions are always normalized to false.
 */
function getDefaultPermissions(role: string): ModulePermission[] {
  const permissions = createDefaultPermissions()

  function setPermission(
    module: ModuleName,
    values: Partial<Omit<ModulePermission, 'module'>>
  ) {
    const permission = permissions.find(
      (item) => item.module === module
    )

    if (permission) {
      Object.assign(permission, values)
    }
  }

  function setViewOnly(moduleNames: ModuleName[]) {
    moduleNames.forEach((module) => {
      setPermission(module, { can_view: true })
    })
  }

  switch (role) {
    case 'User':
      // Dashboard and Weekly Sales only have View available.
      setViewOnly(['Dashboard', 'Weekly Sales'])

      setPermission('Sales Input', {
        can_view: true,
        can_add: true,
        can_edit: true,
      })
      break

    case 'Superuser':
      setViewOnly([
        'Dashboard',
        'Sales Input',
        'Weekly Sales',
        'Approvals',
        'Categories',
        'Products',
        'Regions',
        'Subregions',
      ])

      setPermission('Budget', {
        can_view: true,
        can_add: true,
        can_edit: true,
      })

      setPermission('Week Locks', {
        can_view: true,
        can_add: true,
        can_edit: true,
      })
      break

    case 'Manager':
      setViewOnly([
        'Dashboard',
        'Sales Input',
        'Weekly Sales',
        'Approvals',
        'Categories',
        'Products',
        'Regions',
        'Subregions',
        'Budget',
        'Week Locks',
      ])

      setPermission('Approvals', {
        can_view: true,
        can_edit: true,
      })
      break

    case 'Admin':
      // Enable every permitted action.
      // normalizePermission will keep prohibited actions false.
      permissions.forEach((permission) => {
        permission.can_view = true
        permission.can_add = true
        permission.can_edit = true
        permission.can_delete = true
      })
      break
  }

  return permissions.map(normalizePermission)
}

export default function UsersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<Subregion[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState('')
  const [role, setRole] = useState<string>('User')
  const [regionId, setRegionId] = useState<number | null>(null)
  const [subregionId, setSubregionId] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(false)

  const [permissions, setPermissions] = useState<ModulePermission[]>(
    () => createDefaultPermissions()
  )

  // True if this user already has at least one saved permission row.
  const [hasSavedPermissions, setHasSavedPermissions] = useState(false)
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [permissionLoadError, setPermissionLoadError] = useState(false)

  useEffect(() => {
    checkAccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const { data: profile, error } = await supabase
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

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
      loadSubregions(),
    ])

    setLoading(false)
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        role,
        region_id,
        subregion_id,
        position,
        is_active,
        created_at
      `)
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Users Select Error:', error)
      alert(`Unable to load users: ${error.message}`)
      return
    }

    setUsers((data ?? []) as User[])
  }

  async function loadRegions() {
    const { data, error } = await supabase
      .from('regions')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Regions Select Error:', error)
      alert(`Unable to load regions: ${error.message}`)
      return
    }

    setRegions((data ?? []) as Region[])
  }

  async function loadSubregions() {
    const { data, error } = await supabase
      .from('subregions')
      .select('id, name, region_id')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Subregions Select Error:', error)
      alert(`Unable to load subregions: ${error.message}`)
      return
    }

    setSubregions((data ?? []) as Subregion[])
  }

  async function handleRefresh() {
    setRefreshing(true)

    try {
      await Promise.all([
        loadUsers(),
        loadRegions(),
        loadSubregions(),
      ])

      if (selectedUser) {
        await loadUserPermissions(selectedUser.id, role)
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function loadUserPermissions(
    userId: string,
    selectedRole: string
  ) {
    setLoadingPermissions(true)
    setPermissionLoadError(false)

    const { data, error } = await supabase
      .from('user_permissions')
      .select(`
        module,
        can_view,
        can_add,
        can_edit,
        can_delete
      `)
      .eq('user_id', userId)

    if (error) {
      console.error('User Permissions Select Error:', error)
      setPermissionLoadError(true)
      setLoadingPermissions(false)

      alert(
        `Unable to load user permissions: ${error.message}`
      )
      return
    }

    if (!data || data.length === 0) {
      // No permission records exist for this user.
      // Generate defaults based on the selected user's role.
      setHasSavedPermissions(false)
      setPermissions(getDefaultPermissions(selectedRole))
      setLoadingPermissions(false)
      return
    }

    // Existing permission records take precedence over role defaults.
    // Any modules without rows remain false.
    const savedPermissions = new Map(
      data.map((item) => [item.module, item])
    )

    const mergedPermissions: ModulePermission[] = modules.map(
      (module) => {
        const saved = savedPermissions.get(module)

        return normalizePermission({
          module,
          can_view: saved?.can_view ?? false,
          can_add: saved?.can_add ?? false,
          can_edit: saved?.can_edit ?? false,
          can_delete: saved?.can_delete ?? false,
        })
      }
    )

    setHasSavedPermissions(true)
    setPermissions(mergedPermissions)
    setLoadingPermissions(false)
  }

  async function selectUser(user: User) {
    setSelectedUser(user)
    setFullName(user.full_name ?? '')
    setEmail(user.email)
    setPosition(user.position ?? '')
    setRole(user.role)
    setRegionId(user.region_id)
    setSubregionId(user.subregion_id)
    setIsActive(user.is_active)

    await loadUserPermissions(user.id, user.role)
  }

  function handleRoleChange(newRole: string) {
    setRole(newRole)

    // If this user has no saved permission rows, update the defaults
    // immediately whenever the selected role changes.
    if (!hasSavedPermissions) {
      setPermissions(getDefaultPermissions(newRole))
    }

    if (newRole === 'Admin') {
      setRegionId(null)
      setSubregionId(null)
    }
  }

  function clearSelection() {
    setSelectedUser(null)
    setFullName('')
    setEmail('')
    setPosition('')
    setRole('User')
    setRegionId(null)
    setSubregionId(null)
    setIsActive(false)
    setPermissions(createDefaultPermissions())
    setHasSavedPermissions(false)
    setLoadingPermissions(false)
    setPermissionLoadError(false)
  }

  function updatePermission(
    module: ModuleName,
    field: PermissionField,
    checked: boolean
  ) {
    if (isPermissionDisabled(module, field)) return

    setPermissions((current) =>
      current.map((permission) =>
        permission.module === module
          ? normalizePermission({
              ...permission,
              [field]: checked,
            })
          : permission
      )
    )
  }

  function toggleModulePermissions(
    module: ModuleName,
    checked: boolean
  ) {
    setPermissions((current) =>
      current.map((permission) => {
        if (permission.module !== module) return permission

        const updated = { ...permission }

        permissionFields.forEach(({ field }) => {
          if (!isPermissionDisabled(module, field)) {
            updated[field] = checked
          }
        })

        return normalizePermission(updated)
      })
    )
  }

  function toggleAllPermissions(checked: boolean) {
    setPermissions((current) =>
      current.map((permission) => {
        const updated = { ...permission }

        permissionFields.forEach(({ field }) => {
          if (!isPermissionDisabled(permission.module, field)) {
            updated[field] = checked
          }
        })

        return normalizePermission(updated)
      })
    )
  }

  async function handleSave() {
    if (!selectedUser) return

    if (!fullName.trim()) {
      alert('Please enter the full name.')
      return
    }

    if (!role) {
      alert('Please select a role.')
      return
    }

    if (role !== 'Admin' && regionId === null) {
      alert('Please select a region.')
      return
    }

    if (
      role !== 'Admin' &&
      subregionId !== null &&
      !subregions.some(
        (subregion) =>
          subregion.id === subregionId &&
          subregion.region_id === regionId
      )
    ) {
      alert(
        'Please select a subregion belonging to the selected region.'
      )
      return
    }

    if (loadingPermissions || permissionLoadError) {
      alert(
        'Please ensure user permissions have loaded successfully before saving.'
      )
      return
    }

    setSaving(true)

    const assignedRegionId =
      role === 'Admin' ? null : regionId

    const assignedSubregionId =
      role === 'Admin' ? null : subregionId

    const updatedFields = {
      full_name: fullName.trim(),
      position: position.trim() || null,
      role,
      region_id: assignedRegionId,
      subregion_id: assignedSubregionId,
      is_active: isActive,
    }

    const { error: userError } = await supabase
      .from('users')
      .update(updatedFields)
      .eq('id', selectedUser.id)

    if (userError) {
      console.error('User Update Error:', userError)
      alert(`Unable to update user: ${userError.message}`)
      setSaving(false)
      return
    }

    // Normalize again before saving so disabled permissions are false.
    const normalizedPermissions = permissions.map(
      normalizePermission
    )

    const permissionRecords = normalizedPermissions.map(
      (permission) => ({
        user_id: selectedUser.id,
        module: permission.module,
        can_view: permission.can_view,
        can_add: permission.can_add,
        can_edit: permission.can_edit,
        can_delete: permission.can_delete,
        updated_at: new Date().toISOString(),
      })
    )

    const { error: permissionError } = await supabase
      .from('user_permissions')
      .upsert(permissionRecords, {
        onConflict: 'user_id,module',
      })

    const updatedUser: User = {
      ...selectedUser,
      ...updatedFields,
    }

    setUsers((currentUsers) =>
      currentUsers
        .map((user) =>
          user.id === selectedUser.id ? updatedUser : user
        )
        .sort((a, b) =>
          (a.full_name ?? '').localeCompare(b.full_name ?? '')
        )
    )

    setSelectedUser(updatedUser)
    setRegionId(assignedRegionId)
    setSubregionId(assignedSubregionId)
    setPermissions(normalizedPermissions)
    setSaving(false)

    if (permissionError) {
      console.error(
        'User Permissions Save Error:',
        permissionError
      )

      alert(
        `User details were saved, but permissions could not be saved: ${permissionError.message}`
      )
      return
    }

    setHasSavedPermissions(true)
    setPermissionLoadError(false)

    alert('User details and permissions saved successfully.')
  }

  async function handleDelete() {
    if (!selectedUser) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${
        selectedUser.full_name || selectedUser.email
      }?`
    )

    if (!confirmed) return

    setDeleting(true)

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', selectedUser.id)

    if (error) {
      console.error('User Delete Error:', error)
      alert(`Unable to delete user: ${error.message}`)
      setDeleting(false)
      return
    }

    setUsers((currentUsers) =>
      currentUsers.filter((user) => user.id !== selectedUser.id)
    )

    clearSelection()
    setDeleting(false)
  }

  function getRegionName(id: number | null) {
    if (id === null) return 'All Regions'

    return regions.find((region) => region.id === id)?.name ?? '—'
  }

  function getSubregionName(id: number | null) {
    if (id === null) return '—'

    return (
      subregions.find((subregion) => subregion.id === id)?.name ??
      '—'
    )
  }

  const availableSubregions = subregions.filter(
    (subregion) => subregion.region_id === regionId
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">
          Loading users...
        </p>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {/* User Accounts */}

      <div className="rounded-xl border bg-background">
        <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">User Accounts</h2>
            <p className="text-sm text-muted-foreground">
              {users.length} user{users.length !== 1 ? 's' : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 self-start rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 sm:self-auto"
          >
            <RefreshCw
              className={`size-4 ${
                refreshing ? 'animate-spin' : ''
              }`}
            />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-6 py-3 text-left font-medium">Full Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Region</th>
                <th className="px-4 py-3 text-left font-medium">Subregion</th>
                <th className="px-4 py-3 text-left font-medium">Position</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b last:border-0 ${
                      selectedUser?.id === user.id
                        ? 'bg-muted/40'
                        : ''
                    }`}
                  >
                    <td className="px-6 py-3">
                      {user.full_name || '—'}
                    </td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.role}</td>
                    <td className="px-4 py-3">
                      {getRegionName(user.region_id)}
                    </td>
                    <td className="px-4 py-3">
                      {getSubregionName(user.subregion_id)}
                    </td>
                    <td className="px-4 py-3">
                      {user.position || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {user.is_active ? 'Active' : 'Pending'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => selectUser(user)}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        <Pencil className="size-4" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User */}

      {selectedUser && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-background">
            <div className="border-b px-6 py-4">
              <h2 className="font-semibold">Edit User</h2>
              <p className="text-sm text-muted-foreground">
                Update the user's details, role, region, subregion, and status.
              </p>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="fullName" className="text-sm font-medium">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
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

              <div className="space-y-2">
                <label htmlFor="position" className="text-sm font-medium">
                  Position
                </label>
                <input
                  id="position"
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Enter position"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="role" className="text-sm font-medium">
                  Role
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                >
                  {roles.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                {!hasSavedPermissions && (
                  <p className="text-xs text-muted-foreground">
                    Default permissions are applied for the selected role.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="region" className="text-sm font-medium">
                  Region
                </label>

                {role === 'Admin' ? (
                  <div className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    All Regions
                  </div>
                ) : (
                  <select
                    id="region"
                    value={regionId ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      const newRegionId = value ? Number(value) : null

                      setRegionId(newRegionId)

                      if (
                        subregionId !== null &&
                        !subregions.some(
                          (subregion) =>
                            subregion.id === subregionId &&
                            subregion.region_id === newRegionId
                        )
                      ) {
                        setSubregionId(null)
                      }
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select region</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="subregion" className="text-sm font-medium">
                  Subregion
                </label>

                {role === 'Admin' ? (
                  <div className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    All Subregions
                  </div>
                ) : (
                  <select
                    id="subregion"
                    value={subregionId ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      setSubregionId(value ? Number(value) : null)
                    }}
                    disabled={regionId === null}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">No subregion selected</option>
                    {availableSubregions.map((subregion) => (
                      <option key={subregion.id} value={subregion.id}>
                        {subregion.name}
                      </option>
                    ))}
                  </select>
                )}

                <p className="text-xs text-muted-foreground">
                  Subregion is optional and must belong to the selected region.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4"
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active
                </label>
              </div>
            </div>
          </div>

          {/* User Permissions */}

          <div className="rounded-xl border bg-background">
            <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border p-2">
                  <ShieldCheck className="size-5" />
                </div>

                <div>
                  <h2 className="font-semibold">User Permissions</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure module access for{' '}
                    {selectedUser.full_name || selectedUser.email}.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleAllPermissions(true)}
                disabled={
                  loadingPermissions ||
                  permissionLoadError ||
                  saving
                }
                className="self-start rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 sm:self-auto"
              >
                Enable All
              </button>
            </div>

            <div className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                Select the actions this user can perform in each module.
                Disabled actions are not permitted for that module.
              </p>

              {permissionLoadError ? (
                <div className="rounded-lg border border-destructive/40 p-4 text-sm">
                  <p className="font-medium">
                    Permissions could not be loaded.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Refresh the page or try again before saving changes.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      loadUserPermissions(selectedUser.id, role)
                    }
                    className="mt-3 rounded-md border px-3 py-2 hover:bg-muted"
                  >
                    Retry
                  </button>
                </div>
              ) : loadingPermissions ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Loading user permissions...
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[650px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-4 py-3 text-left font-medium">
                            Module
                          </th>
                          {permissionFields.map(({ field, label }) => (
                            <th
                              key={field}
                              className="px-4 py-3 text-center font-medium"
                            >
                              {label}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-center font-medium">
                            All
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {permissions.map((permission) => {
                          const allAllowedFieldsChecked =
                            permissionFields
                              .filter(
                                ({ field }) =>
                                  !isPermissionDisabled(
                                    permission.module,
                                    field
                                  )
                              )
                              .every(
                                ({ field }) => permission[field]
                              )

                          return (
                            <tr
                              key={permission.module}
                              className="border-b last:border-0"
                            >
                              <td className="px-4 py-3 font-medium">
                                {permission.module}
                              </td>

                              {permissionFields.map(({ field, label }) => {
                                const disabled = isPermissionDisabled(
                                  permission.module,
                                  field
                                )

                                return (
                                  <td
                                    key={field}
                                    className="px-4 py-3 text-center"
                                  >
                                    <input
                                      type="checkbox"
                                      aria-label={`${label} permission for ${permission.module}`}
                                      checked={permission[field]}
                                      disabled={disabled || saving}
                                      title={
                                        disabled
                                          ? `${label} is not available for ${permission.module}`
                                          : `${label} ${permission.module}`
                                      }
                                      onChange={(e) =>
                                        updatePermission(
                                          permission.module,
                                          field,
                                          e.target.checked
                                        )
                                      }
                                      className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-30"
                                    />
                                  </td>
                                )
                              })}

                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  aria-label={`All available permissions for ${permission.module}`}
                                  checked={allAllowedFieldsChecked}
                                  onChange={(e) =>
                                    toggleModulePermissions(
                                      permission.module,
                                      e.target.checked
                                    )
                                  }
                                  disabled={saving}
                                  title={`Toggle all available permissions for ${permission.module}`}
                                  className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {permissions.filter((p) => p.can_view).length} of{' '}
                      {modules.length} modules have View enabled.
                    </p>

                    <button
                      type="button"
                      onClick={() => toggleAllPermissions(false)}
                      disabled={saving}
                      className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                      Clear All Permissions
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Actions */}

          <div className="flex items-center justify-between rounded-xl border bg-background px-6 py-4">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center gap-2 rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearSelection}
                disabled={saving || deleting}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={
                  saving ||
                  loadingPermissions ||
                  permissionLoadError
                }
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
