export const MAX_IMAGES_PER_SESSION = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

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
