"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SortableRow } from "@/components/ui/sortable-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  OTHER_DISCOVERY_SOURCE_ID,
  type DiscoverySourceCatalog,
  type DiscoverySourceOption,
} from "@/lib/discovery-source";
import { sortableMove, type SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import { getApiErrorMessage } from "@/lib/utils";
import { InfoTip } from "@/components/ui/info-tip";

const LOCALES = ["en-US", "zh-CN"] as const;

const iconButtonClassName =
  "min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:bg-press disabled:opacity-30";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function emptyLabels() {
  return { "en-US": "", "zh-CN": "" };
}

/** The `/api/settings/forms/discovery-source` payload the page mounts with. */
export type FormsInitialData = { ok: true; catalog: DiscoverySourceCatalog };

export default function FormsSettingsPage({
  initialData,
}: {
  initialData?: FormsInitialData;
}) {
  const [options, setOptions] = useState<DiscoverySourceOption[]>(
    initialData?.catalog?.options ?? [],
  );
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabels, setNewLabels] = useState(emptyLabels);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/forms/discovery-source");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data.error, "Couldn't load."));
      setOptions(data.catalog?.options ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load.");
    } finally {
      setLoading(false);
    }
  }, []);

  // The server already loaded the catalog; fetch only when it could not.
  // Saves and rollbacks still call load().
  useEffect(() => {
    if (initialData) return;
    // load() sets `loading`, which already starts true without initialData.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [initialData, load]);

  const save = async (next: DiscoverySourceOption[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/forms/discovery-source", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data.error, "Couldn't save."));
      setOptions(data.catalog?.options ?? next);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const editable = options.filter((o) => o.id !== OTHER_DISCOVERY_SOURCE_ID);
    const other = options.find((o) => o.id === OTHER_DISCOVERY_SOURCE_ID);
    const j = index + dir;
    if (j < 0 || j >= editable.length) return;
    const next = [...editable];
    [next[index], next[j]] = [next[j]!, next[index]!];
    void save(other ? [...next, other] : next);
  };

  const updateOption = (id: string, patch: Partial<DiscoverySourceOption>) => {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch, labels: patch.labels ?? o.labels } : o)),
    );
  };

  const archiveToggle = (id: string) => {
    if (id === OTHER_DISCOVERY_SOURCE_ID) {
      toast.error("Other can't be archived.");
      return;
    }
    const next = options.map((o) =>
      o.id === id ? { ...o, active: !o.active } : o,
    );
    void save(next);
  };

  const removeOption = (id: string) => {
    if (id === OTHER_DISCOVERY_SOURCE_ID || options.find((o) => o.id === id)?.system) {
      toast.error("System options can't be deleted.");
      return;
    }
    void save(options.filter((o) => o.id !== id));
  };

  const addOption = () => {
    const id = slugify(newId || newLabels["en-US"]);
    if (!id) {
      toast.error("Enter an id or English label.");
      return;
    }
    if (options.some((o) => o.id === id)) {
      toast.error("That id already exists.");
      return;
    }
    if (!newLabels["en-US"].trim()) {
      toast.error("Enter an English label.");
      return;
    }
    const other = options.find((o) => o.id === OTHER_DISCOVERY_SOURCE_ID);
    const rest = options.filter((o) => o.id !== OTHER_DISCOVERY_SOURCE_ID);
    const created: DiscoverySourceOption = {
      id,
      labels: {
        "en-US": newLabels["en-US"].trim(),
        "zh-CN": newLabels["zh-CN"].trim() || newLabels["en-US"].trim(),
      },
      active: true,
    };
    setAddOpen(false);
    setNewId("");
    setNewLabels(emptyLabels());
    void save(other ? [...rest, created, other] : [...rest, created]);
  };

  const editable = options.filter((o) => o.id !== OTHER_DISCOVERY_SOURCE_ID);
  const other = options.find((o) => o.id === OTHER_DISCOVERY_SOURCE_ID);

  // Only `editable` is sortable, so "Other" keeps its always-last slot on a drop too.
  const handleDragEnd = (event: SortableDragEndEvent) => {
    const next = sortableMove(editable, event, (o) => o.id);
    if (next) void save(other ? [...next, other] : next);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8" data-settings-forms="">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
          <InfoTip label="About Forms">
            <p>Edit the Discovery source options on the configurator preview. Customisation steps aren&apos;t edited here.</p>
          </InfoTip>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-medium">Discovery source</h2>
              <InfoTip label="About Discovery source">
                <p>Answers to “How did you hear about us?”</p>
              </InfoTip>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="flex-1 sm:flex-none">
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Discovery source</DialogTitle>
                  <DialogDescription>
                    The id is stored on results. Labels can change later.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-ds-id">Id (slug)</Label>
                    <Input
                      id="new-ds-id"
                      value={newId}
                      onChange={(e) => setNewId(e.target.value)}
                      placeholder="auto from English label"
                    />
                  </div>
                  <Tabs defaultValue="en-US">
                    <TabsList>
                      {LOCALES.map((loc) => (
                        <TabsTrigger key={loc} value={loc}>
                          {loc}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {LOCALES.map((loc) => (
                      <TabsContent key={loc} value={loc} className="mt-2">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={newLabels[loc]}
                          onChange={(e) =>
                            setNewLabels((prev) => ({ ...prev, [loc]: e.target.value }))
                          }
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={addOption} disabled={saving}>
                    Add option
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              type="button"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => void save(options)}
              disabled={saving || loading}
            >
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Save labels
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <DragDropProvider onDragEnd={handleDragEnd}>
            <ul className="space-y-2">
              {editable.map((opt, index) => (
                <li key={opt.id}>
                  <Collapsible
                    open={expanded === opt.id}
                    onOpenChange={(open) => setExpanded(open ? opt.id : null)}
                  >
                    <SortableRow
                      id={opt.id}
                      index={index}
                      label={opt.labels["en-US"] || opt.id}
                      className={`rounded-lg border bg-card ${!opt.active ? "opacity-60" : ""}`}
                    >
                      {(grip) => (
                        <>
                          <div className="flex items-center gap-1 px-2 py-2 max-md:py-1">
                            {grip}
                            <div className="flex flex-col max-md:hidden">
                              <button
                                type="button"
                                className={iconButtonClassName}
                                disabled={index === 0 || saving}
                                onClick={() => move(index, -1)}
                                aria-label="Move up"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className={iconButtonClassName}
                                disabled={index === editable.length - 1 || saving}
                                onClick={() => move(index, 1)}
                                aria-label="Move down"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>
                            <button
                              type="button"
                              className={`${iconButtonClassName} max-md:hidden`}
                              onClick={() => archiveToggle(opt.id)}
                              aria-label={opt.active ? "Archive" : "Restore"}
                            >
                              {opt.active ? (
                                <Archive className="h-4 w-4" />
                              ) : (
                                <ArchiveRestore className="h-4 w-4" />
                              )}
                            </button>
                            {/* Phones: the whole name line opens the labels, at 44px. */}
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                className="min-w-0 flex-1 px-2 text-left text-sm font-medium max-md:flex max-md:min-h-11 max-md:flex-col max-md:justify-center max-md:rounded-md max-md:transition-colors max-md:active:bg-press"
                              >
                                <span>{opt.labels["en-US"]}</span>
                                <span className="ml-2 font-normal text-muted-foreground max-md:ml-0 max-md:text-xs">
                                  {opt.id}
                                  {!opt.active ? ", archived" : ""}
                                </span>
                              </button>
                            </CollapsibleTrigger>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="min-h-11 min-w-11 text-muted-foreground max-md:hidden"
                              onClick={() => removeOption(opt.id)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-11 shrink-0 text-muted-foreground md:hidden"
                                  aria-label={`Actions for ${opt.labels["en-US"] || opt.id}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-44">
                                <DropdownMenuItem
                                  className="min-h-11"
                                  disabled={index === 0 || saving}
                                  onSelect={() => move(index, -1)}
                                >
                                  <ChevronUp />
                                  Move up
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="min-h-11"
                                  disabled={index === editable.length - 1 || saving}
                                  onSelect={() => move(index, 1)}
                                >
                                  <ChevronDown />
                                  Move down
                                </DropdownMenuItem>
                                <DropdownMenuItem className="min-h-11" onSelect={() => archiveToggle(opt.id)}>
                                  {opt.active ? <Archive /> : <ArchiveRestore />}
                                  {opt.active ? "Archive" : "Restore"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="min-h-11"
                                  onSelect={() => removeOption(opt.id)}
                                >
                                  <Trash2 />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <CollapsibleContent className="border-t px-4 py-3">
                            <Tabs defaultValue="en-US">
                              <TabsList>
                                {LOCALES.map((loc) => (
                                  <TabsTrigger key={loc} value={loc}>
                                    {loc}
                                  </TabsTrigger>
                                ))}
                              </TabsList>
                              {LOCALES.map((loc) => (
                                <TabsContent key={loc} value={loc} className="mt-2">
                                  <Label className="text-xs">Label</Label>
                                  <Input
                                    value={opt.labels[loc] ?? ""}
                                    onChange={(e) =>
                                      updateOption(opt.id, {
                                        labels: { ...opt.labels, [loc]: e.target.value },
                                      })
                                    }
                                  />
                                </TabsContent>
                              ))}
                            </Tabs>
                          </CollapsibleContent>
                        </>
                      )}
                    </SortableRow>
                  </Collapsible>
                </li>
              ))}

              {other ? (
                <li>
                  <Collapsible
                    open={expanded === other.id}
                    onOpenChange={(open) => setExpanded(open ? other.id : null)}
                  >
                    <div className="rounded-lg border border-dashed bg-card">
                      <div className="flex items-center gap-2 px-3 py-2.5 max-md:py-1">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          System
                        </span>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left text-sm font-medium max-md:flex max-md:min-h-11 max-md:flex-col max-md:justify-center max-md:rounded-md max-md:px-1 max-md:transition-colors max-md:active:bg-press"
                          >
                            <span>{other.labels["en-US"]}</span>
                            <span className="ml-2 font-normal text-muted-foreground max-md:ml-0 max-md:text-xs">
                              Always last, can&apos;t be archived
                            </span>
                          </button>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent className="border-t px-4 py-3">
                        <Tabs defaultValue="en-US">
                          <TabsList>
                            {LOCALES.map((loc) => (
                              <TabsTrigger key={loc} value={loc}>
                                {loc}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                          {LOCALES.map((loc) => (
                            <TabsContent key={loc} value={loc} className="mt-2">
                              <Label className="text-xs">Label</Label>
                              <Input
                                value={other.labels[loc] ?? ""}
                                onChange={(e) =>
                                  updateOption(other.id, {
                                    labels: { ...other.labels, [loc]: e.target.value },
                                  })
                                }
                              />
                            </TabsContent>
                          ))}
                        </Tabs>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </li>
              ) : null}
            </ul>
          </DragDropProvider>
        )}
      </section>
    </div>
  );
}
