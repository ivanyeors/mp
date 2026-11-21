"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  type ConfigUpload,
  MAX_IMAGES_PER_SESSION,
  MAX_FILE_BYTES,
} from "@/lib/config-upload/limits";

type ConfigImageUploadProps = {
  sessionId: string | null;
  ensureSessionId: () => string | null;
  className?: string;
};

export function ConfigImageUpload({
  sessionId,
  ensureSessionId,
  className,
}: ConfigImageUploadProps) {
  const [images, setImages] = useState<ConfigUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    fetch(`/api/config-uploads?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (active && payload?.ok) setImages(payload.images as ConfigUpload[]);
      })
      .catch(() => {
        /* ponytail: silent — mount hydrate failure just shows an empty grid */
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const id = sessionId ?? ensureSessionId();
      if (!id) {
        toast.error("Missing session id. Please refresh and try again.");
        return;
      }

      setUploading(true);
      try {
        let count = images.length;
        for (const file of files) {
          // ponytail: instant UX only — server enforces (422); these mirror assertUploadAllowed.
          if (count >= MAX_IMAGES_PER_SESSION) {
            toast.error(`Up to ${MAX_IMAGES_PER_SESSION} images per session.`);
            break;
          }
          if (file.size > MAX_FILE_BYTES) {
            toast.error(
              `Each image must be ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`,
            );
            continue;
          }
          if (!file.type.startsWith("image/")) {
            toast.error("Only image files are allowed.");
            continue;
          }

          const form = new FormData();
          form.append("sessionId", id);
          form.append("file", file);
          const res = await fetch("/api/config-uploads", { method: "POST", body: form });
          const payload = await res.json().catch(() => null);
          if (res.ok && payload?.ok) {
            setImages((prev) => [...prev, payload.image as ConfigUpload]);
            count += 1;
          } else {
            toast.error(payload?.error ?? "Upload failed");
          }
        }
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [sessionId, ensureSessionId, images.length],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      toast.error("Please drop an image file");
      return;
    }
    void uploadFiles(files);
  };

  const handleDelete = async (imageId: string) => {
    const res = await fetch(`/api/config-uploads?id=${encodeURIComponent(imageId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } else {
      const payload = await res.json().catch(() => null);
      toast.error(payload?.error ?? "Delete failed");
    }
  };

  return (
    <div className={className}>
      <h3 className="text-sm font-medium">Reference photos</h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        Staff only — attach reference images for the build team.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`mt-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/25"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            void uploadFiles(files);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Uploading…" : "Click to upload or drag & drop"}
        </button>
      </div>

      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((image) => (
            <div
              key={image.id}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <img
                src={image.hostedUrl}
                alt="Reference photo"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => void handleDelete(image.id)}
                aria-label="Remove reference photo"
                className="absolute right-1 top-1 flex items-center justify-center rounded-full bg-background/90 p-2.5 shadow transition-opacity max-md:min-h-11 max-md:min-w-11 max-md:opacity-100 md:p-1 md:opacity-0 md:group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
