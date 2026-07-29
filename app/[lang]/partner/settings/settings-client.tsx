"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload, CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LOGO_GUIDELINES, checkLogoFile } from "@/lib/partner-upload/limits";
import { checkPayoutImage } from "@/lib/payout-upload/limits";

type Profile = {
  name: string;
  description: string;
  address: string;
  postal_code: string;
  logo_url: string | null;
};

type PaymentDetails = {
  qrUrl: string | null;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
};

export function PartnerSettingsClient({
  whatsappNumber,
  initialProfile,
  backupEmail,
  paymentDetails,
}: {
  whatsappNumber: string;
  initialProfile: Profile;
  backupEmail: { email: string | null; verified: boolean; pending: string | null };
  paymentDetails: PaymentDetails;
}) {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const err = checkLogoFile(file);
    if (err) return toast.error(err);

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/partner/logo", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        set("logo_url", json.url as string);
        toast.success("Logo uploaded — Save to publish it.");
      } else {
        toast.error(json?.error ?? "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    if (!profile.name.trim()) return toast.error("Company name is required.");
    setSavingProfile(true);
    try {
      const res = await fetch("/api/partner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) toast.success("Profile saved. Your public listing is updated.");
      else toast.error(json?.error ?? "Save failed");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your public listing, sign-in, and support.
        </p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
          <CardDescription>
            Shown on <span className="font-mono">/our-partners</span> and the booking picker.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" value={profile.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-4">
              {profile.logo_url ? (
                <Image
                  src={profile.logo_url}
                  alt="Logo preview"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-md border object-contain"
                  unoptimized
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-md border text-xs text-muted-foreground">
                  None
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onPickLogo}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload logo
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">{LOGO_GUIDELINES}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Write-up</Label>
            <Textarea
              id="description"
              rows={5}
              value={profile.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Tell patients about your practice."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={profile.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal">Postal code</Label>
              <Input id="postal" value={profile.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
            </div>
          </div>

          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </CardContent>
      </Card>

      {/* Payout details */}
      <PayoutDetailsCard initial={paymentDetails} />

      {/* Backup email */}
      <BackupEmailCard initial={backupEmail} />

      {/* Support */}
      <Card>
        <CardHeader>
          <CardTitle>Support</CardTitle>
          <CardDescription>Message the Mpillow team on WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Chat on WhatsApp
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PayoutDetailsCard({ initial }: { initial: PaymentDetails }) {
  const [qrUrl, setQrUrl] = useState<string | null>(initial.qrUrl);
  const [bank, setBank] = useState({
    bank_name: initial.bank_name,
    bank_account_name: initial.bank_account_name,
    bank_account_number: initial.bank_account_number,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const qrRef = useRef<HTMLInputElement>(null);

  async function onPickQr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (qrRef.current) qrRef.current.value = "";
    if (!file) return;
    const err = checkPayoutImage(file);
    if (err) return toast.error(err);

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/partner/payment-details", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setQrUrl(json.qrUrl as string);
        toast.success("PayNow QR saved.");
      } else {
        toast.error(json?.error ?? "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  async function saveBank() {
    setSaving(true);
    try {
      const res = await fetch("/api/partner/payment-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bank),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) toast.success("Bank details saved.");
      else toast.error(json?.error ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payout details</CardTitle>
        <CardDescription>
          How we pay your released commission. Only the Mpillow team can see these —
          never other partners or the public.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>PayNow QR</Label>
          <div className="flex items-center gap-4">
            {qrUrl ? (
              <Image
                src={qrUrl}
                alt="PayNow QR"
                width={96}
                height={96}
                className="h-24 w-24 rounded-md border object-contain"
                unoptimized
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-md border text-xs text-muted-foreground">
                None
              </div>
            )}
            <div>
              <input
                ref={qrRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onPickQr}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => qrRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {qrUrl ? "Replace QR" : "Upload QR"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, or WebP, up to 10 MB.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank name</Label>
            <Input
              id="bank_name"
              value={bank.bank_name}
              onChange={(e) => setBank((b) => ({ ...b, bank_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account_name">Account holder name</Label>
            <Input
              id="bank_account_name"
              value={bank.bank_account_name}
              onChange={(e) => setBank((b) => ({ ...b, bank_account_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bank_account_number">Account number</Label>
            <Input
              id="bank_account_number"
              value={bank.bank_account_number}
              onChange={(e) => setBank((b) => ({ ...b, bank_account_number: e.target.value }))}
            />
          </div>
        </div>

        <Button onClick={saveBank} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save bank details
        </Button>
      </CardContent>
    </Card>
  );
}

function BackupEmailCard({
  initial,
}: {
  initial: { email: string | null; verified: boolean; pending: string | null };
}) {
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(
    initial.verified ? initial.email : null,
  );
  const [email, setEmail] = useState(initial.pending ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(Boolean(initial.pending));
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!email.trim()) return toast.error("Enter an email address.");
    setBusy(true);
    try {
      const res = await fetch("/api/partner/backup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setSent(true);
        toast.success("Code sent — check that inbox.");
      } else {
        toast.error(json?.error ?? "Could not send code");
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      const res = await fetch("/api/partner/backup-email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setVerifiedEmail(json.backup_email as string);
        setSent(false);
        setCode("");
        toast.success("Backup email verified.");
      } else {
        toast.error(json?.error ?? "Verification failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup email</CardTitle>
        <CardDescription>
          A second address you can sign in with — both reach this same account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {verifiedEmail && (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="font-medium">{verifiedEmail}</span>
            <span className="text-muted-foreground">verified</span>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="backup">{verifiedEmail ? "Change backup email" : "Add a backup email"}</Label>
          <div className="flex gap-2">
            <Input
              id="backup"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Button type="button" variant="outline" onClick={sendCode} disabled={busy}>
              {sent ? "Resend" : "Send code"}
            </Button>
          </div>
        </div>

        {sent && (
          <div className="space-y-2">
            <Label htmlFor="code">Enter the 6-digit code</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
              />
              <Button type="button" onClick={verify} disabled={busy || code.length !== 6}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
