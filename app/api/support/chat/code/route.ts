import { NextResponse } from "next/server";
import { z } from "zod";
import { issueChatCode } from "@/lib/support/chat-codes";
import { chatError, rateLimited } from "@/lib/support/chat-http";

export const runtime = "nodejs";

/**
 * POST: email a visitor without an account the 6-digit code that proves their
 * address, before their first chat message goes out (lib/support/chat-codes.ts).
 * The page sends the code back with that message (POST ..).
 */

const CodeSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(320),
  // Honeypot: real visitors never fill this; bots usually do.
  company: z.string().max(0).optional().default(""),
});

export async function POST(req: Request) {
  const limited = rateLimited(req, "support-chat-code", 5, 10 * 60_000);
  if (limited) return limited;

  const parsed = CodeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return chatError(parsed.error.issues[0]?.message ?? "Enter a valid email address.", 400);
  if (parsed.data.company) return chatError("We couldn't send the code. Please try again.", 400);

  try {
    const issued = await issueChatCode(parsed.data.email);
    if (issued.ok) return NextResponse.json({ codeId: issued.codeId, email: issued.email });
    if (issued.reason === "too_many") {
      return chatError(
        "We've sent a few codes to this address already. Check your inbox and spam folder, or try again in 10 minutes.",
        429,
      );
    }
    return chatError("We couldn't send the code. Check the address, or message us on WhatsApp.", 502);
  } catch (err) {
    console.error("[support/chat] code failed:", err);
    return chatError("We couldn't send the code right now. Please try again, or message us on WhatsApp.", 500);
  }
}
