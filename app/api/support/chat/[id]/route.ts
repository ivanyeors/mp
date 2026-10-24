import { NextResponse } from "next/server";
import { z } from "zod";
import { countMessages, readMessages, setChatContact, toChatView, touchChat } from "@/lib/support/chat";
import { chatError, openChat, rateLimited } from "@/lib/support/chat-http";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET: the page's poll. `?have=N` is how many messages the page already
 * shows; while that is still the count, the messages are left out. Each poll
 * also tells the chat the customer is on the page.
 */
export async function GET(req: Request, { params }: Params) {
  const limited = rateLimited(req, "support-chat-poll", 120, 60_000);
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

const ContactSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(320),
  name: z.string().trim().max(200).optional(),
});

/** PATCH: the visitor's email (and name), for the transcript. */
export async function PATCH(req: Request, { params }: Params) {
  const limited = rateLimited(req, "support-chat-contact", 10, 10 * 60_000);
  if (limited) return limited;
  const { id } = await params;
  const parsed = ContactSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return chatError(parsed.error.issues[0]?.message ?? "Enter a valid email address.", 400);
  try {
    const opened = await openChat(req, id);
    if (!opened.ok) return opened.response;
    // A signed-in chat already uses the account's verified email.
    if (opened.chat.auth_user_id) return NextResponse.json({ chat: toChatView(opened.chat) });
    const chat = await setChatContact(opened.chat, parsed.data);
    return NextResponse.json({ chat: toChatView(chat) });
  } catch (err) {
    console.error("[support/chat] contact failed:", err);
    return chatError("We couldn't save your email. Please try again.", 500);
  }
}
