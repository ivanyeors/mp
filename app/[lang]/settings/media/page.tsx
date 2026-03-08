"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Trash2, Link as LinkIcon, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaFile {
    name: string;
    url: string;
    id: string; // Supabase adds an ID too, but we mainly care about name/url
    created_at: string;
}

export default function MediaPage() {
    const [files, setFiles] = useState<MediaFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadFiles = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/media");
            const data = await res.json();
            if (data.ok) {
                setFiles(data.files);
            }
        } catch (error) {
            console.error("Failed to load files", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFiles();
    }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/media", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (data.ok) {
                // Prepend the new file to the list
                loadFiles();
            } else {
                alert(data.error || "Upload failed");
            }
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
            const res = await fetch(`/api/media/${encodeURIComponent(fileName)}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (data.ok) {
                setFiles(files.filter(f => f.name !== fileName));
            } else {
                alert(data.error || "Delete failed");
            }
        } catch (error) {
            console.error("Delete error", error);
            alert("Delete failed");
        }
    };

    const copyToClipboard = (url: string) => {
        navigator.clipboard.writeText(url);
        // Could use a toast here ideally
        alert("Copied to clipboard!");
    };

    return (
        <div className="space-y-6 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Media Gallery</h1>
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
        </div>
    );
}
