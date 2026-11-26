import type { SupabaseClient } from "@supabase/supabase-js";
import { screenSizingPhoto, screenableImage, type SizingPhotoView } from "@/lib/ai/photo-screening";
import { photoDriveFromEnv, sizingPhotoDataUrl, sizingPhotoFolder, type PhotoDrive } from "@/lib/results/sizing-photo-drive";

export interface SizingPhotoRow {
  view: string;
  data_url: string | null;
  drive_file_id: string | null;
  screening_status: string | null;
}

export interface TelegramSizingPhotos {
  front: string | null;
  side: string | null;
  notes: string[];
}

const LABEL: Record<SizingPhotoView, string> = { front: "Front", side: "Side" };

const RETRY = { timeoutMs: 8_000, maxRetries: 0 };

export async function sizingPhotosForTelegram(
  admin: SupabaseClient,
  responseId: string,
  rows: readonly SizingPhotoRow[],
  { screen = screenSizingPhoto, drive = photoDriveFromEnv() }: { screen?: typeof screenSizingPhoto; drive?: PhotoDrive | null } = {},
): Promise<TelegramSizingPhotos> {
  const out: TelegramSizingPhotos = { front: null, side: null, notes: [] };

  await Promise.all(
    (["front", "side"] as const).map(async (view) => {
      const row = rows.find((r) => r.view === view);
      if (!row) return;

      const dataUrl = await sizingPhotoDataUrl(row, drive).catch((e) => {
        console.error(`[sizing-photo] ${responseId} ${view} could not be read from Drive:`, e instanceof Error ? e.message : e);
        return null;
      });
      if (!dataUrl) {
        out.notes.push(`📷 ${LABEL[view]} photo not attached: it couldn't be read from Google Drive.`);
        return;
      }
      if (row.screening_status === "passed") {
        out[view] = dataUrl;
        return;
      }

      const image = screenableImage(dataUrl);
      const result = image ? await screen(image, view, RETRY) : null;

      if (result?.status === "passed") {
        out[view] = dataUrl;
        const { data: marked, error } = await admin
          .from("mp_config_response_photos")
          .update({ screening_status: "passed", screening_model: result.model, screened_at: new Date().toISOString(), screened_view: result.view })
          .eq("response_id", responseId)
          .eq("view", view)
          .select("drive_file_id,data_url");
        if (error) console.error(`[sizing-photo] ${responseId} ${view} passed but not marked:`, error.message);
        const onDrive = (marked as { drive_file_id: string | null; data_url: string | null }[] | null)?.[0];
        if (onDrive?.drive_file_id && !onDrive.data_url && drive) {
          const folder = sizingPhotoFolder({ view, screening_status: "passed", screened_view: result.view });
          await drive.moveOutOf(onDrive.drive_file_id, "unchecked", folder).catch((e) => {
            console.error(`[sizing-photo] ${responseId} ${view} passed but left in the unchecked folder:`, e instanceof Error ? e.message : e);
          });
        }
        return;
      }
      if (result?.status === "rejected") {
        out.notes.push(`📷 ${LABEL[view]} photo removed: it didn't pass the photo check.`);
        const { error } = await admin.from("mp_config_response_photos").delete().eq("response_id", responseId).eq("view", view);
        if (error) console.error(`[sizing-photo] ${responseId} ${view} rejected but not deleted:`, error.message);
        return;
      }
      out.notes.push(`📷 ${LABEL[view]} photo not attached: it couldn't be checked.`);
    }),
  );

  out.notes.sort((a, b) => Number(a.includes("Side")) - Number(b.includes("Side")));
  return out;
}
