import { NextResponse } from "next/server";
import { z } from "zod";
import { deliverContactMessage } from "@/lib/support/contact";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("A valid email is required").max(320),
  subject: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().min(1, "Message is required").max(5000),
  // Honeypot: real users never fill this; bots usually do.
  company: z.string().max(0).optional().default(""),
});

export async function POST(req: Request) {
  if (isRateLimited({ bucket: "support-contact", key: clientIp(req), windowMs: 60_000, max: 5 })) {
    return NextResponse.json(
      { error: "Too many messages. Please try again in a minute." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Honeypot tripped — pretend success so bots don't learn anything.
  if (parsed.data.company) {
    return NextResponse.json({ ok: true });
  }

  // Email to the support inbox plus a Telegram notice; either one reaching staff is a success.
  const { emailed, notified } = await deliverContactMessage({
    name: parsed.data.name,
    email: parsed.data.email,
    subject: parsed.data.subject || null,
    message: parsed.data.message,
  });
  if (emailed || notified) {
    // `emailed` tells the form whether the customer has a copy in their inbox.
    return NextResponse.json({ ok: true, emailed });
  }
  return NextResponse.json(
    { error: "We couldn't send your message right now. Please try again, or message us on WhatsApp." },
    { status: 502 }
  );
}
