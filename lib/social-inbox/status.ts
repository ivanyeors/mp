import { sweepUncarded } from "@/lib/social-inbox/ingest";
import { checkMetaSetup, metaAccountIds, metaConfigured, type MetaSetup } from "@/lib/social-inbox/meta";
import { humanAgentEnabled } from "@/lib/social-inbox/platforms";
import { getTikTokTokenRow, tiktokAccess, tiktokAppConfig } from "@/lib/social-inbox/tiktok";

export type SocialInboxStatus = {
  meta: {
    connected: boolean;
    pageId: string | null;
    instagramId: string | null;
    humanAgent: boolean;
    setup: MetaSetup | null;
    webhookUrl: string | null;
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

export async function getSocialInboxStatus(metaWebhookUrl: string | null): Promise<SocialInboxStatus> {
  const ids = metaAccountIds();
  const [row, setup] = await Promise.all([
    getTikTokTokenRow().catch(() => null),
    checkMetaSetup(metaWebhookUrl).catch(
      (e): MetaSetup => ({ ok: false, error: e instanceof Error ? e.message : "Couldn't check Meta" }),
    ),
  ]);
  return {
    meta: {
      connected: metaConfigured(),
      pageId: ids.pageId,
      instagramId: ids.instagramId,
      humanAgent: humanAgentEnabled(),
      setup,
      webhookUrl: metaWebhookUrl,
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
