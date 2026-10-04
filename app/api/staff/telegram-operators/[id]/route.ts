import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import {
  deleteTelegramOperator,
  getTelegramOperator,
  issueTelegramLinkCode,
  unlinkTelegramOperator,
  updateTelegramOperator,
} from "@/lib/telegram/operators";
import { TELEGRAM_ROLES } from "@/lib/telegram/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edit one person's Telegram access: rename, change role, switch on/off,
 * issue a new link code, or unlink their Telegram account. `users` permission.
 */
const PatchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80).optional(),
    role: z.enum(TELEGRAM_ROLES).optional(),
    is_active: z.boolean().optional(),
    action: z.enum(["new_link_code", "unlink"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });

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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const before = await getTelegramOperator(id);
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { action, ...fields } = parsed.data;
    let row = before;
    let linkCode: string | undefined;

    if (Object.keys(fields).length) {
      row = (await updateTelegramOperator(id, fields)) ?? row;
    }
    if (action === "new_link_code") {
      const issued = await issueTelegramLinkCode(id);
      if (issued) {
        row = issued.row;
        linkCode = issued.linkCode;
      }
    } else if (action === "unlink") {
      row = (await unlinkTelegramOperator(id)) ?? row;
    }

    await recordAdminAction({
      actor: ctx,
      action: action ? `telegram_operator.${action}` : "telegram_operator.update",
      entityType: "telegram_operator",
      entityId: id,
      before,
      after: row,
    });
    return NextResponse.json({ ok: true, row, ...(linkCode ? { linkCode } : {}) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 },
    );
  }
}

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
    const before = await getTelegramOperator(id);
    if (!before || !(await deleteTelegramOperator(id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await recordAdminAction({
      actor: ctx,
      action: "telegram_operator.delete",
      entityType: "telegram_operator",
      entityId: id,
      before,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove" },
      { status: 500 },
    );
  }
}
