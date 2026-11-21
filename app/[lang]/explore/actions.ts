"use server";

import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getAuthUser } from "@/lib/auth/user";
import { pickFlower, readExploreViewer, type ExploreViewer, type FlowerPickReason } from "@/lib/explore/viewer";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { setMarketingEmail } from "@/lib/marketing-consent/consent";
import { readPointsBalance, readPointsSettings } from "@/lib/points/server";
import { grantWelcomeBonus, readWelcomeSteps, welcomeOffer, type WelcomeGrantReason, type WelcomeOffer } from "@/lib/points/welcome";
import { getCurrentCustomerId } from "@/lib/shop/customer-addresses";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ClaimOutcome =
  | { state: "signed_out" }
  | {
      state: "done";
      granted: number;
      reason: WelcomeGrantReason;
      viewer: ExploreViewer;
      offer: WelcomeOffer | null;
    }
  | { state: "error" };

export async function claimExplorePoints(input: { agree: boolean; lang: string }): Promise<ClaimOutcome> {
  const user = await getAuthUser();
  if (!user) return { state: "signed_out" };
  try {
    const admin = supabaseAdmin();
    const locale = isSupportedLocale(input.lang) ? input.lang : DEFAULT_LOCALE;
    const customerId = (await getCurrentCustomerId()) ?? (await linkCustomerToAuthUser(user, { locale })).id;

    if (input.agree === true) {
      const res = await setMarketingEmail(admin, { customerId, to: "subscribed", source: "explore_claim" });
      if (!res.ok) console.error("[explore] claim consent not recorded:", res.error);
    }

    const settings = await readPointsSettings(admin);
    const grant = settings.enabled ? await grantWelcomeBonus(admin, customerId) : { granted: false, points: 0, reason: "off" as const };
    const offer = settings.enabled ? welcomeOffer(await readWelcomeSteps(admin)) : null;
    const viewer = await readExploreViewer(admin, customerId, Boolean(offer?.current));
    return { state: "done", granted: grant.granted ? grant.points : 0, reason: grant.reason, viewer, offer };
  } catch (e) {
    console.error("[explore] claim failed:", e instanceof Error ? e.message : String(e));
    return { state: "error" };
  }
}

export type FlowerOutcome =
  | { state: "signed_out" }
  | { state: "picked"; points: number; balance: number }
  | { state: "nothing"; reason: Exclude<FlowerPickReason, "picked"> | "error" };

export async function pickExploreFlower(flower: number): Promise<FlowerOutcome> {
  if (!Number.isInteger(flower) || flower < 0 || flower > 4) return { state: "nothing", reason: "none" };
  const customerId = await getCurrentCustomerId();
  if (!customerId) return { state: "signed_out" };
  try {
    const admin = supabaseAdmin();
    const res = await pickFlower(admin, customerId, flower);
    if (!res.picked) return { state: "nothing", reason: res.reason === "picked" ? "none" : res.reason };
    const balance = await readPointsBalance(admin, customerId);
    return { state: "picked", points: res.points, balance: balance.available };
  } catch (e) {
    console.error("[explore] flower pick failed:", e instanceof Error ? e.message : String(e));
    return { state: "nothing", reason: "error" };
  }
}
