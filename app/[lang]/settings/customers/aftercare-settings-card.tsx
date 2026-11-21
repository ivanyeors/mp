"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CHECKUP_EMAIL_SKIP_LABELS,
  CHECKUP_LIMITS,
  CHECKUP_SKIP_LABELS,
  CHECKUP_WHATSAPP_SKIP_LABELS,
  type CheckupReport,
} from "@/lib/aftercare/checkup";
import {
  EMAIL_SKIP_LABELS,
  REVIEW_REQUEST_LIMITS,
  WHATSAPP_SKIP_LABELS,
  type ReviewRequestReport,
} from "@/lib/aftercare/review-request";
import type { AftercareCardData, AftercareSettingsPatch } from "@/lib/aftercare/settings";

export function AftercareSettingsCard({
  canEdit,
  initialData,
}: {
  canEdit: boolean;
  initialData?: AftercareCardData;
}) {
  const [data, setData] = useState<AftercareCardData | null>(initialData ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    fetchAftercareCard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Couldn't load the aftercare settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  async function save(patch: AftercareSettingsPatch) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/customers/aftercare", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't save.");
      toast.success("Saved");
      const next = await fetchAftercareCard().catch(() => null);
      setData((d) => next ?? (d ? { ...d, settings: payload.settings } : d));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="min-w-0 gap-4 p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-medium">Aftercare</h2>
        <InfoTip label="About Aftercare">
          Service messages about something a customer bought, by email and, for customers who opted
          in, WhatsApp. They never carry an offer. Each customer can switch either channel off in
          their profile, or ask staff to.
        </InfoTip>
      </div>

      {!data ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <ReviewRequestSection
            key={JSON.stringify(data.settings.reviewRequests)}
            data={data}
            canEdit={canEdit}
            saving={saving}
            onSave={save}
          />
          <CheckupSection
            key={JSON.stringify(data.settings.checkups)}
            data={data}
            canEdit={canEdit}
            saving={saving}
            onSave={save}
          />
        </>
      )}
    </Card>
  );
}

function CheckupSection({
  data,
  canEdit,
  saving,
  onSave,
}: {
  data: AftercareCardData;
  canEdit: boolean;
  saving: boolean;
  onSave: (patch: AftercareSettingsPatch) => Promise<void>;
}) {
  const s = data.settings.checkups;
  const { today, last90 } = data.checkups;
  const [months, setMonths] = useState(String(s.months));
  const dirty = months !== String(s.months);

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="aftercare-checkup-enabled">Check-up reminder</Label>
          <p className="text-xs text-muted-foreground">
            For a Premium Mpillow only: every {plural(s.months, "month")} after delivery, a reminder
            that a re-adjustment keeps it fitted, which says it is a paid visit and states the fee.
            Email goes only to customers with marketing consent; WhatsApp only to those who opted in.
          </p>
          <p className="text-xs text-muted-foreground">{checkupStatusLine(today)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          <Switch
            id="aftercare-checkup-enabled"
            checked={s.enabled}
            disabled={!canEdit || saving}
            onCheckedChange={(v) => void onSave({ checkup_reminders_enabled: v })}
          />
        </div>
      </div>

      <div className="flex min-w-0 items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1 sm:max-w-[50%]">
          <Label htmlFor="aftercare-checkup-months" className="text-xs">
            Months after delivery, and between reminders
          </Label>
          <Input
            id="aftercare-checkup-months"
            type="number"
            inputMode="numeric"
            min={CHECKUP_LIMITS.months.min}
            max={CHECKUP_LIMITS.months.max}
            value={months}
            disabled={!canEdit || saving}
            onChange={(e) => setMonths(e.target.value)}
          />
        </div>
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => void onSave({ checkup_months: Number(months) })}
          >
            Save
          </Button>
        ) : null}
      </div>

      {s.months !== 12 ? (
        <p className="text-xs text-muted-foreground">
          Both messages call the re-adjustment &quot;yearly&quot;, and the WhatsApp wording is approved as
          it is: keep 12 months unless the copy changes too.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{feeLine(today)}</p>
      <p className="text-xs text-muted-foreground">{checkupWhatsAppLine(data)}</p>

      <div className="space-y-1 border-t pt-3 text-xs">
        <p className="font-medium">Last 90 days</p>
        <p className="text-muted-foreground">
          {plural(last90.sent, "check-up")} sent ({last90.email} by email, {last90.whatsapp} by
          WhatsApp); {last90.followedByBooking} followed by a re-adjustment booking.
        </p>
      </div>

      <div className="space-y-1 border-t pt-3 text-xs">
        <p className="font-medium">Today</p>
        <p className="text-muted-foreground">
          {plural(today.candidates, "order")} due, {today.reachable} reachable.
        </p>
        <SkipList
          title="Skipped"
          items={Object.entries(today.skipped).map(([k, n]) => [
            CHECKUP_SKIP_LABELS[k as keyof typeof CHECKUP_SKIP_LABELS],
            n,
          ])}
        />
        <SkipList
          title="Email not sent"
          items={Object.entries(today.emailSkipped).map(([k, n]) => [
            CHECKUP_EMAIL_SKIP_LABELS[k as keyof typeof CHECKUP_EMAIL_SKIP_LABELS],
            n ?? 0,
          ])}
        />
        <SkipList
          title="WhatsApp not sent"
          items={Object.entries(today.whatsappSkipped).map(([k, n]) => [
            CHECKUP_WHATSAPP_SKIP_LABELS[k as keyof typeof CHECKUP_WHATSAPP_SKIP_LABELS],
            n ?? 0,
          ])}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Before switching this on, read the email and the WhatsApp message: one product the customer
        owns, the fee stated plainly, and no discount, offer or other product.
      </p>
    </div>
  );
}

function ReviewRequestSection({
  data,
  canEdit,
  saving,
  onSave,
}: {
  data: AftercareCardData;
  canEdit: boolean;
  saving: boolean;
  onSave: (patch: AftercareSettingsPatch) => Promise<void>;
}) {
  const s = data.settings.reviewRequests;
  const { today, last30, googleReviewsLinked } = data.reviewRequests;
  const [daysAfter, setDaysAfter] = useState(String(s.daysAfter));
  const [maxAgeDays, setMaxAgeDays] = useState(String(s.maxAgeDays));
  const [url, setUrl] = useState(s.googleReviewUrl);

  const dirty =
    daysAfter !== String(s.daysAfter) || maxAgeDays !== String(s.maxAgeDays) || url.trim() !== s.googleReviewUrl;

  function saveFields() {
    const patch: AftercareSettingsPatch = {};
    if (daysAfter !== String(s.daysAfter)) patch.review_request_days_after = Number(daysAfter);
    if (maxAgeDays !== String(s.maxAgeDays)) patch.review_request_max_age_days = Number(maxAgeDays);
    if (url.trim() !== s.googleReviewUrl) patch.google_review_url = url.trim();
    void onSave(patch);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="aftercare-review-enabled">Review request</Label>
          <p className="text-xs text-muted-foreground">
            One message per customer, ever, {s.daysAfter} days after their order is delivered, with
            one button to our Google review form. Everyone who is due is asked the same way.
          </p>
          <p className="text-xs text-muted-foreground">{statusLine(today)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          <Switch
            id="aftercare-review-enabled"
            checked={s.enabled}
            disabled={!canEdit || saving}
            onCheckedChange={(v) => void onSave({ review_requests_enabled: v })}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="aftercare-review-days-after" className="text-xs">
            Days after delivery
          </Label>
          <Input
            id="aftercare-review-days-after"
            type="number"
            inputMode="numeric"
            min={REVIEW_REQUEST_LIMITS.daysAfter.min}
            max={REVIEW_REQUEST_LIMITS.daysAfter.max}
            value={daysAfter}
            disabled={!canEdit || saving}
            onChange={(e) => setDaysAfter(e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="aftercare-review-max-age" className="text-xs">
            Never later than (days)
          </Label>
          <Input
            id="aftercare-review-max-age"
            type="number"
            inputMode="numeric"
            min={REVIEW_REQUEST_LIMITS.maxAgeDays.min}
            max={REVIEW_REQUEST_LIMITS.maxAgeDays.max}
            value={maxAgeDays}
            disabled={!canEdit || saving}
            onChange={(e) => setMaxAgeDays(e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1 sm:col-span-2">
          <Label htmlFor="aftercare-review-url" className="text-xs">
            Google review link
          </Label>
          <Input
            id="aftercare-review-url"
            type="url"
            inputMode="url"
            placeholder="https://g.page/r/…/review"
            value={url}
            disabled={!canEdit || saving}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      </div>
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={saveFields}>
            Save
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{whatsappLine(data)}</p>

      <div className="space-y-1 border-t pt-3 text-xs">
        <p className="font-medium">Last 30 days</p>
        <p className="text-muted-foreground">
          {plural(last30.asked, "customer")} asked ({last30.email} by email, {last30.whatsapp} by
          WhatsApp); {last30.opened} opened the link.
        </p>
        <p className="text-muted-foreground">
          Google reviews linked to a customer we asked, so far:{" "}
          {googleReviewsLinked}
          .
        </p>
      </div>

      <div className="space-y-1 border-t pt-3 text-xs">
        <p className="font-medium">Today</p>
        <p className="text-muted-foreground">
          {plural(today.candidates, "customer")} due, {today.reachable} reachable.
        </p>
        <SkipList title="Skipped" items={[
          ["No email or WhatsApp to reach them", today.skipped.no_channel],
          ["Orders never marked delivered", today.skipped.not_marked_delivered],
        ]} />
        <SkipList
          title="Email not sent"
          items={Object.entries(today.emailSkipped).map(([k, n]) => [EMAIL_SKIP_LABELS[k as keyof typeof EMAIL_SKIP_LABELS], n ?? 0])}
        />
        <SkipList
          title="WhatsApp not sent"
          items={Object.entries(today.whatsappSkipped).map(([k, n]) => [
            WHATSAPP_SKIP_LABELS[k as keyof typeof WHATSAPP_SKIP_LABELS],
            n ?? 0,
          ])}
        />
      </div>

      <p className="border-t pt-3 text-xs text-muted-foreground">
        Open STOP requests on WhatsApp: {data.openStopRequests}. Switch WhatsApp off on each
        customer&apos;s page to close one.
      </p>

      <p className="text-xs text-muted-foreground">
        Before switching this on, read the email and the WhatsApp message against Google&apos;s
        rules: everyone due is asked alike, nothing is offered for a review, and the &quot;need
        anything else?&quot; line is never an alternative to reviewing.
      </p>
    </div>
  );
}

async function fetchAftercareCard(): Promise<AftercareCardData> {
  const res = await fetch("/api/settings/customers/aftercare", { cache: "no-store" });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't load the aftercare settings.");
  return {
    settings: payload.settings,
    reviewRequests: payload.reviewRequests,
    checkups: payload.checkups,
    whatsapp: payload.whatsapp,
    openStopRequests: payload.openStopRequests,
  };
}

function SkipList({ title, items }: { title: string; items: Array<[string, number]> }) {
  const shown = items.filter(([, n]) => n > 0);
  if (shown.length === 0) return null;
  return (
    <p className="text-muted-foreground">
      {title}: {shown.map(([label, n]) => `${label} ${n}`).join("; ")}
    </p>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function statusLine(today: ReviewRequestReport): string {
  if (today.blocked === "disabled") return "Off: nothing is sent. The numbers below are what would go today.";
  if (today.blocked === "no_review_url") return "No usable Google review link (https), so nothing is sent.";
  return "On: due customers are asked in the daily run, at about 10:00 SGT.";
}

function checkupStatusLine(today: CheckupReport): string {
  if (today.blocked === "disabled") return "Off: nothing is sent. The numbers below are what would go today.";
  if (today.blocked === "no_fee") return "No re-adjustment fee to state, so nothing is sent today.";
  return "On: due Premium Mpillow owners are reminded in the daily run, at about 10:00 SGT.";
}

function feeLine(today: CheckupReport): string {
  if (today.fee) return `Fee stated: ${today.fee}, read from Costings → Service fees when each message goes.`;
  return `Fee: none to state (${today.feeError ?? "unknown"}). Set the re-adjustment fee in Costings → Service fees.`;
}

function checkupWhatsAppLine(data: AftercareCardData): string {
  if (!data.whatsapp.senderConfigured) return "WhatsApp: the sender is not set up, so check-ups go by email only.";
  if (!data.whatsapp.checkupTemplate) {
    return "WhatsApp: the template is not approved yet (WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP), so check-ups go by email only.";
  }
  return "WhatsApp: also sent to customers who opted in, unless they asked to stop.";
}

function whatsappLine(data: AftercareCardData): string {
  if (!data.whatsapp.senderConfigured) return "WhatsApp: the sender is not set up, so requests go by email only.";
  if (!data.whatsapp.reviewTemplate) {
    return "WhatsApp: the template is not approved yet (WHATSAPP_TEMPLATE_AFTERCARE_REVIEW), so requests go by email only.";
  }
  return "WhatsApp: also sent to customers who opted in, unless they asked to stop.";
}
