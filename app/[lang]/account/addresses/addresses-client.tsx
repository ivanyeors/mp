"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { getApiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CustomerAddress } from "@/lib/types/ecommerce";
import type { AddressInput } from "@/lib/shop/customer-addresses";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "./actions";

type FormState = {
  label: string;
  recipient: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  is_default: boolean;
};

function emptyForm(): FormState {
  return {
    label: "",
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "MY",
    phone: "",
    is_default: false,
  };
}

function toForm(a: CustomerAddress): FormState {
  return {
    label: a.label ?? "",
    recipient: a.recipient,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    state: a.state ?? "",
    postal_code: a.postal_code,
    country: a.country,
    phone: a.phone ?? "",
    is_default: a.is_default,
  };
}

function toInput(form: FormState): AddressInput {
  return {
    label: form.label.trim() || undefined,
    recipient: form.recipient.trim(),
    line1: form.line1.trim(),
    line2: form.line2.trim() || undefined,
    city: form.city.trim(),
    state: form.state.trim() || undefined,
    postal_code: form.postal_code.trim(),
    country: form.country.trim().toUpperCase(),
    phone: form.phone.trim() || undefined,
    is_default: form.is_default,
  };
}

export function AddressesClient({ addresses }: { addresses: CustomerAddress[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm(), is_default: addresses.length === 0 });
    setOpen(true);
  }

  function openEdit(a: CustomerAddress) {
    setEditing(a);
    setForm(toForm(a));
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput(form);
    startTransition(async () => {
      const result = editing
        ? await updateAddress(editing.id, input)
        : await createAddress(input);
      if (result.ok) {
        toast.success(editing ? "Address updated" : "Address added");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(getApiErrorMessage(result.error));
      }
    });
  }

  function handleDelete(a: CustomerAddress) {
    if (!confirm("Delete this address?")) return;
    startTransition(async () => {
      const result = await deleteAddress(a.id);
      if (result.ok) {
        toast.success("Address deleted");
        router.refresh();
      } else {
        toast.error(getApiErrorMessage(result.error));
      }
    });
  }

  function handleSetDefault(a: CustomerAddress) {
    startTransition(async () => {
      const result = await setDefaultAddress(a.id);
      if (result.ok) {
        toast.success("Default address updated");
        router.refresh();
      } else {
        toast.error(getApiErrorMessage(result.error));
      }
    });
  }

  return (
    <div className="mt-8">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add address
        </Button>
      </div>

      {addresses.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You haven&apos;t saved any addresses yet.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-lg border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{a.recipient}</p>
                    {a.label ? (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        {a.label}
                      </span>
                    ) : null}
                    {a.is_default ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Star className="h-3 w-3 fill-current" />
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground">{a.line1}</p>
                  {a.line2 ? <p className="text-muted-foreground">{a.line2}</p> : null}
                  <p className="text-muted-foreground">
                    {[a.city, a.state, a.postal_code].filter(Boolean).join(", ")}
                  </p>
                  <p className="text-muted-foreground">{a.country}</p>
                  {a.phone ? <p className="text-muted-foreground">{a.phone}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!a.is_default ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleSetDefault(a)}
                    >
                      Set default
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit address"
                    disabled={pending}
                    onClick={() => openEdit(a)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete address"
                    disabled={pending}
                    onClick={() => handleDelete(a)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit address" : "Add address"}</DialogTitle>
            <DialogDescription>
              Saved addresses can be reused when you check out.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="recipient">Recipient</Label>
              <Input
                id="recipient"
                value={form.recipient}
                onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="line1">Address line 1</Label>
              <Input
                id="line1"
                value={form.line1}
                onChange={(e) => setForm({ ...form, line1: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="line2">Address line 2 (optional)</Label>
              <Input
                id="line2"
                value={form.line2}
                onChange={(e) => setForm({ ...form, line2: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="state">State / region (optional)</Label>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="postal_code">Postal code</Label>
                <Input
                  id="postal_code"
                  value={form.postal_code}
                  onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="country">Country code</Label>
                <Input
                  id="country"
                  value={form.country}
                  maxLength={2}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                placeholder="Home, Office…"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_default}
                onCheckedChange={(checked) =>
                  setForm({ ...form, is_default: checked === true })
                }
              />
              Set as default address
            </label>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {editing ? "Save changes" : "Add address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
