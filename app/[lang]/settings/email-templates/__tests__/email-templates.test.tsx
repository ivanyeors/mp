process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPermission, permissionEntry, permissionForHref, permissionsForRoleRow, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { defaultEmailCopy } from "@/lib/email/copy";
import { ORDER_EMAIL_COPY } from "@/lib/email/templates";

/**
 * Email templates is its own key (PRD-email-templates), held by Owner and
 * Admin. The actions validate the words against the email's spec before they
 * save, preview or send a test; a save is one upsert, a reset one delete.
 */

const h = vi.hoisted(() => ({
  permissions: new Set<string>(),
  rows: new Map<string, { template_id: string; copy: unknown; updated_at: string; editor: null }>(),
  sent: [] as { to: string; subject: string; html: string }[],
  audit: [] as { action: string; before?: unknown; after?: unknown }[],
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminPage: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error(`REDIRECT /settings?denied=${permission}`);
    return { permissions: h.permissions, email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
  }),
  assertAdmin: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error("Forbidden");
    return { permissions: h.permissions, email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn(async (a: { action: string }) => void h.audit.push(a)) }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "p1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/email/transport", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/transport")>()),
  getDefaultTransport: () => ({
    name: "fake",
    send: async (e: { to: string; subject: string; html: string }) => (h.sent.push(e), { id: "1" }),
  }),
  getDefaultFromAddress: () => "Mpillow <orders@mpillow.com>",
}));

// The one table, in memory: select by id or all, upsert, delete.
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "email_template_copy") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: h.rows.get(id) ?? null, error: null }) }),
          then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [...h.rows.values()], error: null }).then(r),
        }),
        upsert: async (row: { template_id: string; copy: unknown }) => {
          h.rows.set(row.template_id, { ...row, updated_at: "2026-10-21T05:00:00Z", editor: null });
          return { error: null };
        },
        delete: () => ({
          eq: async (_c: string, id: string) => {
            h.rows.delete(id);
            return { error: null };
          },
        }),
      };
    },
  }),
}));

const actions = await import("../actions");
const { default: ListPage } = await import("../page");

const ROLE_ROWS = {
  owner: { grants_all: true, permissions: [] },
  admin: { grants_all: true, permissions: [] },
  manager: { grants_all: false, permissions: ROLE_PERMISSIONS.manager },
  fulfilment: { grants_all: false, permissions: ROLE_PERMISSIONS.staff },
  viewer: { grants_all: false, permissions: ROLE_PERMISSIONS.viewer },
} as const;
type RoleKey = keyof typeof ROLE_ROWS;
const signInAs = (role: RoleKey) => {
  h.permissions = new Set(permissionsForRoleRow(ROLE_ROWS[role]));
};

const ID = "order.order_confirmation";
const words = (over: Record<string, string> = {}) => ({ ...defaultEmailCopy(ORDER_EMAIL_COPY.order_confirmation), ...over });

beforeEach(() => {
  h.rows.clear();
  h.sent = [];
  h.audit = [];
  signInAs("owner");
});

describe("email-templates in the catalog", () => {
  it("is its own sidebar page under Store, held by Owner and Admin only", () => {
    expect(permissionEntry("email-templates")).toMatchObject({ label: "Email templates", group: "Store", href: "/settings/email-templates" });
    expect(permissionForHref("/settings/email-templates/order.refund")).toBe("email-templates");
    for (const role of Object.keys(ROLE_ROWS) as RoleKey[]) {
      expect(hasPermission({ permissions: permissionsForRoleRow(ROLE_ROWS[role]) }, "email-templates"), role).toBe(role === "owner" || role === "admin");
    }
  });

  it.each(["manager", "fulfilment", "viewer"] as const)("sends %s to the denied page, and refuses their actions", async (role) => {
    signInAs(role);
    await expect(ListPage({ params: Promise.resolve({ lang: "en-US" }) })).rejects.toThrow("denied=email-templates");
    await expect(actions.saveEmailCopy(ID, words())).rejects.toThrow("Forbidden");
    await expect(actions.resetEmailCopy(ID)).rejects.toThrow("Forbidden");
    await expect(actions.previewEmailCopy(ID, null, words())).rejects.toThrow("Forbidden");
    await expect(actions.sendEmailCopyTest(ID, null, words(), ["a@x.test"])).rejects.toThrow("Forbidden");
  });
});

describe("saving and resetting", () => {
  it("saves validated words, audited with before and after", async () => {
    expect(await actions.saveEmailCopy(ID, words({ heading: "  Thank you, {customer_name}!  " }))).toEqual({ ok: true });
    expect((h.rows.get(ID)?.copy as Record<string, string>).heading).toBe("Thank you, {customer_name}!");
    expect(h.audit).toEqual([
      expect.objectContaining({ action: "email_template.save", before: words(), after: words({ heading: "Thank you, {customer_name}!" }) }),
    ]);
  });

  it("refuses a placeholder the email does not have, or an empty required field, and saves nothing", async () => {
    const res = await actions.saveEmailCopy(ID, words({ intro: "Hi {first_name}", subject: " " }));
    expect(res).toMatchObject({ ok: false, fieldErrors: { intro: expect.stringMatching(/\{first_name\}/), subject: expect.stringMatching(/empty/) } });
    expect(h.rows.size).toBe(0);
  });

  it("stores nothing when the words are the originals, and reset deletes the row", async () => {
    await actions.saveEmailCopy(ID, words({ closing: "" }));
    expect(h.rows.has(ID)).toBe(true);
    await actions.saveEmailCopy(ID, words());
    expect(h.rows.has(ID)).toBe(false);
    await actions.saveEmailCopy(ID, words({ closing: "" }));
    expect(await actions.resetEmailCopy(ID)).toEqual({ ok: true });
    expect(h.rows.has(ID)).toBe(false);
    expect(h.audit.at(-1)).toMatchObject({ action: "email_template.reset" });
  });

  it("answers an unknown email", async () => {
    expect(await actions.saveEmailCopy("order.nope", words())).toMatchObject({ ok: false });
    expect(await actions.resetEmailCopy("../etc")).toMatchObject({ ok: false });
  });
});

describe("preview and test", () => {
  it("previews the words as typed in the chosen version", async () => {
    const res = await actions.previewEmailCopy("order.shipping", "order.shipping_no_tracking", {
      ...defaultEmailCopy(ORDER_EMAIL_COPY.shipping),
      button_order: "See order {order_number}",
    });
    expect(res.ok && res.html).toContain("See order MP-10428");
  });

  it("sends the words on screen as a test, through the order mailbox, to at most three addresses", async () => {
    const res = await actions.sendEmailCopyTest(ID, null, words({ heading: "Hello there" }), ["me@mpillow.com", "Ops <ops@mpillow.com>", "nope"]);
    expect(res).toEqual({ ok: true, sent: 2 });
    expect(h.sent.map((e) => e.to)).toEqual(["me@mpillow.com", "ops@mpillow.com"]);
    expect(h.sent[0].subject).toBe("[Test] Order MP-10428 confirmed");
    expect(h.sent[0].html).toContain("Hello there");
    expect(h.rows.size).toBe(0);
    expect(await actions.sendEmailCopyTest(ID, null, words(), ["a@x.test", "b@x.test", "c@x.test", "d@x.test"])).toMatchObject({ ok: false });
  });
});

describe("the list", () => {
  it("lists every editable email by kind, and says which were edited", async () => {
    await actions.saveEmailCopy("order.refund", { ...defaultEmailCopy(ORDER_EMAIL_COPY.refund), heading: "Money back" });
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ lang: "en-US" }) }));
    expect(html).toContain("Order confirmed");
    expect(html).toContain('href="/en-US/settings/email-templates/order.refund"');
    expect((html.match(/>Edited</g) ?? []).length).toBe(1);
    expect(html).toContain("Sign-in code emails");
  });
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/email-templates/order.shipping",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

describe("the editor", () => {
  it("shows every field with its words, shared fields first, and the placeholders", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { EmailCopyEditor } = await import("../email-copy-editor");
    const spec = ORDER_EMAIL_COPY.shipping;
    const html = renderToStaticMarkup(
      <EmailCopyEditor
        spec={spec}
        groupLabel="Orders"
        variants={[
          { id: "order.shipping", label: "Order shipped" },
          { id: "order.shipping_no_tracking", label: "Order shipped — no tracking link" },
        ]}
        saved={{ copy: { ...defaultEmailCopy(spec), heading: "On its way!" }, edited: ["heading"], updatedAt: "2026-10-21T05:00:00Z", updatedBy: "Ivan Yeo" }}
        readError={null}
        staffEmail="owner@mpillow.com"
      />,
    );
    expect(html).toContain("Order shipped");
    expect(html).toContain('value="On its way!"');
    expect(html).toContain("Original: Your order is on its way");
    expect(html).toContain("{order_number}");
    expect(html).toContain("Edited");
    expect(html).toContain("by Ivan Yeo");
  });

  it("opens an email by its id, and answers 404 for one that is not editable", async () => {
    const { default: EditorPage } = await import("../[id]/page");
    const page = (await EditorPage({ params: Promise.resolve({ lang: "en-US", id: "order.refund" }) })) as { props: { spec: { id: string } } };
    expect(page.props.spec.id).toBe("order.refund");
    await expect(EditorPage({ params: Promise.resolve({ lang: "en-US", id: "auth.admin_invite" }) })).rejects.toThrow("NOT_FOUND");
  });
});
