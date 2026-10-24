import { after, NextResponse } from "next/server";
import { LEAVE_SETTLE_MS, markChatLeft, settleLeave } from "@/lib/support/chat";
import { openChat, rateLimited } from "@/lib/support/chat-http";

export const runtime = "nodejs";
// The transcript decision waits LEAVE_SETTLE_MS after the response.
export const maxDuration = 30;

/**
 * POST: the page's pagehide beacon. sendBeacon cannot set headers, so the
 * token comes in the body. The transcript goes only if the page does not poll
 * again within LEAVE_SETTLE_MS: a reload does, closing the tab doesn't.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(req, "support-chat-leave", 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : null;
  try {
    const opened = await openChat(req, id, token);
    if (!opened.ok) return opened.response;
    const chat = await markChatLeft(opened.chat);
    if (chat.status === "open") {
      after(async () => {
        await new Promise((resolve) => setTimeout(resolve, LEAVE_SETTLE_MS));
        await settleLeave(chat.id);
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[support/chat] leave failed:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
