"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RULE_ACTIONS,
  RULE_CONDITIONS,
  type EasyshipReference,
  type EasyshipShippingRule,
  type OptionField,
  type RefKind,
  type RuleClause,
} from "@/lib/easyship/schema";

type RefOption = { value: string | number; label: string };

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function refOptions(kind: RefKind, ref: EasyshipReference | null): RefOption[] {
  if (!ref) return [];
  switch (kind) {
    case "country": return ref.countries.map((c) => ({ value: c.id, label: `${c.name} (${c.alpha2})` }));
    case "courier_service": return ref.courier_services.map((s) => ({ value: s.id, label: s.name }));
    case "box": return ref.boxes.filter((b) => b.type === "box").map((b) => ({ value: b.id, label: b.name }));
    case "flat_rate_box": return ref.boxes.filter((b) => b.type === "flat_rate_box").map((b) => ({ value: b.id, label: b.name }));
    case "address": return ref.addresses.map((a) => ({ value: a.id, label: a.label }));
    case "store": return ref.stores.map((s) => ({ value: s.id, label: s.name }));
    case "category": return ref.categories.map((c) => ({ value: c.id, label: c.name }));
  }
}

const NEW_RULE = (priority: number): EasyshipShippingRule => ({
  name: "",
  description: "",
  priority,
  active: true,
  conditions: [{ type: "match_all", options: {} }],
  actions: [{ type: "force_sort_by", options: { sort_by: "total_charge" } }],
});

export function ShippingRulesEditor({
  rules,
  onChange,
}: {
  rules: EasyshipShippingRule[];
  onChange: (rules: EasyshipShippingRule[]) => void;
}) {
  const [reference, setReference] = useState<EasyshipReference | null>(null);
  const [editing, setEditing] = useState<{ index: number; draft: EasyshipShippingRule } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/easyship/reference")
      .then((r) => r.json())
      .then((j: { reference?: EasyshipReference; error?: unknown }) => {
        if (cancelled) return;
        if (j.reference) setReference(j.reference);
        else throw new Error(typeof j.error === "string" ? j.error : "no reference");
      })
      .catch((e) => !cancelled && toast.error(`Courier reference data unavailable: ${e instanceof Error ? e.message : e}`));
    return () => { cancelled = true; };
  }, []);

  const ordered = useMemo(
    () => rules.map((r, i) => ({ r, i })).sort((a, b) => a.r.priority - b.r.priority || a.i - b.i),
    [rules],
  );

  const commit = () => {
    if (!editing) return;
    const { index, draft } = editing;
    if (!draft.name.trim()) return toast.error("Give the rule a name");
    if (!draft.conditions.length || !draft.actions.length) return toast.error("A rule needs at least one condition and one action");
    const next = [...rules];
    if (index < 0) next.push(draft);
    else next[index] = draft;
    onChange(next);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rules run in priority order (lower first) when the courier account quotes a shipment. Matched there by name; a rule
        whose conditions or actions change is recreated there.
      </p>

      {ordered.map(({ r, i }) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">#{r.priority}</Badge>
                <span className="font-medium">{r.name || "Untitled rule"}</span>
                {!r.active && <Badge variant="secondary">inactive</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {r.conditions.map((c) => titleCase(c.type)).join(", ")} → {r.actions.map((a) => titleCase(a.type)).join(", ")}
              </p>
              {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                aria-label="Rule active"
                checked={r.active}
                onCheckedChange={(v) => onChange(rules.map((x, j) => (j === i ? { ...x, active: v } : x)))}
              />
              <Button variant="ghost" size="sm" aria-label="Edit rule" onClick={() => setEditing({ index: i, draft: structuredClone(r) })}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Delete rule" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={() => setEditing({ index: -1, draft: NEW_RULE(rules.length) })}>
        <Plus className="h-4 w-4" /> Add rule
      </Button>

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
          <SheetHeader className="border-b p-4">
            <SheetTitle>{editing && editing.index < 0 ? "New shipping rule" : "Edit shipping rule"}</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="flex-1 space-y-6 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-name">Name</Label>
                  <Input id="rule-name" value={editing.draft.name} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-priority">Priority</Label>
                  <Input
                    id="rule-priority"
                    type="number"
                    min={0}
                    value={editing.draft.priority}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, priority: Math.max(0, Number(e.target.value) || 0) } })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-description">Description</Label>
                <Input id="rule-description" value={editing.draft.description} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, description: e.target.value } })} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="rule-active">Active</Label>
                <Switch id="rule-active" checked={editing.draft.active} onCheckedChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, active: v } })} />
              </div>

              <ClauseList
                title="When"
                spec={RULE_CONDITIONS}
                clauses={editing.draft.conditions}
                reference={reference}
                onChange={(conditions) => setEditing({ ...editing, draft: { ...editing.draft, conditions } })}
              />
              <ClauseList
                title="Then"
                spec={RULE_ACTIONS}
                clauses={editing.draft.actions}
                reference={reference}
                onChange={(actions) => setEditing({ ...editing, draft: { ...editing.draft, actions } })}
              />
            </div>
          )}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background p-4 pb-[calc(1rem+var(--safe-bottom,0px))]">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={commit}>Done</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ── Clauses ───────────────────────────────────────────────────────────── */

function defaultOptions(fields: OptionField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.optional) continue;
    if (f.kind === "enum" && f.enum?.length) out[f.key] = f.enum[0];
    else if (f.kind === "boolean") out[f.key] = true;
    else if (f.kind.endsWith("-list")) out[f.key] = [];
  }
  return out;
}

function ClauseList({
  title,
  spec,
  clauses,
  reference,
  onChange,
}: {
  title: string;
  spec: Record<string, OptionField[]>;
  clauses: RuleClause[];
  reference: EasyshipReference | null;
  onChange: (clauses: RuleClause[]) => void;
}) {
  const types = Object.keys(spec);
  const replace = (i: number, c: RuleClause) => onChange(clauses.map((x, j) => (j === i ? c : x)));
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {clauses.map((c, i) => {
        const fields = spec[c.type] ?? [];
        return (
          <div key={i} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Select value={c.type} onValueChange={(type) => replace(i, { type, options: defaultOptions(spec[type] ?? []) })}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}
                  {!types.includes(c.type) && <SelectItem value={c.type}>{titleCase(c.type)}</SelectItem>}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => onChange(clauses.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {fields.map((f) => (
              <OptionInput
                key={f.key}
                field={f}
                value={c.options[f.key]}
                reference={reference}
                onChange={(v) => {
                  const options = { ...c.options };
                  if (v === undefined) delete options[f.key];
                  else options[f.key] = v;
                  replace(i, { ...c, options });
                }}
              />
            ))}
            <JsonField value={c.options} onChange={(options) => replace(i, { ...c, options })} />
          </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={() => onChange([...clauses, { type: types[0], options: defaultOptions(spec[types[0]]) }])}>
        <Plus className="h-4 w-4" /> Add {title.toLowerCase()}
      </Button>
    </div>
  );
}

function OptionInput({
  field,
  value,
  reference,
  onChange,
}: {
  field: OptionField;
  value: unknown;
  reference: EasyshipReference | null;
  onChange: (v: unknown) => void;
}) {
  const label = field.label ?? titleCase(field.key);
  switch (field.kind) {
    case "text":
      return (
        <Labeled label={label}>
          <Input value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        </Labeled>
      );
    case "number":
      return (
        <Labeled label={label}>
          <Input
            type="number"
            inputMode="decimal"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </Labeled>
      );
    case "boolean":
      return (
        <div className="flex items-center justify-between">
          <Label className="font-normal">{label}</Label>
          <Switch checked={!!value} onCheckedChange={onChange} />
        </div>
      );
    case "text-list":
      return (
        <Labeled label={label} hint="Comma-separated">
          <ListInput values={Array.isArray(value) ? value.map(String) : []} onChange={onChange} />
        </Labeled>
      );
    case "enum":
      return (
        <Labeled label={label}>
          <Select value={value === undefined ? "" : String(value)} onValueChange={(v) => onChange(coerce(v, field.enum))}>
            <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              {(field.enum ?? []).map((o) => <SelectItem key={String(o)} value={String(o)}>{titleCase(String(o))}</SelectItem>)}
            </SelectContent>
          </Select>
        </Labeled>
      );
    case "enum-list": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <Labeled label={label}>
          <div className="flex flex-wrap gap-3">
            {(field.enum ?? []).map((o) => (
              <label key={String(o)} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(o)}
                  onCheckedChange={(v) => onChange(v ? [...selected.filter((x) => x !== o), o] : selected.filter((x) => x !== o))}
                />
                {String(o)}
              </label>
            ))}
          </div>
        </Labeled>
      );
    }
    case "ref": {
      const options = refOptions(field.ref!, reference);
      if (!options.length) {
        return (
          <Labeled label={label} hint="Courier account id">
            <Input value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)} />
          </Labeled>
        );
      }
      return (
        <Labeled label={label}>
          <Select value={value === undefined ? "" : String(value)} onValueChange={(v) => onChange(coerce(v, options.map((o) => o.value)))}>
            <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              {options.map((o) => <SelectItem key={String(o.value)} value={String(o.value)}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Labeled>
      );
    }
    case "ref-list":
      return (
        <Labeled label={label}>
          <RefListPicker options={refOptions(field.ref!, reference)} selected={Array.isArray(value) ? value : []} onChange={onChange} />
        </Labeled>
      );
  }
}

/** Select gives back strings; hand numeric enums/ids back as numbers. */
function coerce(v: string, from: readonly (string | number)[] | undefined): string | number {
  const hit = from?.find((x) => String(x) === v);
  return hit ?? v;
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-normal">
        {label}
        {hint && <span className="ml-1 text-xs text-muted-foreground">· {hint}</span>}
      </Label>
      {children}
    </div>
  );
}

/** Keeps the raw text while typing; splits on commas/newlines when focus leaves. */
function ListInput({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [state, setState] = useState({ for: values, text: values.join(", ") });
  if (state.for !== values) setState({ for: values, text: values.join(", ") });
  return (
    <Input
      value={state.text}
      onChange={(e) => setState({ ...state, text: e.target.value })}
      onBlur={() => onChange(state.text.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean))}
    />
  );
}

function RefListPicker({
  options,
  selected,
  onChange,
}: {
  options: RefOption[];
  selected: unknown[];
  onChange: (v: unknown[]) => void;
}) {
  const [q, setQ] = useState("");
  if (!options.length) {
    return <ListInput values={selected.map(String)} onChange={onChange} />;
  }
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const chosen = options.filter((o) => selected.includes(o.value));
  return (
    <div className="space-y-2">
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chosen.map((o) => (
            <Badge key={String(o.value)} variant="secondary" className="cursor-pointer" onClick={() => onChange(selected.filter((x) => x !== o.value))}>
              {o.label} ×
            </Badge>
          ))}
        </div>
      )}
      {options.length > 8 && <Input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
        {shown.slice(0, 200).map((o) => (
          <label key={String(o.value)} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(o.value)}
              onCheckedChange={(v) => onChange(v ? [...selected.filter((x) => x !== o.value), o.value] : selected.filter((x) => x !== o.value))}
            />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
        {shown.length > 200 && <p className="text-xs text-muted-foreground">Narrow the filter to see more.</p>}
      </div>
    </div>
  );
}

/** Escape hatch for option shapes the field spec doesn't know. */
function JsonField({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const [state, setState] = useState({ for: value, text: JSON.stringify(value, null, 2), bad: false });
  if (state.for !== value) setState({ for: value, text: JSON.stringify(value, null, 2), bad: false });
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">Options JSON</summary>
      <Textarea
        className={`mt-2 font-mono text-xs ${state.bad ? "border-destructive" : ""}`}
        rows={4}
        value={state.text}
        onChange={(e) => setState({ ...state, text: e.target.value })}
        onBlur={() => {
          try {
            const parsed = JSON.parse(state.text) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object expected");
            setState({ ...state, bad: false });
            onChange(parsed as Record<string, unknown>);
          } catch {
            setState({ ...state, bad: true });
          }
        }}
      />
    </details>
  );
}
