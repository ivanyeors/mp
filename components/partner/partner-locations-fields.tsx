"use client";

import { MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BranchInput } from "@/lib/locations/branches";

export type LocationDraft = {
  key: string;
  id?: string;
  branch_name: string;
  address: string;
  postal_code: string;
};

type PlaceRow = {
  id?: string;
  branch_name?: string | null;
  address?: string | null;
  postal_code?: string | null;
};

let draftSeq = 0;
const newKey = () => `new-${++draftSeq}`;

export function emptyLocationDraft(): LocationDraft {
  return { key: newKey(), branch_name: "", address: "", postal_code: "" };
}

export function toLocationDrafts(main: PlaceRow, branches: PlaceRow[] = []): LocationDraft[] {
  const draft = (row: PlaceRow, id?: string): LocationDraft => ({
    key: id ?? "main",
    id,
    branch_name: row.branch_name ?? "",
    address: row.address ?? "",
    postal_code: row.postal_code ?? "",
  });
  return [draft(main), ...branches.map((b) => draft(b, b.id))];
}

export function locationDraftsToPayload(
  drafts: LocationDraft[],
):
  | {
      ok: true;
      branch_name: string | null;
      address: string | null;
      postal_code: string | null;
      branches: BranchInput[];
    }
  | { ok: false; error: string } {
  const [main = emptyLocationDraft(), ...rest] = drafts;
  const branches: BranchInput[] = [];
  for (const [i, d] of rest.entries()) {
    const address = d.address.trim();
    const branch_name = d.branch_name.trim();
    const postal_code = d.postal_code.trim();
    if (!address && !branch_name && !postal_code) continue;
    if (!address) {
      return { ok: false, error: `Add an address for ${branch_name || `location ${i + 2}`}.` };
    }
    branches.push({
      ...(d.id ? { id: d.id } : {}),
      branch_name: branch_name || null,
      address,
      postal_code: postal_code || null,
    });
  }
  return {
    ok: true,
    branch_name: main.branch_name.trim() || null,
    address: main.address.trim() || null,
    postal_code: main.postal_code.trim() || null,
    branches,
  };
}

export function PartnerLocationsFields({
  value,
  onChange,
  idPrefix = "loc",
}: {
  value: LocationDraft[];
  onChange: (next: LocationDraft[]) => void;
  idPrefix?: string;
}) {
  const drafts = value.length ? value : [emptyLocationDraft()];
  const many = drafts.length > 1;
  const showNames = many || drafts[0].branch_name.trim() !== "";

  const update = (index: number, patch: Partial<LocationDraft>) =>
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const remove = (index: number) => onChange(drafts.filter((_, i) => i !== index));
  const add = () => onChange([...drafts, emptyLocationDraft()]);
  const postal = (d: LocationDraft, index: number, id: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-postal`}>Postal code</Label>
      <Input
        id={`${id}-postal`}
        value={d.postal_code}
        onChange={(e) => update(index, { postal_code: e.target.value })}
        inputMode="numeric"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {drafts.map((d, index) => {
        const id = `${idPrefix}-${index}`;
        const title = index === 0 ? "Main location" : `Location ${index + 1}`;
        return (
          <div
            key={d.key}
            role="group"
            aria-label={title}
            className={many ? "space-y-3 rounded-lg border p-3" : "space-y-3"}
          >
            {many ? (
              <div className="flex min-h-9 items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {title}
                </span>
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 max-md:size-11"
                    aria-label={`Remove ${d.branch_name.trim() || title.toLowerCase()}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            ) : null}
            {showNames ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-name`}>Location name</Label>
                  <Input
                    id={`${id}-name`}
                    value={d.branch_name}
                    onChange={(e) => update(index, { branch_name: e.target.value })}
                    placeholder="e.g. Novena, Fortune Centre"
                  />
                </div>
                {postal(d, index, id)}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-address`}>Address</Label>
              <Textarea
                id={`${id}-address`}
                value={d.address}
                onChange={(e) => update(index, { address: e.target.value })}
                rows={showNames ? 3 : 2}
                placeholder="Street address, unit, building"
              />
            </div>
            {showNames ? null : <div className="sm:max-w-40">{postal(d, index, id)}</div>}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" onClick={add}>
        <Plus className="mr-2 h-4 w-4" />
        Add another location
      </Button>
    </div>
  );
}
