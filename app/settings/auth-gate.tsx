"use client"

import { useEffect, useMemo, useState } from "react"
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, Clock3 } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"

type Props = {
  children: React.ReactNode
}

type SessionResponse = {
  authenticated: boolean
  expiresAt?: number | null
  error?: string
}

export default function SettingsAuthGate({ children }: Props) {
  const [status, setStatus] = useState<"checking" | "authed" | "unauth">("checking")
  const [otp, setOtp] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null)

  useEffect(() => {
    checkSession()
  }, [])

  const formattedExpiry = useMemo(() => {
    if (!sessionExpiry) return null
    try {
      return new Date(sessionExpiry).toLocaleString()
    } catch {
      return null
    }
  }, [sessionExpiry])

  async function checkSession() {
    try {
      const res = await fetch("/api/auth/settings-otp/session", { method: "GET", cache: "no-store" })
      const data = (await res.json()) as SessionResponse
      if (data.authenticated) {
        setStatus("authed")
        setSessionExpiry(data.expiresAt ?? null)
      } else {
        setStatus("unauth")
        setSessionExpiry(null)
      }
    } catch (e) {
      console.error(e)
      setStatus("unauth")
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      setError("Enter the 6-digit code.")
      return
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
        return
      }
      setStatus("authed")
      setSessionExpiry(data?.expiresAt ?? null)
      setOtp("")
    } catch (e) {
      console.error(e)
      setError("Unable to verify the code. Try again.")
    } finally {
      setVerifying(false)
    }
  }

  if (status === "authed") {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-xl border-border/60 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Secure access
          </CardTitle>
          <CardDescription>
            Authenticate with Telegram OTP to open Settings. Login stays active for 3 days on this device.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {status === "checking" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking session...
            </div>
          ) : null}

          {error ? (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-3">
            <label className="text-sm font-medium" htmlFor="settings-otp-input">
              Enter code
            </label>
            <div className="flex flex-col gap-3">
              <InputOTP
                id="settings-otp-input"
                maxLength={6}
                value={otp}
                onChange={setOtp}
                disabled={verifying || status === "checking"}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-10 w-10 text-base" />
                  <InputOTPSlot index={1} className="h-10 w-10 text-base" />
                  <InputOTPSlot index={2} className="h-10 w-10 text-base" />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} className="h-10 w-10 text-base" />
                  <InputOTPSlot index={4} className="h-10 w-10 text-base" />
                  <InputOTPSlot index={5} className="h-10 w-10 text-base" />
                </InputOTPGroup>
              </InputOTP>
              <Button
                onClick={verifyOtp}
                disabled={verifying || status === "checking"}
                className="w-full sm:w-auto"
              >
                {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verify & continue
              </Button>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>Request the code in Telegram by sending /otp to the bot.</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            <span>Your login is remembered for 3 days per device.</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

