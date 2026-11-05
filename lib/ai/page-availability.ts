import type { AiWritingAvailability } from "./availability";
import { claudeConfigured } from "./claude";
import { readAiWritingSettings } from "./settings";

/**
 * Whether an editor offers ✨, read on the server for its first load (the
 * campaign editor, PRD-campaign-email-editor slices 09 and 16; the product
 * editor): AI writing switched on, on General, and Claude's credentials set.
 * A failed read is off, so a read error never shows what the owner switched
 * off. Each call checks again on the server.
 */
export async function readAiWritingAvailability(): Promise<AiWritingAvailability> {
  const read = await readAiWritingSettings();
  return { on: read.settings.enabled, configured: await claudeConfigured() };
}
