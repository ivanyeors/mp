import { after, NextResponse } from "next/server";
import { LEAVE_SETTLE_MS, markChatLeft, settleLeave } from "@/lib/support/chat";
import { openChat, rateLimited } from "@/lib/support/chat-http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(req, "support-chat-leave", 20, 60_000);
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
