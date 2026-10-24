"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SocialInboxStatus } from "@/lib/social-inbox/status";

/**
 * Users & permissions → Telegram → Customer messages: which of Facebook, Instagram and TikTok
 * are connected to the measurements group, and the one-click TikTok connect
 * (Meta is set up once in env — see .claude/PRD-social-inbox/OPS-CHECKLIST.md).
 *
 * The TikTok callback lands back on this tab with ?tiktok=connected|error;
 * that outcome is toasted once and removed from the address bar.
 */
export function SocialInboxCard() {
  const [status, setStatus] = useState<SocialInboxStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("tiktok");
    if (outcome) {
      if (outcome === "connected") {
        const account = params.get("account");
        const webhook = params.get("webhook") ?? "";
        toast.success(`TikTok connected${account ? ` as ${account}` : ""}.`);
        if (webhook.startsWith("failed")) toast.error(`TikTok webhook not registered — ${webhook.slice(8)}`);
        else if (webhook === "skipped") toast.message("Webhook not registered from a non-production deployment.");
      } else {
        toast.error(`TikTok not connected — ${params.get("reason") ?? "unknown error"}`);
      }
      for (const key of ["tiktok", "reason", "account", "webhook"]) params.delete(key);
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }

    let cancelled = false;
    fetch("/api/social-inbox/status")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const payload = (await res.json()) as SocialInboxStatus;
        if (!cancelled) setStatus(payload);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const meta = status?.meta;
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
          <Row
            name="Facebook Messenger"
            connected={!!meta?.connected}
            detail={
              meta?.connected
                ? meta.pageId
                  ? `Page ${meta.pageId}`
                  : "Page token set"
                : "Set META_PAGE_ACCESS_TOKEN (OPS checklist, part 1)."
            }
          />
          <Row
            name="Instagram"
            connected={!!meta?.connected}
            detail={
              meta?.connected
                ? `Through the Facebook Page${meta.instagramId ? ` · account ${meta.instagramId}` : ""}`
                : "Uses the same Facebook Page token once Instagram is linked to the Page."
            }
          />
          <Row
            name="TikTok"
            connected={!!tiktok?.connected}
            detail={
              tiktok?.connected
                ? `${tiktok.accountName ?? "Business account"}${reconnectNote(tiktok.refreshExpiresAt)}${tiktok.lastError ? ` · last refresh failed: ${tiktok.lastError}` : ""}`
                : tiktok?.appConfigured
                  ? "Not connected yet."
                  : "Set TIKTOK_APP_ID and TIKTOK_APP_SECRET first (OPS checklist, part 2)."
            }
            action={
              tiktok?.appConfigured ? (
                // A full-page navigation (not the router): the route redirects to TikTok's sign-in.
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
          {meta?.connected && !meta.webhookSigned ? (
            <li className="text-destructive">
              META_APP_SECRET is not set — production refuses every Facebook and Instagram webhook until it is.
            </li>
          ) : null}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Replies go out within 24 hours of the customer&apos;s last message on Facebook and Instagram
        {meta?.humanAgent ? " (7 days with Meta's Human Agent permission, which is on)" : ""} — after that, answer
        from the platform&apos;s own app. TikTok has no time limit but caps how many messages go to a quiet customer;
        the bot says so if a reply is refused.
      </p>
    </Card>
  );
}

/** TikTok's connection lasts a year; say when it ends once that is a month away. */
function reconnectNote(refreshExpiresAt: string | null): string {
  if (!refreshExpiresAt) return "";
  const ends = new Date(refreshExpiresAt);
  const days = (ends.getTime() - Date.now()) / 86_400_000;
  if (days > 30) return "";
  if (days <= 0) return " · connection expired — reconnect";
  return ` · reconnect by ${ends.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}`;
}

function Row({
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
