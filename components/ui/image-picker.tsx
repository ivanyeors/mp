"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Upload, Loader2, ImageIcon, Check, Search, HardDrive } from "lucide-react";
import { getApiErrorMessage } from "@/lib/utils";
import { uploadImage } from "@/lib/media-assets/upload-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  SelectFromDriveDialog,
  type DriveImportedAsset,
} from "@/components/settings/select-from-drive-dialog";

/** Selection returned by the Asset picker (hybrid DAM ref). */
export type AssetSelection = {
  assetId: string;
  url: string;
  alt?: string | null;
};

type PickerAsset = {
  id: string;
  name: string;
  url: string;
  alt: string | null;
  created_at: string;
  folder_id: string | null;
  kind: string;
  tags: string[];
};

type PickerFolder = { id: string; name: string };

type FilterMode = "all" | "in_use" | "unused";
type FolderFilter = "all" | "unfiled" | string;
type KindFilter = "all" | "image" | "video" | "pdf";

interface ImagePickerProps {
  onSelect: (selection: AssetSelection) => void;
  children?: React.ReactNode;
  /** Image-only registry filter (product gallery default). */
  imageOnly?: boolean;
}

export function ImagePicker({ onSelect, children, imageOnly = true }: ImagePickerProps) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<PickerAsset[]>([]);
  const [usageByUrl, setUsageByUrl] = useState<Record<string, unknown[]>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [folders, setFolders] = useState<PickerFolder[]>([]);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>(imageOnly ? "image" : "all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [isDragging, setIsDragging] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const loadId = useRef(0);

  const loadAssets = useCallback(async () => {
    const id = ++loadId.current;
    setLoading(true);
    try {
      // ponytail: load all kinds when picker allows; imageOnly still requests kind=image
      const q = imageOnly ? "?kind=image" : "";
      const [assetsRes, usageRes, foldersRes] = await Promise.all([
        fetch(`/api/media-assets${q}`),
        fetch("/api/media/usage"),
        fetch("/api/media-folders"),
      ]);
      const assetsData = await assetsRes.json();
      const usageData = await usageRes.json();
      const foldersData = await foldersRes.json();
      if (id !== loadId.current) return;

      if (!assetsRes.ok || !assetsData.ok) {
        toast.error(getApiErrorMessage(assetsData.error, "Failed to load assets"));
        return;
      }

      const loaded: PickerAsset[] = (
          assetsData.assets as Array<{
            id: string;
            name: string;
            alt_text?: string | null;
            hosted_url?: string | null;
            created_at: string;
            folder_id?: string | null;
            kind?: string;
            tags?: string[];
          }>
        )
          .filter((a) => a.hosted_url)
          .map((a) => ({
            id: a.id,
            name: a.name,
            url: a.hosted_url!,
            alt: a.alt_text ?? null,
            created_at: a.created_at,
            folder_id: a.folder_id ?? null,
            kind: a.kind ?? "image",
            tags: Array.isArray(a.tags) ? a.tags : [],
          }));
      setAssets(loaded);

      if (foldersData.ok && Array.isArray(foldersData.folders)) {
        setFolders(
          foldersData.folders.map((f: PickerFolder) => ({
            id: f.id,
            name: f.name,
          })),
        );
      }

      if (usageData.ok && usageData.usages) {
        setUsageByUrl(usageData.usages);
      }
    } catch (error) {
      if (id !== loadId.current) return;
      console.error("Failed to load assets", error);
      toast.error("Failed to load media assets");
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, [imageOnly]);

  // Each open starts from the full library with no search or filters.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    void loadAssets();
    setSearchQuery("");
    setFilterMode("all");
    setFolderFilter("all");
    setKindFilter(imageOnly ? "image" : "all");
    setTagFilter("all");
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    const res = await uploadImage(file);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Image uploaded");
    onSelect({ assetId: res.asset.id, url: res.asset.hosted_url, alt: res.asset.alt_text ?? null });
    setOpen(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleSelect = (asset: PickerAsset) => {
    onSelect({ assetId: asset.id, url: asset.url, alt: asset.alt });
    setOpen(false);
  };

  // One hosted import picks it straight away; several land in the grid to choose from.
  const handleDriveImported = (imported: DriveImportedAsset[]) => {
    const [only] = imported;
    if (imported.length === 1 && only.hosted_url) {
      onSelect({
        assetId: only.id,
        url: only.hosted_url,
        alt: only.alt_text ?? null,
      });
      setOpen(false);
      return;
    }
    void loadAssets();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  };

  const isUsed = useCallback(
    (asset: PickerAsset) => (usageByUrl[asset.url]?.length ?? 0) > 0,
    [usageByUrl],
  );

  const knownTags = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      for (const t of a.tags) set.add(t);
    }
    return [...set].sort();
  }, [assets]);

  const filtered = useMemo(() => {
    let list = assets;
    if (folderFilter === "unfiled") list = list.filter((a) => !a.folder_id);
    else if (folderFilter !== "all") list = list.filter((a) => a.folder_id === folderFilter);
    if (!imageOnly && kindFilter !== "all") {
      list = list.filter((a) => a.kind === kindFilter);
    }
    if (tagFilter !== "all") list = list.filter((a) => a.tags.includes(tagFilter));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    if (filterMode === "in_use") list = list.filter(isUsed);
    else if (filterMode === "unused") list = list.filter((a) => !isUsed(a));
    return list;
  }, [assets, folderFilter, kindFilter, tagFilter, searchQuery, filterMode, isUsed, imageOnly]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {children || (
            <Button variant="outline" type="button">
              <ImageIcon className="mr-2 h-4 w-4" />
              Browse Media
            </Button>
          )}
        </DialogTrigger>
        <DialogContent
          className="max-w-4xl max-h-[85vh] flex flex-col"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <DialogHeader>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle>Select Asset</DialogTitle>
                <DialogDescription>
                  Upload or drop an image to attach it, or pick one below.
                </DialogDescription>
              </div>
              <div className="flex gap-2 max-sm:justify-center sm:mr-6">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleUpload}
                  disabled={uploading}
                />
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => setDriveOpen(true)}
                  disabled={uploading}
                >
                  <HardDrive className="mr-2 h-4 w-4" />
                  Drive
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-2 px-1">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex gap-1">
                {(
                  [
                    ["all", "All"],
                    ["in_use", "Used"],
                    ["unused", "Unused"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={filterMode === value ? "default" : "outline"}
                    onClick={() => setFilterMode(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {!imageOnly && (
              <div className="flex flex-wrap gap-1">
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
                    onClick={() => setKindFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value as FolderFilter)}
                className="text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary sm:max-w-xs"
                aria-label="Filter by folder"
              >
                <option value="all">All folders</option>
                <option value="unfiled">Unfiled</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary sm:max-w-xs"
                aria-label="Filter by tag"
              >
                <option value="all">All tags</option>
                {knownTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 min-h-[300px] relative">
            {isDragging && (
              <div className="absolute inset-0 z-10 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <Upload className="mx-auto h-10 w-10 text-primary mb-2" />
                  <p className="text-sm font-medium text-primary">Drop image to upload</p>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : assets.length === 0 ? (
              <div className="text-center py-20 border rounded-lg bg-muted/20">
                <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-3" />
                <h3 className="text-lg font-medium">No media assets found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Upload some images or drag &amp; drop to get started.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Search className="mx-auto h-8 w-8 text-muted-foreground opacity-50 mb-2" />
                <p className="text-sm text-muted-foreground">No assets match your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filtered.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleSelect(asset)}
                    className="group relative border rounded-lg overflow-hidden bg-background shadow-sm hover:shadow-md hover:border-primary transition-all text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                      <img
                        src={asset.url}
                        alt={asset.alt || asset.name}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="bg-primary text-primary-foreground rounded-full p-2 transform scale-75 group-hover:scale-100 transition-transform">
                        <Check className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="p-2 text-xs truncate bg-background border-t flex items-center justify-between gap-1">
                      <span className="truncate" title={asset.name}>
                        {asset.name}
                      </span>
                      {isUsed(asset) ? (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Used
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-700">
                          Unused
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <SelectFromDriveDialog
        open={driveOpen}
        onOpenChange={setDriveOpen}
        onImported={handleDriveImported}
        imageOnly={imageOnly}
      />
    </>
  );
}
