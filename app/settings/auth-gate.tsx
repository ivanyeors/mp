"use client"

import { Loader2, AlertCircle, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { useSettingsOtpAuth } from "@/hooks/use-settings-otp-auth"

type Props = {
  children: React.ReactNode
}

export default function SettingsAuthGate({ children }: Props) {
  const router = useRouter()
  const { status, otp, setOtp, verifying, error, verifyOtp } = useSettingsOtpAuth()

  if (status === "authed") {
    return <>{children}</>
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <Card className="relative w-[min(92vw,28rem)] border-border/60 py-4 shadow-md sm:py-6">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={() => router.push("/")}
          className="absolute right-2 top-2 h-8 w-8 text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
        <CardHeader className="items-center px-4 pb-2 text-center sm:px-6">
          <CardTitle className="text-lg">Login</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5 px-4 text-center sm:px-6">
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
            <div className="flex flex-col items-center gap-4">
              <InputOTP
                id="settings-otp-input"
                maxLength={6}
                value={otp}
                onChange={setOtp}
                disabled={verifying || status === "checking"}
                className="justify-center"
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
      </Card>
    </div>
  )
}

