import type { Metadata } from "next";

import { ExploreExperience } from "@/components/explore/explore-experience";
import { getAuthUser } from "@/lib/auth/user";
import { EXPLORE_LAUNCH_AT } from "@/lib/explore/launch";
import { skyAt } from "@/lib/explore/sky";
import { NO_FLOWERS, readExploreFlowers, readExploreViewer } from "@/lib/explore/viewer";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { readPointsSettings } from "@/lib/points/server";
import { POINTS_DEFAULTS } from "@/lib/points/settings";
import { readWelcomeSteps, welcomeOffer } from "@/lib/points/welcome";
import { englishOnlyPageMetadata } from "@/lib/seo/page-meta";
import { getCurrentCustomerId } from "@/lib/shop/customer-addresses";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  return englishOnlyPageMetadata("explore", (await params).lang);
}

/** Where the sky is worked out from until the visitor's own clock is known. */
const SINGAPORE = { lat: 1.35, lon: 103.82 };

/**
 * Explore (owner, 2026-11-17): one screen that does not scroll. A countdown
 * to the launch and "Claim my points" over a scene whose sky follows the
 * visitor's own day and night. The points flow opens in a popup
 * (ADR 0030, amendment of 2026-11-17).
 *
 * Query: `claim=1` (back from signing in: finish the claim), and two ways to
 * look at the scene at another moment, which change nothing but the picture:
 * `hour` (0 to 24, the visitor's local time) and `rain=1`. Outside
 * production, `bloom` (1 to 5) grows flowers that give no points.
 */
export default async function ExplorePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ claim?: string; hour?: string; rain?: string; bloom?: string }>;
}) {
  const { lang } = await params;
  const { claim, hour, rain, bloom } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const admin = supabaseAdmin();

  const [settings, user] = await Promise.all([readPointsSettings(admin).catch(() => POINTS_DEFAULTS), getAuthUser()]);
  const offer = settings.enabled ? welcomeOffer(await readWelcomeSteps(admin).catch(() => [])) : null;
  const customerId = user ? await getCurrentCustomerId() : null;
  const [viewer, flowers] = await Promise.all([
    customerId ? readExploreViewer(admin, customerId, Boolean(offer?.current)).catch(() => null) : null,
    readExploreFlowers(admin, customerId).catch(() => NO_FLOWERS),
  ]);

  const hourValue = hour != null && hour !== "" ? Number(hour) : NaN;
  const bloomValue = process.env.NODE_ENV !== "production" && bloom ? Math.floor(Number(bloom)) : NaN;
  const now = new Date();

  return (
    <ExploreExperience
      locale={locale}
      serverNow={now.getTime()}
      launchAt={Date.parse(EXPLORE_LAUNCH_AT)}
      initialSky={skyAt(now, SINGAPORE)}
      offer={offer}
      pointsOn={settings.enabled}
      rules={{ minRedeem: settings.minRedeem, maxShare: settings.maxShare }}
      signedIn={Boolean(user)}
      viewer={viewer}
      flowers={bloomValue >= 1 && bloomValue <= 5 ? { count: bloomValue, picked: [], givesPoints: false } : flowers}
      finishClaim={claim === "1" && Boolean(user)}
      look={{
        hour: Number.isFinite(hourValue) && hourValue >= 0 && hourValue <= 24 ? hourValue : null,
        rain: rain === "1" ? true : rain === "0" ? false : null,
      }}
    />
  );
}
