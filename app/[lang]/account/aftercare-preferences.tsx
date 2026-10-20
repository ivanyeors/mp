"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { normalizePhone } from "@/lib/appointments/phone";
import {
  AFTERCARE_EMAIL_LABEL,
  aftercareWhatsAppWording,
  mobileForWording,
  type AftercarePreference,
} from "@/lib/aftercare/state";
import { setMyAftercarePreference } from "./actions";

type Props = {
  email: boolean;
  whatsapp: boolean;
  /** `customers.phone` as stored, which may be missing or not a mobile. */
  phone: string | null;
};

/**
 * The Profile's Aftercare messages card (PRD customer-crm slice 13): the only
 * place a customer turns aftercare off, or WhatsApp on, themselves.
 *
 * The WhatsApp toggle shows exactly what they agree to, with their number in
 * it, and that text is what the server stores as the evidence. With no valid
 * mobile on file, turning it on asks for the number first.
 */
export function AftercarePreferences({ email: initialEmail, whatsapp: initialWhatsapp, phone: initialPhone }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp);
  const [phone, setPhone] = useState(initialPhone);
  const [askMobile, setAskMobile] = useState(false);
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onFile = normalizePhone(phone);
  const typed = normalizePhone(mobile);
  // The number the wording names: the one on file, else the one being typed.
  const wordingNumber = onFile ?? (askMobile ? typed : null);

  const save = (preference: AftercarePreference, value: boolean, withMobile?: string) => {
    setError(null);
    startTransition(async () => {
      const result = await setMyAftercarePreference({ preference, value, mobile: withMobile });
      if (!result.ok) {
        if (result.needsMobile) setAskMobile(true);
        setError(result.error);
        return;
      }
      setEmail(result.email);
      setWhatsapp(result.whatsapp);
      setPhone(result.phone);
      setAskMobile(false);
      setMobile("");
    });
  };

  const toggleWhatsapp = (next: boolean) => {
    if (next && !onFile) {
      // A mobile first; nothing is saved until they confirm it.
      setError(null);
      setAskMobile(true);
      return;
    }
    save("aftercare_whatsapp", next);
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Aftercare messages</h2>
      <div className="divide-y rounded-lg border">
        <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
          <Label htmlFor="aftercare-email" className="font-medium">
            {AFTERCARE_EMAIL_LABEL}
          </Label>
          <Switch
            id="aftercare-email"
            checked={email}
            disabled={pending}
            onCheckedChange={(next) => save("aftercare_email", next)}
          />
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="aftercare-whatsapp" className="font-medium">
                WhatsApp
              </Label>
              {wordingNumber ? (
                <p className="text-sm text-muted-foreground">
                  {aftercareWhatsAppWording(mobileForWording(wordingNumber))}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Add a mobile number to turn this on.</p>
              )}
            </div>
            <Switch
              id="aftercare-whatsapp"
              checked={whatsapp}
              disabled={pending || (askMobile && !whatsapp)}
              onCheckedChange={toggleWhatsapp}
            />
          </div>

          {askMobile && !whatsapp ? (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed) save("aftercare_whatsapp", true, typed);
              }}
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="aftercare-mobile">Mobile number</Label>
                <Input
                  id="aftercare-mobile"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="8123 4567"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending || !typed}>
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Turn on WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setAskMobile(false);
                    setMobile("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
