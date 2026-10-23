"use client";

import type { Dispatch, SetStateAction } from "react";
import { Check, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SavedAddressSelect,
  type HoldShippingAddress,
} from "@/components/shop/saved-address-select";
import type { CustomerAddress } from "@/lib/types/ecommerce";

/** A row of `/api/shop/shipping?collect=1`, the configurator's method list. */
export type HoldShippingMethod = {
  id: string;
  slug: string;
  base_rate: number;
  free_above: number | null;
  content: Record<string, { name?: string; description?: string }>;
  /** Self-collect: the studio it is collected from. Absent for a delivery method. */
  collect_location?: { id: string; name: string; address: string } | null;
};

/** The configurator's shipping list: delivery methods plus Self-collect. */
export const HOLD_SHIPPING_METHODS_PATH = "/api/shop/shipping?collect=1";

export function isSelfCollectMethod(method: HoldShippingMethod | undefined): boolean {
  return Boolean(method?.collect_location);
}

/**
 * Shipping on a configurator's customisation page: the method first, then the
 * address it needs. Self-collect asks only who collects; the server stores the
 * studio's address (lib/shipping/self-collect).
 */
export function HoldShippingFields({
  methods,
  selectedId,
  onSelect,
  address,
  setAddress,
  errors,
  savedAddresses,
  recipientPlaceholder,
}: {
  methods: HoldShippingMethod[];
  selectedId: string;
  onSelect: (id: string) => void;
  address: HoldShippingAddress;
  setAddress: Dispatch<SetStateAction<HoldShippingAddress>>;
  errors: Record<string, string>;
  /** Hidden when off: on a Staff device those are the Staff member's own addresses. */
  savedAddresses: {
    signedIn: boolean;
    addresses: CustomerAddress[];
    value: string;
    onValueChange: (id: string) => void;
  };
  recipientPlaceholder: string;
}) {
  const selected = methods.find((m) => m.id === selectedId);
  const collect = selected?.collect_location ?? null;

  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold">Shipping</Label>
      <div className="space-y-2">
        <Label>Shipping method</Label>
        {methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shipping methods available. Add active methods under Settings → Shipping.
          </p>
        ) : (
          <div className="space-y-2">
            {methods.map((m) => {
              const label = m.content?.["en-US"]?.name ?? m.slug;
              const isSelected = selectedId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : errors.shipping
                        ? "border-destructive"
                        : "border-border"
                  }`}
                >
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">{label}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    SGD {Number(m.base_rate).toFixed(2)}
                    {isSelected && <Check className="ml-2 inline size-4 text-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {errors.shipping ? <p className="text-sm text-destructive">{errors.shipping}</p> : null}
      </div>

      {collect ? (
        <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <Store className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">Collect from {collect.name}</p>
            <p className="break-words text-muted-foreground">{collect.address}</p>
          </div>
        </div>
      ) : (
        <SavedAddressSelect {...savedAddresses} />
      )}

      <div className="space-y-2">
        <Label htmlFor="hold-recipient">{collect ? "Collected by" : "Recipient"}</Label>
        <Input
          id="hold-recipient"
          value={address.recipient}
          onChange={(e) => setAddress((a) => ({ ...a, recipient: e.target.value }))}
          placeholder={recipientPlaceholder}
          aria-invalid={!!errors.recipient}
        />
        {errors.recipient ? <p className="text-sm text-destructive">{errors.recipient}</p> : null}
      </div>

      {collect ? null : (
        <>
          <div className="space-y-2">
            <Label htmlFor="hold-line1">Address</Label>
            <Input
              id="hold-line1"
              value={address.line1}
              onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
              placeholder="Street address"
              aria-invalid={!!errors.line1}
            />
            {errors.line1 ? <p className="text-sm text-destructive">{errors.line1}</p> : null}
          </div>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hold-city">City</Label>
              <Input
                id="hold-city"
                value={address.city}
                onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                aria-invalid={!!errors.city}
              />
              {errors.city ? <p className="text-sm text-destructive">{errors.city}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="hold-postal">Postal code</Label>
              <Input
                id="hold-postal"
                value={address.postal_code}
                onChange={(e) => setAddress((a) => ({ ...a, postal_code: e.target.value }))}
                aria-invalid={!!errors.postal_code}
              />
              {errors.postal_code ? (
                <p className="text-sm text-destructive">{errors.postal_code}</p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
