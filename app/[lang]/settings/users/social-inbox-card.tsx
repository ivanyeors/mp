"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Music2, Webhook } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SocialInboxStatus } from "@/lib/social-inbox/status";

export function SocialInboxCard() {
  const [status, setStatus] = useState<SocialInboxStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [connectingMeta, setConnectingMeta] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/social-inbox/status");
    if (!res.ok) throw new Error();
    return (await res.json()) as SocialInboxStatus;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("tiktok");
    if (outcome) {
      if (outcome === "connected") {
        const account = params.get("account");
        const webhook = params.get("webhook") ?? "";
        toast.success(`TikTok connected${account ? ` as ${account}` : ""}.`);
        if (webhook.startsWith("failed")) toast.error(`Couldn't register the TikTok webhook: ${webhook.slice(8)}`);
        else if (webhook === "skipped") toast.message("Webhooks are only registered from the production site.");
      } else {
        toast.error(`Couldn't connect TikTok: ${params.get("reason") ?? "unknown error"}`);
      }
      for (const key of ["tiktok", "reason", "account", "webhook"]) params.delete(key);
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }

    let cancelled = false;
    load()
      .then((payload) => !cancelled && setStatus(payload))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function connectMeta() {
    setConnectingMeta(true);
    try {
      const res = await fetch("/api/social-inbox/meta/connect", { method: "POST" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? "unknown error");
      toast.success("Meta now sends Facebook and Instagram messages to this site.");
    } catch (e) {
      toast.error(`Couldn't connect the webhooks: ${e instanceof Error ? e.message : "unknown error"}`);
    }
    await load().then(setStatus, () => setFailed(true));
    setConnectingMeta(false);
  }

  const meta = status?.meta;
  const setup = meta?.setup?.ok ? meta.setup : null;
  const setupError = meta?.setup && !meta.setup.ok ? meta.setup.error : null;
  const tiktok = status?.tiktok;

  return (
    <Card className="space-y-4 p-4 text-sm">
      <div className="space-y-1">
        <p className="font-medium">Customer messages</p>
        <p className="text-muted-foreground">
          New messages to our Facebook Page, Instagram and TikTok arrive in the measurements group as message cards.
          Anyone allowed to <span className="font-medium text-foreground">Answer customer messages</span> replies to
          a card to answer the customer on the same app. A reply that starts with{" "}
          <code className="rounded bg-muted px-1">{"//"}</code> stays in the group as a team note.
        </p>
      </div>

      {!status && !failed ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking connections…
        </p>
      ) : failed ? (
        <p className="text-destructive">Couldn&apos;t load the connection status.</p>
      ) : (
        <ul className="space-y-3">
          <ConnectionRow
            name="Facebook Messenger"
            connected={!!setup}
            detail={
              setup
                ? `${setup.page.name ?? "Page"} (${setup.page.id})`
                : meta?.connected
                  ? "Page token set, but Meta refused it (below)."
                  : "Set META_PAGE_ACCESS_TOKEN (OPS checklist, part 1)."
            }
          />
          <ConnectionRow
            name="Instagram"
            connected={!!setup?.instagram}
            detail={
              setup?.instagram
                ? `${setup.instagram.username ? `@${setup.instagram.username}` : "Account"} (${setup.instagram.id})`
                : setup
                  ? "No Instagram professional account is linked to the Page (Meta Business Suite → Settings → Instagram accounts)."
                  : "Uses the same Facebook Page token once Instagram is linked to the Page."
            }
          />
          {setup ? (
            <ConnectionRow
              name="Meta webhooks"
              connected={setup.problems.length === 0}
              detail={
                setup.problems.length === 0
                  ? "Meta sends Facebook and Instagram messages to the site."
                  : meta?.webhookUrl
                    ? "Not all set up yet (below)."
                    : "Not all set up yet (below). Open this tab on the production site to connect them."
              }
              action={
                meta?.webhookUrl ? (
                  <Button variant="outline" size="sm" disabled={connectingMeta} onClick={connectMeta}>
                    {connectingMeta ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Webhook className="mr-2 h-4 w-4" />
                    )}
                    {setup.problems.length === 0 ? "Reconnect webhooks" : "Connect webhooks"}
                  </Button>
                ) : null
              }
            />
          ) : null}
          <ConnectionRow
            name="TikTok"
            connected={!!tiktok?.connected}
            detail={
              tiktok?.connected
                ? `${tiktok.accountName ?? "Business account"}${reconnectNote(tiktok.refreshExpiresAt)}${tiktok.lastError ? `. Last refresh failed: ${tiktok.lastError}` : ""}`
                : tiktok?.appConfigured
                  ? "Not connected yet."
                  : "Set TIKTOK_APP_ID and TIKTOK_APP_SECRET first (OPS checklist, part 2)."
            }
            action={
              tiktok?.appConfigured ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.assign(new URL("/api/social-inbox/tiktok/connect", window.location.origin))}
                >
                  <Music2 className="mr-2 h-4 w-4" />
                  {tiktok.connected ? "Reconnect TikTok" : "Connect TikTok"}
                </Button>
              ) : null
            }
          />
          {setupError ? <li className="break-words text-destructive">Meta: {setupError}</li> : null}
          {setup?.problems.map((problem) => (
            <li key={problem} className="break-words text-destructive">
              {problem}
            </li>
          ))}
          {setup && (!meta?.pageId || (setup.instagram && !meta.instagramId)) ? (
            <li className="break-words text-xs text-muted-foreground">
              Optional: add <code className="rounded bg-muted px-1">META_PAGE_ID={setup.page.id}</code>
              {setup.instagram ? (
                <>
                  {" "}
                  and <code className="rounded bg-muted px-1">INSTAGRAM_ACCOUNT_ID={setup.instagram.id}</code>
                </>
              ) : null}{" "}
              to Vercel, so messages to any other account the app serves are ignored.
            </li>
          ) : null}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Replies go out within 24 hours of the customer&apos;s last message on Facebook and Instagram
        {meta?.humanAgent ? " (7 days with Meta's Human Agent permission, which is on)" : ""}. After that, answer
        from the platform&apos;s own app. TikTok has no time limit but caps how many messages go to a quiet customer;
        the bot says so if a reply is refused.
      </p>
    </Card>
  );
}

function reconnectNote(refreshExpiresAt: string | null): string {
  if (!refreshExpiresAt) return "";
  const ends = new Date(refreshExpiresAt);
  const days = (ends.getTime() - Date.now()) / 86_400_000;
  if (days > 30) return "";
  if (days <= 0) return ". The connection has expired, so reconnect";
  return `. Reconnect by ${ends.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function ConnectionRow({
  name,
  connected,
  detail,
  action,
}: {
  name: string;
  connected: boolean;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-2 font-medium">
          {name}
          <Badge variant={connected ? "default" : "secondary"}>{connected ? "Connected" : "Not connected"}</Badge>
        </p>
        <p className="break-words text-muted-foreground">{detail}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}
