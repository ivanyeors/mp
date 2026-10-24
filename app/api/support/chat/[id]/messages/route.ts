import { NextResponse } from "next/server";
import { z } from "zod";
import { addCustomerMessage, CHAT_MESSAGE_MAX_CHARS, toChatView } from "@/lib/support/chat";
import { chatError, openChat, rateLimited } from "@/lib/support/chat-http";

export const runtime = "nodejs";

const MessageSchema = z.object({
  message: z.string().trim().min(1, "Write a message first.").max(CHAT_MESSAGE_MAX_CHARS),
});

/** POST: the customer's next message, stored and posted to the staff Telegram group. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(req, "support-chat-message", 30, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const parsed = MessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return chatError(parsed.error.issues[0]?.message ?? "Invalid message.", 400);
  try {
    const opened = await openChat(req, id);
    if (!opened.ok) return opened.response;
    const result = await addCustomerMessage(opened.chat, parsed.data.message);
    if (!result.ok) {
      return chatError(
        result.reason === "ended"
          ? "This chat has ended. Start a new one to keep talking."
          : "This chat is full. Start a new one to keep talking.",
        409,
      );
    }
    return NextResponse.json({ chat: toChatView(result.chat), message: result.message, delivered: result.delivered });
  } catch (err) {
    console.error("[support/chat] message failed:", err);
    return chatError("We couldn't send that. Please try again.", 500);
  }
}
