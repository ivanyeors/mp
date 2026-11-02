// Customer messages on Users & permissions → Telegram. Scenario
// `tiktok-connected` stores a TikTok connection, so the TikTok row shows
// Connected with its Disconnect button. The preview withholds TIKTOK_APP_ID,
// so Connect / Reconnect stays hidden. The account and tokens are made up.

export default function socialInbox({ scenario, now }) {
  if (scenario !== "tiktok-connected") return {};
  const inDays = (days) => new Date(now.getTime() + days * 86_400_000).toISOString();
  return {
    tables: {
      social_channel_tokens: [
        {
          platform: "tiktok",
          account_id: "preview-business-id",
          account_name: "@preview_pillows",
          access_token: "preview-access-token",
          access_expires_at: inDays(1),
          refresh_token: "preview-refresh-token",
          refresh_expires_at: inDays(300),
          connected_by: "owner@preview.local",
          last_error: null,
          created_at: inDays(-65),
          updated_at: inDays(-1),
        },
      ],
    },
  };
}
