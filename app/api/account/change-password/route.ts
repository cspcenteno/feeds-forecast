
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'

export const runtime = 'nodejs'

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  try {
    // Verify the current user's authenticated session.
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse(
        'Your session has expired. Please sign in again.',
        401,
      )
    }

    // Parse the request body.
    let body: { newPassword?: unknown }

    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid request body.', 400)
    }

    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : ''

    // Validate the new password.
    if (newPassword.length < 8 || newPassword.length > 128) {
      return errorResponse(
        'Your new password must be 8–128 characters long.',
        400,
      )
    }

    // Verify the user's application profile.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id, must_change_password')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('Profile lookup failed:', profileError)
      return errorResponse('Unable to verify your account.', 500)
    }

    if (!profile) {
      return errorResponse(
        'Your user profile could not be found.',
        404,
      )
    }

    // Update the password through the authenticated user's session.
    const { error: passwordError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (passwordError) {
      console.error('Password update failed:', passwordError)

      return errorResponse(
        'Unable to update your password. Please try again.',
        400,
      )
    }

    // Clear the first-login password-change requirement.
    const { error: updateProfileError } = await supabaseAdmin
      .from('users')
      .update({ must_change_password: false })
      .eq('id', user.id)

    if (updateProfileError) {
      console.error(
        'Password flag update failed:',
        updateProfileError,
      )

      return errorResponse(
        'Your password was changed, but your account setup could not be completed. Please contact your administrator.',
        500,
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been changed successfully.',
    })
  } catch (error) {
    console.error('Unexpected password change error:', error)

    return errorResponse(
      'An unexpected error occurred.',
      500,
    )
  }
}
