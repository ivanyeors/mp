"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { looksLikeLegacyImport, unauthoredReason } from "@/lib/spatial-fillings/authoring";
import type { FillingKind } from "@/lib/filling-templates/keys";
import { TemplateScopeChips } from "./filling-template-scope";

export type FillingTemplateListRow = {
  id: number;
  name: string;
  is_active: boolean;
  /** Sections holding at least one Placement; pillow filling templates only. */
  sections?: string[];
  /** Every size this template serves. */
  keys?: string[];
};

/** Advisory: the recipe's Placements were never laid out by a person (CONTEXT.md). */
export function UnauthoredBadge({ sections, className }: { sections: string[]; className?: string }) {
  return (
    <span
      className={cn(
        "rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400",
        className,
      )}
      title={`${unauthoredReason(sections)}${
        looksLikeLegacyImport(sections)
          ? " Placements were auto-generated from a legacy flat recipe and have never been laid out."
          : ""
      }`}
    >
      Not spatially authored
    </span>
  );
}

/**
 * Inline rename field for one row of a template list. Enter or the tick commits,
 * Escape or the cross reverts. Mounted per row by the caller's editing state, so
 * the draft always starts from the row's current name.
 */
export function TemplateNameEditor({
  value,
  busy,
  onCancel,
  onSubmit,
}: {
  value: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Input
        autoFocus
        value={draft}
        disabled={busy}
        maxLength={120}
        aria-label="Filling Template name"
        className="h-8 min-w-0 flex-1"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="shrink-0"
        disabled={busy}
        onClick={() => onSubmit(draft)}
        aria-label="Save name"
      >
        <Check className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="shrink-0"
        disabled={busy}
        onClick={onCancel}
        aria-label="Cancel rename"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Phone list of the Filling Templates serving one size. Rows are renameable in
 * place, and carry the scope strip so a recipe shared in from another size is
 * recognisable before it is opened. Desktop uses the rail instead.
 */
export function FillingTemplateTable({
  kind,
  currentKey,
  templates,
  unauthoredCount,
  renamingId,
  renaming,
  isUnauthored,
  onSelect,
  onStartRename,
  onCancelRename,
  onRename,
  onToggleActive,
}: {
  kind: FillingKind;
  currentKey: string;
  templates: FillingTemplateListRow[];
  unauthoredCount: number;
  renamingId: number | "";
  renaming: boolean;
  isUnauthored: (t: FillingTemplateListRow) => boolean;
  onSelect: (id: number) => void;
  onStartRename: (id: number) => void;
  onCancelRename: () => void;
  onRename: (id: number, name: string) => void;
  onToggleActive: (id: number, active: boolean) => void;
}) {
  if (!templates.length) return null;
  const sharedCount = templates.filter((t) => (t.keys?.length ?? 1) > 1).length;
  return (
    <div className="rounded-lg border lg:hidden">
      {unauthoredCount > 0 && (
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          {unauthoredCount} of {templates.length} Filling Template
          {templates.length === 1 ? "" : "s"} not yet spatially authored — pieces are not laid out
          across the left, center and right sections.
        </p>
      )}
      {sharedCount > 0 && (
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          {sharedCount} of {templates.length} also{" "}
          {kind === "bolster" ? "serve other lengths" : "serve other sizes"} — editing one edits it
          everywhere it is used.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                {renamingId === t.id ? (
                  <TemplateNameEditor
                    value={t.name}
                    busy={renaming}
                    onCancel={onCancelRename}
                    onSubmit={(next) => onRename(t.id, next)}
                  />
                ) : (
                  <div className="space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <button
                        type="button"
                        className="min-w-0 text-left font-medium hover:underline"
                        onClick={() => onSelect(t.id)}
                      >
                        {t.name}
                      </button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => onStartRename(t.id)}
                        aria-label={`Rename ${t.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {isUnauthored(t) && <UnauthoredBadge sections={t.sections ?? []} />}
                    </div>
                    <TemplateScopeChips
                      kind={kind}
                      keys={t.keys ?? [currentKey]}
                      currentKey={currentKey}
                    />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Switch
                  checked={t.is_active}
                  onCheckedChange={(checked) => onToggleActive(t.id, checked)}
                  aria-label={`${t.name} active`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
