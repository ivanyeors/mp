import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { changeLink, removeLink, type LinkChange } from "@/lib/telegram/link-admin";
import { TELEGRAM_ACTIONS, type TelegramAction } from "@/lib/telegram/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * One Telegram link: set its actions, switch it on or off, issue a new link
 * code, or unlink the Telegram account. One change per request, so each is
 * its own Audit Log entry. `users` permission.
 */
const PatchSchema = z.union([
  z.object({ actions: z.array(z.enum(TELEGRAM_ACTIONS as [TelegramAction, ...TelegramAction[]])).max(10) }).strict(),
  z.object({ is_active: z.boolean() }).strict(),
  z.object({ action: z.enum(["new_link_code", "unlink"]) }).strict(),
]);

const IdSchema = z.string().uuid();

export async function PATCH(req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }

  const { id } = await params;
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send exactly one of: actions, is_active, action." }, { status: 400 });
  }
  const body = parsed.data;
  const change: LinkChange =
    "actions" in body
      ? { kind: "actions", actions: [...new Set(body.actions)] }
      : "is_active" in body
        ? { kind: "active", isActive: body.is_active }
        : { kind: body.action };

  try {
    const result = await changeLink(ctx, id, change);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, row: result.row, ...(result.linkCode ? { linkCode: result.linkCode } : {}) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 },
    );
  }
}

/** Remove a profile's Telegram access entirely. */
export async function DELETE(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }

  const { id } = await params;
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const result = await removeLink(ctx, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove" },
      { status: 500 },
    );
  }
}
