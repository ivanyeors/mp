/**
 * The one Telegram group mp-config notices may reach, and the only sender.
 *
 * The chat id is hardcoded on purpose and is NOT read from the environment: a
 * misconfigured env var must not be able to redirect customer and order detail
 * into some other chat. That guard was already the intent — it was just written
 * out three times, in hold/, results-sla/ and mp-config/responses/, with the
 * same literal copied into each. Three copies of a safety constant is two too
 * many; this is the definition the rest import.
 */
export const MP_CONFIG_TELEGRAM_CHAT_ID = -1001279910218;

export type TelegramStatus = "sent" | "skipped" | "failed";

/**
 * Best-effort group notice.
 *
 * Never throws and never blocks the caller: every site that uses this has
 * already done the thing worth doing — taken a hold, expired a Result, accepted
 * a cancellation — and a Telegram outage must not turn a completed action into
 * a failed request. "skipped" means no bot token is configured, which is the
 * normal state in development.
 */
export async function sendTelegram(text: string): Promise<TelegramStatus> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return "skipped";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: MP_CONFIG_TELEGRAM_CHAT_ID, text }),
      cache: "no-store",
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
