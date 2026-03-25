"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, Loader2, ImageIcon, Check, Search } from "lucide-react";
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

interface MediaFile {
    name: string;
    url: string;
    id: string;
    created_at: string;
}

interface ImagePickerProps {
    onSelect: (url: string) => void;
    children?: React.ReactNode;
}

export function ImagePicker({ onSelect, children }: ImagePickerProps) {
    const [open, setOpen] = useState(false);
    const [files, setFiles] = useState<MediaFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    const loadFiles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/media");
            const data = await res.json();
            if (data.ok) {
                setFiles(data.files);
            }
        } catch (error) {
            console.error("Failed to load files", error);
            toast.error("Failed to load media files");
        } finally {
            setLoading(false);
        }
    }, []);

    // Load files when dialog opens
    useEffect(() => {
        if (open) {
            loadFiles();
            setSearchQuery("");
        }
    }, [open, loadFiles]);

    const uploadFile = async (file: File) => {
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
                setFiles((prev) => [data.file, ...prev]);
                toast.success("Image uploaded");
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

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await uploadFile(file);
    };

    const handleSelect = (url: string) => {
        onSelect(url);
        setOpen(false);
    };

    /* Drag-and-drop handlers */
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.types.includes("Files")) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
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
        if (file && file.type.startsWith("image/")) {
            await uploadFile(file);
        } else {
            toast.error("Please drop an image file");
        }
    };

    const filteredFiles = searchQuery.trim()
        ? files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : files;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
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
                    <div className="flex items-center justify-between mt-2">
                        <div>
                            <DialogTitle>Select Image</DialogTitle>
                            <DialogDescription>
                                Pick an image from your media gallery, upload, or drag &amp; drop.
                            </DialogDescription>
                        </div>
                        <div className="flex gap-2 mr-6">
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleUpload}
                                disabled={uploading}
                            />
                            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                Upload
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                {/* Search bar */}
                <div className="relative px-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search images..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>

                <div className="flex-1 overflow-y-auto pr-2 min-h-[300px] relative">
                    {/* Drag overlay */}
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
                    ) : files.length === 0 ? (
                        <div className="text-center py-20 border rounded-lg bg-muted/20">
                            <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-3" />
                            <h3 className="text-lg font-medium">No media files found</h3>
                            <p className="text-muted-foreground text-sm mt-1">
                                Upload some images or drag &amp; drop to get started.
                            </p>
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="text-center py-12">
                            <Search className="mx-auto h-8 w-8 text-muted-foreground opacity-50 mb-2" />
                            <p className="text-sm text-muted-foreground">No images match your search.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {filteredFiles.map((file) => (
                                <button
                                    key={file.name}
                                    type="button"
                                    onClick={() => handleSelect(file.url)}
                                    className="group relative border rounded-lg overflow-hidden bg-background shadow-sm hover:shadow-md hover:border-primary transition-all text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
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
                                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                        <div className="bg-primary text-primary-foreground rounded-full p-2 transform scale-75 group-hover:scale-100 transition-transform">
                                            <Check className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <div className="p-2 text-xs truncate bg-background border-t" title={file.name}>
                                        {file.name}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
