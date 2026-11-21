import { NextResponse } from "next/server";
import { getAuthIdentity, getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { clientIp, rateLimitExceeded } from "@/lib/rate-limit";
import { canAccessChat, loadChat, type ChatCustomer, type SupportChatRow } from "./chat";

export const CHAT_TOKEN_HEADER = "x-chat-token";

export function chatError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function rateLimited(
  req: Request,
  bucket: string,
  max: number,
  windowMs: number,
): Promise<NextResponse | null> {
  if (!(await rateLimitExceeded({ bucket, key: clientIp(req), windowMs, max }))) return null;
  return chatError("Too many requests. Please wait a minute and try again.", 429);
}

export async function openChat(
  req: Request,
  id: string,
  token: string | null = req.headers.get(CHAT_TOKEN_HEADER),
): Promise<{ ok: true; chat: SupportChatRow } | { ok: false; response: NextResponse }> {
  const chat = await loadChat(id);
  if (chat) {
    if (token && canAccessChat(chat, { token })) return { ok: true, chat };
    if (chat.auth_user_id) {
      const identity = await getAuthIdentity();
      if (identity && canAccessChat(chat, { authUserId: identity.id })) return { ok: true, chat };
    }
  }
  return { ok: false, response: chatError("Chat not found.", 404) };
}

export async function signedInCustomer(): Promise<ChatCustomer | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;
  const customer = await linkCustomerToAuthUser(user);
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return {
    customerId: customer.id,
    authUserId: user.id,
    email: customer.email || user.email,
    name: name || null,
  };
}
