import { NextResponse } from "next/server";
import { endChat, toChatView } from "@/lib/support/chat";
import { chatError, openChat, rateLimited } from "@/lib/support/chat-http";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(req, "support-chat-end", 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  try {
    const opened = await openChat(req, id);
    if (!opened.ok) return opened.response;
    const { chat, emailed } = await endChat(opened.chat);
    return NextResponse.json({ chat: toChatView(chat), emailed });
  } catch (err) {
    console.error("[support/chat] end failed:", err);
    return chatError("We couldn't end the chat. Please try again.", 500);
  }
}
