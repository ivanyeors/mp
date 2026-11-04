import type { AiWritingAvailability } from "@/lib/ai/availability";
import { readAiWritingAvailability } from "@/lib/ai/page-availability";

/**
 * Whether the editor offers ✨ (PRD-campaign-email-editor slices 09 and 16):
 * AI writing switched on, on General, and Claude's credentials set. A failed
 * read is off, so a read error never shows what the owner switched off. Each
 * call checks again on the server.
 */
export async function campaignAiWriting(): Promise<AiWritingAvailability> {
  return readAiWritingAvailability();
}
