import { JWT } from "google-auth-library";
import type { EmailTransport, OutgoingEmail, TransportResult } from "./types";

// ============================================================
// Email transports (swappable providers)
// ============================================================

/**
 * Logs the email instead of sending it. Used in development and as a safe
 * fallback when no provider is configured, so lifecycle code can always call
 * the email module without crashing.
 */
export class ConsoleTransport implements EmailTransport {
  readonly name = "console";

  async send(email: OutgoingEmail): Promise<TransportResult> {
    console.info(
      `[email:console] to=${email.to}${email.cc?.length ? ` cc=${email.cc.join(",")}` : ""} from=${email.from} subject="${email.subject}"`
    );
    return { id: `console_${Date.now()}` };
  }
}

/**
 * Resend (https://resend.com) transport via their REST API — no SDK dependency.
 * Selected automatically when RESEND_API_KEY is set.
 */
export class ResendTransport implements EmailTransport {
  readonly name = "resend";

  constructor(private readonly apiKey: string) {}

  async send(email: OutgoingEmail): Promise<TransportResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        ...(email.cc?.length ? { cc: email.cc } : {}),
        ...(email.replyTo?.length ? { reply_to: email.replyTo } : {}),
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.headers ? { headers: Object.fromEntries(extraHeaders(email.headers)) } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${detail}`);
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: json.id };
  }
}

/**
 * Gmail API transport (Google Workspace) via a service account with
 * domain-wide delegation. The service account impersonates `sender` (a real
 * Workspace mailbox) and sends through Gmail's REST API — no SMTP, no SDK
 * beyond google-auth-library for minting the access token.
 *
 * Setup: enable the Gmail API on a GCP project, create a service account + key,
 * then authorize its client ID for the `gmail.send` scope under
 * Admin console → Security → API controls → Domain-wide delegation.
 */
export class GmailTransport implements EmailTransport {
  readonly name = "gmail";
  private readonly jwt: JWT;

  constructor(
    private readonly clientEmail: string,
    privateKey: string,
    private readonly sender: string
  ) {
    this.jwt = new JWT({
      email: clientEmail,
      // Env vars commonly store the key with literal "\n" — normalise to real newlines.
      key: privateKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      // Impersonate the Workspace mailbox we send as.
      subject: sender,
    });
  }

  async send(email: OutgoingEmail): Promise<TransportResult> {
    const { token } = await this.jwt.getAccessToken();
    if (!token) {
      throw new Error("Gmail transport: failed to obtain access token");
    }

    const raw = buildRawMessage({ ...email, from: email.from || this.sender });

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gmail send failed (${res.status}): ${detail}`);
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: json.id };
  }
}

/** RFC 2047 encode a header value when it contains non-ASCII characters. */
function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Headers every transport writes itself; `OutgoingEmail.headers` cannot set them. */
const OWNED_HEADERS = new Set([
  "from",
  "to",
  "cc",
  "bcc",
  "reply-to",
  "subject",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
]);

/**
 * `OutgoingEmail.headers` as checked (name, value) pairs. Throws on a name that
 * is not a plain header token, one the transport owns, or a value carrying a
 * line break: any of those could rewrite the message (header injection).
 */
export function extraHeaders(headers: Record<string, string> | undefined): Array<[string, string]> {
  return Object.entries(headers ?? {}).map(([name, value]) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(name)) throw new Error(`Invalid email header name: ${name}`);
    if (OWNED_HEADERS.has(name.toLowerCase())) throw new Error(`The transport sets ${name} itself`);
    if (/[\r\n]/.test(value)) throw new Error(`Email header ${name} has a line break in its value`);
    return [name, value];
  });
}

/** An address header's value, one address or a list. A line break could add headers, so it throws. */
function addressHeader(value: string | string[]): string {
  const list = typeof value === "string" ? [value] : value;
  if (list.some((address) => /[\r\n]/.test(address))) throw new Error("Email address has a line break in it");
  return list.join(", ");
}

/** Build a base64url-encoded MIME message for the Gmail API. Exported for tests. */
export function buildRawMessage(email: OutgoingEmail): string {
  const boundary = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${email.from}`,
    `To: ${email.to}`,
    ...(email.cc?.length ? [`Cc: ${addressHeader(email.cc)}`] : []),
    ...(email.replyTo?.length ? [`Reply-To: ${addressHeader(email.replyTo)}`] : []),
    `Subject: ${encodeHeaderValue(email.subject)}`,
    ...extraHeaders(email.headers).map(([name, value]) => `${name}: ${encodeHeaderValue(value)}`),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(email.text, "utf8").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(email.html, "utf8").toString("base64"),
    `--${boundary}--`,
    "",
  ];

  const mime = `${headers.join("\r\n")}\r\n\r\n${body.join("\r\n")}`;
  return Buffer.from(mime, "utf8").toString("base64url");
}

// Memoise the resolved transport so stateful providers (e.g. Gmail's cached
// access token) are reused across sends within an instance.
let cachedTransport: EmailTransport | null = null;

/**
 * Resolve the configured transport from the environment. Provider selection
 * lives here so the rest of the module never reads provider env vars directly.
 *
 * Order: explicit EMAIL_PROVIDER override, else auto-detect
 * (Resend → Gmail → console fallback).
 */
export function getDefaultTransport(): EmailTransport {
  if (cachedTransport) return cachedTransport;
  cachedTransport = resolveTransport();
  return cachedTransport;
}

function resolveTransport(): EmailTransport {
  const provider = process.env.EMAIL_PROVIDER?.toLowerCase();

  const resendKey = process.env.RESEND_API_KEY;
  const gmailEmail = process.env.GMAIL_CLIENT_EMAIL;
  const gmailKey = process.env.GMAIL_PRIVATE_KEY;
  const gmailSender = process.env.GMAIL_SENDER;
  const gmailReady = Boolean(gmailEmail && gmailKey && gmailSender);

  if (provider === "console") return new ConsoleTransport();
  if (provider === "resend") {
    if (!resendKey) throw new Error("EMAIL_PROVIDER=resend but RESEND_API_KEY is not set");
    return new ResendTransport(resendKey);
  }
  if (provider === "gmail") {
    if (!gmailReady) {
      throw new Error(
        "EMAIL_PROVIDER=gmail but GMAIL_CLIENT_EMAIL / GMAIL_PRIVATE_KEY / GMAIL_SENDER are not all set"
      );
    }
    return new GmailTransport(gmailEmail!, gmailKey!, gmailSender!);
  }

  // Auto-detect.
  if (resendKey) return new ResendTransport(resendKey);
  if (gmailReady) return new GmailTransport(gmailEmail!, gmailKey!, gmailSender!);
  return new ConsoleTransport();
}

/** Reset the memoised transport (primarily for tests). */
export function resetTransportCache(): void {
  cachedTransport = null;
}

export function getDefaultFromAddress(): string {
  // For Gmail, the From must be the impersonated mailbox (or one of its
  // verified aliases), so fall back to GMAIL_SENDER before the generic default.
  return (
    process.env.EMAIL_FROM ??
    process.env.GMAIL_SENDER ??
    "mpillow <onboarding@resend.dev>"
  );
}
