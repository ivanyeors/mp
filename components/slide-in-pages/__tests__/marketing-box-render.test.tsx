import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MARKETING_BOX_LABEL } from "@/lib/marketing-consent/state";
import { I18nMessagesProvider } from "@/lib/i18n/messages/provider";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

/**
 * The marketing email box where people give their email, past checkout
 * (PRD-campaign-audiences slice 02; ADR 0039): on booking, in the page's
 * language, and on a customisation's contact step. Ticked by default, never
 * required.
 */

const nav = vi.hoisted(() => ({ pathname: "/en-US/appointments" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { BookingFlow } = await import("@/components/slide-in-pages/booking-flow");
const { PreviewContactFields } = await import("@/components/configurator/preview-contact-fields");

/** The checkbox with this id: its tag, so its state and its `required` can be read. */
const box = (html: string, id: string) => html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

describe("the booking form's box", () => {
  it("is ticked by default, says what the emails are, and is not required", () => {
    nav.pathname = "/en-US/appointments";
    const html = renderToString(<BookingFlow type="customisation" />);
    const tag = box(html, "booking-marketing-email");
    expect(tag).toContain('aria-checked="true"');
    expect(tag).not.toContain("required");
    expect(html).toContain("Email me important updates, event invites and offers. No spam, unsubscribe anytime.");
  });

  it("speaks Chinese on the Chinese page", () => {
    nav.pathname = "/zh-CN/appointments";
    // As the [lang] layout serves a zh-CN page: its dictionary, provided.
    const html = renderToString(
      <I18nMessagesProvider locale="zh-CN" messages={zhCN}>
        <BookingFlow type="customisation" />
      </I18nMessagesProvider>,
    );
    expect(box(html, "booking-marketing-email")).toContain('aria-checked="true"');
    expect(html).toContain("绝无垃圾邮件，可随时退订");
  });
});

describe("the customisation contact step's box", () => {
  const render = (marketingEmail: boolean) =>
    renderToString(
      <PreviewContactFields
        values={{ email: "", phone: "", discoverySource: "", discoverySourceOther: "", notes: "", code: "", marketingEmail }}
        onChange={() => undefined}
        fieldErrors={{}}
        locale="en-US"
        codeContext={null}
        onCodeStatus={() => undefined}
        formatAmount={(n) => `SGD ${n.toFixed(2)}`}
      />,
    );

  it("sits under the email, ticked as the page holds it", () => {
    const html = render(true);
    expect(box(html, "hold-marketing-email")).toContain('aria-checked="true"');
    expect(html.indexOf('id="hold-email"')).toBeLessThan(html.indexOf('id="hold-marketing-email"'));
    expect(html.indexOf('id="hold-marketing-email"')).toBeLessThan(html.indexOf('id="hold-phone"'));
    expect(html).toContain(MARKETING_BOX_LABEL);
    expect(box(render(false), "hold-marketing-email")).toContain('aria-checked="false"');
  });
});
