"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgreementContent } from "@/components/partner/agreement-content";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_CATEGORY_LABELS,
  validateApplication,
  type ApplicationFields,
  type BusinessCategory,
} from "@/lib/partner-application";
import { submitApplication } from "./actions";

type FormValues = Omit<ApplicationFields, "category"> & { category: BusinessCategory | "" };

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function ApplyForm({
  lang,
  initialEmail,
  agreementMd,
}: {
  lang: string;
  initialEmail: string;
  agreementMd: string;
}) {
  const [values, setValues] = useState<FormValues>({
    companyName: "",
    uen: "",
    website: "",
    category: "",
    contactName: "",
    contactMobile: "",
    businessEmail: initialEmail,
    introPlan: "",
  });
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [agreed, setAgreed] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const errors = validateApplication(values as ApplicationFields);

  const set = (patch: Partial<FormValues>) => setValues((v) => ({ ...v, ...patch }));
  const blur = (key: keyof FormValues) => setTouched((t) => new Set(t).add(key));
  const errorFor = (key: keyof FormValues) => (touched.has(key) ? errors[key] : undefined);

  // The agreement modal opens only once the fields validate; otherwise reveal inline errors.
  function openAgreement() {
    setTouched(new Set(Object.keys(values)));
    if (Object.keys(errors).length === 0) setAgreementOpen(true);
  }

  function onSubmit() {
    setFormError(null);
    startTransition(async () => {
      const res = await submitApplication(lang, values as ApplicationFields, agreed);
      // Reached only on failure (success redirects server-side).
      if (res?.fieldErrors) {
        setTouched(new Set(Object.keys(res.fieldErrors)));
        setAgreementOpen(false); // close so inline field errors are visible
      }
      if (res?.formError) setFormError(res.formError);
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Become a Partner</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell us about your practice. We review each application and email you once a decision is
          made.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          openAgreement();
        }}
      >
        <Field id="companyName" label="Company name" error={errorFor("companyName")}>
          <Input
            id="companyName"
            value={values.companyName}
            onChange={(e) => set({ companyName: e.target.value })}
            onBlur={() => blur("companyName")}
            aria-invalid={!!errorFor("companyName")}
          />
        </Field>

        <Field id="uen" label="ACRA UEN" error={errorFor("uen")}>
          <Input
            id="uen"
            value={values.uen}
            onChange={(e) => set({ uen: e.target.value })}
            onBlur={() => blur("uen")}
            placeholder="e.g. 201812345A"
            aria-invalid={!!errorFor("uen")}
          />
        </Field>

        <Field id="website" label="Business website or social link" error={errorFor("website")}>
          <Input
            id="website"
            value={values.website}
            onChange={(e) => set({ website: e.target.value })}
            onBlur={() => blur("website")}
            placeholder="https:// or @handle"
            aria-invalid={!!errorFor("website")}
          />
        </Field>

        <Field id="category" label="Business category" error={errorFor("category")}>
          <Select
            value={values.category || undefined}
            onValueChange={(v) => {
              set({ category: v as BusinessCategory });
              blur("category");
            }}
          >
            <SelectTrigger id="category" className="w-full" aria-invalid={!!errorFor("category")}>
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {BUSINESS_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="contactName" label="Contact person name" error={errorFor("contactName")}>
          <Input
            id="contactName"
            value={values.contactName}
            onChange={(e) => set({ contactName: e.target.value })}
            onBlur={() => blur("contactName")}
            aria-invalid={!!errorFor("contactName")}
          />
        </Field>

        <Field id="contactMobile" label="Contact mobile" error={errorFor("contactMobile")}>
          <Input
            id="contactMobile"
            type="tel"
            inputMode="tel"
            value={values.contactMobile}
            onChange={(e) => set({ contactMobile: e.target.value })}
            onBlur={() => blur("contactMobile")}
            placeholder="8780 5311 or +65…"
            aria-invalid={!!errorFor("contactMobile")}
          />
        </Field>

        <Field id="businessEmail" label="Business email" error={errorFor("businessEmail")}>
          <Input
            id="businessEmail"
            type="email"
            value={values.businessEmail}
            onChange={(e) => set({ businessEmail: e.target.value })}
            onBlur={() => blur("businessEmail")}
            aria-invalid={!!errorFor("businessEmail")}
          />
        </Field>

        <Field
          id="introPlan"
          label="How do you plan to introduce Mpillow to your clients?"
          error={errorFor("introPlan")}
        >
          <Textarea
            id="introPlan"
            rows={4}
            value={values.introPlan}
            onChange={(e) => set({ introPlan: e.target.value })}
            onBlur={() => blur("introPlan")}
            aria-invalid={!!errorFor("introPlan")}
          />
        </Field>

        <Button type="submit" className="w-full">
          Become a Partner
        </Button>
      </form>

      {/* Agreement pops up only after the fields validate — larger modal for comfortable reading. */}
      <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Partner Agreement</DialogTitle>
            <DialogDescription>
              Please read the agreement below, then confirm to submit your application.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/30 p-4">
            <AgreementContent content={agreementMd} />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={agreed}
              onCheckedChange={(c) => setAgreed(c === true)}
              aria-label="I agree to the Partner Agreement"
              className="mt-0.5"
            />
            <span>I have read and agree to the Partner Agreement above.</span>
          </label>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              disabled={!agreed || pending}
              onClick={onSubmit}
              className="w-full sm:w-auto"
            >
              {pending ? "Submitting…" : "Agree & submit application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
