"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReadjustmentQuote } from "@/lib/readjustment/eligibility";
import { formatSgd, quoteBadge, shortDate } from "@/lib/readjustment/format";
import { cn } from "@/lib/utils";

export type ReadjustmentPurchaseOption = {
  orderItemId: string;
  orderNumber: string;
  label: string;
  imageUrl: string | null;
  paidAt: string | null;
  quote: ReadjustmentQuote;
};

export const UNLISTED = "unlisted" as const;
export type PurchaseSelection = string | typeof UNLISTED | null;

export type UnlistedWhere = "online_before_accounts" | "in_store" | "gift" | "other";

type Strings = {
  pickTitle: string;
  orderLine: string;
  badgeFree: string;
  badgeFee: string;
  badgeFreeUsed: string;
  badgeWindowEnded: string;
  notListed: string;
  notListedHint: string;
  whereLabel: string;
  where: Record<UnlistedWhere, string>;
  referenceLabel: string;
  emptyTitle: string;
};

export function ReadjustmentPurchasePicker({
  purchases,
  fee,
  selection,
  onSelect,
  where,
  onWhere,
  reference,
  onReference,
  t,
  locale,
}: {
  purchases: ReadjustmentPurchaseOption[];
  fee: number;
  selection: PurchaseSelection;
  onSelect: (s: PurchaseSelection) => void;
  where: UnlistedWhere | "";
  onWhere: (w: UnlistedWhere) => void;
  reference: string;
  onReference: (r: string) => void;
  t: Strings;
  locale: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{t.pickTitle}</legend>
      {purchases.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t.emptyTitle}</p>
      ) : null}
      {purchases.map((p) => {
        const selected = selection === p.orderItemId;
        return (
          <button
            key={p.orderItemId}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(p.orderItemId)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors max-md:min-h-11",
              selected ? "border-primary ring-2 ring-ring" : "hover:bg-muted/50",
            )}
          >
            <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {p.imageUrl ? (
                <Image src={p.imageUrl} alt="" fill sizes="48px" className="object-cover" />
              ) : (
                <Package className="size-5 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{p.label}</span>
              <span className="block text-xs text-muted-foreground">
                {t.orderLine
                  .replace("{order}", p.orderNumber)
                  .replace("{date}", p.paidAt ? shortDate(p.paidAt, locale) : "—")}
              </span>
              <Badge
                variant={p.quote.complimentary ? "default" : "outline"}
                className="mt-1.5 whitespace-normal text-left font-normal"
              >
                {quoteBadge(p.quote, t, locale)}
              </Badge>
            </span>
            {selected ? <Check className="size-5 shrink-0 text-primary" /> : null}
          </button>
        );
      })}

      <button
        type="button"
        role="radio"
        aria-checked={selection === UNLISTED}
        onClick={() => onSelect(UNLISTED)}
        className={cn(
          "flex w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors max-md:min-h-11",
          selection === UNLISTED ? "border-primary ring-2 ring-ring" : "hover:bg-muted/50",
        )}
      >
        <span className="font-medium">{t.notListed} →</span>
        <span className="text-xs text-muted-foreground">{t.notListedHint}</span>
        <Badge variant="outline" className="mt-1 font-normal">
          {t.badgeFee.replace("{fee}", formatSgd(fee))}
        </Badge>
      </button>

      {selection === UNLISTED ? (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="readjust-where">{t.whereLabel}</Label>
            <Select value={where} onValueChange={(v) => onWhere(v as UnlistedWhere)}>
              <SelectTrigger id="readjust-where" className="w-full">
                <SelectValue placeholder={t.whereLabel} />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(t.where) as UnlistedWhere[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {t.where[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="readjust-reference">{t.referenceLabel}</Label>
            <Input
              id="readjust-reference"
              value={reference}
              maxLength={120}
              onChange={(e) => onReference(e.target.value)}
            />
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
