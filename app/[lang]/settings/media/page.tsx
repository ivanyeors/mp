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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MediaFile {
    name: string;
    url: string;
    id: string;
    created_at: string;
}

interface LandingSlot {
    key: string;
    label: string;
    defaultUrl: string;
}

interface UsageEntry {
    type: "blog_featured" | "blog_inline" | "landing_slot";
    label: string;
    ref_id: string;
}

type UsageMap = Record<string, UsageEntry[]>;
type FilterMode = "all" | "in_use" | "unused";

/* ------------------------------------------------------------------ */
/* Landing page image slot definitions                                 */
/* ------------------------------------------------------------------ */

const LANDING_SLOTS: LandingSlot[] = [
    { key: "landing_hero", label: "Hero", defaultUrl: "/m-pillow-417953-web.webp" },
    { key: "landing_size_matters", label: "Size Matters", defaultUrl: "https://www.mpillow.com/cdn/shop/files/m-pillow-317409-final-WEB.jpg?v=1662868268&width=1400" },
    { key: "landing_marquee", label: "Marquee", defaultUrl: "/3way-side-sleep.jpg" },
    { key: "landing_ambassadors", label: "Ambassadors", defaultUrl: "https://www.mpillow.com/cdn/shop/files/DSC_2362-H-WEB_1200x_71b66f9b-3cce-4686-99be-34f774ddbe8a.webp?v=1667646766&width=900" },
    { key: "landing_cervical_neck", label: "Cervical Neck", defaultUrl: "/mpillow-cervical-neck.webp" },
    { key: "landing_basic_pillow", label: "Basic Pillow", defaultUrl: "/basic-mpillow.webp" },
    { key: "landing_premium_pillow", label: "Premium Pillow", defaultUrl: "/DarkMpillowImage-WEB.jpg" },
    { key: "landing_mbolster", label: "Mbolster", defaultUrl: "/808907f4-ac2b-499a-ace6-69933883b2f5.webp" },
    { key: "landing_founder", label: "Founder", defaultUrl: "/Darrenyeo-profileshoot_2.webp" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function MediaPage() {
    /* Media gallery state */
    const [files, setFiles] = useState<MediaFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /* Landing-image overrides state */
    const [overrides, setOverrides] = useState<Record<string, string>>({});
    const [overridesLoading, setOverridesLoading] = useState(true);
    const [savingSlot, setSavingSlot] = useState<string | null>(null);

    /* Picker dialog state (for landing slots) */
    const [pickerSlot, setPickerSlot] = useState<LandingSlot | null>(null);

    /* Usage data */
    const [usageMap, setUsageMap] = useState<UsageMap>({});
    const [usageLoading, setUsageLoading] = useState(true);

    /* Image detail sheet */
    const [detailFile, setDetailFile] = useState<MediaFile | null>(null);

    /* Search & filter */
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<FilterMode>("all");

    /* Replace dialog */
    const [replaceFile, setReplaceFile] = useState<MediaFile | null>(null);
    const [replacing, setReplacing] = useState(false);

    /* Delete confirmation dialog (for in-use images) */
    const [deleteConfirm, setDeleteConfirm] = useState<{ file: MediaFile; usages: UsageEntry[] } | null>(null);
    const [deleting, setDeleting] = useState(false);

    /* ---------------------------------------------------------------- */
    /* Data loaders                                                      */
    /* ---------------------------------------------------------------- */

    const loadFiles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/media");
            const data = await res.json();
            if (data.ok) setFiles(data.files);
        } catch (error) {
            console.error("Failed to load files", error);
            toast.error("Failed to load media files");
        } finally {
            setLoading(false);
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
            console.error("Failed to load overrides", error);
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
            console.error("Failed to load usages", error);
        } finally {
            setUsageLoading(false);
        }
    }, []);

    useEffect(() => {
        loadFiles();
        loadOverrides();
        loadUsages();
    }, [loadFiles, loadOverrides, loadUsages]);

    /* ---------------------------------------------------------------- */
    /* Filtered files                                                    */
    /* ---------------------------------------------------------------- */

    const filteredFiles = useMemo(() => {
        let result = files;

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((f) => f.name.toLowerCase().includes(q));
        }

        // Usage filter
        if (filterMode === "in_use") {
            result = result.filter((f) => (usageMap[f.url]?.length ?? 0) > 0);
        } else if (filterMode === "unused") {
            result = result.filter((f) => !usageMap[f.url] || usageMap[f.url].length === 0);
        }

        return result;
    }, [files, searchQuery, filterMode, usageMap]);

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
                toast.success("Image uploaded successfully");
            } else {
                toast.error(data.error || "Upload failed");
            }
        } catch (error) {
            console.error("Upload error", error);
            toast.error("Upload failed");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDelete = async (file: MediaFile, force = false) => {
        try {
            const url = `/api/media/${encodeURIComponent(file.name)}${force ? "?force=true" : ""}`;
            const res = await fetch(url, { method: "DELETE" });
            const data = await res.json();

            if (res.status === 409 && data.usages) {
                // Image is in use — show confirmation dialog
                setDeleteConfirm({ file, usages: data.usages });
                return;
            }

            if (data.ok) {
                setFiles((prev) => prev.filter((f) => f.name !== file.name));
                setDetailFile(null);
                setDeleteConfirm(null);
                toast.success("Image deleted");
                loadUsages();
            } else {
                toast.error(data.error || "Delete failed");
            }
        } catch (error) {
            console.error("Delete error", error);
            toast.error("Delete failed");
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

    /** Set a landing-page image override */
    const setSlotImage = async (slot: LandingSlot, url: string) => {
        setSavingSlot(slot.key);
        try {
            const res = await fetch("/api/site-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: slot.key, value: url }),
            });
            const data = await res.json();
            if (data.ok) {
                setOverrides((prev) => ({ ...prev, [slot.key]: url }));
                toast.success(`Updated "${slot.label}" image`);
                loadUsages();
            } else {
                toast.error(data.error || "Failed to update");
            }
        } catch (error) {
            console.error("Set slot error", error);
            toast.error("Failed to update");
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
                toast.error(data.error || "Failed to reset");
            }
        } catch (error) {
            console.error("Reset slot error", error);
            toast.error("Failed to reset");
        } finally {
            setSavingSlot(null);
        }
    };

    /** Replace an image everywhere */
    const handleReplace = async (oldUrl: string, newUrl: string) => {
        setReplacing(true);
        try {
            const res = await fetch("/api/media/replace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldUrl, newUrl }),
            });
            const data = await res.json();
            if (data.ok) {
                const { blogFeatured, blogInline, landingSlots } = data.summary;
                const parts: string[] = [];
                if (blogFeatured > 0) parts.push(`${blogFeatured} blog featured image${blogFeatured > 1 ? "s" : ""}`);
                if (blogInline > 0) parts.push(`${blogInline} blog inline reference${blogInline > 1 ? "s" : ""}`);
                if (landingSlots.length > 0) parts.push(`${landingSlots.length} landing slot${landingSlots.length > 1 ? "s" : ""}`);
                toast.success(`Replaced in ${parts.join(", ")}`);
                setReplaceFile(null);
                setDetailFile(null);
                loadUsages();
                loadOverrides();
            } else {
                toast.error(data.error || "Replace failed");
            }
        } catch (error) {
            console.error("Replace error", error);
            toast.error("Replace failed");
        } finally {
            setReplacing(false);
        }
    };

    /* ---------------------------------------------------------------- */
    /* Helpers                                                           */
    /* ---------------------------------------------------------------- */

    const getUsageCount = (url: string) => usageMap[url]?.length ?? 0;

    const usageIcon = (type: string) => {
        switch (type) {
            case "blog_featured":
            case "blog_inline":
                return <Newspaper className="h-3.5 w-3.5 shrink-0" />;
            case "landing_slot":
                return <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />;
            default:
                return null;
        }
    };

    const usageTypeLabel = (type: string) => {
        switch (type) {
            case "blog_featured": return "Featured in";
            case "blog_inline": return "Inline in";
            case "landing_slot": return "Landing Page";
            default: return type;
        }
    };

    /* ---------------------------------------------------------------- */
    /* Render                                                            */
    /* ---------------------------------------------------------------- */

    return (
        <div className="space-y-10 max-w-6xl">
            {/* ===== Landing Page Images Section ===== */}
            <section className="space-y-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Landing Page Images</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Customise the images shown on the front page. Click an image slot to choose from your media gallery.
                    </p>
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
                                        className="w-full aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                                                className="h-6 w-6 shrink-0"
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
            <hr className="border-border" />

            {/* ===== Full Media Gallery ===== */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Media Gallery</h2>
                        <p className="text-muted-foreground text-sm mt-1">
                            Manage your images and static assets here.
                        </p>
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
                            {uploading ? "Uploading..." : "Upload Image"}
                        </Button>
                    </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search images..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    <div className="flex gap-1 border rounded-lg p-1">
                        {([
                            { value: "all", label: "All" },
                            { value: "in_use", label: "In Use" },
                            { value: "unused", label: "Unused" },
                        ] as const).map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setFilterMode(opt.value)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                    filterMode === opt.value
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
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
                        <h3 className="text-lg font-medium">No matching images</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                            Try a different search term or filter.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filteredFiles.map((file) => {
                            const count = getUsageCount(file.url);
                            return (
                                <div
                                    key={file.name}
                                    className="group relative border rounded-lg overflow-hidden bg-background shadow-sm hover:shadow-md transition-all cursor-pointer"
                                    onClick={() => setDetailFile(file)}
                                >
                                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={file.url}
                                            alt={file.name}
                                            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                                            loading="lazy"
                                        />
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

                                    {/* Quick actions overlay */}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                        <Button
                                            size="icon"
                                            variant="secondary"
                                            className="h-8 w-8 rounded-full"
                                            onClick={(e) => { e.stopPropagation(); copyToClipboard(file.url); }}
                                            title="Copy URL"
                                        >
                                            <LinkIcon className="h-4 w-4" />
                                        </Button>
                                        {count > 0 && (
                                            <Button
                                                size="icon"
                                                variant="secondary"
                                                className="h-8 w-8 rounded-full"
                                                onClick={(e) => { e.stopPropagation(); setReplaceFile(file); }}
                                                title="Replace everywhere"
                                            >
                                                <ArrowLeftRight className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button
                                            size="icon"
                                            variant="destructive"
                                            className="h-8 w-8 rounded-full"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                                            title="Delete Image"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="p-2 text-xs truncate" title={file.name}>
                                        {file.name}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ===== Image Detail Sheet ===== */}
            <Sheet open={!!detailFile} onOpenChange={(open) => !open && setDetailFile(null)}>
                <SheetContent side="right" className="w-full sm:max-w-md">
                    {detailFile && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="truncate pr-8">{detailFile.name}</SheetTitle>
                                <SheetDescription>
                                    Uploaded {new Date(detailFile.created_at).toLocaleDateString()}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="px-4 pb-4 space-y-6 overflow-y-auto flex-1">
                                {/* Preview */}
                                <div className="rounded-lg overflow-hidden border bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={detailFile.url}
                                        alt={detailFile.name}
                                        className="w-full h-auto object-contain max-h-64"
                                    />
                                </div>

                                {/* URL */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">URL</label>
                                    <div className="flex gap-2">
                                        <input
                                            readOnly
                                            value={detailFile.url}
                                            className="flex-1 text-xs border rounded-md px-2 py-1.5 bg-muted/50 truncate"
                                        />
                                        <Button size="sm" variant="outline" onClick={() => copyToClipboard(detailFile.url)}>
                                            <LinkIcon className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Usage list */}
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Used in ({getUsageCount(detailFile.url)} {getUsageCount(detailFile.url) === 1 ? "place" : "places"})
                                    </label>
                                    {usageLoading ? (
                                        <div className="flex justify-center py-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : getUsageCount(detailFile.url) === 0 ? (
                                        <p className="text-xs text-muted-foreground py-2">
                                            This image is not used anywhere.
                                        </p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {usageMap[detailFile.url]?.map((usage, i) => (
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
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2 pt-2 border-t">
                                    {getUsageCount(detailFile.url) > 0 && (
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start"
                                            onClick={() => {
                                                setReplaceFile(detailFile);
                                                setDetailFile(null);
                                            }}
                                        >
                                            <ArrowLeftRight className="mr-2 h-4 w-4" />
                                            Replace Everywhere
                                        </Button>
                                    )}
                                    <Button
                                        variant="destructive"
                                        className="w-full justify-start"
                                        onClick={() => {
                                            setDetailFile(null);
                                            handleDelete(detailFile);
                                        }}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete Image
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* ===== Landing Slot Picker Dialog ===== */}
            <Dialog open={!!pickerSlot} onOpenChange={(open) => !open && setPickerSlot(null)}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
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
                                {files.map((file) => {
                                    const isSelected = pickerSlot && overrides[pickerSlot.key] === file.url;

                                    return (
                                        <button
                                            key={file.name}
                                            type="button"
                                            className={[
                                                "relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                                isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/30",
                                            ].join(" ")}
                                            onClick={() => pickerSlot && setSlotImage(pickerSlot, file.url)}
                                            disabled={!!savingSlot}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={file.url}
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
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Replace Image Everywhere</DialogTitle>
                        <DialogDescription>
                            Choose a new image to replace <strong>{replaceFile?.name}</strong> in all {getUsageCount(replaceFile?.url ?? "")} {getUsageCount(replaceFile?.url ?? "") === 1 ? "place" : "places"} it&apos;s used.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Usage summary */}
                    {replaceFile && usageMap[replaceFile.url] && (
                        <div className="px-6 -mt-2">
                            <div className="flex flex-wrap gap-1.5">
                                {usageMap[replaceFile.url].map((usage, i) => (
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
                                    .filter((f) => f.url !== replaceFile?.url)
                                    .map((file) => (
                                        <button
                                            key={file.name}
                                            type="button"
                                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                            onClick={() => replaceFile && handleReplace(replaceFile.url, file.url)}
                                            disabled={replacing}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={file.url}
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
                            Image In Use
                        </DialogTitle>
                        <DialogDescription>
                            This image is currently used in {deleteConfirm?.usages.length}{" "}
                            {deleteConfirm?.usages.length === 1 ? "place" : "places"}. Deleting it will break these references.
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
                            Replace First
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleForceDelete}
                            disabled={deleting}
                        >
                            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Delete Anyway
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
