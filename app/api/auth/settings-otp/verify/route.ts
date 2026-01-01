import { NextRequest, NextResponse } from 'next/server'
import { baseCookieOptions, issueSession, SETTINGS_SESSION_COOKIE, validateOtp } from '@/lib/settings-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const otp = (body?.otp ?? '').toString().trim()

    if (!otp || otp.length !== 6) {
      return NextResponse.json({ ok: false, error: 'Enter the 6-digit code' }, { status: 400 })
    }

    const result = validateOtp(otp)

    if (!result.valid) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired code' }, { status: 400 })
    }

    const { token: sessionToken, expiresAt } = issueSession()
    const res = NextResponse.json({ ok: true, expiresAt })
    const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000))
    res.cookies.set(SETTINGS_SESSION_COOKIE, sessionToken, { ...baseCookieOptions, maxAge, expires: new Date(expiresAt) })
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify code'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

