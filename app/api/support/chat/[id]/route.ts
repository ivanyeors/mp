import { NextResponse } from "next/server";
import { countMessages, readMessages, toChatView, touchChat } from "@/lib/support/chat";
import { chatError, openChat, rateLimited } from "@/lib/support/chat-http";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET: the page's poll. `?have=N` is how many messages the page already
 * shows; while that is still the count, the messages are left out. Each poll
 * also tells the chat the customer is on the page.
 */
export async function GET(req: Request, { params }: Params) {
  const limited = await rateLimited(req, "support-chat-poll", 120, 60_000);
  if (limited) return limited;
  const { id } = await params;
  try {
    const opened = await openChat(req, id);
    if (!opened.ok) return opened.response;
    const chat = await touchChat(opened.chat);
    const have = Number(new URL(req.url).searchParams.get("have"));
    const count = await countMessages(chat.id);
    if (Number.isInteger(have) && have === count) {
      return NextResponse.json({ chat: toChatView(chat), unchanged: true });
    }
    return NextResponse.json({ chat: toChatView(chat), messages: await readMessages(chat.id) });
  } catch (err) {
    console.error("[support/chat] poll failed:", err);
    return chatError("We couldn't load the chat.", 500);
  }
}
