import { sweepUncarded } from "@/lib/social-inbox/ingest";
import { metaAccountIds, metaConfigured } from "@/lib/social-inbox/meta";
import { humanAgentEnabled } from "@/lib/social-inbox/platforms";
import { getTikTokTokenRow, tiktokAccess, tiktokAppConfig } from "@/lib/social-inbox/tiktok";

/** What Users & permissions → Telegram shows about each platform. Never includes a token. */
export type SocialInboxStatus = {
  meta: {
    connected: boolean;
    webhookSigned: boolean;
    pageId: string | null;
    instagramId: string | null;
    humanAgent: boolean;
  };
  tiktok: {
    appConfigured: boolean;
    connected: boolean;
    accountName: string | null;
    accessExpiresAt: string | null;
    refreshExpiresAt: string | null;
    lastError: string | null;
  };
};

export async function getSocialInboxStatus(): Promise<SocialInboxStatus> {
  const ids = metaAccountIds();
  const row = await getTikTokTokenRow().catch(() => null);
  return {
    meta: {
      connected: metaConfigured(),
      webhookSigned: Boolean(process.env.META_APP_SECRET?.trim()),
      pageId: ids.pageId,
      instagramId: ids.instagramId,
      humanAgent: humanAgentEnabled(),
    },
    tiktok: {
      appConfigured: tiktokAppConfig() !== null,
      connected: row !== null,
      accountName: row?.account_name ?? null,
      accessExpiresAt: row?.access_expires_at ?? null,
      refreshExpiresAt: row?.refresh_expires_at ?? null,
      lastError: row?.last_error ?? null,
    },
  };
}

/**
 * Daily, from the results-sla cron: card anything a webhook left uncarded, and
 * refresh TikTok's token, so a broken TikTok connection shows on the Telegram
 * access tab before an agent's reply fails on it.
 */
export async function runSocialInboxMaintenance(): Promise<{
  sweep: Awaited<ReturnType<typeof sweepUncarded>> | { error: string };
  tiktok: "refreshed" | "not_connected" | { error: string };
}> {
  let sweep: Awaited<ReturnType<typeof sweepUncarded>> | { error: string };
  try {
    sweep = await sweepUncarded({ max: 10 });
  } catch (e) {
    sweep = { error: e instanceof Error ? e.message : "sweep failed" };
  }

  let tiktok: "refreshed" | "not_connected" | { error: string } = "not_connected";
  try {
    if (await getTikTokTokenRow()) {
      const access = await tiktokAccess({ force: true });
      tiktok = access.ok ? "refreshed" : { error: access.error };
    }
  } catch (e) {
    tiktok = { error: e instanceof Error ? e.message : "tiktok refresh failed" };
  }
  return { sweep, tiktok };
}
