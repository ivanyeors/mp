"use client";

import { useCallback, useRef, useState } from "react";
import { Download, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AD_TITLES,
  BOX_TYPES,
  DEFAULT_SETTINGS,
  TRACKING_STATUSES,
  WEBHOOK_EVENTS,
  importFromLive,
  type EasyshipAddress,
  type EasyshipSettings,
  type LiveSnapshot,
} from "@/lib/easyship/schema";
import type { SyncAction, SyncReport } from "@/lib/easyship/sync-report";
import { ShippingRulesEditor } from "./shipping-rules-editor";
import { EasyshipPanel } from "./easyship-panel";

export type SyncView = {
  last_at: string | null;
  report: SyncReport | null;
  easyship_company_id: string | null;
  webhook_secret_set: boolean;
};

export type EasyshipInitial = {
  settings: EasyshipSettings | null;
  sync: SyncView;
  webhook_endpoint: string | null;
};

type ApiResponse = Partial<EasyshipInitial> & {
  ok?: boolean;
  error?: unknown;
  report?: SyncReport;
  live?: LiveSnapshot;
};

const API = "/api/settings/easyship";
const EMPTY_SYNC: SyncView = { last_at: null, report: null, easyship_company_id: null, webhook_secret_set: false };

async function call(method: "GET" | "PUT" | "POST", body?: unknown, query = ""): Promise<ApiResponse> {
  const res = await fetch(`${API}${query}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as ApiResponse;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `Request failed (${res.status})`);
  }
  return json;
}

type Update = (fn: (draft: EasyshipSettings) => void) => void;

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function EasyshipSettingsPage({ initial }: { initial?: EasyshipInitial }) {
  const [settings, setSettings] = useState<EasyshipSettings>(initial?.settings ?? DEFAULT_SETTINGS);
  const [seeded, setSeeded] = useState(!!initial?.settings);
  const [sync, setSync] = useState<SyncView>(initial?.sync ?? EMPTY_SYNC);
  const endpoint = initial?.webhook_endpoint ?? null;
  const [busy, setBusy] = useState<"save" | "sync" | "import" | null>(null);
  const [tab, setTab] = useState("connection");

  const update: Update = useCallback((fn) => {
    setSettings((s) => {
      const draft = structuredClone(s);
      fn(draft);
      return draft;
    });
  }, []);

  const applyResponse = (r: ApiResponse) => {
    if (r.settings) setSettings(r.settings);
    if (r.sync) setSync(r.sync);
    if (r.report) {
      if (r.report.ok) toast.success("Saved and synced");
      else toast.error("Saved, but some sync steps failed — see the report");
    }
  };

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run("save", async () => {
      applyResponse(await call("PUT", settings));
      setSeeded(true);
    });
  const syncNow = () => run("sync", async () => applyResponse(await call("POST", { action: "sync" })));
  const importLive = () =>
    run("import", async () => {
      const r = await call("GET", undefined, "?live=1");
      if (!r.live) throw new Error("No live snapshot returned");
      const imported = importFromLive(r.live, endpoint ? new URL(endpoint).origin : null);
      // The courier account has no type → box mapping, so keep ours.
      setSettings((s) => ({ ...imported, box_for_type: s.box_for_type }));
      toast.success("Imported from courier account — review, then Save & sync");
    });

  const spin = (kind: typeof busy) => (busy === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Couriers</h1>
          <p className="text-sm text-muted-foreground">
            Saved here, pushed to the courier account on every save. This page is the source of truth.
            {sync.easyship_company_id ? ` Account ${sync.easyship_company_id}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={importLive} disabled={!!busy}>
            {spin("import") ?? <Download className="h-4 w-4" />} Import from courier account
          </Button>
          <Button variant="outline" onClick={syncNow} disabled={!!busy || !seeded}>
            {spin("sync") ?? <RefreshCw className="h-4 w-4" />} Sync now
          </Button>
          <Button onClick={save} disabled={!!busy}>
            {spin("save") ?? <Save className="h-4 w-4" />} Save &amp; sync
          </Button>
        </div>
      </div>

      {!seeded && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Nothing saved yet. Import from courier account to start from the live account, or fill the tabs in and save.
          </CardContent>
        </Card>
      )}

      <SyncReportCard sync={sync} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="addresses">Addresses <Count n={settings.addresses.length} /></TabsTrigger>
          <TabsTrigger value="boxes">Boxes <Count n={settings.boxes.length} /></TabsTrigger>
          <TabsTrigger value="rules">Rules <Count n={settings.shipping_rules.length} /></TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>

        {/* Kept mounted so unsaved Connection edits survive a tab switch. */}
        <TabsContent value="connection" forceMount className="mt-4 data-[state=inactive]:hidden">
          <EasyshipPanel onShowAddresses={() => setTab("addresses")} />
        </TabsContent>

        <TabsContent value="tracking" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <TrackingCard kind="tracking_email" settings={settings} update={update} />
            <TrackingCard kind="tracking_page" settings={settings} update={update} />
          </div>
        </TabsContent>
        <TabsContent value="addresses" className="mt-4">
          <AddressesSection addresses={settings.addresses} update={update} />
        </TabsContent>
        <TabsContent value="boxes" className="mt-4">
          <BoxesSection boxes={settings.boxes} boxForType={settings.box_for_type} update={update} />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <ShippingRulesEditor
            rules={settings.shipping_rules}
            onChange={(rules) => update((d) => { d.shipping_rules = rules; })}
          />
        </TabsContent>
        <TabsContent value="webhook" className="mt-4">
          <WebhookSection webhook={settings.webhook} endpoint={endpoint} sync={sync} update={update} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <Badge variant="secondary" className="ml-1.5 px-1.5">{n}</Badge>;
}

/* ── Sync report ──────────────────────────────────────────────────────── */

const ACTION_VARIANT: Record<SyncAction, "default" | "secondary" | "destructive" | "outline"> = {
  created: "default",
  updated: "default",
  activated: "default",
  deactivated: "outline",
  deleted: "outline",
  unchanged: "secondary",
  skipped: "secondary",
  error: "destructive",
};

function SyncReportCard({ sync }: { sync: SyncView }) {
  if (!sync.last_at || !sync.report) {
    return (
      <Card>
        <CardContent className="py-3 text-sm text-muted-foreground">Never synced.</CardContent>
      </Card>
    );
  }
  const { report } = sync;
  const changed = report.steps.filter((s) => s.action !== "unchanged" && s.action !== "skipped");
  return (
    <Card>
      <CardContent className="py-3">
        <details>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
            <Badge variant={report.ok ? "default" : "destructive"}>{report.ok ? "Synced" : "Sync had errors"}</Badge>
            <span className="text-muted-foreground">
              {new Date(sync.last_at).toLocaleString()} · {changed.length} change{changed.length === 1 ? "" : "s"},{" "}
              {report.steps.length - changed.length} unchanged
            </span>
          </summary>
          <ul className="mt-3 space-y-1 text-sm">
            {report.steps.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <Badge variant={ACTION_VARIANT[s.action]} className="w-24 justify-center">{s.action}</Badge>
                <span className="text-muted-foreground">{s.area}</span>
                <span className="break-all">{s.target}</span>
                {s.detail && <span className="text-xs text-muted-foreground break-all">— {s.detail}</span>}
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

/* ── Tracking email / page ─────────────────────────────────────────────── */

const DISPLAY_LABELS: Record<string, string> = {
  header: "Show company logo",
  contact: "Show contact page & social links",
  estimated_delivery_time: "Show estimated delivery time",
  status_icon: "Show animated status icon",
  contact_courier: "Show courier contact link",
};

const NONE = "__none__";

function TrackingCard({
  kind,
  settings,
  update,
}: {
  kind: "tracking_email" | "tracking_page";
  settings: EasyshipSettings;
  update: Update;
}) {
  const value = settings[kind];
  const isEmail = kind === "tracking_email";
  const set = (fn: (t: EasyshipSettings["tracking_email"] | EasyshipSettings["tracking_page"]) => void) =>
    update((d) => fn(d[kind]));

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div>
          <h2 className="font-medium">{isEmail ? "Tracking email" : "Tracking page"}</h2>
          <p className="text-xs text-muted-foreground">
            {isEmail ? "Status update emails the courier account sends your customers." : "The public trackmyshipment.co page."}
          </p>
        </div>

        <div className="space-y-2">
          {Object.entries(value.display_options).map(([key, on]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`${kind}-${key}`} className="font-normal">{DISPLAY_LABELS[key] ?? titleCase(key)}</Label>
              <Switch
                id={`${kind}-${key}`}
                checked={on}
                onCheckedChange={(v) => set((t) => { (t.display_options as Record<string, boolean>)[key] = v; })}
              />
            </div>
          ))}
        </div>

        {isEmail && (
          <div className="space-y-2">
            <Label>Email on these statuses</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TRACKING_STATUSES.map((s) => {
                const checked = settings.tracking_email.allowed_statuses.includes(s);
                return (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        update((d) => {
                          const list = d.tracking_email.allowed_statuses.filter((x) => x !== s);
                          d.tracking_email.allowed_statuses = v ? [...list, s] : list;
                        })
                      }
                    />
                    {titleCase(s)}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Button background"
            value={value.button.background_color}
            onChange={(v) => set((t) => { t.button.background_color = v; })}
          />
          <ColorField
            label="Button text"
            value={value.button.text_color}
            onChange={(v) => set((t) => { t.button.text_color = v; })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${kind}-footnote`}>Footnote</Label>
          <Textarea
            id={`${kind}-footnote`}
            value={value.footnote}
            maxLength={350}
            rows={3}
            onChange={(e) => set((t) => { t.footnote = e.target.value; })}
          />
          <p className="text-right text-xs text-muted-foreground">{value.footnote.length}/350</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Advertising button</Label>
            <Select
              value={value.advertising?.title ?? NONE}
              onValueChange={(v) =>
                set((t) => {
                  t.advertising = v === NONE ? null : { title: v as (typeof AD_TITLES)[number], url: t.advertising?.url ?? "" };
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {AD_TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {value.advertising && (
            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-ad-url`}>Button link</Label>
              <Input
                id={`${kind}-ad-url`}
                type="url"
                placeholder="https://"
                value={value.advertising.url}
                onChange={(e) => set((t) => { if (t.advertising) t.advertising.url = e.target.value; })}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour`}
          className="h-9 w-11 cursor-pointer rounded-md border bg-transparent p-0.5"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono uppercase" maxLength={7} />
      </div>
    </div>
  );
}

/* ── Addresses ─────────────────────────────────────────────────────────── */

const BLANK_ADDRESS: EasyshipAddress = {
  line_1: "", line_2: null, city: "Singapore", state: null, postal_code: null, country_alpha2: "SG",
  company_name: "", contact_name: "", contact_phone: "", contact_email: "",
  default_for: { sender: false, return: false, pickup: false, billing: false },
};

type AddressTextKey = Exclude<keyof EasyshipAddress, "default_for">;
const ADDRESS_FIELDS: Array<{ key: AddressTextKey; label: string; max: number; nullable?: boolean }> = [
  { key: "company_name", label: "Company", max: 27 },
  { key: "contact_name", label: "Contact name", max: 22 },
  { key: "contact_phone", label: "Phone", max: 20 },
  { key: "contact_email", label: "Email", max: 50 },
  { key: "line_1", label: "Address line 1", max: 35 },
  { key: "line_2", label: "Address line 2", max: 35, nullable: true },
  { key: "city", label: "City", max: 200 },
  { key: "state", label: "State / region", max: 200, nullable: true },
  { key: "postal_code", label: "Postal code", max: 20, nullable: true },
  { key: "country_alpha2", label: "Country (ISO-2)", max: 2 },
];

function AddressesSection({ addresses, update }: { addresses: EasyshipAddress[]; update: Update }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Default sender, return, pickup and billing addresses. Matched to the courier account by line 1 + postal code +
        company; other addresses there are left alone.
      </p>
      {addresses.map((a, i) => (
        <Card key={i}>
          <CardContent className="space-y-4 py-5">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{a.company_name || a.line_1 || `Address ${i + 1}`}</h3>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove address"
                onClick={() => update((d) => { d.addresses.splice(i, 1); })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ADDRESS_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`addr-${i}-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`addr-${i}-${f.key}`}
                    value={a[f.key] ?? ""}
                    maxLength={f.max}
                    onChange={(e) =>
                      update((d) => {
                        const v = e.target.value;
                        (d.addresses[i] as unknown as Record<string, string | null>)[f.key] = f.nullable ? v || null : v;
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {(["sender", "return", "pickup", "billing"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={a.default_for[k]}
                    onCheckedChange={(v) => update((d) => { d.addresses[i].default_for[k] = !!v; })}
                  />
                  Default {k}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" onClick={() => update((d) => { d.addresses.push(structuredClone(BLANK_ADDRESS)); })}>
        <Plus className="h-4 w-4" /> Add address
      </Button>
    </div>
  );
}

/* ── Boxes ─────────────────────────────────────────────────────────────── */

const BOX_DIMS = [
  { key: "outer_length", label: "Length (cm)" },
  { key: "outer_width", label: "Width (cm)" },
  { key: "outer_height", label: "Height (cm)" },
  { key: "weight", label: "Box weight (kg)" },
] as const;

const sameBox = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function BoxesSection({
  boxes,
  boxForType,
  update,
}: {
  boxes: EasyshipSettings["boxes"];
  boxForType: EasyshipSettings["box_for_type"];
  update: Update;
}) {
  const renaming = useRef("");
  // Renaming (on blur, so mid-typing names never collide) or removing a box carries its "Used for" mapping with it.
  const remap = (d: EasyshipSettings, from: string, to: string | null) => {
    for (const t of BOX_TYPES) {
      const m = d.box_for_type[t];
      if (!m || !sameBox(m.box, from)) continue;
      if (to === null) delete d.box_for_type[t];
      else m.box = to;
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your custom boxes (courier flat-rate boxes are built in). A box removed here is deleted from the courier account on sync.
        &ldquo;Used for&rdquo; picks the box each item type ships in, with one unit&apos;s content weight (a variant&apos;s own
        weight wins). A type with no box gets no live rates.
      </p>
      {boxes.map((b, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 py-4">
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_repeat(4,6rem)_auto]">
              <div className="space-y-1.5">
                <Label htmlFor={`box-${i}-name`}>Name</Label>
                <Input
                  id={`box-${i}-name`}
                  value={b.name}
                  onFocus={() => { renaming.current = b.name; }}
                  onChange={(e) => update((d) => { d.boxes[i].name = e.target.value; })}
                  onBlur={() => update((d) => {
                    const from = renaming.current;
                    const to = d.boxes[i].name;
                    const taken = (n: string) => d.boxes.some((o, j) => j !== i && sameBox(o.name, n));
                    if (from !== to && !taken(from) && !taken(to)) remap(d, from, to);
                  })}
                />
              </div>
              {BOX_DIMS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`box-${i}-${f.key}`} className="text-xs">{f.label}</Label>
                  <Input
                    id={`box-${i}-${f.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    value={b[f.key]}
                    onChange={(e) => update((d) => { d.boxes[i][f.key] = Number(e.target.value) || 0; })}
                  />
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove box"
                onClick={() => update((d) => { remap(d, d.boxes[i].name, null); d.boxes.splice(i, 1); })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Used for</span>
              {BOX_TYPES.map((t) => {
                const m = boxForType[t];
                const on = !!m && !!b.name.trim() && sameBox(m.box, b.name);
                return (
                  <div key={t} className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      aria-pressed={on}
                      disabled={!b.name.trim()}
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => update((d) => {
                        if (on) delete d.box_for_type[t];
                        else d.box_for_type[t] = { box: b.name, weight_grams: d.box_for_type[t]?.weight_grams ?? 0 };
                      })}
                    >
                      {titleCase(t)}
                    </Button>
                    {on && (
                      <Input
                        aria-label={`${titleCase(t)} content weight (g)`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step="10"
                        className="h-7 w-24 text-xs"
                        value={m.weight_grams}
                        onChange={(e) => update((d) => { d.box_for_type[t]!.weight_grams = Math.max(0, Math.round(Number(e.target.value) || 0)); })}
                      />
                    )}
                    {on && <span className="text-xs text-muted-foreground">g</span>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
      <Button
        variant="outline"
        onClick={() => update((d) => { d.boxes.push({ name: "", outer_length: 0, outer_width: 0, outer_height: 0, weight: 0 }); })}
      >
        <Plus className="h-4 w-4" /> Add box
      </Button>
    </div>
  );
}

/* ── Webhook ───────────────────────────────────────────────────────────── */

function WebhookSection({
  webhook,
  endpoint,
  sync,
  update,
}: {
  webhook: EasyshipSettings["webhook"];
  endpoint: string | null;
  sync: SyncView;
  update: Update;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="wh-enabled">Send events to this platform</Label>
            <p className="text-xs text-muted-foreground">Label and tracking events update the matching order by order number.</p>
          </div>
          <Switch id="wh-enabled" checked={webhook.enabled} onCheckedChange={(v) => update((d) => { d.webhook.enabled = v; })} />
        </div>

        <div className="space-y-1.5">
          <Label>Endpoint</Label>
          <Input readOnly value={endpoint ?? "Unavailable on this origin (needs a public https site URL)"} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">
            {sync.webhook_secret_set
              ? "Signing secret captured — incoming events are verified."
              : "Signing secret not captured yet; the receiver rejects events until the first sync with the webhook enabled."}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Events</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((ev) => {
              const checked = webhook.event_types.includes(ev);
              return (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      update((d) => {
                        const list = d.webhook.event_types.filter((x) => x !== ev);
                        d.webhook.event_types = v ? [...list, ev] : list;
                      })
                    }
                  />
                  <span className="font-mono text-xs">{ev}</span>
                </label>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
