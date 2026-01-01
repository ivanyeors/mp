import { NextResponse } from 'next/server'
import { baseCookieOptions, SETTINGS_SESSION_COOKIE } from '@/lib/settings-auth'

export const runtime = 'nodejs'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SETTINGS_SESSION_COOKIE, '', { ...baseCookieOptions, maxAge: 0 })
  return res
}

