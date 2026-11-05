import type { SupabaseClient } from "@supabase/supabase-js";
import { screenSizingPhoto, screenableImage, type SizingPhotoView } from "@/lib/ai/photo-screening";

/**
 * The Sizing photos a submitted Result's Telegram message attaches (ADR 0047).
 * Only a photo Claude passed is attached. One that wasn't checked when it was
 * uploaded (`unchecked`, or `null` from before screening) is checked again
 * now, briefly, so a short outage doesn't cost the build team the photo: if it
 * passes it is attached and marked passed; if it is rejected it is deleted;
 * if Claude still can't be reached it stays, unattached, and the message says
 * so. Server-only.
 */

export interface SizingPhotoRow {
  view: string;
  data_url: string;
  screening_status: string | null;
}

export interface TelegramSizingPhotos {
  front: string | null;
  side: string | null;
  /** Lines for the message about photos it leaves out. */
  notes: string[];
}

const LABEL: Record<SizingPhotoView, string> = { front: "Front", side: "Side" };

/** The submit route waits on this, so the retry is short and not repeated. */
const RETRY = { timeoutMs: 8_000, maxRetries: 0 };

export async function sizingPhotosForTelegram(
  admin: SupabaseClient,
  responseId: string,
  rows: readonly SizingPhotoRow[],
  { screen = screenSizingPhoto }: { screen?: typeof screenSizingPhoto } = {},
): Promise<TelegramSizingPhotos> {
  const out: TelegramSizingPhotos = { front: null, side: null, notes: [] };

  await Promise.all(
    (["front", "side"] as const).map(async (view) => {
      const row = rows.find((r) => r.view === view);
      if (!row) return;
      if (row.screening_status === "passed") {
        out[view] = row.data_url;
        return;
      }

      const image = screenableImage(row.data_url);
      const result = image ? await screen(image, view, RETRY) : null;

      if (result?.status === "passed") {
        out[view] = row.data_url;
        const { error } = await admin
          .from("mp_config_response_photos")
          .update({ screening_status: "passed", screening_model: result.model, screened_at: new Date().toISOString() })
          .eq("response_id", responseId)
          .eq("view", view);
        if (error) console.error(`[sizing-photo] ${responseId} ${view} passed but not marked:`, error.message);
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

  // Promise.all settles in any order; keep front before side.
  out.notes.sort((a, b) => Number(a.includes("Side")) - Number(b.includes("Side")));
  return out;
}
