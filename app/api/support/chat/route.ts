import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAT_MESSAGE_MAX_CHARS, listCustomerChats, startChat, toChatView } from "@/lib/support/chat";
import { redeemChatCode, type RedeemCodeResult } from "@/lib/support/chat-codes";
import { chatError, openChat, rateLimited, signedInCustomer } from "@/lib/support/chat-http";

export const runtime = "nodejs";

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
  verification: z
    .object({ codeId: z.string().min(1).max(64), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") })
    .optional(),
  after: z.object({ id: z.string().min(1).max(64), token: z.string().min(1).max(200) }).optional(),
  company: z.string().max(0).optional().default(""),
});

const needsCode = () =>
  NextResponse.json({ error: "Check your email with a code first.", needsCode: true }, { status: 401 });

function codeRefused(result: Exclude<RedeemCodeResult, { ok: true }>): NextResponse {
  const error =
    result.reason === "wrong"
      ? result.attemptsLeft === 1
        ? "That code isn't right. You have one more try."
        : "That code isn't right. Check the email and try again."
      : result.reason === "expired"
        ? "That code has expired. Send yourself a new one."
        : "That's too many tries for this code. Send yourself a new one.";
  return NextResponse.json({ error, codeError: result.reason }, { status: 400 });
}

export async function POST(req: Request) {
  const limited = await rateLimited(req, "support-chat-start", 10, 10 * 60_000);
  if (limited) return limited;

  const parsed = StartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return chatError(parsed.error.issues[0]?.message ?? "Invalid message.", 400);
  if (parsed.data.company) return chatError("We couldn't start the chat. Please try again.", 400);

  const { message: body, name, verification, after } = parsed.data;
  try {
    const customer = await signedInCustomer();
    let started: Awaited<ReturnType<typeof startChat>>;
    if (customer) {
      started = await startChat({ body, name, customer });
    } else if (verification) {
      const redeemed = await redeemChatCode(verification.codeId, verification.code);
      if (!redeemed.ok) return codeRefused(redeemed);
      started = await startChat({ body, name, verifiedEmail: redeemed.email });
    } else if (after) {
      const previous = await openChat(req, after.id, after.token);
      if (!previous.ok) return needsCode();
      started = await startChat({ body, name: name || previous.chat.name, verifiedEmail: previous.chat.email });
    } else {
      return needsCode();
    }
    const { chat, token, message, delivered } = started;
    return NextResponse.json({ chat: toChatView(chat), token, messages: [message], delivered });
  } catch (err) {
    console.error("[support/chat] start failed:", err);
    return chatError("We couldn't start the chat right now. Please try again, or message us on WhatsApp.", 500);
  }
}
