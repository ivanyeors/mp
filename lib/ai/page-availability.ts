import type { AiWritingAvailability } from "./availability";
import { claudeConfigured } from "./claude";
import { readAiWritingSettings } from "./settings";

export async function readAiWritingAvailability(): Promise<AiWritingAvailability> {
  const read = await readAiWritingSettings();
  return { on: read.settings.enabled, configured: await claudeConfigured() };
}
