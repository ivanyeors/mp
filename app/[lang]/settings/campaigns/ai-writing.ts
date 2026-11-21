import type { AiWritingAvailability } from "@/lib/ai/availability";
import { readAiWritingAvailability } from "@/lib/ai/page-availability";

export async function campaignAiWriting(): Promise<AiWritingAvailability> {
  return readAiWritingAvailability();
}
