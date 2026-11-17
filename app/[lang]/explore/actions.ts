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

/**
 * The Explore page's two writes (ADR 0030, amendment of 2026-11-17). Both act
 * on the session's own Customer and nobody else; the database decides what is
 * granted, so calling either more often than the page does gains nothing.
 */

export type ClaimOutcome =
  | { state: "signed_out" }
  | {
      state: "done";
      /** Welcome points granted by this call; 0 when none were. */
      granted: number;
      reason: WelcomeGrantReason;
      viewer: ExploreViewer;
      offer: WelcomeOffer | null;
    }
  | { state: "error" };

/**
 * "Claim my points". Signed out, it says so and the page asks them to sign
 * in. Signed in, it grants the Welcome bonus if one is theirs (a Migrated
 * customer's Claim bonus was granted when they signed in), and returns what
 * they hold now.
 *
 * `agree` is true when the visitor pressed Claim under the consent line while
 * already signed in: that press subscribes them, if nobody has asked them
 * before (source `explore_claim`). A claim that follows a sign-in passes
 * false: the sign-in already recorded it (lib/auth/complete-sign-in.ts).
 */
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

/**
 * A flower on the cliff was picked. Signed in and points live: 1 to 3 points.
 * The flower then grows back for them at a random time 24 to 36 hours later
 * ("already" until then), until their flowers have given 500 points (S$5);
 * then never again ("spent").
 */
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
