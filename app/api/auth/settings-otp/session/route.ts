import { NextRequest, NextResponse } from 'next/server'
import { baseCookieOptions, SETTINGS_SESSION_COOKIE, validateSession } from '@/lib/settings-auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(SETTINGS_SESSION_COOKIE)?.value
    const result = validateSession(token)
    const res = NextResponse.json({ authenticated: result.valid, expiresAt: result.expiresAt ?? null })
    if (!result.valid && token) {
      res.cookies.set(SETTINGS_SESSION_COOKIE, '', { ...baseCookieOptions, maxAge: 0 })
    }
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check session'
    return NextResponse.json({ authenticated: false, error: message }, { status: 500 })
  }
}

