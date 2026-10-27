import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { DEFAULT_TELEGRAM_UPDATES, TELEGRAM_UPDATE_TYPES } from "@/lib/crm/telegram-updates";

/**
 * The Telegram updates card (CRM slice 14): read-only without
 * `customers-edit`, and the online Result switch disabled without `results`.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/en/settings/customers" }));

const { TelegramUpdatesCard } = await import("../telegram-updates-card");

const render = (canEdit: boolean, canEditOnlineResult: boolean, heldReminderTelegram = true) =>
  renderToString(
    <TelegramUpdatesCard
      canEdit={canEdit}
      canEditOnlineResult={canEditOnlineResult}
      initialData={{ settings: DEFAULT_TELEGRAM_UPDATES, heldReminderTelegram }}
    />,
  );

/** Whether the switch for `type` renders disabled. */
const disabled = (html: string, type: string) => {
  const tag = html.match(new RegExp(`<button[^>]*id="tg-update-${type}"[^>]*>`))?.[0];
  expect(tag, `switch for ${type}`).toBeDefined();
  return /\sdisabled=""/.test(tag!);
};

describe("Telegram updates card", () => {
  it("shows every type with its example line, and the held-Result reminder's own switch", () => {
    const html = render(true, true, false);
    for (const text of [
      "New online Result to review",
      "3 Google reviews are waiting to be matched to customers.",
      "5 customers signed up yesterday, 3 of them from Shopify.",
      "This week: 12 new customers, 7 sign-ups, 18 review requests (9 opened), 4 Google reviews linked, 11 follow-ups done, 2 overdue.",
      "Reminder when a held result waits too long: <!-- -->off",
      "API configs",
    ]) {
      expect(html, text).toContain(text);
    }
  });

  it("with customers-edit and results, every switch and Send test are live", () => {
    const html = render(true, true);
    for (const type of TELEGRAM_UPDATE_TYPES) expect(disabled(html, type), type).toBe(false);
    expect(html).toContain("Send test");
  });

  it("with customers-edit alone, the online Result switch is disabled and says why", () => {
    const html = render(true, false);
    expect(disabled(html, "online_result_held")).toBe(true);
    for (const type of ["google_reviews_to_match", "new_sign_ups", "weekly_summary"]) {
      expect(disabled(html, type), type).toBe(false);
    }
    expect(html).toContain("Changing this also needs the Results permission.");
  });

  it("without customers-edit, it is read-only and has no Send test", () => {
    const html = render(false, false);
    for (const type of TELEGRAM_UPDATE_TYPES) expect(disabled(html, type), type).toBe(true);
    expect(html).not.toContain("Send test");
    expect(html).not.toContain("Changing this also needs the Results permission.");
  });
});
