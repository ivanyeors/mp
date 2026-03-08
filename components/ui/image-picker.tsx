"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Loader2, ImageIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

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

    // Load files when dialog opens
    useEffect(() => {
        if (open) {
            loadFiles();
        }
    }, [open]);

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
                // Prepend the new file
                setFiles([data.file, ...files]);
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

    const handleSelect = (url: string) => {
        onSelect(url);
        setOpen(false);
    };

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
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between mt-2">
                        <div>
                            <DialogTitle>Select Image</DialogTitle>
                            <DialogDescription>
                                Pick an image from your media gallery or upload a new one.
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

                <div className="flex-1 overflow-y-auto pr-2 mt-4 min-h-[300px]">
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {files.map((file) => (
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
