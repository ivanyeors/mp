"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { readAllSavedCopy } from "@/lib/email/copy-admin";
import { getEmailCase } from "@/lib/email/registry";
import {
  campaignLanguage,
  productsFor,
  readCampaignRenderData,
  renderCampaignPreview,
} from "@/lib/email-campaigns/sender";
import { campaignSenderSetup } from "@/lib/email-campaigns/setup";
import { PLAYBOOK_DRAFTS, STARTERS, starterDraft } from "@/lib/email-campaigns/starters";
import { getCampaign } from "@/lib/email-campaigns/store";
import { SAMPLE_RECIPIENT } from "@/lib/email-campaigns/variables";
import { FUNNEL_PROGRAMME } from "@/lib/email-funnel/programme";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MAX_RENDER_KEYS } from "./funnel-format";

export type FunnelRender = {
  subject: string;
  html: string;
  templateId?: string;
};


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROGRAMME_TEMPLATES = new Set(FUNNEL_PROGRAMME.flatMap((s) => (s.kind === "automatic" ? [...s.templates] : [])));

export async function renderFunnelEmails(
  keys: string[],
  { dark = false }: { dark?: boolean } = {},
): Promise<{ ok: true; renders: Record<string, FunnelRender> } | { ok: false; error: string }> {
  await assertAdmin("campaigns");
  if (!Array.isArray(keys)) return { ok: false, error: "Nothing to render." };
  const wanted = [...new Set(keys.filter((k): k is string => typeof k === "string"))].slice(0, MAX_RENDER_KEYS);
  const { origin } = campaignSenderSetup();
  const admin = supabaseAdmin();
  const recipient = { origin, ...SAMPLE_RECIPIENT, forceDark: dark === true, locale: DEFAULT_LOCALE };

  const needsCopy = wanted.some((k) => k.startsWith("template:"));
  const saved = needsCopy ? await readAllSavedCopy(admin).catch(() => null) : null;

  const renders: Record<string, FunnelRender> = {};
  await Promise.all(
    wanted.map(async (key) => {
      const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      try {
        if (kind === "campaign" && UUID.test(id)) {
          const campaign = await getCampaign(admin, id);
          if (!campaign || campaign.archivedAt) return;
          const shown = await readCampaignRenderData(admin, campaign.content);
          const r = renderCampaignPreview(campaign, {
            ...recipient,
            images: shown.images,
            products: productsFor(shown, campaignLanguage(campaign, DEFAULT_LOCALE)),
          });
          renders[key] = { subject: r.subject, html: r.html };
        } else if (kind === "starter") {
          const starter = [...STARTERS, ...PLAYBOOK_DRAFTS].find((s) => s.id === id);
          if (!starter) return;
          const r = renderCampaignPreview(starterDraft(starter), recipient);
          renders[key] = { subject: r.subject, html: r.html };
        } else if (kind === "template" && PROGRAMME_TEMPLATES.has(id)) {
          const c = getEmailCase(id);
          if (!c) return;
          const r = c.render("happy", c.copy ? saved?.get(c.copy.id)?.copy : undefined);
          renders[key] = { subject: r.subject, html: r.html, ...(c.copy ? { templateId: c.copy.id } : {}) };
        }
      } catch (err) {
        console.error(`[email-funnel] ${key} did not render:`, err instanceof Error ? err.message : err);
      }
    }),
  );
  return { ok: true, renders };
}
