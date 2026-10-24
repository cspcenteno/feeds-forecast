
import { NextResponse } from 'next/server'

import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'
import {
  defaultPermissions,
  disabledPermissions,
  modules,
} from '@/lib/authorization-rules'

type Role = 'User' | 'Superuser' | 'Manager' | 'Admin'

type PermissionInput = {
  module: string
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_delete: boolean
}

const validRoles: Role[] = ['User', 'Superuser', 'Manager', 'Admin']

const permissionFields = [
  'can_view',
  'can_add',
  'can_edit',
  'can_delete',
] as const

type PermissionField = (typeof permissionFields)[number]

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizePermissions(
  input: PermissionInput[],
): PermissionInput[] | null {
  if (!Array.isArray(input)) return null

  const validModules = modules as readonly string[]
  const seen = new Set<string>()

  const normalized: PermissionInput[] = []

  for (const item of input) {
    if (
      !item ||
      typeof item.module !== 'string' ||
      !validModules.includes(item.module) ||
      seen.has(item.module)
    ) {
      return null
    }

    seen.add(item.module)

    for (const field of permissionFields) {
      if (typeof item[field] !== 'boolean') {
        return null
      }
    }

    const result: PermissionInput = {
      module: item.module,
      can_view: item.can_view,
      can_add: item.can_add,
      can_edit: item.can_edit,
      can_delete: item.can_delete,
    }

    for (const field of permissionFields) {
      const action = field.replace('can_', '') as
        | 'view'
        | 'add'
        | 'edit'
        | 'delete'

      const unavailable = (
        disabledPermissions as Record<string, string[]>
      )[item.module] ?? []

      if (unavailable.includes(action)) {
        result[field] = false
      }
    }

    normalized.push(result)
  }

  // Require a complete set so accidentally missing modules
  // do not silently lose their saved permissions.
  if (normalized.length !== validModules.length) return null

  return normalized
}

async function getActiveAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      error: NextResponse.json(
        { error: 'You must be signed in to perform this action.' },
        { status: 401 },
      ),
      user: null,
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (
    profileError ||
    !profile ||
    profile.role !== 'Admin' ||
    !profile.is_active
  ) {
    return {
      error: NextResponse.json(
        { error: 'Only active administrators can manage users.' },
        { status: 403 },
      ),
      user: null,
    }
  }

  return { error: null, user }
}

async function canManageModule(
  userId: string,
  action: 'can_add' | 'can_edit',
) {
  const { data, error } = await supabaseAdmin
    .from('user_permissions')
    .select('can_add, can_edit, is_default')
    .eq('user_id', userId)
    .eq('module', 'Users')

  if (error) {
    throw new Error(`Unable to verify administrator permissions: ${error.message}`)
  }

  // When no custom permissions are saved, use the shared Admin defaults.
  if (!data || data.length === 0 || data.every((item) => item.is_default)) {
    const defaults = defaultPermissions('Admin') as Record<
      string,
      { add: boolean; edit: boolean }
    >

    return action === 'can_add'
      ? Boolean(defaults.Users?.add)
      : Boolean(defaults.Users?.edit)
  }

  return data.some((item) => Boolean(item[action]))
}

async function validateRegion(
  role: Role,
  regionId: number | null,
  subregionId: number | null,
) {
  if (role === 'Admin') {
    return { valid: regionId === null && subregionId === null }
  }

  if (!Number.isInteger(regionId) || regionId === null) {
    return { valid: false }
  }

  const { data: region, error: regionError } = await supabaseAdmin
    .from('regions')
    .select('id')
    .eq('id', regionId)
    .eq('is_active', true)
    .maybeSingle()

  if (regionError || !region) return { valid: false }

  if (subregionId === null) return { valid: true }

  if (!Number.isInteger(subregionId)) return { valid: false }

  const { data: subregion, error: subregionError } = await supabaseAdmin
    .from('subregions')
    .select('id')
    .eq('id', subregionId)
    .eq('region_id', regionId)
    .eq('is_active', true)
    .maybeSingle()

  if (subregionError || !subregion) return { valid: false }

  return { valid: true }
}

function errorResponse(error: unknown, fallback: string) {
  console.error(fallback, error)

  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : fallback,
    },
    { status: 500 },
  )
}

/**
 * POST /api/admin/users
 * Create an Auth account, profile, and initial permissions.
 */
export async function POST(request: Request) {
  const auth = await getActiveAdmin()

  if (auth.error || !auth.user) {
    return auth.error
  }

  let createdAuthUserId: string | null = null

  try {
    if (!(await canManageModule(auth.user.id, 'can_add'))) {
      return NextResponse.json(
        { error: 'You do not have permission to add users.' },
        { status: 403 },
      )
    }

    const body = await request.json()

    const fullName =
      typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const temporaryPassword =
      typeof body.temporaryPassword === 'string'
        ? body.temporaryPassword
        : ''
    const position =
      typeof body.position === 'string' ? body.position.trim() : ''
    const role = body.role as Role
    const regionId =
      role === 'Admin'
        ? null
        : Number.isInteger(body.regionId)
          ? body.regionId
          : null
    const subregionId =
      role === 'Admin' || body.subregionId == null
        ? null
        : Number.isInteger(body.subregionId)
          ? body.subregionId
          : null

    if (!fullName || fullName.length > 150) {
      return NextResponse.json(
        { error: 'Enter a full name of up to 150 characters.' },
        { status: 400 },
      )
    }

    if (!email || email.length > 254 || !isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Enter a valid email address.' },
        { status: 400 },
      )
    }

    if (temporaryPassword.length < 8 || temporaryPassword.length > 128) {
      return NextResponse.json(
        { error: 'The temporary password must be between 8 and 128 characters.' },
        { status: 400 },
      )
    }

    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Please select a valid role.' },
        { status: 400 },
      )
    }

    if (position.length > 150) {
      return NextResponse.json(
        { error: 'Position must not exceed 150 characters.' },
        { status: 400 },
      )
    }

    const regionValidation = await validateRegion(
      role,
      regionId,
      subregionId,
    )

    if (!regionValidation.valid) {
      return NextResponse.json(
        { error: 'Select a valid region and subregion.' },
        { status: 400 },
      )
    }

    const permissions = normalizePermissions(body.permissions)

    if (!permissions) {
      return NextResponse.json(
        { error: 'The permissions submitted are invalid or incomplete.' },
        { status: 400 },
      )
    }

    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })

    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message ?? 'Unable to create the authentication account.' },
        { status: 400 },
      )
    }

    createdAuthUserId = created.user.id

    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: created.user.id,
        email,
        full_name: fullName,
        position: position || null,
        role,
        region_id: regionId,
        subregion_id: subregionId,
        is_active: false,
        must_change_password: true,
      })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      createdAuthUserId = null

      return NextResponse.json(
        { error: `Unable to create the user profile: ${profileError.message}` },
        { status: 500 },
      )
    }

    const permissionRecords = permissions.map((permission) => ({
      user_id: created.user!.id,
      module: permission.module,
      can_view: permission.can_view,
      can_add: permission.can_add,
      can_edit: permission.can_edit,
      can_delete: permission.can_delete,
      is_default: false,
      updated_at: new Date().toISOString(),
    }))

    const { error: permissionError } = await supabaseAdmin
      .from('user_permissions')
      .upsert(permissionRecords, { onConflict: 'user_id,module' })

    if (permissionError) {
      await supabaseAdmin.from('user_permissions').delete()
        .eq('user_id', created.user.id)

      await supabaseAdmin.from('users').delete()
        .eq('id', created.user.id)

      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      createdAuthUserId = null

      return NextResponse.json(
        { error: `Unable to save initial permissions: ${permissionError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: created.user.id,
          email,
          full_name: fullName,
          position: position || null,
          role,
          region_id: regionId,
          subregion_id: subregionId,
          is_active: false,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    // Avoid leaving an Auth account behind after an unexpected failure.
    if (createdAuthUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId)
    }

    return errorResponse(error, 'Unable to create the user.')
  }
}

/**
 * PATCH /api/admin/users
 * Update a user's profile and module permissions.
 */
export async function PATCH(request: Request) {
  const auth = await getActiveAdmin()

  if (auth.error || !auth.user) {
    return auth.error
  }

  try {
    if (!(await canManageModule(auth.user.id, 'can_edit'))) {
      return NextResponse.json(
        { error: 'You do not have permission to edit users.' },
        { status: 403 },
      )
    }

    const body = await request.json()

    const userId =
      typeof body.userId === 'string' ? body.userId.trim() : ''
    const fullName =
      typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const position =
      typeof body.position === 'string' ? body.position.trim() : ''
    const role = body.role as Role
    const isActive = body.isActive

    if (!userId) {
      return NextResponse.json(
        { error: 'A user ID is required.' },
        { status: 400 },
      )
    }

    if (!fullName || fullName.length > 150) {
      return NextResponse.json(
        { error: 'Enter a full name of up to 150 characters.' },
        { status: 400 },
      )
    }

    if (position.length > 150) {
      return NextResponse.json(
        { error: 'Position must not exceed 150 characters.' },
        { status: 400 },
      )
    }

    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Please select a valid role.' },
        { status: 400 },
      )
    }

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'The account status is invalid.' },
        { status: 400 },
      )
    }

    // Prevent an administrator from accidentally locking themselves out.
    if (userId === auth.user.id && (role !== 'Admin' || !isActive)) {
      return NextResponse.json(
        { error: 'You cannot remove your own Admin role or deactivate your own account.' },
        { status: 400 },
      )
    }

    const regionId =
      role === 'Admin'
        ? null
        : Number.isInteger(body.regionId)
          ? body.regionId
          : null
    const subregionId =
      role === 'Admin' || body.subregionId == null
        ? null
        : Number.isInteger(body.subregionId)
          ? body.subregionId
          : null

    const regionValidation = await validateRegion(
      role,
      regionId,
      subregionId,
    )

    if (!regionValidation.valid) {
      return NextResponse.json(
        { error: 'Select a valid region and subregion.' },
        { status: 400 },
      )
    }

    const permissions = normalizePermissions(body.permissions)

    if (!permissions) {
      return NextResponse.json(
        { error: 'The permissions submitted are invalid or incomplete.' },
        { status: 400 },
      )
    }

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (targetError) {
      throw new Error(`Unable to verify the selected user: ${targetError.message}`)
    }

    if (!targetUser) {
      return NextResponse.json(
        { error: 'The selected user could not be found.' },
        { status: 404 },
      )
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        full_name: fullName,
        position: position || null,
        role,
        region_id: regionId,
        subregion_id: subregionId,
        is_active: isActive,
      })
      .eq('id', userId)
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
      .maybeSingle()

    if (updateError) {
      throw new Error(`Unable to update user details: ${updateError.message}`)
    }

    if (!updatedUser) {
      return NextResponse.json(
        { error: 'The selected user was not updated.' },
        { status: 404 },
      )
    }

    const permissionRecords = permissions.map((permission) => ({
      user_id: userId,
      module: permission.module,
      can_view: permission.can_view,
      can_add: permission.can_add,
      can_edit: permission.can_edit,
      can_delete: permission.can_delete,
      is_default: false,
      updated_at: new Date().toISOString(),
    }))

    const { error: permissionError } = await supabaseAdmin
      .from('user_permissions')
      .upsert(permissionRecords, { onConflict: 'user_id,module' })

    if (permissionError) {
      console.error('User profile saved, but permission save failed:', permissionError)

      return NextResponse.json(
        {
          error: `User details were saved, but permissions could not be saved: ${permissionError.message}`,
          user: updatedUser,
          profileSaved: true,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error) {
    return errorResponse(error, 'Unable to update the user.')
  }
}
