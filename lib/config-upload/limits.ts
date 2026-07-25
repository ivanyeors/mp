// Client-safe limits + type for reference-photo uploads. Deliberately imports nothing
// server-only (no sharp / supabase), so client components (e.g. config-image-upload.tsx)
// can import these without dragging the Node image pipeline into the browser bundle.

/** Limits enforced at the API boundary (mirrored in the UI for instant feedback). */
export const MAX_IMAGES_PER_SESSION = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB, pre-compression

export type ConfigUpload = {
  id: string;
  sessionId: string;
  storagePath: string;
  hostedUrl: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};
