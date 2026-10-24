import { NextResponse } from "next/server";
import { claimChat, toChatView } from "@/lib/support/chat";
import { CHAT_TOKEN_HEADER, chatError, openChat, rateLimited, signedInCustomer } from "@/lib/support/chat-http";

export const runtime = "nodejs";

/**
 * POST: the visitor just signed in (or created an account) from the chat, so
 * the chat moves into their account. Needs the chat's token, not only the
 * session: signing in is not a claim on somebody else's chat.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(req, "support-chat-claim", 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  if (!req.headers.get(CHAT_TOKEN_HEADER)) return chatError("Chat not found.", 404);
  try {
    const opened = await openChat(req, id);
    if (!opened.ok) return opened.response;
    const customer = await signedInCustomer();
    if (!customer) return chatError("Sign in first.", 401);
    const chat = await claimChat(opened.chat, customer);
    if (!chat) return chatError("This chat belongs to another account.", 409);
    return NextResponse.json({ chat: toChatView(chat) });
  } catch (err) {
    console.error("[support/chat] claim failed:", err);
    return chatError("We couldn't save the chat to your account. Please try again.", 500);
  }
}
