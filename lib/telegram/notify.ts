export const MP_CONFIG_TELEGRAM_CHAT_ID = -1001279910218;

const TELEGRAM_TIMEOUT_MS = 5_000;

export type TelegramStatus = "sent" | "skipped" | "failed";

export async function sendTelegram(text: string): Promise<TelegramStatus> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return "skipped";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: MP_CONFIG_TELEGRAM_CHAT_ID, text }),
      cache: "no-store",
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
