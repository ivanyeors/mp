"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
    Upload,
    Trash2,
    Link as LinkIcon,
    Image as ImageIcon,
    Loader2,
    RotateCcw,
    Check,
    Search,
    ArrowLeftRight,
    Newspaper,
    LayoutDashboard,
    ExternalLink,
    AlertTriangle,
    FileText,
    Film,
    Mail,
} from "lucide-react";
import { getApiErrorMessage } from "@/lib/utils";
import { formatAdminDate, formatAdminRelative } from "@/lib/format/admin-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { SelectFromDriveDialog } from "@/components/settings/select-from-drive-dialog";
import { InfoTip } from "@/components/ui/info-tip";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MediaFile {
    name: string;
    url: string | null;
    id: string;
    created_at: string;
    kind?: string;
    alt_text?: string | null;
    drive_url?: string | null;
    drive_file_id?: string | null;
    last_used_at?: string | null;
    folder_id?: string | null;
    tags?: string[];
}

interface MediaFolderRow {
    id: string;
    name: string;
}

interface DrivePreview {
    id: string;
    name: string;
    mimeType: string;
    thumbnailLink: string | null;
    size: number | null;
    webViewLink: string | null;
    isFolder: boolean;
}

function kindFromMime(mimeType: string): "image" | "video" | "pdf" | "other" {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType === "application/pdf") return "pdf";
    return "other";
}

interface LandingSlot {
    key: string;
    label: string;
    defaultUrl: string;
}

interface UsageEntry {
    type: string;
    label: string;
    ref_id: string;
}

type UsageMap = Record<string, UsageEntry[]>;
type FilterMode = "all" | "in_use" | "unused";
/** all = no folder filter; unfiled = folder_id null; else folder uuid */
type FolderFilter = "all" | "unfiled" | string;
type KindFilter = "all" | "image" | "video" | "pdf";

/* ------------------------------------------------------------------ */
/* Landing page image slot definitions                                 */
/* ------------------------------------------------------------------ */

const LANDING_SLOTS: LandingSlot[] = [
    { key: "landing_hero", label: "Hero", defaultUrl: "/m-pillow-417953-web.webp" },
    { key: "landing_size_matters", label: "Size matters", defaultUrl: "/images/landing/size-matters.jpg" },
    { key: "landing_marquee", label: "Marquee", defaultUrl: "/3way-side-sleep.jpg" },
    { key: "landing_ambassadors", label: "Ambassadors", defaultUrl: "/images/landing/ambassadors-hero.webp" },
    { key: "landing_cervical_neck", label: "Cervical neck", defaultUrl: "/mpillow-cervical-neck.webp" },
    { key: "landing_basic_pillow", label: "Basic pillow", defaultUrl: "/basic-mpillow.webp" },
    { key: "landing_premium_pillow", label: "Premium pillow", defaultUrl: "/DarkMpillowImage-WEB.jpg" },
    { key: "landing_mbolster", label: "Mbolster", defaultUrl: "/808907f4-ac2b-499a-ace6-69933883b2f5.webp" },
    { key: "landing_founder", label: "Founder", defaultUrl: "/Darrenyeo-profileshoot_2.webp" },
];

/* ------------------------------------------------------------------ */
/* Server-rendered first paint                                         */
/* ------------------------------------------------------------------ */

type MediaAssetJson = {
    id: string;
    name: string;
    alt_text?: string | null;
    hosted_url?: string | null;
    drive_url?: string | null;
    drive_file_id?: string | null;
    created_at: string;
    kind: string;
    last_used_at?: string | null;
    folder_id?: string | null;
    tags?: string[];
};

/**
 * Exactly the JSON `/api/media-assets` and `/api/media-folders` return,
 * pre-fetched by the RSC page wrapper. Null when the server did not load them
 * (including the empty-registry case, which needs the client's backfill), and
 * the client then fetches both on mount as before. Landing-image overrides and
 * usage counts are still fetched by the client.
 */
export type MediaInitialData = {
    assets: { ok: true; assets: MediaAssetJson[] };
    folders: { ok: true; folders: MediaFolderRow[] };
} | null;

/** Same projection `loadFiles` applies to the asset registry rows. */
function toMediaFiles(assets: MediaAssetJson[]): MediaFile[] {
    return assets.map((a) => ({
        id: a.id,
        name: a.name,
        alt_text: a.alt_text ?? null,
        url: a.hosted_url ?? null,
        drive_url: a.drive_url ?? null,
        drive_file_id: a.drive_file_id ?? null,
        created_at: a.created_at,
        kind: a.kind,
        last_used_at: a.last_used_at ?? null,
        folder_id: a.folder_id ?? null,
        tags: Array.isArray(a.tags) ? a.tags : [],
    }));
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function MediaPage({ initialData }: { initialData?: MediaInitialData }) {
    /* Media gallery state */
    const [files, setFiles] = useState<MediaFile[]>(
        initialData ? toMediaFiles(initialData.assets.assets) : [],
    );
    const [loading, setLoading] = useState(!initialData);

    // The server already delivered the assets and folders; skip those two
    // mount fetches. Overrides + usage still load on the client, and every
    // later refresh (upload, delete, folder edit) is untouched.
    const skipFilesFetch = useRef(Boolean(initialData));
    const skipFoldersFetch = useRef(Boolean(initialData));
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /* Landing-image overrides state */
    const [overrides, setOverrides] = useState<Record<string, string>>({});
    const [overridesLoading, setOverridesLoading] = useState(true);
    const [savingSlot, setSavingSlot] = useState<string | null>(null);

    /* Picker dialog state (for landing slots) */
    const [pickerSlot, setPickerSlot] = useState<LandingSlot | null>(null);

    /* Usage data (URL map for grid; detailUsages for open sheet) */
    const [usageMap, setUsageMap] = useState<UsageMap>({});
    const [usageByAssetId, setUsageByAssetId] = useState<UsageMap>({});
    const [usageLoading, setUsageLoading] = useState(true);
    const [detailUsages, setDetailUsages] = useState<UsageEntry[] | null>(null);

    /**
     * "Now" is sampled once per mount instead of on every render, so the
     * relative "used" labels are stable while the page is open. The server
     * samples its own instant, so the elements that print one are marked
     * `suppressHydrationWarning` — a relative time genuinely cannot agree
     * across the two passes.
     */
    const [nowMs] = useState(() => Date.now());
    const relativeUsed = useCallback(
        (iso: string | null | undefined) => formatAdminRelative(iso, nowMs),
        [nowMs],
    );

    /* Image detail sheet */
    const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
    const [editName, setEditName] = useState("");
    const [editAlt, setEditAlt] = useState("");
    const [savingMeta, setSavingMeta] = useState(false);
    const [reimporting, setReimporting] = useState(false);

    /* Search & filter */
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<FilterMode>("all");
    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [tagFilter, setTagFilter] = useState<string>("all");
    const [folders, setFolders] = useState<MediaFolderRow[]>(
        initialData
            ? initialData.folders.folders.map((f) => ({ id: f.id, name: f.name }))
            : [],
    );
    const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
    const [newFolderName, setNewFolderName] = useState("");
    const [folderBusy, setFolderBusy] = useState(false);
    const [editFolderId, setEditFolderId] = useState<string | null>(null);
    const [editTags, setEditTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");

    /* Replace dialog */
    const [replaceFile, setReplaceFile] = useState<MediaFile | null>(null);
    const [replacing, setReplacing] = useState(false);

    /* Delete confirmation dialog (for in-use images) */
    // `deletable` is false when an email campaign uses it: no "Delete anyway" past that.
    const [deleteConfirm, setDeleteConfirm] = useState<{ file: MediaFile; usages: UsageEntry[]; deletable: boolean } | null>(null);
    const [deleting, setDeleting] = useState(false);

    /* Drive paste import */
    const [driveUrl, setDriveUrl] = useState("");
    const [drivePreview, setDrivePreview] = useState<DrivePreview | null>(null);
    const [drivePreviewing, setDrivePreviewing] = useState(false);
    const [driveImporting, setDriveImporting] = useState(false);
    const [driveBrowseOpen, setDriveBrowseOpen] = useState(false);

    /* ---------------------------------------------------------------- */
    /* Data loaders                                                      */
    /* ---------------------------------------------------------------- */

    const loadFiles = useCallback(async () => {
        setLoading(true);
        try {
            let res = await fetch("/api/media-assets");
            let data = await res.json();
            if (data.ok && Array.isArray(data.assets) && data.assets.length === 0) {
                // One-shot backfill from existing bucket objects
                await fetch("/api/media-assets", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "backfill" }),
                });
                res = await fetch("/api/media-assets");
                data = await res.json();
            }
            if (data.ok && Array.isArray(data.assets)) {
                setFiles(toMediaFiles(data.assets as MediaAssetJson[]));
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't load media assets."));
            }
        } catch (error) {
            console.error("Couldn't load files.", error);
            toast.error("Couldn't load media files.");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadFolders = useCallback(async () => {
        try {
            const res = await fetch("/api/media-folders");
            const data = await res.json();
            if (data.ok && Array.isArray(data.folders)) {
                setFolders(data.folders.map((f: MediaFolderRow) => ({ id: f.id, name: f.name })));
            }
        } catch (error) {
            console.error("Couldn't load folders.", error);
        }
    }, []);

    const loadOverrides = useCallback(async () => {
        setOverridesLoading(true);
        try {
            const keys = LANDING_SLOTS.map((s) => s.key).join(",");
            const res = await fetch(`/api/site-settings?keys=${keys}`);
            const data = await res.json();
            if (data.ok) {
                const map: Record<string, string> = {};
                for (const row of data.settings) map[row.key] = row.value;
                setOverrides(map);
            }
        } catch (error) {
            console.error("Couldn't load overrides.", error);
        } finally {
            setOverridesLoading(false);
        }
    }, []);

    const loadUsages = useCallback(async () => {
        setUsageLoading(true);
        try {
            const res = await fetch("/api/media/usage");
            const data = await res.json();
            if (data.ok) setUsageMap(data.usages);
        } catch (error) {
            console.error("Couldn't load usages.", error);
        } finally {
            setUsageLoading(false);
        }
    }, []);

    useEffect(() => {
        const byId: UsageMap = {};
        for (const f of files) {
            if (f.url && usageMap[f.url]) byId[f.id] = usageMap[f.url];
        }
        setUsageByAssetId(byId);
    }, [files, usageMap]);

    useEffect(() => {
        if (skipFilesFetch.current) {
            skipFilesFetch.current = false;
        } else {
            loadFiles();
        }
        if (skipFoldersFetch.current) {
            skipFoldersFetch.current = false;
        } else {
            loadFolders();
        }
        loadOverrides();
        loadUsages();
    }, [loadFiles, loadFolders, loadOverrides, loadUsages]);

    /* ---------------------------------------------------------------- */
    /* Filtered files                                                    */
    /* ---------------------------------------------------------------- */

    const getFileUsages = useCallback(
        (file: MediaFile): UsageEntry[] => {
            if (file.url && usageMap[file.url]?.length) return usageMap[file.url];
            return usageByAssetId[file.id] ?? [];
        },
        [usageMap, usageByAssetId],
    );

    const filteredFiles = useMemo(() => {
        let result = files;

        if (folderFilter === "unfiled") {
            result = result.filter((f) => !f.folder_id);
        } else if (folderFilter !== "all") {
            result = result.filter((f) => f.folder_id === folderFilter);
        }

        if (kindFilter !== "all") {
            result = result.filter((f) => (f.kind ?? "image") === kindFilter);
        }

        if (tagFilter !== "all") {
            result = result.filter((f) => (f.tags ?? []).includes(tagFilter));
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((f) => f.name.toLowerCase().includes(q));
        }

        // Usage filter
        if (filterMode === "in_use") {
            result = result.filter((f) => getFileUsages(f).length > 0);
        } else if (filterMode === "unused") {
            result = result.filter((f) => getFileUsages(f).length === 0);
        }

        return result;
    }, [files, folderFilter, kindFilter, tagFilter, searchQuery, filterMode, getFileUsages]);

    const knownTags = useMemo(() => {
        const set = new Set<string>();
        for (const f of files) {
            for (const t of f.tags ?? []) set.add(t);
        }
        return [...set].sort();
    }, [files]);

    /* ---------------------------------------------------------------- */
    /* Actions                                                           */
    /* ---------------------------------------------------------------- */

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        try {
            const res = await fetch("/api/media", { method: "POST", body: formData });
            const data = await res.json();
            if (data.ok) {
                loadFiles();
                toast.success("Image uploaded");
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't upload."));
            }
        } catch (error) {
            console.error("Upload error", error);
            toast.error("Couldn't upload.");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDrivePreview = async () => {
        const url = driveUrl.trim();
        if (!url) {
            toast.error("Paste a Google Drive link first");
            return;
        }
        setDrivePreviewing(true);
        setDrivePreview(null);
        try {
            const res = await fetch(`/api/media/drive/resolve?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast.error(getApiErrorMessage(data.error, "Couldn't open that Drive link."));
                return;
            }
            if (data.file.isFolder) {
                toast.error("Folders can't be imported. Paste a link to a file.");
                return;
            }
            setDrivePreview(data.file as DrivePreview);
        } catch (error) {
            console.error("Drive preview error", error);
            toast.error("Couldn't open that Drive link.");
        } finally {
            setDrivePreviewing(false);
        }
    };

    const handleDriveImport = async () => {
        if (!drivePreview) return;
        setDriveImporting(true);
        try {
            const res = await fetch("/api/media/import/drive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId: drivePreview.id }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast.error(getApiErrorMessage(data.error, "Couldn't import."));
                return;
            }
            const kind = data.asset?.kind ?? kindFromMime(drivePreview.mimeType);
            if (data.existing) {
                toast.success("Already in the library. Opened the existing asset.");
            } else if (kind === "image") {
                toast.success("Imported image from Drive");
            } else {
                toast.success(`Imported ${kind} as Drive link (not hosted)`);
            }
            setDrivePreview(null);
            setDriveUrl("");
            loadFiles();
        } catch (error) {
            console.error("Drive import error", error);
            toast.error("Couldn't import.");
        } finally {
            setDriveImporting(false);
        }
    };

    const openDetail = (file: MediaFile) => {
        setDetailFile(file);
        setEditName(file.name);
        setEditAlt(file.alt_text ?? "");
        setEditFolderId(file.folder_id ?? null);
        setEditTags([...(file.tags ?? [])]);
        setTagInput("");
        setDetailUsages(null);
        void (async () => {
            try {
                const res = await fetch(`/api/media-assets/${file.id}/usage`);
                const data = await res.json();
                if (data.ok && Array.isArray(data.usages)) {
                    setDetailUsages(data.usages);
                    if (data.usages.length > 0) {
                        setUsageByAssetId((prev) => ({ ...prev, [file.id]: data.usages }));
                    }
                }
            } catch {
                /* grid map is fallback */
            }
        })();
    };

    const handleCreateFolder = async () => {
        const name = newFolderName.trim();
        if (!name) {
            toast.error("Folder name is required");
            return;
        }
        setFolderBusy(true);
        try {
            const res = await fetch("/api/media-folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast.error(getApiErrorMessage(data.error, "Couldn't create the folder."));
                return;
            }
            setFolders((prev) =>
                [...prev, { id: data.folder.id, name: data.folder.name }].sort((a, b) =>
                    a.name.localeCompare(b.name),
                ),
            );
            setNewFolderName("");
            setFolderFilter(data.folder.id);
            toast.success("Folder created");
        } catch (error) {
            console.error("Create folder error", error);
            toast.error("Couldn't create the folder.");
        } finally {
            setFolderBusy(false);
        }
    };

    const handleRenameFolder = async (id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Enter a folder name.");
            return;
        }
        setFolderBusy(true);
        try {
            const res = await fetch(`/api/media-folders/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast.error(getApiErrorMessage(data.error, "Couldn't rename."));
                return;
            }
            setFolders((prev) =>
                prev
                    .map((f) => (f.id === id ? { id, name: data.folder.name } : f))
                    .sort((a, b) => a.name.localeCompare(b.name)),
            );
            toast.success("Folder renamed");
        } catch (error) {
            console.error("Rename folder error", error);
            toast.error("Couldn't rename.");
        } finally {
            setFolderBusy(false);
        }
    };

    const handleSaveMeta = async () => {
        if (!detailFile) return;
        const name = editName.trim();
        if (!name) {
            toast.error("Enter a name.");
            return;
        }
        setSavingMeta(true);
        try {
            const res = await fetch(`/api/media-assets/${detailFile.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    alt_text: (detailFile.kind ?? "image") === "image" ? editAlt : undefined,
                    folder_id: editFolderId,
                    tags: editTags,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast.error(getApiErrorMessage(data.error, "Couldn't save."));
                return;
            }
            const updated: MediaFile = {
                ...detailFile,
                name: data.asset.name,
                alt_text: data.asset.alt_text ?? null,
                folder_id: data.asset.folder_id ?? null,
                tags: Array.isArray(data.asset.tags) ? data.asset.tags : [],
            };
            setDetailFile(updated);
            setEditFolderId(updated.folder_id ?? null);
            setEditTags([...(updated.tags ?? [])]);
            setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
            toast.success("Saved");
        } catch (error) {
            console.error("Save meta error", error);
            toast.error("Couldn't save.");
        } finally {
            setSavingMeta(false);
        }
    };

    const handleReimport = async () => {
        if (!detailFile) return;
        setReimporting(true);
        try {
            const res = await fetch(`/api/media-assets/${detailFile.id}/reimport`, {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast.error(getApiErrorMessage(data.error, "Re-import failed"));
                return;
            }
            const updated: MediaFile = {
                ...detailFile,
                url: data.asset.hosted_url ?? detailFile.url,
                name: data.asset.name ?? detailFile.name,
            };
            setDetailFile(updated);
            setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
            toast.success("Re-imported from Drive");
        } catch (error) {
            console.error("Re-import error", error);
            toast.error("Re-import failed");
        } finally {
            setReimporting(false);
        }
    };

    const handleDelete = async (file: MediaFile, force = false) => {
        try {
            const url = `/api/media-assets/${file.id}${force ? "?force=true" : ""}`;
            const res = await fetch(url, { method: "DELETE" });
            const data = await res.json();

            if (res.status === 409 && data.usages) {
                setDeleteConfirm({ file, usages: data.usages, deletable: data.deletable !== false });
                return;
            }

            if (data.ok) {
                setFiles((prev) => prev.filter((f) => f.id !== file.id));
                setDetailFile(null);
                setDeleteConfirm(null);
                toast.success("Asset deleted");
                loadUsages();
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't delete."));
            }
        } catch (error) {
            console.error("Delete error", error);
            toast.error("Couldn't delete.");
        }
    };

    const handleForceDelete = async () => {
        if (!deleteConfirm) return;
        setDeleting(true);
        await handleDelete(deleteConfirm.file, true);
        setDeleting(false);
    };

    const copyToClipboard = (url: string) => {
        navigator.clipboard.writeText(url);
        toast.success("URL copied to clipboard");
    };

    /** Set a landing-page image override (URL + Asset id dual-write) */
    const setSlotImage = async (slot: LandingSlot, url: string, assetId?: string) => {
        setSavingSlot(slot.key);
        try {
            const res = await fetch("/api/site-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: slot.key,
                    value: url,
                    media_asset_id: assetId ?? null,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setOverrides((prev) => ({ ...prev, [slot.key]: url }));
                toast.success(`Updated "${slot.label}" image`);
                loadUsages();
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't update."));
            }
        } catch (error) {
            console.error("Set slot error", error);
            toast.error("Couldn't update.");
        } finally {
            setSavingSlot(null);
            setPickerSlot(null);
        }
    };

    /** Reset a landing-page image to default */
    const resetSlot = async (slot: LandingSlot) => {
        if (!confirm(`Reset "${slot.label}" to the default image?`)) return;
        setSavingSlot(slot.key);
        try {
            const res = await fetch(`/api/site-settings?key=${slot.key}`, { method: "DELETE" });
            const data = await res.json();
            if (data.ok) {
                setOverrides((prev) => {
                    const copy = { ...prev };
                    delete copy[slot.key];
                    return copy;
                });
                toast.success(`Reset "${slot.label}" to default`);
                loadUsages();
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't reset."));
            }
        } catch (error) {
            console.error("Reset slot error", error);
            toast.error("Couldn't reset.");
        } finally {
            setSavingSlot(null);
        }
    };

    /** Replace an image everywhere (URL + Asset id across all consumers) */
    const handleReplace = async (oldFile: MediaFile, newFile: MediaFile) => {
        if (!oldFile.url || !newFile.url) return;
        setReplacing(true);
        try {
            const res = await fetch("/api/media/replace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    oldUrl: oldFile.url,
                    newUrl: newFile.url,
                    oldAssetId: oldFile.id,
                    newAssetId: newFile.id,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                const s = data.summary as {
                    blogFeatured: number;
                    blogInline: number;
                    landingSlots: string[];
                    landingSections: number;
                    productImages: number;
                    productVariants: number;
                    categories: number;
                    partners: number;
                    partnersPages: number;
                };
                const parts: string[] = [];
                if (s.blogFeatured > 0) parts.push(`${s.blogFeatured} blog featured`);
                if (s.blogInline > 0) parts.push(`${s.blogInline} blog inline`);
                if (s.landingSlots?.length > 0) parts.push(`${s.landingSlots.length} landing slot${s.landingSlots.length > 1 ? "s" : ""}`);
                if (s.landingSections > 0) parts.push(`${s.landingSections} page builder`);
                if (s.productImages > 0) parts.push(`${s.productImages} product image${s.productImages > 1 ? "s" : ""}`);
                if (s.productVariants > 0) parts.push(`${s.productVariants} variant${s.productVariants > 1 ? "s" : ""}`);
                if (s.categories > 0) parts.push(`${s.categories} categor${s.categories > 1 ? "ies" : "y"}`);
                if (s.partners > 0) parts.push(`${s.partners} partner${s.partners > 1 ? "s" : ""}`);
                if (s.partnersPages > 0) parts.push(`${s.partnersPages} partners page`);
                toast.success(parts.length > 0 ? `Replaced in ${parts.join(", ")}` : "No references found to replace");
                setReplaceFile(null);
                setDetailFile(null);
                loadUsages();
                loadOverrides();
            } else {
                toast.error(getApiErrorMessage(data.error, "Couldn't replace."));
            }
        } catch (error) {
            console.error("Replace error", error);
            toast.error("Couldn't replace.");
        } finally {
            setReplacing(false);
        }
    };

    /* ---------------------------------------------------------------- */
    /* Helpers                                                           */
    /* ---------------------------------------------------------------- */

    const getUsageCount = (file: MediaFile | null | undefined) =>
        file ? getFileUsages(file).length : 0;

    const kindIcon = (kind?: string) => {
        switch (kind) {
            case "video":
                return <Film className="h-10 w-10 text-muted-foreground opacity-60" />;
            case "pdf":
                return <FileText className="h-10 w-10 text-muted-foreground opacity-60" />;
            default:
                return <ImageIcon className="h-10 w-10 text-muted-foreground opacity-60" />;
        }
    };

    const usageIcon = (type: string) => {
        switch (type) {
            case "blog_featured":
            case "blog_inline":
                return <Newspaper className="h-3.5 w-3.5 shrink-0" />;
            case "landing_slot":
            case "landing_section":
            case "partners_page":
                return <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />;
            case "email_campaign":
                return <Mail className="h-3.5 w-3.5 shrink-0" />;
            default:
                return <ImageIcon className="h-3.5 w-3.5 shrink-0" />;
        }
    };

    const usageTypeLabel = (type: string) => {
        switch (type) {
            case "blog_featured": return "Featured in";
            case "blog_inline": return "Inline in";
            case "landing_slot": return "Landing page";
            case "landing_section": return "Page builder";
            case "product_image": return "Product";
            case "product_variant": return "Variant";
            case "category": return "Category";
            case "partner": return "Partner";
            case "partners_page": return "Partners page";
            case "item_overlay": return "Item overlay";
            case "item_image": return "Item image";
            case "email_campaign": return "Email campaign";
            default: return type;
        }
    };

    /* ---------------------------------------------------------------- */
    /* Render                                                            */
    /* ---------------------------------------------------------------- */

    return (
        // Flex, not space-y: on a phone the library (upload, folders, assets) comes first,
        // above the nine landing-image tiles.
        <div className="flex max-w-6xl flex-col gap-10">
            {/* ===== Landing Page Images Section ===== */}
            <section className="space-y-4 max-md:order-3">
                <div>
                    <div className="flex items-center gap-1.5">
                      <h1 className="text-2xl font-bold tracking-tight">Landing page images</h1>
                      <InfoTip label="About landing page images">
                        <p>Customise the images on the front page. Click a slot to pick one from the media library.</p>
                      </InfoTip>
                    </div>
                </div>

                {overridesLoading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {LANDING_SLOTS.map((slot) => {
                            const currentUrl = overrides[slot.key] ?? slot.defaultUrl;
                            const isOverridden = slot.key in overrides;
                            const isSaving = savingSlot === slot.key;

                            return (
                                <div
                                    key={slot.key}
                                    className="group relative border rounded-lg overflow-hidden bg-background shadow-sm"
                                >
                                    {/* Thumbnail */}
                                    <button
                                        type="button"
                                        className="w-full aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden cursor-pointer transition-opacity active:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                        onClick={() => setPickerSlot(slot)}
                                        disabled={isSaving}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={currentUrl}
                                            alt={slot.label}
                                            className="object-cover w-full h-full"
                                            loading="lazy"
                                        />
                                    </button>

                                    {/* Label + actions */}
                                    <div className="p-2 flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-xs font-medium truncate">{slot.label}</span>
                                            {isOverridden && (
                                                <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                                    Custom
                                                </span>
                                            )}
                                        </div>

                                        {isOverridden && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6 shrink-0 max-md:size-11"
                                                onClick={() => resetSlot(slot)}
                                                disabled={isSaving}
                                                title="Reset to default"
                                            >
                                                {isSaving ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="h-3 w-3" />
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Divider */}
            <hr className="border-border max-md:order-2" />

            {/* ===== Full Media Gallery ===== */}
            <section className="space-y-6 max-md:order-1">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-2xl font-bold tracking-tight">Media library</h2>
                          <InfoTip label="About media library">
                            <p>Upload images or import them from Google Drive.</p>
                          </InfoTip>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleUpload}
                            disabled={uploading}
                        />
                        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            {uploading ? "Uploading…" : "Upload image"}
                        </Button>
                    </div>
                </div>

                {/* Drive paste / browse import */}
                <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-sm font-medium">Import from Google Drive</div>
                        <Button variant="outline" size="sm" onClick={() => setDriveBrowseOpen(true)}>
                            Select from Drive
                        </Button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="url"
                            placeholder="Paste Google Drive file link…"
                            value={driveUrl}
                            onChange={(e) => {
                                setDriveUrl(e.target.value);
                                setDrivePreview(null);
                            }}
                            className="flex-1 min-w-0 max-md:min-h-11 px-3 py-2 text-base md:text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <Button
                            variant="outline"
                            onClick={handleDrivePreview}
                            disabled={drivePreviewing || !driveUrl.trim()}
                        >
                            {drivePreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Preview
                        </Button>
                    </div>
                    {drivePreview && (
                        <div className="flex flex-col sm:flex-row gap-3 items-start border rounded-lg p-3 bg-background">
                            <div className="w-24 h-24 shrink-0 rounded-md overflow-hidden border bg-muted flex items-center justify-center">
                                {drivePreview.thumbnailLink ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={drivePreview.thumbnailLink}
                                        alt={drivePreview.name}
                                        className="object-cover w-full h-full"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    kindIcon(kindFromMime(drivePreview.mimeType))
                                )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="text-sm font-medium truncate" title={drivePreview.name}>
                                    {drivePreview.name}
                                </div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                                    {kindFromMime(drivePreview.mimeType)}
                                    {drivePreview.size != null ? `, ${(drivePreview.size / 1024).toFixed(1)} KB` : ""}
                                </div>
                                {kindFromMime(drivePreview.mimeType) !== "image" &&
                                    kindFromMime(drivePreview.mimeType) !== "other" && (
                                    <p className="text-xs text-muted-foreground">
                                        Will import as a Drive link (not copied to site storage).
                                    </p>
                                )}
                                {kindFromMime(drivePreview.mimeType) === "other" && (
                                    <p className="text-xs text-destructive">
                                        This file type can&apos;t be imported.
                                    </p>
                                )}
                            </div>
                            <Button
                                onClick={handleDriveImport}
                                disabled={
                                    driveImporting ||
                                    kindFromMime(drivePreview.mimeType) === "other" ||
                                    drivePreview.isFolder
                                }
                            >
                                {driveImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Import
                            </Button>
                        </div>
                    )}
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search images…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full max-md:min-h-11 pl-9 pr-3 py-2 text-base md:text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div className="flex gap-1 border rounded-lg p-1">
                            {([
                                { value: "all", label: "All" },
                                { value: "in_use", label: "In use" },
                                { value: "unused", label: "Unused" },
                            ] as const).map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFilterMode(opt.value)}
                                    className={`min-h-11 px-4 py-2 text-xs font-medium rounded-md transition-colors ${
                                        filterMode === opt.value
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-press"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1 border rounded-lg p-1 w-fit">
                        {([
                            { value: "all", label: "All kinds" },
                            { value: "image", label: "Images" },
                            { value: "video", label: "Videos" },
                            { value: "pdf", label: "PDFs" },
                        ] as const).map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setKindFilter(opt.value)}
                                className={`min-h-11 px-4 py-2 text-xs font-medium rounded-md transition-colors ${
                                    kindFilter === opt.value
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-press"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                        <select
                            value={folderFilter}
                            onChange={(e) => setFolderFilter(e.target.value as FolderFilter)}
                            className="max-md:min-h-11 text-base md:text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary active:bg-press sm:min-w-[180px]"
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
                            className="max-md:min-h-11 text-base md:text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary active:bg-press sm:min-w-[160px]"
                            aria-label="Filter by tag"
                        >
                            <option value="all">All tags</option>
                            {knownTags.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                        <div className="flex gap-2 flex-1">
                            <Input
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                placeholder="New folder name"
                                className="h-9"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleCreateFolder();
                                }}
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={folderBusy || !newFolderName.trim()}
                                onClick={() => void handleCreateFolder()}
                            >
                                Create
                            </Button>
                        </div>
                        {folderFilter !== "all" && folderFilter !== "unfiled" && (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={folderBusy}
                                onClick={() => {
                                    const current = folders.find((f) => f.id === folderFilter);
                                    const next = window.prompt("Rename folder", current?.name ?? "");
                                    if (next != null) void handleRenameFolder(folderFilter, next);
                                }}
                            >
                                Rename
                            </Button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : files.length === 0 ? (
                    <div className="text-center py-20 border rounded-lg bg-muted/20">
                        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-3" />
                        <h3 className="text-lg font-medium">No media files found</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                            Upload some images to use throughout your site.
                        </p>
                    </div>
                ) : filteredFiles.length === 0 ? (
                    <div className="text-center py-12 border rounded-lg bg-muted/20">
                        <Search className="mx-auto h-10 w-10 text-muted-foreground opacity-50 mb-3" />
                        <h3 className="text-lg font-medium">No matching assets</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                            Try a different search term or filter.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filteredFiles.map((file) => {
                            const count = getUsageCount(file);
                            const usedLabel = relativeUsed(file.last_used_at);
                            return (
                                <div
                                    key={file.id}
                                    className="group relative border rounded-lg overflow-hidden bg-background shadow-sm hover:shadow-md transition-all cursor-pointer active:opacity-80"
                                    onClick={() => openDetail(file)}
                                >
                                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                                        {file.url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={file.url}
                                                alt={file.name}
                                                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                                                loading="lazy"
                                            />
                                        ) : (
                                            kindIcon(file.kind)
                                        )}
                                    </div>

                                    {/* Usage badge */}
                                    {!usageLoading && (
                                        <div className="absolute top-2 left-2">
                                            {count > 0 ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/90 text-white px-2 py-0.5 text-[10px] font-medium shadow-sm backdrop-blur-sm">
                                                    {count} {count === 1 ? "use" : "uses"}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-muted/80 text-muted-foreground px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm">
                                                    Unused
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Quick actions: always visible on mobile, hover on sm+ */}
                                    <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                        {file.url && (file.kind ?? "image") === "image" && (
                                            <Button
                                                size="icon"
                                                variant="secondary"
                                                className="min-h-11 min-w-11 rounded-full"
                                                onClick={(e) => { e.stopPropagation(); copyToClipboard(file.url!); }}
                                                title="Copy URL"
                                            >
                                                <LinkIcon className="h-4 w-4" />
                                            </Button>
                                        )}
                                        {file.drive_url && (
                                            <Button
                                                size="icon"
                                                variant="secondary"
                                                className="min-h-11 min-w-11 rounded-full"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(file.drive_url!, "_blank", "noopener,noreferrer");
                                                }}
                                                title="Open in Drive"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        )}
                                        {count > 0 && file.url && (file.kind ?? "image") === "image" && (
                                            <Button
                                                size="icon"
                                                variant="secondary"
                                                className="min-h-11 min-w-11 rounded-full"
                                                onClick={(e) => { e.stopPropagation(); setReplaceFile(file); }}
                                                title="Replace everywhere"
                                            >
                                                <ArrowLeftRight className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button
                                            size="icon"
                                            variant="destructive"
                                            className="min-h-11 min-w-11 rounded-full"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="p-2 space-y-0.5">
                                        <div className="text-xs truncate" title={file.name}>
                                            {file.name}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                            <span className="uppercase tracking-wide">{file.kind ?? "image"}</span>
                                            <span>·</span>
                                            <span suppressHydrationWarning>
                                                {usedLabel ? `Used ${usedLabel}` : formatAdminDate(file.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ===== Image Detail Sheet ===== */}
            <Sheet
                open={!!detailFile}
                onOpenChange={(open) => {
                    if (!open) {
                        setDetailFile(null);
                        setDetailUsages(null);
                    }
                }}
            >
                <SheetContent side="right" className="w-full sm:max-w-md">
                    {detailFile && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="truncate pr-8">{detailFile.name}</SheetTitle>
                                <SheetDescription>
                                    {(detailFile.kind ?? "image").toUpperCase()},{" "}
                                    {formatAdminDate(detailFile.created_at)}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="px-4 pb-4 space-y-6 overflow-y-auto flex-1">
                                {/* Preview */}
                                <div className="rounded-lg overflow-hidden border bg-muted flex items-center justify-center min-h-32">
                                    {detailFile.drive_file_id &&
                                    (detailFile.kind === "video" || detailFile.kind === "pdf") ? (
                                        <iframe
                                            src={`https://drive.google.com/file/d/${detailFile.drive_file_id}/preview`}
                                            title={detailFile.name}
                                            className="w-full aspect-video bg-background"
                                            allow="autoplay"
                                        />
                                    ) : detailFile.url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={detailFile.url}
                                            alt={detailFile.name}
                                            className="w-full h-auto object-contain max-h-64"
                                        />
                                    ) : (
                                        <div className="py-10 flex flex-col items-center gap-2">
                                            {kindIcon(detailFile.kind)}
                                            <span className="text-xs text-muted-foreground">Drive link only</span>
                                        </div>
                                    )}
                                </div>

                                {detailFile.url &&
                                    (detailFile.kind === "video" || detailFile.kind === "pdf") && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">
                                            Preview thumbnail
                                        </label>
                                        <div className="rounded-md overflow-hidden border bg-muted w-28 h-28">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={detailFile.url}
                                                alt=""
                                                className="object-cover w-full h-full"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* URL — hosted image masters only */}
                                {detailFile.url && detailFile.kind === "image" && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">URL</label>
                                        <div className="flex gap-2">
                                            <input
                                                readOnly
                                                value={detailFile.url}
                                                className="flex-1 text-xs border rounded-md px-2 py-1.5 bg-muted/50 truncate"
                                            />
                                            <Button size="sm" variant="outline" onClick={() => copyToClipboard(detailFile.url!)}>
                                                <LinkIcon className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {detailFile.drive_url && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Google Drive</label>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full justify-start"
                                            onClick={() =>
                                                window.open(detailFile.drive_url!, "_blank", "noopener,noreferrer")
                                            }
                                        >
                                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                            Open in Drive
                                        </Button>
                                    </div>
                                )}

                                {/* Rename + alt */}
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="asset-name" className="text-xs text-muted-foreground">
                                            Name
                                        </Label>
                                        <Input
                                            id="asset-name"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                        />
                                    </div>
                                    {(detailFile.kind ?? "image") === "image" && (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="asset-alt" className="text-xs text-muted-foreground">
                                                Alt text
                                            </Label>
                                            <Textarea
                                                id="asset-alt"
                                                value={editAlt}
                                                onChange={(e) => setEditAlt(e.target.value)}
                                                rows={2}
                                                placeholder="Describe the image for accessibility"
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="asset-folder" className="text-xs text-muted-foreground">
                                            Folder
                                        </Label>
                                        <select
                                            id="asset-folder"
                                            value={editFolderId ?? ""}
                                            onChange={(e) =>
                                                setEditFolderId(e.target.value ? e.target.value : null)
                                            }
                                            className="w-full max-md:min-h-11 text-base md:text-sm border rounded-md px-3 py-2 bg-background active:bg-press"
                                        >
                                            <option value="">Unfiled</option>
                                            {folders.map((f) => (
                                                <option key={f.id} value={f.id}>
                                                    {f.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="asset-tag-input" className="text-xs text-muted-foreground">
                                            Tags
                                        </Label>
                                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                                            {editTags.map((tag) => (
                                                <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditTags((prev) => prev.filter((t) => t !== tag))
                                                        }
                                                        className="ml-0.5 hover:text-destructive transition-colors"
                                                        aria-label={`Remove tag ${tag}`}
                                                    >
                                                        ×
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                        <Input
                                            id="asset-tag-input"
                                            value={tagInput}
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key !== "Enter") return;
                                                e.preventDefault();
                                                const val = tagInput.trim().toLowerCase();
                                                if (val && !editTags.includes(val)) {
                                                    setEditTags((prev) => [...prev, val]);
                                                }
                                                setTagInput("");
                                            }}
                                            list="media-known-tags"
                                            placeholder="Type a tag and press Enter"
                                            className="text-sm"
                                        />
                                        <datalist id="media-known-tags">
                                            {knownTags.map((t) => (
                                                <option key={t} value={t} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={handleSaveMeta}
                                        disabled={
                                            savingMeta ||
                                            (editName.trim() === detailFile.name &&
                                                editAlt === (detailFile.alt_text ?? "") &&
                                                (editFolderId ?? null) === (detailFile.folder_id ?? null) &&
                                                JSON.stringify(editTags) ===
                                                    JSON.stringify(detailFile.tags ?? []))
                                        }
                                    >
                                        {savingMeta ? (
                                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                        ) : null}
                                        Save
                                    </Button>
                                </div>

                                {/* Usage list */}
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Used in ({(detailUsages ?? getFileUsages(detailFile)).length}{" "}
                                        {(detailUsages ?? getFileUsages(detailFile)).length === 1 ? "place" : "places"})
                                    </label>
                                    {usageLoading && detailUsages === null ? (
                                        <div className="flex justify-center py-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (detailUsages ?? getFileUsages(detailFile)).length === 0 ? (
                                        <p className="text-xs text-muted-foreground py-2">
                                            This asset is not used anywhere.
                                        </p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {(detailUsages ?? getFileUsages(detailFile)).map((usage, i) => (
                                                <div
                                                    key={`${usage.ref_id}-${usage.type}-${i}`}
                                                    className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-muted/30"
                                                >
                                                    {usageIcon(usage.type)}
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                            {usageTypeLabel(usage.type)}
                                                        </span>
                                                        <p className="text-xs font-medium truncate">{usage.label}</p>
                                                    </div>
                                                    {(usage.type === "blog_featured" || usage.type === "blog_inline") && (
                                                        <a
                                                            href={`/en-US/settings/blogs/${usage.ref_id}`}
                                                            className="shrink-0 text-muted-foreground hover:text-foreground"
                                                            title="Edit blog post"
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </a>
                                                    )}
                                                    {usage.type === "email_campaign" && (
                                                        <a
                                                            href={`/en-US/settings/campaigns/${usage.ref_id}`}
                                                            className="shrink-0 text-muted-foreground hover:text-foreground"
                                                            title="Open the campaign"
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {relativeUsed(detailFile.last_used_at) && (
                                        <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                                            Last used {relativeUsed(detailFile.last_used_at)}
                                        </p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2 pt-2 border-t">
                                    {(detailFile.kind ?? "image") === "image" &&
                                        detailFile.drive_file_id && (
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start"
                                            onClick={handleReimport}
                                            disabled={reimporting}
                                        >
                                            {reimporting ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                            )}
                                            Re-import from Drive
                                        </Button>
                                    )}
                                    {getUsageCount(detailFile) > 0 && detailFile.url && (
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start"
                                            onClick={() => {
                                                setReplaceFile(detailFile);
                                                setDetailFile(null);
                                            }}
                                        >
                                            <ArrowLeftRight className="mr-2 h-4 w-4" />
                                            Replace everywhere
                                        </Button>
                                    )}
                                    <Button
                                        variant="destructive"
                                        className="w-full justify-start"
                                        onClick={() => {
                                            handleDelete(detailFile);
                                        }}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* ===== Landing Slot Picker Dialog ===== */}
            <Dialog open={!!pickerSlot} onOpenChange={(open) => !open && setPickerSlot(null)}>
                <DialogContent className="max-w-3xl max-h-[80dvh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>
                            Choose image for &ldquo;{pickerSlot?.label}&rdquo;
                        </DialogTitle>
                    </DialogHeader>

                    <div className="overflow-y-auto flex-1 -mx-6 px-6 pb-4">
                        {loading ? (
                            <div className="flex justify-center py-16">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : files.length === 0 ? (
                            <div className="text-center py-16">
                                <ImageIcon className="mx-auto h-10 w-10 text-muted-foreground opacity-50 mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    No images in the gallery. Upload one first.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                {files.filter((f) => f.url && (f.kind ?? "image") === "image").map((file) => {
                                    const isSelected = pickerSlot && overrides[pickerSlot.key] === file.url;

                                    return (
                                        <button
                                            key={file.id}
                                            type="button"
                                            className={[
                                                "relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                                isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/30",
                                            ].join(" ")}
                                            onClick={() =>
                                                pickerSlot &&
                                                file.url &&
                                                setSlotImage(pickerSlot, file.url, file.id)
                                            }
                                            disabled={!!savingSlot}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={file.url!}
                                                alt={file.name}
                                                className="object-cover w-full h-full"
                                                loading="lazy"
                                            />
                                            {isSelected && (
                                                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                                    <Check className="h-6 w-6 text-primary-foreground drop-shadow-md" />
                                                </div>
                                            )}
                                            {savingSlot === pickerSlot?.key && (
                                                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ===== Replace Image Dialog ===== */}
            <Dialog open={!!replaceFile} onOpenChange={(open) => !open && setReplaceFile(null)}>
                <DialogContent className="max-w-3xl max-h-[80dvh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Replace image everywhere</DialogTitle>
                        <DialogDescription>
                            Choose a new image to replace <strong>{replaceFile?.name}</strong> in all {getUsageCount(replaceFile)} {getUsageCount(replaceFile) === 1 ? "place" : "places"} it&apos;s used.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Usage summary */}
                    {replaceFile && getFileUsages(replaceFile).length > 0 && (
                        <div className="px-6 -mt-2">
                            <div className="flex flex-wrap gap-1.5">
                                {getFileUsages(replaceFile).map((usage, i) => (
                                    <span
                                        key={`${usage.ref_id}-${i}`}
                                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                    >
                                        {usageIcon(usage.type)}
                                        {usage.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="overflow-y-auto flex-1 -mx-6 px-6 pb-4">
                        {loading ? (
                            <div className="flex justify-center py-16">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                {files
                                    .filter((f) => f.url && (f.kind ?? "image") === "image" && f.url !== replaceFile?.url)
                                    .map((file) => (
                                        <button
                                            key={file.id}
                                            type="button"
                                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                            onClick={() =>
                                                replaceFile &&
                                                file.url &&
                                                handleReplace(replaceFile, file)
                                            }
                                            disabled={replacing}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={file.url!}
                                                alt={file.name}
                                                className="object-cover w-full h-full"
                                                loading="lazy"
                                            />
                                            {replacing && (
                                                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ===== Delete Confirmation Dialog (for in-use images) ===== */}
            <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            Image in use
                        </DialogTitle>
                        <DialogDescription>
                            This image is currently used in {deleteConfirm?.usages.length}{" "}
                            {deleteConfirm?.usages.length === 1 ? "place" : "places"}.{" "}
                            {deleteConfirm?.deletable === false
                                ? "An email campaign uses it, so it can't be deleted: a sent email shows it for good."
                                : "Deleting it will break these references."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {deleteConfirm?.usages.map((usage, i) => (
                            <div
                                key={`${usage.ref_id}-${i}`}
                                className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-muted/30"
                            >
                                {usageIcon(usage.type)}
                                <span className="text-xs">
                                    {usageTypeLabel(usage.type)}: <strong>{usage.label}</strong>
                                </span>
                            </div>
                        ))}
                    </div>

                    {deleteConfirm?.deletable === false ? (
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                                Close
                            </Button>
                        </DialogFooter>
                    ) : (
                        <DialogFooter className="flex-col sm:flex-row gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (deleteConfirm) {
                                        setReplaceFile(deleteConfirm.file);
                                    }
                                    setDeleteConfirm(null);
                                }}
                            >
                                <ArrowLeftRight className="mr-2 h-4 w-4" />
                                Replace first
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleForceDelete}
                                disabled={deleting}
                            >
                                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                Delete anyway
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            <SelectFromDriveDialog
                open={driveBrowseOpen}
                onOpenChange={setDriveBrowseOpen}
                onImported={() => {
                    void loadFiles();
                    void loadUsages();
                }}
            />
        </div>
    );
}
