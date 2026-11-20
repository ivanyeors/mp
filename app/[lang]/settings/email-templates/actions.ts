"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { validateEmailCopy } from "@/lib/email/copy";
import { editableEmail, readSavedCopy, resetCopy, variantCase, writeCopy } from "@/lib/email/copy-admin";
import { emailAddressOf } from "@/lib/email/campaign-transport";
import { getDefaultFromAddress, getDefaultTransport } from "@/lib/email/transport";
import { getWorkingAs } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";

type Failure = { ok: false; error: string; fieldErrors?: Record<string, string> };

const NOT_FOUND: Failure = { ok: false, error: "That email does not exist." };
const MAX_TEST_RECIPIENTS = 3;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function checkWords(id: string, values: unknown) {
  const email = typeof id === "string" ? editableEmail(id) : null;
  if (!email) return NOT_FOUND;
  const checked = validateEmailCopy(email.spec, values);
  if (!checked.ok) {
    return { ok: false as const, error: "Check the highlighted fields.", fieldErrors: checked.errors as Record<string, string> };
  }
  return { ok: true as const, email, values: checked.values };
}

export async function saveEmailCopy(id: string, values: Record<string, string>): Promise<{ ok: true } | Failure> {
  const ctx = await assertAdmin("email-templates");
  const checked = checkWords(id, values);
  if (!checked.ok) return checked;
  const admin = supabaseAdmin();
  try {
    const before = await readSavedCopy(admin, checked.email.spec);
    const workingAs = await getWorkingAs(ctx.memberId);
    await writeCopy(admin, checked.email.spec, checked.values, workingAs?.id ?? null);
    await recordAdminAction({
      actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
      action: "email_template.save",
      entityType: "email_template",
      entityId: checked.email.spec.id,
      before: before.copy,
      after: checked.values,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function resetEmailCopy(id: string): Promise<{ ok: true } | Failure> {
  const ctx = await assertAdmin("email-templates");
  const email = typeof id === "string" ? editableEmail(id) : null;
  if (!email) return NOT_FOUND;
  const admin = supabaseAdmin();
  try {
    const before = await readSavedCopy(admin, email.spec);
    await resetCopy(admin, email.spec);
    await recordAdminAction({
      actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
      action: "email_template.reset",
      entityType: "email_template",
      entityId: email.spec.id,
      before: before.copy,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function previewEmailCopy(
  id: string,
  variantId: string | null,
  values: Record<string, string>,
): Promise<{ ok: true; subject: string; html: string } | Failure> {
  await assertAdmin("email-templates");
  const checked = checkWords(id, values);
  if (!checked.ok) return checked;
  const rendered = variantCase(checked.email, variantId).render("happy", checked.values);
  return { ok: true, subject: rendered.subject, html: rendered.html };
}

export async function sendEmailCopyTest(
  id: string,
  variantId: string | null,
  values: Record<string, string>,
  to: string[],
): Promise<{ ok: true; sent: number } | Failure> {
  const ctx = await assertAdmin("email-templates");
  const checked = checkWords(id, values);
  if (!checked.ok) return checked;
  const addresses = [...new Set((Array.isArray(to) ? to : []).map((t) => emailAddressOf(t)).filter((t): t is string => Boolean(t)))];
  if (addresses.length === 0) return { ok: false, error: "Enter an email address to send the test to." };
  if (addresses.length > MAX_TEST_RECIPIENTS) return { ok: false, error: `A test goes to at most ${MAX_TEST_RECIPIENTS} addresses.` };

  const rendered = variantCase(checked.email, variantId).render("happy", checked.values);
  const transport = getDefaultTransport();
  let sent = 0;
  try {
    for (const address of addresses) {
      await transport.send({ ...rendered, subject: `[Test] ${rendered.subject}`, to: address, from: getDefaultFromAddress() });
      sent++;
    }
  } catch (err) {
    return { ok: false, error: `Sent ${sent}; then: ${message(err)}` };
  }
  await recordAdminAction({
    actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
    action: "email_template.test",
    entityType: "email_template",
    entityId: checked.email.spec.id,
    after: { sent, variant: variantId },
  });
  return { ok: true, sent };
}
