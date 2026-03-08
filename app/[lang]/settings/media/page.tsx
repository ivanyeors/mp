"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Upload,
    Trash2,
    Link as LinkIcon,
    Image as ImageIcon,
    Loader2,
    RotateCcw,
    Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

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

    /* Picker dialog state */
    const [pickerSlot, setPickerSlot] = useState<LandingSlot | null>(null);

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

    useEffect(() => {
        loadFiles();
        loadOverrides();
    }, [loadFiles, loadOverrides]);

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
            if (data.ok) loadFiles();
            else alert(data.error || "Upload failed");
        } catch (error) {
            console.error("Upload error", error);
            alert("Upload failed");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDelete = async (fileName: string) => {
        if (!confirm("Are you sure you want to delete this image?")) return;
        try {
            const res = await fetch(`/api/media/${encodeURIComponent(fileName)}`, { method: "DELETE" });
            const data = await res.json();
            if (data.ok) setFiles(files.filter((f) => f.name !== fileName));
            else alert(data.error || "Delete failed");
        } catch (error) {
            console.error("Delete error", error);
            alert("Delete failed");
        }
    };

    const copyToClipboard = (url: string) => {
        navigator.clipboard.writeText(url);
        alert("Copied to clipboard!");
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
            } else {
                alert(data.error || "Failed to update");
            }
        } catch (error) {
            console.error("Set slot error", error);
            alert("Failed to update");
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
            } else {
                alert(data.error || "Failed to reset");
            }
        } catch (error) {
            console.error("Reset slot error", error);
            alert("Failed to reset");
        } finally {
            setSavingSlot(null);
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
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {files.map((file) => (
                            <div key={file.name} className="group relative border rounded-lg overflow-hidden bg-background shadow-sm hover:shadow-md transition-all">
                                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={file.url}
                                        alt={file.name}
                                        className="object-cover w-full h-full"
                                        loading="lazy"
                                    />
                                </div>

                                {/* Overlay Controls */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                    <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={() => copyToClipboard(file.url)} title="Copy URL">
                                        <LinkIcon className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full" onClick={() => handleDelete(file.name)} title="Delete Image">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="p-2 text-xs truncate" title={file.name}>
                                    {file.name}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ===== Image Picker Dialog ===== */}
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
        </div>
    );
}
