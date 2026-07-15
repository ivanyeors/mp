"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Loader2, Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ApiConfig {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  api_key: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

type FormData = {
  name: string;
  slug: string;
  base_url: string;
  api_key: string;
  config: string;
  is_active: boolean;
};

const emptyForm: FormData = {
  name: "",
  slug: "",
  base_url: "",
  api_key: "",
  config: "{}",
  is_active: true,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function GeneralSettingsPage() {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const [autoSlug, setAutoSlug] = useState(true);

  /* ---- fetch ---- */
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/api-configs");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: ApiConfig[] = await res.json();
      setConfigs(data);
    } catch {
      toast.error("Failed to load API configurations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  /* ---- helpers ---- */
  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setAutoSlug(true);
    setShowKey(false);
    setDialogOpen(true);
  };

  const openEdit = (cfg: ApiConfig) => {
    setEditingId(cfg.id);
    setForm({
      name: cfg.name,
      slug: cfg.slug,
      base_url: cfg.base_url,
      api_key: cfg.api_key ?? "",
      config: JSON.stringify(cfg.config ?? {}, null, 2),
      is_active: cfg.is_active,
    });
    setAutoSlug(false);
    setShowKey(false);
    setDialogOpen(true);
  };

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name" && autoSlug) {
        next.slug = slugify(value as string);
      }
      return next;
    });
  };

  /* ---- save ---- */
  const handleSave = async () => {
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(form.config);
    } catch {
      toast.error("Config must be valid JSON");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        base_url: form.base_url,
        api_key: form.api_key,
        config: parsedConfig,
        is_active: form.is_active,
      };

      const isEdit = editingId !== null;
      if (isEdit) payload.id = editingId;

      const res = await fetch("/api/settings/api-configs", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(typeof err.error === "string" ? err.error : "Save failed");
      }

      toast.success(isEdit ? "API config updated" : "API config created");
      setDialogOpen(false);
      fetchConfigs();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /* ---- delete ---- */
  const handleDelete = async () => {
    if (!editingId) return;
    if (!confirm("Are you sure you want to delete this API configuration?")) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/api-configs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId }),
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("API config deleted");
      setDialogOpen(false);
      fetchConfigs();
    } catch {
      toast.error("Failed to delete API config");
    } finally {
      setSaving(false);
    }
  };

  /* ---- truncate url ---- */
  const truncateUrl = (url: string | null, max = 40) => {
    if (!url) return "—";
    return url.length > max ? url.slice(0, max) + "..." : url;
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">API Configurations</h1>
          <p className="text-sm text-muted-foreground">
            Manage external API integrations (LLM providers, Stripe, etc.)
          </p>
        </div>
        <Button onClick={openNew} className="shrink-0 self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add API
        </Button>
      </div>

      {/* Table */}
      {configs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No API configurations yet. Click &ldquo;Add API&rdquo; to create one.
        </div>
      ) : (
        <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Slug</th>
                <th className="px-4 py-3 text-left font-medium">Base URL</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((cfg) => (
                <tr key={cfg.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{cfg.name}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {cfg.slug}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs" title={cfg.base_url ?? ""}>
                    {truncateUrl(cfg.base_url)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={cfg.is_active ? "default" : "secondary"}>
                      {cfg.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(cfg)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit API Config" : "New API Config"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the configuration for this API integration."
                : "Add a new external API integration."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="cfg-name">Name</Label>
              <Input
                id="cfg-name"
                placeholder="e.g. OpenAI"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>

            {/* Slug */}
            <div className="grid gap-2">
              <Label htmlFor="cfg-slug">Slug</Label>
              <Input
                id="cfg-slug"
                placeholder="e.g. openai"
                value={form.slug}
                onChange={(e) => {
                  setAutoSlug(false);
                  updateField("slug", e.target.value);
                }}
              />
            </div>

            {/* Base URL */}
            <div className="grid gap-2">
              <Label htmlFor="cfg-url">Base URL</Label>
              <Input
                id="cfg-url"
                placeholder="https://api.openai.com/v1"
                value={form.base_url}
                onChange={(e) => updateField("base_url", e.target.value)}
              />
            </div>

            {/* API Key */}
            <div className="grid gap-2">
              <Label htmlFor="cfg-key">API Key</Label>
              <div className="relative">
                <Input
                  id="cfg-key"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={form.api_key}
                  onChange={(e) => updateField("api_key", e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Config JSON */}
            <div className="grid gap-2">
              <Label htmlFor="cfg-config">Config (JSON)</Label>
              <Textarea
                id="cfg-config"
                rows={5}
                className="font-mono text-xs"
                placeholder='{"model": "gpt-4"}'
                value={form.config}
                onChange={(e) => updateField("config", e.target.value)}
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-3">
              <Switch
                id="cfg-active"
                checked={form.is_active}
                onCheckedChange={(v) => updateField("is_active", v)}
              />
              <Label htmlFor="cfg-active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            {editingId && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={saving}
                className="mr-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
