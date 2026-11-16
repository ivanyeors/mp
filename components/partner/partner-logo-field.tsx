"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LOGO_GUIDELINES, checkLogoFile } from "@/lib/partner-upload/limits";

/**
 * A partner logo picker: preview, Upload/Replace, optional Remove, and the
 * logo guidelines. Uploads straight away to `uploadUrl` (the application's or
 * Partner Hub's logo endpoint) and reports the stored url; the caller saves it
 * with the rest of its form.
 */
export function PartnerLogoField({
  id,
  value,
  onChange,
  uploadUrl,
  uploadedMessage,
  error,
}: {
  id: string;
  value: string | null;
  onChange: (url: string | null) => void;
  uploadUrl: string;
  /** Toast after a successful upload, e.g. what still has to be saved. */
  uploadedMessage: string;
  error?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const err = checkLogoFile(file);
    if (err) return toast.error(err);

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        onChange(json.url as string);
        toast.success(uploadedMessage);
      } else {
        toast.error(json?.error ?? "Upload failed");
      }
    } catch {
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-4">
        {value ? (
          <Image
            src={value}
            alt="Logo preview"
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-md border bg-background object-contain"
            unoptimized
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            No logo
          </div>
        )}
        <div className="min-w-0 space-y-2">
          <input
            ref={fileRef}
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onPick}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {value ? "Replace logo" : "Upload logo"}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => onChange(null)}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{LOGO_GUIDELINES}</p>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
