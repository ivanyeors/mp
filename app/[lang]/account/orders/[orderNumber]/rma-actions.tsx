"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type RmaEligibleItem = {
  id: string;
  title: string;
  availableQty: number;
};

export type RmaIneligibleItem = {
  id: string;
  title: string;
  reason: string;
};

type Props = {
  orderNumber: string;
  eligibleItems: RmaEligibleItem[];
  ineligibleItems: RmaIneligibleItem[];
};

type Selection = { checked: boolean; quantity: number };

export function OrderRmaActions({ orderNumber, eligibleItems, ineligibleItems }: Props) {
  const router = useRouter();
  const [selections, setSelections] = useState<Record<string, Selection>>(() =>
    Object.fromEntries(
      eligibleItems.map((i) => [i.id, { checked: false, quantity: 1 }]),
    ),
  );
  const [resolution, setResolution] = useState<"refund" | "exchange" | "replacement">(
    "refund",
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const chosen = useMemo(
    () => eligibleItems.filter((i) => selections[i.id]?.checked),
    [eligibleItems, selections],
  );

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="font-medium">Return request received</p>
        <p className="mt-1 text-muted-foreground">
          We&apos;ve emailed you a confirmation and will follow up with the next steps.
        </p>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const items = chosen.map((i) => ({
        order_item_id: i.id,
        quantity: selections[i.id].quantity,
      }));
      if (items.length === 0) throw new Error("Select at least one item to return.");

      const urls = photoUrls
        .split(/[\n,\s]+/)
        .map((u) => u.trim())
        .filter(Boolean);

      const res = await fetch(
        `/api/account/orders/${encodeURIComponent(orderNumber)}/rma`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            resolution,
            reason: reason.trim() || undefined,
            customer_note: note.trim() || undefined,
            photo_urls: urls.length ? urls : undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Request failed",
        );
      }
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const setSel = (id: string, patch: Partial<Selection>) =>
    setSelections((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const selectClass =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <section className="rounded-lg border p-4 space-y-4">
      <div>
        <p className="text-sm font-medium">Request a return</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the item(s) you&apos;d like to return and how you&apos;d like it resolved.
        </p>
      </div>

      {eligibleItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None of the items on this order can be returned right now.
        </p>
      ) : (
        <div className="space-y-2">
          {eligibleItems.map((item) => {
            const sel = selections[item.id];
            return (
              <div key={item.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`rma-${item.id}`}
                  checked={sel?.checked ?? false}
                  onChange={(e) => setSel(item.id, { checked: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor={`rma-${item.id}`} className="flex-1 text-sm font-normal">
                  {item.title}
                </Label>
                {sel?.checked ? (
                  <select
                    aria-label={`Quantity to return for ${item.title}`}
                    value={sel.quantity}
                    onChange={(e) =>
                      setSel(item.id, { quantity: Number(e.target.value) })
                    }
                    className={selectClass}
                  >
                    {Array.from({ length: item.availableQty }, (_, n) => n + 1).map(
                      (q) => (
                        <option key={q} value={q}>
                          Qty {q}
                        </option>
                      ),
                    )}
                  </select>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    up to {item.availableQty}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ineligibleItems.length > 0 ? (
        <div className="space-y-1 border-t pt-3">
          {ineligibleItems.map((item) => (
            <p key={item.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{item.title}:</span>{" "}
              {item.reason}
            </p>
          ))}
        </div>
      ) : null}

      {eligibleItems.length > 0 ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="rma-resolution">Resolution</Label>
            <select
              id="rma-resolution"
              value={resolution}
              onChange={(e) =>
                setResolution(e.target.value as typeof resolution)
              }
              className={`${selectClass} w-full`}
            >
              <option value="refund">Refund</option>
              <option value="exchange">Exchange</option>
              <option value="replacement">Replacement</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rma-reason">Reason (optional)</Label>
            <Textarea
              id="rma-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What's wrong with the item?"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rma-note">Additional note (optional)</Label>
            <Textarea
              id="rma-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rma-photos">Photo URLs (optional)</Label>
            <Textarea
              id="rma-photos"
              value={photoUrls}
              onChange={(e) => setPhotoUrls(e.target.value)}
              placeholder="One URL per line"
              rows={2}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={busy || chosen.length === 0}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit return request
          </Button>
        </>
      ) : null}
    </section>
  );
}
