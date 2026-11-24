"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { invalidateTag } from "@/lib/cache/invalidate";
import { COMPANY_OUTPUTS_TAG } from "@/lib/company/load";

export async function refreshCompanyOutputs(): Promise<void> {
  await assertAdmin("company");
  invalidateTag(COMPANY_OUTPUTS_TAG);
}
