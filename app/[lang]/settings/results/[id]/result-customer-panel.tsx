"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Search, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LifecycleStageBadge } from "@/app/[lang]/settings/customers/lifecycle-stage-badge";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import { LIFECYCLE_DETAIL_LABEL } from "@/lib/crm/lifecycle-stage";
import { MARKETING_BOX_LABEL } from "@/lib/marketing-consent/state";
import {
  customerDisplayName,
  measuredForSomeoneElse,
  type ResultCustomerSummary,
} from "@/lib/results/result-customer";
import { cn } from "@/lib/utils";

type Mode = "link" | "create";

/**
 * A **Result**'s **Customer** (ADR 0051 d–g; PRD-results-to-customer slice
 * 02): who it belongs to and their stage, or a way to link an existing
 * Customer or create one, so a drop-off is a *Lead* Staff can follow up.
 *
 * - **Matched**: name, stage, email and mobile, and *Open customer*. A Customer
 *   who bought before and was measured under another name is said to be
 *   measuring someone else (owner, 2026-11-15).
 * - **Not matched**: *Link existing* or *Create customer*. An email is a must;
 *   a mobile is asked for and encouraged. The marketing box is the
 *   customisation's own, ticked by default.
 * - **A Result whose email is locked** (a guest's own, or a live Result's) can
 *   only be added as the Customer with that email.
 */
export function ResultCustomerPanel({
  resultId,
  resultName,
  resultEmail,
  resultPhone,
  editable,
  customer,
  canEdit,
  customerHref,
  onChanged,
}: {
  resultId: string;
  resultName: string | null;
  resultEmail: string | null;
  resultPhone: string | null;
  /** `resultContactEditable`: Staff may point it at any Customer. */
  editable: boolean;
  customer: ResultCustomerSummary | null;
  /** The viewer holds `customers-edit` (the page already needs `results`). */
  canEdit: boolean;
  customerHref: (id: string) => string;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<Mode | null>(null);

  const someoneElse = customer ? measuredForSomeoneElse(resultName, customer.name) : false;
  const bought = (customer?.purchases ?? 0) > 0;

  return (
    <Card
      role="region"
      aria-labelledby="result-customer-heading"
      id="customer"
      className="scroll-mt-20 p-4 text-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h2 id="result-customer-heading" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer
          </h2>
          {customer ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={customerHref(customer.id)}
                  className="truncate font-medium underline-offset-4 hover:underline active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center"
                >
                  {customer.name ?? customer.email}
                </Link>
                {customer.stage ? <LifecycleStageBadge stage={customer.stage} /> : null}
                {customer.detail ? (
                  <span className="text-xs text-muted-foreground">{LIFECYCLE_DETAIL_LABEL[customer.detail]}</span>
                ) : null}
              </div>
              <p className="truncate text-muted-foreground">
                {customer.email}
                {customer.phone ? ` · ${customer.phone}` : null}
              </p>
              {!customer.phone ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">No mobile on file. Ask for one next time.</p>
              ) : null}
              {someoneElse ? (
                <p className="text-xs text-muted-foreground">
                  {bought ? "Bought before. " : ""}This Result is for {resultName}, someone they may be measuring for.
                </p>
              ) : bought ? (
                <p className="text-xs text-muted-foreground">Bought before: a returning customer.</p>
              ) : null}
            </>
          ) : resultEmail ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{resultEmail}</span> isn&apos;t a customer yet, so they
              aren&apos;t in the CRM.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Not linked to anyone. Link or create a customer so they&apos;re a Lead in the CRM and can be followed up.
            </p>
          )}
        </div>

        {canEdit ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {customer ? (
              <>
                <Button size="sm" variant="outline" asChild>
                  <Link href={customerHref(customer.id)}>Open customer</Link>
                </Button>
                {editable ? (
                  <Button size="sm" variant="ghost" onClick={() => setDialog("link")}>
                    Change
                  </Button>
                ) : null}
              </>
            ) : editable ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setDialog("link")}>
                  <Search className="mr-1.5 h-4 w-4" />
                  Link existing
                </Button>
                <Button size="sm" onClick={() => setDialog("create")}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Create customer
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setDialog("create")}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Add as customer
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {dialog ? (
        <CustomerDialog
          resultId={resultId}
          resultName={resultName}
          resultEmail={resultEmail}
          resultPhone={resultPhone}
          editable={editable}
          initialMode={dialog}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

function CustomerDialog({
  resultId,
  resultName,
  resultEmail,
  resultPhone,
  editable,
  initialMode,
  onClose,
  onDone,
}: {
  resultId: string;
  resultName: string | null;
  resultEmail: string | null;
  resultPhone: string | null;
  editable: boolean;
  initialMode: Mode;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(editable ? initialMode : "create");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOverviewRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CustomerOverviewRow | null>(null);
  const [name, setName] = useState(resultName ?? "");
  const [email, setEmail] = useState(resultEmail ?? "");
  const [phone, setPhone] = useState(resultPhone ?? "");
  // Owner, 2026-11-15: ticked by default, as the customisation's own box is.
  const [marketing, setMarketing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; phone?: string; form?: string }>({});

  const q = query.trim();
  useEffect(() => {
    if (mode !== "link" || q.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: q, limit: "6", page: "1" });
        const res = await fetch(`/api/shop/customers?${params.toString()}`);
        const json = await res.json().catch(() => null);
        setResults(res.ok ? ((json?.rows ?? []) as CustomerOverviewRow[]) : []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mode, q]);
  const shown = q.length < 2 ? null : results;

  const pickedHasPhone = Boolean(picked?.phone?.trim());
  const askPhone = mode === "create" || (picked !== null && !pickedHasPhone);
  const canSubmit = mode === "link" ? picked !== null : email.trim().length > 0;

  const submit = async () => {
    setErrors({});
    if (mode === "create" && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrors({ email: "An email is needed to create a customer." });
      return;
    }
    setBusy(true);
    try {
      const body =
        mode === "link"
          ? { mode, customerId: picked!.id, phone: askPhone && phone.trim() ? phone.trim() : undefined, marketingEmail: marketing }
          : {
              mode,
              email: editable ? email.trim() : undefined,
              name: name.trim() || undefined,
              phone: phone.trim() || undefined,
              marketingEmail: marketing,
            };
      const res = await fetch(`/api/results/${resultId}/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = typeof json?.error === "string" ? json.error : "Couldn't save the customer.";
        if (json?.field === "phone") setErrors({ phone: message });
        else if (json?.field === "email") setErrors({ email: message });
        else setErrors({ form: message });
        return;
      }
      toast.success(
        mode === "link"
          ? "Linked to the customer."
          : json?.created
            ? "Customer created. They're a Lead in the CRM."
            : "Already a customer: linked to their record.",
      );
      onDone();
    } catch {
      setErrors({ form: "Couldn't save the customer. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editable ? "Customer for this Result" : "Add as customer"}</DialogTitle>
          <DialogDescription>
            {editable
              ? "Link someone already in the CRM, or create them. Their email becomes this Result's, so payment requests and updates reach them."
              : "This Result's email is where its emails already go, so the customer is whoever holds it."}
          </DialogDescription>
        </DialogHeader>

        {editable ? (
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="link" className="flex-1">
                Existing customer
              </TabsTrigger>
              <TabsTrigger value="create" className="flex-1">
                New customer
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

        <div className="space-y-4">
          {mode === "link" ? (
            <div className="space-y-2">
              <Label htmlFor="customer-search">Find by name or email</Label>
              <Input
                id="customer-search"
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPicked(null);
                }}
                placeholder="e.g. Jorge or jorge@…"
              />
              {searching ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </p>
              ) : shown && shown.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nobody matches. Try another spelling, or create them under <em>New customer</em>.
                </p>
              ) : null}
              {shown && shown.length > 0 ? (
                <ul className="divide-y rounded-md border" role="listbox" aria-label="Customers">
                  {shown.map((c) => {
                    const label = customerDisplayName(c);
                    const selected = picked?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => setPicked(c)}
                          className={cn(
                            "flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 active:bg-press",
                            selected && "bg-muted",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{label ?? c.email}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {c.email}
                              {c.phone ? ` · ${c.phone}` : ""}
                            </span>
                          </span>
                          <LifecycleStageBadge stage={c.lifecycle_stage} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="customer-name">Name</Label>
                <Input id="customer-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer-email">
                  Email <span className="text-muted-foreground">(required)</span>
                </Label>
                <Input
                  id="customer-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  readOnly={!editable}
                  aria-invalid={Boolean(errors.email)}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  If someone already has this email, they&apos;re linked instead. Nobody is created twice.
                </p>
                {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
              </div>
            </>
          )}

          {askPhone ? (
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">
                Mobile <span className="text-muted-foreground">(encouraged)</span>
              </Label>
              <Input
                id="customer-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                aria-invalid={Boolean(errors.phone)}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9123 4567"
              />
              <p className="text-xs text-muted-foreground">
                {mode === "link" ? "They have no mobile on file. " : ""}A mobile lets the team reach them on WhatsApp.
              </p>
              {errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}
            </div>
          ) : null}

          <label className="flex items-start gap-2.5 rounded-md border p-3">
            <Checkbox checked={marketing} onCheckedChange={(v) => setMarketing(v === true)} className="mt-0.5" />
            <span className="space-y-0.5">
              <span className="block text-sm">The customer agrees: &ldquo;{MARKETING_BOX_LABEL}&rdquo;</span>
              <span className="block text-xs text-muted-foreground">
                Only subscribes someone who hasn&apos;t chosen yet. Never someone who unsubscribed.
              </span>
            </span>
          </label>

          {errors.form ? <p className="text-sm text-destructive">{errors.form}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !canSubmit}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserRound className="mr-1.5 h-4 w-4" />}
            {mode === "link" ? "Link customer" : editable ? "Create customer" : "Add as customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

