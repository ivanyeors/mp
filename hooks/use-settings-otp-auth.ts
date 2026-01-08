"use client"

import { useCallback, useEffect, useState } from "react"

export type SettingsOtpAuthStatus = "checking" | "authed" | "unauth"

type SessionResponse = {
  authenticated: boolean
  expiresAt?: number | null
  error?: string
}

export function useSettingsOtpAuth(options?: { autoCheck?: boolean }) {
  const autoCheck = options?.autoCheck ?? true

  const [status, setStatus] = useState<SettingsOtpAuthStatus>("checking")
  const [otp, setOtp] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const authenticated = status === "authed"

  const checkSession = useCallback(async () => {
    try {
      setStatus("checking")
      const res = await fetch("/api/auth/settings-otp/session", { method: "GET", cache: "no-store" })
      const data = (await res.json()) as SessionResponse
      setStatus(data.authenticated ? "authed" : "unauth")
    } catch (e) {
      console.error(e)
      setStatus("unauth")
    }
  }, [])

  const verifyOtp = useCallback(async () => {
    if (otp.length !== 6) {
      setError("Enter the 6-digit code.")
      return { ok: false as const }
    }
    try {
      setVerifying(true)
      setError(null)
      const res = await fetch("/api/auth/settings-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Invalid code. Try again.")
        return { ok: false as const }
      }
      setStatus("authed")
      setOtp("")
      return { ok: true as const }
    } catch (e) {
      console.error(e)
      setError("Unable to verify the code. Try again.")
      return { ok: false as const }
    } finally {
      setVerifying(false)
    }
  }, [otp])

  useEffect(() => {
    if (!autoCheck) return
    checkSession()
  }, [autoCheck, checkSession])

  return {
    status,
    authenticated,
    otp,
    setOtp,
    verifying,
    error,
    setError,
    checkSession,
    verifyOtp,
  }
}

