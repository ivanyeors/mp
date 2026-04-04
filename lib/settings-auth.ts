import { createHmac, timingSafeEqual } from 'crypto'

type SignedPayload<T> = { payload: T; token: string }

type SessionCookiePayload = {
  issuedAt: number
  expiresAt: number
}

const SESSION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
const TOTP_STEP_MS = 30 * 1000 // 30s step
const TOTP_WINDOW_STEPS = 1 // allow +/- 1 step (roughly ±30s)

export const SETTINGS_SESSION_COOKIE = 'mp_settings_session'

export const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

function getSecret(): string {
  const secret = process.env.SETTINGS_AUTH_SECRET
  if (!secret) throw new Error('Missing SETTINGS_AUTH_SECRET env var')
  return secret
}

function signPayload<T extends object>(payload: T): SignedPayload<T> {
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const secret = getSecret()
  const sig = createHmac('sha256', secret).update(raw).digest('base64url')
  return { payload, token: `${raw}.${sig}` }
}

function verifySignedPayload<T>(token?: string | null): T | null {
  if (!token) return null
  const [raw, providedSig] = token.split('.')
  if (!raw || !providedSig) return null
  const secret = getSecret()
  const expectedSig = createHmac('sha256', secret).update(raw).digest('base64url')
  if (expectedSig.length !== providedSig.length) return null
  const a = Buffer.from(expectedSig)
  const b = Buffer.from(providedSig)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as T
    return parsed
  } catch {
    return null
  }
}

function hotp(counter: number, secret: string, digits = 6): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha256', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return (code % 10 ** digits).toString().padStart(digits, '0')
}

function currentCounter(now = Date.now()) {
  return Math.floor(now / TOTP_STEP_MS)
}

export function currentOtp(): { code: string; expiresAt: number } {
  const secret = getSecret()
  const counter = currentCounter()
  const code = hotp(counter, secret, 6)
  const expiresAt = (counter + 1) * TOTP_STEP_MS
  return { code, expiresAt }
}

export function validateOtp(code: string): { valid: boolean } {
  if (!code || code.length !== 6) return { valid: false }
  const secret = getSecret()
  const nowCounter = currentCounter()
  for (let delta = -TOTP_WINDOW_STEPS; delta <= TOTP_WINDOW_STEPS; delta++) {
    const candidate = hotp(nowCounter + delta, secret, 6)
    if (candidate === code) return { valid: true }
  }
  return { valid: false }
}

export function issueSession(): { token: string; expiresAt: number } {
  const now = Date.now()
  const expiresAt = now + SESSION_WINDOW_MS
  const payload: SessionCookiePayload = { issuedAt: now, expiresAt }
  const { token } = signPayload(payload)
  return { token, expiresAt }
}

export function validateSession(token?: string | null): { valid: boolean; expiresAt?: number; reason?: string } {
  const payload = verifySignedPayload<SessionCookiePayload>(token)
  if (!payload) return { valid: false, reason: 'missing' }
  if (!payload.expiresAt) return { valid: false, reason: 'invalid' }
  if (Date.now() > payload.expiresAt) return { valid: false, reason: 'expired' }
  return { valid: true, expiresAt: payload.expiresAt }
}

