import { NextResponse } from "next/server";
import { requireBearerOrAdmin } from "@/lib/auth/bearer-or-admin";
import { EasyshipSettingsSchema } from "@/lib/easyship/schema";
import { readEasyshipConfig, writeEasyshipConfig, type EasyshipConfig } from "@/lib/easyship/store";
import { readLiveSnapshot, syncEasyship, webhookEndpoint } from "@/lib/easyship/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The platform row is the source of truth for Easyship account config. Staff
 * (`shipping`) or automation (`Bearer $EASYSHIP_SYNC_TOKEN`) read and write it
 * here; every write pushes to Easyship and stores the resulting report.
 */
const guard = (req: Request) => requireBearerOrAdmin(req, "EASYSHIP_SYNC_TOKEN", "shipping");

function view(cfg: EasyshipConfig) {
  const { webhook_secret_token, ...sync } = cfg.sync;
  return { settings: cfg.settings, sync: { ...sync, webhook_secret_set: !!webhook_secret_token }, webhook_endpoint: webhookEndpoint() };
}

export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const cfg = await readEasyshipConfig();
    const wantLive = new URL(req.url).searchParams.get("live") === "1";
    const live = wantLive ? await readLiveSnapshot() : undefined;
    return NextResponse.json({ ok: true, ...view(cfg), ...(live ? { live } : {}) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

async function runSync(cfg: EasyshipConfig) {
  if (!cfg.settings) throw new Error("No Easyship settings saved yet");
  const { report, webhook_secret_token, easyship_company_id } = await syncEasyship(cfg.settings, webhookEndpoint());
  const next = await writeEasyshipConfig({
    sync: {
      last_at: report.finished_at,
      report,
      webhook_secret_token: webhook_secret_token ?? cfg.sync.webhook_secret_token,
      easyship_company_id: easyship_company_id ?? cfg.sync.easyship_company_id,
    },
  });
  return { report, next };
}

export async function PUT(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const parsed = EasyshipSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const saved = await writeEasyshipConfig({ settings: parsed.data });
    const { report, next } = await runSync(saved);
    return NextResponse.json({ ok: report.ok, ...view(next), report });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/** Re-push the saved settings without changing them. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const { report, next } = await runSync(await readEasyshipConfig());
    return NextResponse.json({ ok: report.ok, ...view(next), report });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
