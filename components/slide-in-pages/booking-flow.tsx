"use client";

import * as React from "react";
import { CalendarIcon, Check, MapPin } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";

import { useI18n } from "@/lib/i18n/use-i18n";
import { type ApptType } from "@/lib/appointments/appt-type";
import { LANGUAGE_PREFERENCES, type LanguagePreference } from "@/lib/appointments/language";
import { isFreeVisit } from "@/lib/readjustment/eligibility";
import { formatSgd } from "@/lib/readjustment/format";
import {
  ReadjustmentPurchasePicker,
  UNLISTED,
  type PurchaseSelection,
  type ReadjustmentPurchaseOption,
  type UnlistedWhere,
} from "@/components/slide-in-pages/readjustment-purchase-picker";
import { cn } from "@/lib/utils";
import { trackGaEvent } from "@/lib/analytics/ga-events";

export type BookingLocation = { id: string; name: string; type: string; address: string };
type Location = BookingLocation;
type Slot = { id: string; startIso: string; endIso: string };
type DaySuggestion = { date: string; count: number };

function sgtToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseYmdLocal(ymd));
}

function slotLabel(startIso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(startIso));
}

function icsHref(loc: Location, slot: Slot, summaryType: string, eventId: string | null): string {
  const params = new URLSearchParams({
    summary: `Mpillow ${summaryType}`,
    start: slot.startIso,
    end: slot.endIso,
    location: [loc.name, loc.address].filter(Boolean).join(", "),
    description: summaryType,
    uid: eventId ?? `${slot.id}@mpillow`,
  });
  return `/api/appointments/ics?${params.toString()}`;
}

export type ReadjustmentBooking = {
  purchases: ReadjustmentPurchaseOption[];
  fee: number;
  preselect: string | null;
  prefill: { name: string; phone: string; email: string };
};

export function BookingFlow({
  type,
  readjustment,
  locations = [],
}: {
  type: ApptType;
  readjustment?: ReadjustmentBooking;
  locations?: Location[];
}) {
  const { m, locale } = useI18n();
  const router = useRouter();
  const t = m.slides.bookAppointment.flow;
  const rt = m.slides.bookAppointment.readjust;
  const typeLabel = type === "customisation" ? t.customisation : t.readjustment;
  const languageLabel: Record<LanguagePreference, string> = {
    english: t.languageEnglish,
    mandarin: t.languageMandarin,
    none: t.languageNone,
  };

  const [selection, setSelection] = React.useState<PurchaseSelection>(() => {
    if (!readjustment) return null;
    const pre = readjustment.purchases.find((p) => p.orderItemId === readjustment.preselect);
    if (pre) return pre.orderItemId;
    return readjustment.purchases.length === 1 ? readjustment.purchases[0].orderItemId : null;
  });
  const [unlistedWhere, setUnlistedWhere] = React.useState<UnlistedWhere | "">("");
  const [unlistedReference, setUnlistedReference] = React.useState("");
  const selectedPurchase =
    readjustment && selection && selection !== UNLISTED
      ? (readjustment.purchases.find((p) => p.orderItemId === selection) ?? null)
      : null;
  const quote = readjustment
    ? selection === UNLISTED
      ? ({ complimentary: false, fee: readjustment.fee } as const)
      : selectedPurchase?.quote ?? null
    : null;
  const purchaseReady = !readjustment || (selection === UNLISTED ? unlistedWhere !== "" : !!selectedPurchase);

  const [locationId, setLocationId] = React.useState<string>("");
  const [date, setDate] = React.useState<string>("");
  const [dateOpen, setDateOpen] = React.useState(false);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [suggestions, setSuggestions] = React.useState<DaySuggestion[]>([]);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [name, setName] = React.useState(readjustment?.prefill.name ?? "");
  const [phone, setPhone] = React.useState(readjustment?.prefill.phone ?? "");
  const [email, setEmail] = React.useState(readjustment?.prefill.email ?? "");
  const [language, setLanguage] = React.useState<LanguagePreference>("none");
  const [marketingEmail, setMarketingEmail] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState<Location | null>(null);
  const [redirecting, setRedirecting] = React.useState(false);
  const [confirmedEventId, setConfirmedEventId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!date) return;
    let alive = true;
    setSlotsLoading(true);
    setSlot(null);
    fetch(`/api/appointments/slots?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setSlots(d?.ok ? d.slots : []);
        setSuggestions(d?.ok ? (d.suggestions ?? []) : []);
      })
      .catch(() => {
        if (alive) {
          setSlots([]);
          setSuggestions([]);
        }
      })
      .finally(() => {
        if (alive) setSlotsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [date, refreshKey]);

  const location = locations.find((l) => l.id === locationId) ?? null;
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSubmit =
    !!locationId &&
    !!slot &&
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    emailValid &&
    purchaseReady &&
    !submitting;

  async function submitReadjustment() {
    if (!readjustment || !slot || !location || !quote) return;
    const purchase =
      selection === UNLISTED
        ? { unlisted: { where: unlistedWhere, reference: unlistedReference.trim() || undefined } }
        : { order_item_id: selection };
    const res = await fetch(isFreeVisit(quote) ? "/api/readjustments/book" : "/api/readjustments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...purchase,
        location_id: locationId,
        start_iso: slot.startIso,
        end_iso: slot.endIso,
        guest_name: name.trim(),
        phone: phone.trim(),
        language_preference: language,
        marketing_email: marketingEmail,
        locale,
      }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.url) {
      setRedirecting(true);
      window.location.assign(body.url);
      return;
    }
    if (res.ok) {
      setConfirmedEventId(body?.eventId ?? null);
      setConfirmed(location);
      trackGaEvent({
        name: "book_appointment",
        params: { location_id: String(locationId), location_name: location.name, appointment_type: type },
      });
      router.refresh();
      return;
    }
    if (res.status === 409 && ["not_complimentary", "complimentary", "free_visit_taken"].includes(body?.code)) {
      setError(rt.errorRequote);
      router.refresh();
      return;
    }
    if (res.status === 409) {
      setError(t.errorSlotTaken);
      setSlot(null);
      setRefreshKey((k) => k + 1);
      return;
    }
    setError(body?.error ?? t.errorGeneric);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !slot || !location) return;
    setSubmitting(true);
    setError(null);
    if (readjustment) {
      try {
        await submitReadjustment();
      } catch {
        setError(t.errorGeneric);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      const res = await fetch("/api/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          start_iso: slot.startIso,
          end_iso: slot.endIso,
          guest_name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          appointment_type: type,
          language_preference: language,
          marketing_email: marketingEmail,
        }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        setConfirmedEventId(body?.eventId ?? null);
        setConfirmed(location);
        trackGaEvent({
          name: "book_appointment",
          params: { location_id: String(locationId), location_name: location?.name, appointment_type: type },
        });
        return;
      }
      if (res.status === 409) {
        setError(t.errorSlotTaken);
        setSlot(null);
        setRefreshKey((k) => k + 1);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? t.errorGeneric);
      }
    } catch {
      setError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="size-6" />
        </div>
        <p className="text-lg font-medium">{t.confirmedTitle}</p>
        <p className="text-sm text-muted-foreground">
          {slot ? slotLabel(slot.startIso) : ""} {t.confirmedAt} {confirmed.name}
        </p>
        {readjustment ? (
          <p className="text-sm font-medium text-primary">{rt.confirmedFree}</p>
        ) : null}
        {confirmed.address ? (
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            {confirmed.address}
          </p>
        ) : null}
        {slot ? (
          <a
            href={icsHref(confirmed, slot, typeLabel, confirmedEventId)}
            download="appointment.ics"
            className={cn(buttonVariants({ variant: "default" }), "mt-2")}
          >
            {t.saveToCalendar}
          </a>
        ) : null}
        <Button
          variant="outline"
          onClick={() => {
            setConfirmed(null);
            setConfirmedEventId(null);
            setSlot(null);
            setSlots([]);
            setSuggestions([]);
            setDate("");
            setName(readjustment?.prefill.name ?? "");
            setPhone(readjustment?.prefill.phone ?? "");
            setEmail(readjustment?.prefill.email ?? "");
            setLanguage("none");
            setError(null);
          }}
        >
          {t.bookAnother}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-5">
      {readjustment ? (
        <ReadjustmentPurchasePicker
          purchases={readjustment.purchases}
          fee={readjustment.fee}
          selection={selection}
          onSelect={setSelection}
          where={unlistedWhere}
          onWhere={setUnlistedWhere}
          reference={unlistedReference}
          onReference={setUnlistedReference}
          t={rt}
          locale={locale}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-location">{t.locationLabel}</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger id="booking-location" className="w-full">
            <SelectValue placeholder={t.locationPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="flex flex-col">
                  <span>{l.name}</span>
                  {l.address ? (
                    <span className="text-xs text-muted-foreground">{l.address}</span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-date">{t.dateLabel}</Label>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              id="booking-date"
              type="button"
              variant="outline"
              className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 size-4 shrink-0" />
              {date ? dateLabel(date) : t.datePlaceholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={date ? parseYmdLocal(date) : undefined}
              defaultMonth={date ? parseYmdLocal(date) : parseYmdLocal(sgtToday())}
              onSelect={(d) => {
                if (d) setDate(formatYmdLocal(d));
                setDateOpen(false);
              }}
              disabled={{ before: parseYmdLocal(sgtToday()) }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-2" aria-live="polite">
        <Label>{t.slotLabel}</Label>
        {!date ? (
          <p className="text-sm text-muted-foreground">{t.pickDateFirst}</p>
        ) : slotsLoading ? (
          <p className="text-sm text-muted-foreground">{t.loadingSlots}</p>
        ) : slots.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t.noSlots}</p>
            {suggestions.length ? (
              <>
                <p className="text-sm text-muted-foreground">{t.suggestionsIntro}</p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <Button
                      key={s.date}
                      type="button"
                      variant="outline"
                      className="h-auto justify-between py-2 max-md:min-h-11"
                      onClick={() => setDate(s.date)}
                    >
                      <span>{dateLabel(s.date)}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.suggestionTimes.replace("{n}", String(s.count))}
                      </span>
                    </Button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant={slot?.id === s.id ? "default" : "outline"}
                className={cn("h-9 max-md:min-h-11", slot?.id === s.id && "ring-2 ring-ring")}
                onClick={() => setSlot(s)}
              >
                {slotLabel(s.startIso)}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-name">{t.nameLabel}</Label>
        <Input
          id="booking-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-phone">{t.phoneLabel}</Label>
        <Input
          id="booking-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-email">{t.emailLabel}</Label>
        <Input
          id="booking-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          readOnly={!!readjustment}
          aria-describedby={readjustment ? "booking-email-hint" : undefined}
        />
        {readjustment ? (
          <p id="booking-email-hint" className="text-xs text-muted-foreground">
            {rt.emailLocked}
          </p>
        ) : null}
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox
            id="booking-marketing-email"
            className="mt-0.5"
            checked={marketingEmail}
            onCheckedChange={(checked) => setMarketingEmail(checked === true)}
          />
          {t.marketingEmail}
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <Label id="booking-language-label">{t.languageLabel}</Label>
        <div
          role="radiogroup"
          aria-labelledby="booking-language-label"
          aria-describedby="booking-language-hint"
          className="grid grid-cols-3 gap-2"
        >
          {LANGUAGE_PREFERENCES.map((pref) => (
            <Button
              key={pref}
              type="button"
              role="radio"
              aria-checked={language === pref}
              variant={language === pref ? "default" : "outline"}
              className={cn("h-auto min-h-9 whitespace-normal px-2 py-2", language === pref && "ring-2 ring-ring")}
              onClick={() => setLanguage(pref)}
            >
              {languageLabel[pref]}
            </Button>
          ))}
        </div>
        <p id="booking-language-hint" className="text-xs text-muted-foreground">
          {t.languageHint}
        </p>
      </div>

      {readjustment ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="min-w-0 text-muted-foreground">
            {rt.priceLabel}
            {selectedPurchase ? ` · ${selectedPurchase.label}` : ""}
          </span>
          <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
            {quote ? (quote.complimentary ? rt.complimentary : formatSgd(quote.fee)) : "—"}
          </span>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {readjustment && !purchaseReady ? (
        <p className="text-sm text-muted-foreground">{rt.pickFirst}</p>
      ) : null}

      <Button type="submit" disabled={!canSubmit || redirecting} className="mt-1 h-12 text-base">
        {redirecting
          ? rt.redirecting
          : submitting
            ? t.submitting
            : readjustment && quote && !isFreeVisit(quote)
              ? rt.payAndBook.replace("{fee}", formatSgd(quote.fee))
              : t.submit}
      </Button>
    </form>
  );
}
