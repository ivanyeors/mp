"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  FileText,
  Film,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Search,
} from "lucide-react";
import { getApiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink: string | null;
  size: number | null;
  webViewLink: string | null;
  isFolder: boolean;
};

type SharedDrive = { id: string; name: string };

type Crumb = {
  label: string;
  driveId?: string;
  folderId?: string;
};

type ImportableKind = "image" | "video" | "pdf";

function kindFromMime(mimeType: string): ImportableKind | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  return "other";
}

function kindIcon(kind: ImportableKind | "other" | "folder", className = "h-5 w-5") {
  switch (kind) {
    case "folder":
      return <Folder className={`${className} text-amber-600`} />;
    case "video":
      return <Film className={`${className} text-muted-foreground`} />;
    case "pdf":
      return <FileText className={`${className} text-muted-foreground`} />;
    case "image":
      return <ImageIcon className={`${className} text-muted-foreground`} />;
    default:
      return <FileText className={`${className} text-muted-foreground opacity-40`} />;
  }
}

export type DriveImportedAsset = {
  id: string;
  hosted_url?: string | null;
  alt_text?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (assets: DriveImportedAsset[]) => void;
  imageOnly?: boolean;
};

export function SelectFromDriveDialog({
  open,
  onOpenChange,
  onImported,
  imageOnly = false,
}: Props) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ label: "Shared Drives" }]);
  const [drives, setDrives] = useState<SharedDrive[]>([]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, DriveItem>>(new Map());
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DriveItem[]>([]);
  const [resultsNext, setResultsNext] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [kindFilter, setKindFilter] = useState<ImportableKind | "all">(imageOnly ? "image" : "all");
  const searchSeq = useRef(0);

  const current = crumbs[crumbs.length - 1];
  const atDriveList = !current.driveId;

  const reset = useCallback(() => {
    setCrumbs([{ label: "Shared Drives" }]);
    setDrives([]);
    setItems([]);
    setNextPageToken(null);
    setError(null);
    setSelected(new Map());
    setImporting(false);
    setQuery("");
    setResults([]);
    setResultsNext(null);
    setKindFilter(imageOnly ? "image" : "all");
  }, [imageOnly]);

  const loadDrives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/media/drive/browse");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(getApiErrorMessage(data.error, "Failed to list Shared Drives"));
      }
      setDrives(data.drives ?? []);
      setItems([]);
      setNextPageToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to list Shared Drives");
      setDrives([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFolder = useCallback(async (driveId: string, folderId: string, pageToken?: string) => {
    const appending = Boolean(pageToken);
    if (appending) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const qs = new URLSearchParams({ driveId, folderId });
      if (pageToken) qs.set("pageToken", pageToken);
      const res = await fetch(`/api/media/drive/browse?${qs}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(getApiErrorMessage(data.error, "Failed to list folder"));
      }
      const next = (data.items ?? []) as DriveItem[];
      setItems((prev) => (appending ? [...prev, ...next] : next));
      setNextPageToken(data.nextPageToken ?? null);
      if (!appending) setDrives([]);
    } catch (e) {
      if (!appending) {
        setError(e instanceof Error ? e.message : "Failed to list folder");
        setItems([]);
        setNextPageToken(null);
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to load more");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const runSearch = useCallback(
    async (
      text: string,
      driveId: string | undefined,
      kind: ImportableKind | "all",
      pageToken?: string,
    ) => {
      const seq = ++searchSeq.current;
      if (!pageToken) setSearching(true);
      else setLoadingMore(true);
      try {
        const qs = new URLSearchParams({ q: text });
        if (driveId) qs.set("driveId", driveId);
        if (kind !== "all") qs.set("kind", kind);
        if (pageToken) qs.set("pageToken", pageToken);
        const res = await fetch(`/api/media/drive/browse?${qs}`);
        const data = await res.json();
        if (seq !== searchSeq.current) return;
        if (!res.ok || !data.ok) {
          throw new Error(getApiErrorMessage(data.error, "Search failed"));
        }
        const next = (data.items ?? []) as DriveItem[];
        setResults((prev) => (pageToken ? [...prev, ...next] : next));
        setResultsNext(data.nextPageToken ?? null);
      } catch (e) {
        if (seq === searchSeq.current) {
          toast.error(e instanceof Error ? e.message : "Search failed");
        }
      } finally {
        if (seq === searchSeq.current) {
          setSearching(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  const debouncedSearch = useDebouncedCallback(
    (text: string, driveId: string | undefined, kind: ImportableKind | "all") =>
      void runSearch(text, driveId, kind),
    300,
  );

  const onQueryChange = (text: string) => {
    setQuery(text);
    if (text.trim()) {
      debouncedSearch(text.trim(), current.driveId, kindFilter);
    } else {
      debouncedSearch.cancel();
      searchSeq.current += 1;
      setSearching(false);
      setResults([]);
      setResultsNext(null);
    }
  };

  const searchActive = query.trim().length > 0;
  const changeKind = (kind: ImportableKind | "all") => {
    setKindFilter(kind);
    if (searchActive) {
      debouncedSearch.cancel();
      void runSearch(query.trim(), current.driveId, kind);
    }
  };

  const listItems = searchActive
    ? results
    : kindFilter === "all"
      ? items
      : items.filter((i) => i.isFolder || kindFromMime(i.mimeType) === kindFilter);
  const listNext = searchActive ? resultsNext : nextPageToken;

  useEffect(() => {
    if (!open) return;
    reset();
    void loadDrives();
  }, [open, reset, loadDrives]);

  const goToCrumb = (index: number) => {
    onQueryChange("");
    const next = crumbs.slice(0, index + 1);
    setCrumbs(next);
    const c = next[next.length - 1];
    if (!c.driveId) void loadDrives();
    else void loadFolder(c.driveId, c.folderId ?? c.driveId);
  };

  const openDrive = (drive: SharedDrive) => {
    onQueryChange("");
    setCrumbs([
      { label: "Shared Drives" },
      { label: drive.name, driveId: drive.id, folderId: drive.id },
    ]);
    void loadFolder(drive.id, drive.id);
  };

  const openFolder = (folder: DriveItem) => {
    if (!current.driveId) return;
    setCrumbs((prev) => [
      ...prev,
      { label: folder.name, driveId: current.driveId, folderId: folder.id },
    ]);
    void loadFolder(current.driveId, folder.id);
  };

  const toggleSelect = (item: DriveItem) => {
    if (item.isFolder || kindFromMime(item.mimeType) === "other") return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  };

  const handleImport = async () => {
    const files = [...selected.values()];
    if (files.length === 0) return;
    setImporting(true);
    let ok = 0;
    let existing = 0;
    let failed = 0;
    const imported: DriveImportedAsset[] = [];
    try {
      for (const file of files) {
        try {
          const res = await fetch("/api/media/import/drive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: file.id, name: file.name }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            failed += 1;
            toast.error(getApiErrorMessage(data.error, `Failed to import ${file.name}`));
            continue;
          }
          if (data.asset) imported.push(data.asset);
          if (data.existing) existing += 1;
          else ok += 1;
        } catch {
          failed += 1;
          toast.error(`Failed to import ${file.name}`);
        }
      }
      if (ok + existing > 0) {
        const parts = [
          ok ? `${ok} imported` : null,
          existing ? `${existing} already in library` : null,
          failed ? `${failed} failed` : null,
        ].filter(Boolean);
        toast.success(parts.join(" · "));
        onImported(imported);
        onOpenChange(false);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Select from Drive</DialogTitle>
          <DialogDescription>
            Browse Shared Drives and import images (hosted) or video/PDF (Drive link).
          </DialogDescription>
        </DialogHeader>

        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm min-h-6">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {last ? (
                  <span className="font-medium text-foreground">{c.label}</span>
                ) : (
                  <button
                    type="button"
                    className="relative text-muted-foreground underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:text-foreground hover:underline active:opacity-60"
                    onClick={() => goToCrumb(i)}
                    disabled={loading || importing}
                  >
                    {c.label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={
              current.driveId ? `Search ${crumbs[1]?.label}…` : "Search all Shared Drives…"
            }
            aria-label="Search Drive files by name"
            className="pl-8"
          />
        </div>

        {!imageOnly && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
            {(
              [
                ["all", "All kinds"],
                ["image", "Images"],
                ["video", "Videos"],
                ["pdf", "PDFs"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={kindFilter === value ? "default" : "outline"}
                aria-pressed={kindFilter === value}
                onClick={() => changeKind(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-[280px] max-h-[50vh] overflow-y-auto border rounded-lg">
          {loading || (searchActive && searching) ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : error && !searchActive ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  atDriveList
                    ? void loadDrives()
                    : void loadFolder(current.driveId!, current.folderId ?? current.driveId!)
                }
              >
                Retry
              </Button>
            </div>
          ) : atDriveList && !searchActive ? (
            drives.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                No Shared Drives visible to the workspace account.
              </p>
            ) : (
              <ul className="divide-y">
                {drives.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="w-full flex min-h-12 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 active:bg-press"
                      onClick={() => openDrive(d)}
                    >
                      <HardDrive className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{d.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : listItems.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              {searchActive
                ? "No matching files."
                : kindFilter !== "all" && items.length > 0
                  ? "Nothing of this kind in this folder."
                  : "This folder is empty."}
            </p>
          ) : (
            <ul className="divide-y">
              {listItems.map((item) => {
                const kind = item.isFolder ? "folder" : kindFromMime(item.mimeType);
                const importable = !item.isFolder && kind !== "other";
                const checked = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <div
                      className={`flex items-center gap-3 px-3 py-2 ${
                        item.isFolder ? "hover:bg-muted/50 active:bg-press cursor-pointer" : ""
                      } ${!importable && !item.isFolder ? "opacity-60" : ""}`}
                      onClick={() => {
                        if (item.isFolder) openFolder(item);
                      }}
                      onKeyDown={(e) => {
                        if (item.isFolder && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          openFolder(item);
                        }
                      }}
                      role={item.isFolder ? "button" : undefined}
                      tabIndex={item.isFolder ? 0 : undefined}
                    >
                      {importable ? (
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSelect(item)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${item.name}`}
                        />
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <div className="w-9 h-9 shrink-0 rounded border bg-muted flex items-center justify-center overflow-hidden">
                        {!item.isFolder && item.thumbnailLink ? (
                          <img
                            src={item.thumbnailLink}
                            alt=""
                            className="object-cover w-full h-full"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          kindIcon(kind)
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                          {item.isFolder
                            ? "folder"
                            : kind === "other"
                              ? "unsupported"
                              : kind === "image"
                                ? "image"
                                : `${kind} · link only`}
                          {!item.isFolder && item.size != null
                            ? ` · ${(item.size / 1024).toFixed(1)} KB`
                            : ""}
                        </div>
                      </div>
                      {item.isFolder && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {listNext && !loading && !searching && (searchActive || !error) && (
          <Button
            variant="outline"
            size="sm"
            className="self-center"
            disabled={loadingMore || importing}
            onClick={() =>
              searchActive
                ? void runSearch(query.trim(), current.driveId, kindFilter, listNext)
                : void loadFolder(current.driveId!, current.folderId ?? current.driveId!, listNext)
            }
          >
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load more
          </Button>
        )}

        <DialogFooter className="gap-2 sm:items-center">
          <span className="text-xs text-muted-foreground mr-auto">
            {selected.size === 0 ? "Select one or more files" : `${selected.size} selected`}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={() => void handleImport()} disabled={importing || selected.size === 0}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
