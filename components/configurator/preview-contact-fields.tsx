"use client";

import { useEffect, useState } from "react";

import { CheckoutCodeField } from "@/components/shop/checkout-code-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isValidPhone } from "@/lib/appointments/phone";
import {
  OTHER_DISCOVERY_SOURCE_ID,
  OTHER_TEXT_MIN_LENGTH,
} from "@/lib/discovery-source";
import type { Locale } from "@/lib/i18n/locales";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
  isNonEmptyString,
  type FieldCheck,
} from "@/lib/configurator/step-validation";
import type { CheckoutCodeContext, CheckoutCodeStatus } from "@/lib/checkout-code/shared";
import { useCheckoutCode } from "@/lib/checkout-code/use-checkout-code";
import { MARKETING_BOX_LABEL } from "@/lib/marketing-consent/state";

export type PreviewContactValues = {
  email: string;
  phone: string;
  discoverySource: string;
  discoverySourceOther: string;
  notes: string;
  /**
   * The one optional code (ADR 0033): a partner's referral code (attribution,
   * #74) or a discount code. Never blocks moving on; the hold resolves it again.
   */
  code: string;
  /**
   * The marketing email box, ticked by default (ADR 0037; PRD-campaign-audiences
   * slice 02). Never required; the hold records it for the email above.
   */
  marketingEmail: boolean;
};

type Option = { id: string; label: string };

type Props = {
  values: PreviewContactValues;
  onChange: (patch: Partial<PreviewContactValues>) => void;
  fieldErrors: Record<string, string>;
  locale: Locale;
  /** The build the code would go on, as priced on this page; `{ flow: "none" }` before a price exists. */
  codeContext: CheckoutCodeContext | null;
  /** The code's status, for the page's totals: a discount moves the price. */
  onCodeStatus: (status: CheckoutCodeStatus) => void;
  formatAmount: (amount: number) => string;
};

/** Field checks for authorize / Save without purchasing. */
export function previewContactFieldChecks(
  values: Omit<PreviewContactValues, "marketingEmail">,
): FieldCheck[] {
  const otherSelected = values.discoverySource === OTHER_DISCOVERY_SOURCE_ID;
  const otherText = values.discoverySourceOther.trim();
  return [
    {
      key: "email",
      touched: isNonEmptyString(values.email),
      valid: isNonEmptyString(values.email) && values.email.includes("@"),
      message: "Email is required",
    },
    {
      key: "phone",
      touched: isNonEmptyString(values.phone),
      valid: isValidPhone(values.phone),
      message: "Enter a valid mobile number",
    },
    {
      key: "discoverySource",
      touched: isNonEmptyString(values.discoverySource),
      valid: isNonEmptyString(values.discoverySource),
      message: "Select how you heard about us",
    },
    {
      key: "discoverySourceOther",
      touched: otherSelected ? isNonEmptyString(values.discoverySourceOther) : true,
      valid: otherSelected ? otherText.length >= OTHER_TEXT_MIN_LENGTH : true,
      message: "Please tell us how you found us",
    },
  ];
}

export function PreviewContactFields({
  values,
  onChange,
  fieldErrors,
  locale,
  codeContext,
  onCodeStatus,
  formatAmount,
}: Props) {
  const [options, setOptions] = useState<Option[]>([]);
  const showOther = values.discoverySource === OTHER_DISCOVERY_SOURCE_ID;

  // Checked as the shopper types and as the build's price changes (ADR 0033);
  // the page's totals read the answer, so a discount moves the price at once.
  const codeStatus = useCheckoutCode(values.code, codeContext, values.email);
  useEffect(() => {
    onCodeStatus(codeStatus);
  }, [codeStatus, onCodeStatus]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/discovery-source?locale=${encodeURIComponent(locale || DEFAULT_LOCALE)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        setOptions(
          Array.isArray(data.options)
            ? data.options.map((o: { id: string; label: string }) => ({
                id: o.id,
                label: o.label,
              }))
            : [],
        );
      } catch {
        /* visitor still sees empty select; authorize will fail server-side */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (
    <div className="space-y-5" data-preview-contact="">
      <div className="space-y-3">
        <Label className="text-base font-semibold">Contact</Label>
        <div className="space-y-2">
          <Label htmlFor="hold-email">Email</Label>
          <Input
            id="hold-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="you@example.com"
            aria-invalid={!!fieldErrors.email}
          />
          {fieldErrors.email ? (
            <p className="text-sm text-destructive">{fieldErrors.email}</p>
          ) : null}
          {/* Ticked by default (owner, 2026-10-31). Unticked changes nothing. */}
          <label className="flex items-start gap-2 pt-1 text-sm text-muted-foreground">
            <Checkbox
              id="hold-marketing-email"
              className="mt-0.5"
              checked={values.marketingEmail}
              onCheckedChange={(checked) => onChange({ marketingEmail: checked === true })}
            />
            {MARKETING_BOX_LABEL}
          </label>
        </div>
        <div className="space-y-2">
          <Label htmlFor="hold-phone">Mobile</Label>
          <Input
            id="hold-phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="8780 5311 or +65…"
            aria-invalid={!!fieldErrors.phone}
          />
          {fieldErrors.phone ? (
            <p className="text-sm text-destructive">{fieldErrors.phone}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-base font-semibold">How you found us</Label>
        <div className="space-y-2">
          <Label htmlFor="hold-discovery">How did you hear about us?</Label>
          <Select
            value={values.discoverySource || undefined}
            onValueChange={(v) =>
              onChange({
                discoverySource: v,
                ...(v !== OTHER_DISCOVERY_SOURCE_ID
                  ? { discoverySourceOther: "" }
                  : {}),
              })
            }
          >
            <SelectTrigger
              id="hold-discovery"
              className="w-full"
              aria-invalid={!!fieldErrors.discoverySource}
            >
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.discoverySource ? (
            <p className="text-sm text-destructive">{fieldErrors.discoverySource}</p>
          ) : null}
        </div>
        {showOther ? (
          <div className="space-y-2">
            <Label htmlFor="hold-discovery-other">Please tell us more</Label>
            <Input
              id="hold-discovery-other"
              value={values.discoverySourceOther}
              onChange={(e) => onChange({ discoverySourceOther: e.target.value })}
              placeholder="e.g. Reddit, podcast…"
              aria-invalid={!!fieldErrors.discoverySourceOther}
            />
            {fieldErrors.discoverySourceOther ? (
              <p className="text-sm text-destructive">{fieldErrors.discoverySourceOther}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <CheckoutCodeField
        id="hold-code"
        value={values.code}
        onChange={(code) => onChange({ code })}
        status={codeStatus}
        formatAmount={formatAmount}
        textClassName="text-sm"
      />

      <div className="space-y-2">
        <Label htmlFor="hold-notes" className="text-base font-semibold">
          Additional Notes{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="hold-notes"
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Any specific preferences or concerns…"
          rows={3}
        />
      </div>
    </div>
  );
}
