import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAT_MESSAGE_MAX_CHARS, listCustomerChats, startChat, toChatView } from "@/lib/support/chat";
import { chatError, rateLimited, signedInCustomer } from "@/lib/support/chat-http";

export const runtime = "nodejs";

/**
 * The website chat (lib/support/chat.ts).
 *
 * GET: who the page is talking to. Signed in, with their chats (adopting any
 * that carry their sign-in email); otherwise just `signedIn: false`.
 * POST: start a chat with its first message.
 */

export async function GET() {
  try {
    const customer = await signedInCustomer();
    if (!customer) return NextResponse.json({ signedIn: false });
    const chats = await listCustomerChats(customer);
    return NextResponse.json({ signedIn: true, email: customer.email, name: customer.name, chats });
  } catch (err) {
    console.error("[support/chat] list failed:", err);
    return chatError("We couldn't load your chats. Please refresh the page.", 500);
  }
}

const StartSchema = z.object({
  message: z.string().trim().min(1, "Write a message first.").max(CHAT_MESSAGE_MAX_CHARS),
  name: z.string().trim().max(200).optional(),
  // Honeypot: real visitors never fill this; bots usually do.
  company: z.string().max(0).optional().default(""),
});

export async function POST(req: Request) {
  const limited = rateLimited(req, "support-chat-start", 5, 10 * 60_000);
  if (limited) return limited;

  const parsed = StartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return chatError(parsed.error.issues[0]?.message ?? "Invalid message.", 400);
  // Honeypot tripped: look like a chat that never answers.
  if (parsed.data.company) return chatError("We couldn't start the chat. Please try again.", 400);

  try {
    const customer = await signedInCustomer();
    const { chat, token, message, delivered } = await startChat({
      body: parsed.data.message,
      name: parsed.data.name,
      customer,
    });
    return NextResponse.json({ chat: toChatView(chat), token, messages: [message], delivered });
  } catch (err) {
    console.error("[support/chat] start failed:", err);
    return chatError("We couldn't start the chat right now. Please try again, or message us on WhatsApp.", 500);
  }
}
