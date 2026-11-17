"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { claimExplorePoints, pickExploreFlower } from "@/app/[lang]/explore/actions";
import { ExploreClaimDialog, type ClaimStage } from "@/components/explore/explore-claim-dialog";
import { ExploreFlowerDialog, type FlowerPopup } from "@/components/explore/explore-flower-dialog";
import type { ExploreScene } from "@/components/explore/explore-scene";
import { resubscribeMe } from "@/lib/auth/sign-in-actions";
import { LOGO_SRC } from "@/lib/brand-logo";
import { countdownParts, EXPLORE_LAUNCH_LABEL } from "@/lib/explore/launch";
import { guessPlace, skyAt, skyCss, type Place, type SkyState } from "@/lib/explore/sky";
import type { ExploreFlowers, ExploreViewer } from "@/lib/explore/viewer";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { welcomeLeftShare, type WelcomeGrantReason, type WelcomeOffer } from "@/lib/points/welcome";
import { cn } from "@/lib/utils";

/**
 * The Explore page (owner, 2026-11-17): one screen, no scrolling. A countdown
 * to the launch and one button, over a scene whose sky follows the visitor's
 * own day and night (components/explore/explore-scene.ts). The points flow is
 * a popup (explore-claim-dialog.tsx).
 *
 * The scene is the picture, never the content: everything a visitor needs is
 * in the words over it, and they read the same over a plain gradient where
 * the scene cannot load.
 *
 * The flowers are an Easter egg (owner, 2026-11-17): a picked one's petals
 * drift to the grass, then a popup shows the 1 to 3 points it held, or, signed
 * out, asks them to sign up for those points (explore-flower-dialog.tsx).
 */

type Look = { hour: number | null; rain: boolean | null };
type Float = { id: number; x: number; y: number; text: string };

const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms));

const number = (n: number) => n.toLocaleString("en-SG");
const two = (n: number) => String(n).padStart(2, "0");

/** The visitor's clock, or the hour the address asked to look at. */
function skyMoment(look: Look): Date {
  const d = new Date();
  if (look.hour != null) d.setHours(Math.floor(look.hour), Math.round((look.hour % 1) * 60), 0, 0);
  return d;
}

/** Where the visitor's own clock says they are. */
function placeFromClock(): Place {
  let zone: string | null = null;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // An old browser: the clock's offset alone.
  }
  return guessPlace(zone, -new Date().getTimezoneOffset());
}

export function ExploreExperience({
  locale,
  serverNow,
  launchAt,
  initialSky,
  offer: initialOffer,
  pointsOn,
  pointsLive,
  rules,
  signedIn,
  viewer: initialViewer,
  flowers: initialFlowers,
  finishClaim,
  finishFlower,
  look,
}: {
  locale: Locale;
  serverNow: number;
  launchAt: number;
  /** Singapore's sky when the page was made: what shows until the visitor's clock is read. */
  initialSky: SkyState;
  offer: WelcomeOffer | null;
  pointsOn: boolean;
  /** Points are on and launched: a signed-in visitor's flower would pay. */
  pointsLive: boolean;
  rules: { minRedeem: number; maxShare: number };
  signedIn: boolean;
  viewer: ExploreViewer | null;
  flowers: ExploreFlowers;
  /** Back from signing in with `?claim=1`: finish the claim. */
  finishClaim: boolean;
  /** Back from signing in with `?flower=N`: pick that flower for them. */
  finishFlower: number | null;
  look: Look;
}) {
  const links = useMemo(
    () => ({
      home: withLocale("/", locale),
      account: withLocale("/account", locale),
      points: withLocale("/points", locale),
      privacy: withLocale("/privacy-policy", locale),
    }),
    [locale],
  );
  const claimPath = `${withLocale("/explore", locale)}?claim=1`;
  const flowerPath = (flower: number) => `${withLocale("/explore", locale)}?flower=${flower}`;

  // ------------------------------------------------------------ the clock
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    // The visitor's clock, unless it is far from ours: then ours, carried forward.
    const drift = serverNow - Date.now();
    const offset = Math.abs(drift) > 30_000 ? drift : 0;
    const tick = () => setNow(Date.now() + offset);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  const left = countdownParts(now, launchAt);

  // ------------------------------------------------------------ the sky
  const [sky, setSky] = useState<SkyState>(initialSky);
  const [weather, setWeather] = useState<{ raining: boolean; place: Place | null }>({ raining: false, place: null });
  const sceneRef = useRef<ExploreScene | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [sceneOn, setSceneOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/explore/weather")
        .then((r) => (r.ok ? r.json() : null))
        .then((w: { raining?: unknown; place?: { lat?: unknown; lon?: unknown } | null } | null) => {
          if (cancelled || !w) return;
          const lat = Number(w.place?.lat);
          const lon = Number(w.place?.lon);
          setWeather({ raining: w.raining === true, place: w.place && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null });
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 10 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const clock = placeFromClock();
    // The visitor's time zone decides day and night. A position that disagrees with it (a VPN) is ignored.
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    const place = weather.place && Math.abs(weather.place.lon / 15 - offsetHours) <= 2.5 ? weather.place : clock;
    const update = () => setSky(skyAt(skyMoment(look), place, look.rain ?? weather.raining));
    update();
    const timer = window.setInterval(update, 20_000);
    return () => window.clearInterval(timer);
  }, [look, weather]);

  // ------------------------------------------------------------ points
  const [offer, setOffer] = useState(initialOffer);
  const [viewer, setViewer] = useState(initialViewer);
  const [flowers, setFlowers] = useState(initialFlowers);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<ClaimStage>("offer");
  const [doneReason, setDoneReason] = useState<WelcomeGrantReason | "balance">("balance");
  const [floats, setFloats] = useState<Float[]>([]);
  const floatId = useRef(0);

  const canClaim = Boolean(offer?.current) && (signedIn ? (viewer ? viewer.canClaim : true) : true);
  const holdsPoints = signedIn && !canClaim;

  const claim = async (agree: boolean) => {
    setOpen(true);
    setStage("working");
    const res = await claimExplorePoints({ agree, lang: locale }).catch(() => ({ state: "error" as const }));
    if (res.state === "done") {
      setViewer(res.viewer);
      setOffer(res.offer);
      setDoneReason(res.reason);
      setStage("done");
    } else if (res.state === "signed_out") {
      setStage("offer");
    } else {
      setStage("error");
    }
  };
  const claimRef = useRef(claim);
  useEffect(() => {
    claimRef.current = claim;
  });

  // Back from signing in: finish what the press began, once, and tidy the address.
  const finished = useRef(false);
  useEffect(() => {
    if (!finishClaim || finished.current) return;
    finished.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("claim");
    window.history.replaceState(window.history.state, "", url);
    void claimRef.current(false);
  }, [finishClaim]);

  const openPopup = () => {
    if (holdsPoints) {
      setDoneReason("balance");
      setStage("done");
    } else {
      setStage("offer");
    }
    setOpen(true);
  };

  // ------------------------------------------------------------ flowers
  const float = (at: { x: number; y: number }, text: string) => {
    const id = (floatId.current += 1);
    setFloats((f) => [...f, { id, x: at.x, y: at.y, text }]);
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 2200);
  };

  const [flowerPopup, setFlowerPopup] = useState<FlowerPopup | null>(null);

  /**
   * A flower was picked: it goes and its petals fall, and once they have, the
   * popup. Signed in, the database says how many points it held; signed out,
   * the popup asks them to sign up for them.
   */
  const onFlower = async (index: number, at: { x: number; y: number }) => {
    const falling = wait(sceneRef.current?.popFlower(index) ?? 0);
    setFlowers((f) => ({ ...f, picked: [...f.picked, index] }));
    if (!signedIn) {
      if (!pointsLive) {
        float(at, "A flower for you");
        return;
      }
      await falling;
      setFlowerPopup({ kind: "sign_up", flower: index });
      return;
    }
    if (!flowers.givesPoints) {
      float(at, "A flower for you");
      return;
    }
    const [res] = await Promise.all([pickExploreFlower(index).catch(() => null), falling]);
    if (res?.state === "picked") {
      setViewer((v) => (v ? { ...v, points: res.balance } : v));
      setFlowerPopup({ kind: "won", points: res.points, balance: res.balance });
    } else if (res?.state === "signed_out") {
      setFlowerPopup({ kind: "sign_up", flower: index });
    } else if (res?.state === "nothing" && res.reason === "already") {
      float(at, "Picked already today");
    } else if (res?.state === "nothing" && res.reason === "spent") {
      // Every flower point found: from now on they are just flowers.
      setFlowers((f) => ({ ...f, givesPoints: false }));
      float(at, "A flower for you");
    } else if (!res || (res.state === "nothing" && res.reason === "error")) {
      float(at, "That did not go through. Try again later");
    }
  };
  // The scene is made once; it calls whatever this is now.
  const onFlowerRef = useRef(onFlower);
  useEffect(() => {
    onFlowerRef.current = onFlower;
  });

  // ------------------------------------------------------------ the scene
  const skyRef = useRef(sky);
  const flowersRef = useRef(flowers);
  useEffect(() => {
    skyRef.current = sky;
    sceneRef.current?.setSky(sky);
  }, [sky]);
  useEffect(() => {
    flowersRef.current = flowers;
    sceneRef.current?.setFlowers(flowers.count, flowers.picked);
  }, [flowers]);

  useEffect(() => {
    let cancelled = false;
    let scene: ExploreScene | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("@/components/explore/explore-scene")
      .then(({ createExploreScene }) => {
        if (cancelled || !hostRef.current) return;
        scene = createExploreScene(hostRef.current, {
          reducedMotion,
          onFlower: (index, at) => void onFlowerRef.current(index, at),
        });
        scene.setSky(skyRef.current);
        scene.setFlowers(flowersRef.current.count, flowersRef.current.picked);
        sceneRef.current = scene;
        setSceneOn(true);
      })
      .catch(() => {
        // No WebGL here: the gradient behind stays, and the page works the same.
      });
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Back from signing up for a flower's points: pick that flower for them, once
  // the scene has grown it again (or straight away, where there is no scene).
  const flowerFinished = useRef(false);
  useEffect(() => {
    if (finishFlower == null || flowerFinished.current) return;
    const go = () => {
      if (flowerFinished.current) return;
      flowerFinished.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("flower");
      window.history.replaceState(window.history.state, "", url);
      // Not a flower today (an old link): nothing. Picked already: the database says so.
      if (finishFlower >= flowersRef.current.count) return;
      void onFlowerRef.current(finishFlower, { x: window.innerWidth * 0.72, y: window.innerHeight * 0.55 });
    };
    const timer = window.setTimeout(go, sceneOn ? 1100 : 2500);
    return () => window.clearTimeout(timer);
  }, [finishFlower, sceneOn]);

  const dark = sky.ink === "dark";
  const share = offer ? welcomeLeftShare(offer) : 0;

  return (
    <main
      className="fixed inset-0 overflow-hidden"
      style={{ background: skyCss(sky.palette) }}
      data-sky-ink={sky.ink}
      data-scene={sceneOn ? "on" : "off"}
      // App UI that sets its own sizes: the marketing type scale would force every line to 18px.
      data-typography-scope="app"
    >
      <style>{`@keyframes explore-float{0%{opacity:0;transform:translate(-50%,-30%) scale(.9)}15%{opacity:1;transform:translate(-50%,-70%) scale(1)}100%{opacity:0;transform:translate(-50%,-260%) scale(1)}}`}</style>
      <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />

      {/* Words over the sky. The layer lets taps through to the scene; its controls take their own. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] transition-colors duration-700 sm:px-8 lg:px-[7vw]",
          dark ? "text-[#0d1b33]" : "text-white",
        )}
      >
        <header className="flex items-center justify-between gap-3">
          <Link
            href={links.home}
            aria-label="Mpillow home"
            className="pointer-events-auto rounded-full border border-[#001736]/10 bg-white px-3 py-1 shadow-[0_8px_24px_-12px_rgba(0,23,54,0.45)]"
          >
            <Image src={LOGO_SRC} unoptimized alt="Mpillow" width={44} height={44} className="size-11 object-contain" priority />
          </Link>
          {signedIn ? (
            <Link
              href={links.account}
              className="pointer-events-auto inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium underline-offset-4 hover:underline"
            >
              My account
            </Link>
          ) : (
            <button
              type="button"
              onClick={openPopup}
              className="pointer-events-auto inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium underline-offset-4 hover:underline"
            >
              Sign in
            </button>
          )}
        </header>

        <div
          className={cn(
            "mt-[7vh] flex flex-col items-center text-center lg:mt-0 lg:flex-1 lg:items-start lg:justify-center lg:pb-[14vh] lg:text-left",
            dark ? "[text-shadow:0_0_28px_rgba(255,255,255,0.6)]" : "[text-shadow:0_1px_22px_rgba(6,10,36,0.55)]",
          )}
        >
          {left.done ? (
            <>
              <p className="text-base font-medium sm:text-lg">The wait is over</p>
              <h1 className="mt-3 text-[clamp(2.75rem,min(11vw,13vh),6rem)] font-semibold leading-none tracking-tight">
                Mpillow is now live.
              </h1>
              <p className="mt-4 max-w-md text-base sm:text-lg">Our new home is open. Come on in.</p>
            </>
          ) : (
            <>
              <h1 className="text-base font-medium sm:text-lg">Our new home opens in</h1>
              <div
                className="mt-3 flex items-start gap-[clamp(0.6rem,2.4vw,1.75rem)] tabular-nums"
                role="timer"
                aria-label={`${left.days} days, ${left.hours} hours, ${left.minutes} minutes and ${left.seconds} seconds until the launch`}
              >
                {(
                  [
                    [String(left.days), "days"],
                    [two(left.hours), "hours"],
                    [two(left.minutes), "min"],
                    [two(left.seconds), "sec"],
                  ] as const
                ).map(([value, label]) => (
                  <div key={label} className="flex flex-col items-center lg:items-start" aria-hidden="true">
                    <span className="text-[clamp(2.5rem,min(12vw,13vh),6.5rem)] font-semibold leading-none tracking-tight">{value}</span>
                    <span className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] opacity-80 sm:text-xs">{label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm opacity-90 sm:text-base">{EXPLORE_LAUNCH_LABEL}</p>
            </>
          )}

          <div className="pointer-events-auto mt-7 flex flex-col items-center gap-3 [text-shadow:none] lg:items-start">
            <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              {left.done ? (
                // The launch has come: the way in to the real home page, which no longer sends anyone here.
                <Link
                  href={links.home}
                  className={cn(
                    "inline-flex h-12 items-center gap-2 rounded-button px-7 text-base font-medium shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition-transform active:scale-[0.97] motion-reduce:transition-none",
                    dark ? "bg-[#0d1b33] text-white" : "bg-white text-[#0d1b33]",
                  )}
                >
                  Enter Mpillow
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
              {/* After the launch, only when there is still something of theirs here: January's welcome step, or their points. */}
              {left.done && !canClaim && !holdsPoints ? null : (
              <button
                type="button"
                onClick={openPopup}
                className={cn(
                  "inline-flex h-12 items-center rounded-button px-6 text-base font-medium transition-transform active:scale-[0.97] motion-reduce:transition-none",
                  left.done
                    ? dark
                      ? "border border-[#0d1b33]/40 bg-white/40 text-[#0d1b33] backdrop-blur-sm"
                      : "border border-white/50 bg-white/10 text-white backdrop-blur-sm"
                    : dark
                      ? "bg-[#0d1b33] text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]"
                      : "bg-white text-[#0d1b33] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]",
                )}
              >
                {holdsPoints
                  ? `My points: ${number(viewer?.points ?? 0)}`
                  : canClaim
                    ? "Claim my welcome points"
                    : pointsOn
                      ? "Sign in or create an account"
                      : "Sign in for an early look"}
              </button>
              )}
            </div>
            {canClaim && offer?.current && !left.done ? (
              <div className={cn("w-64 max-w-full", dark ? "[text-shadow:0_0_18px_rgba(255,255,255,0.7)]" : "[text-shadow:0_1px_14px_rgba(6,10,36,0.6)]")}>
                <div
                  className={cn("h-1 w-full overflow-hidden rounded-full", dark ? "bg-[#0d1b33]/20" : "bg-white/30")}
                  aria-hidden="true"
                >
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", dark ? "bg-[#0d1b33]" : "bg-white")}
                    style={{ width: `${Math.max(share * 100, 2)}%` }}
                  />
                </div>
                <p className="mt-2 whitespace-nowrap text-sm font-medium tabular-nums">
                  {number(offer.left)} of {number(offer.current.allocation)} left at {number(offer.current.points)} points
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* The flowers are in the picture, so a keyboard or a screen reader reaches them here. */}
        {flowers.count - flowers.picked.length > 0 ? (
          <button
            type="button"
            className="pointer-events-auto sr-only rounded-full bg-white px-4 py-2 text-sm font-medium text-[#0d1b33] shadow-lg focus:not-sr-only focus:absolute focus:bottom-16 focus:right-5"
            onClick={() => {
              const next = Array.from({ length: flowers.count }, (_, i) => i).find((i) => !flowers.picked.includes(i));
              if (next != null) void onFlower(next, { x: window.innerWidth * 0.72, y: window.innerHeight * 0.55 });
            }}
          >
            Pick a flower
          </button>
        ) : null}

        <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85 [text-shadow:0_1px_2px_rgba(4,8,30,0.5),0_1px_10px_rgba(4,8,30,0.6)]">
          <span>&copy; 2026 Mellow Life Pte Ltd</span>
          <Link href={links.points} className="pointer-events-auto inline-flex min-h-6 items-center underline-offset-4 hover:underline">
            How points work
          </Link>
          <Link href={links.privacy} className="pointer-events-auto inline-flex min-h-6 items-center underline-offset-4 hover:underline">
            Privacy
          </Link>
        </footer>
      </div>

      {floats.map((f) => (
        <span
          key={f.id}
          role="status"
          className="pointer-events-none fixed z-10 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-sm font-semibold text-[#0d1b33] shadow-lg"
          style={{ left: f.x, top: f.y, animation: "explore-float 2.2s ease-out forwards" }}
        >
          {f.text}
        </span>
      ))}

      <ExploreClaimDialog
        open={open}
        onOpenChange={setOpen}
        stage={stage}
        offer={offer}
        signedIn={signedIn}
        viewer={viewer}
        doneReason={doneReason}
        rules={rules}
        claimPath={claimPath}
        links={links}
        onClaim={() => void claim(true)}
        onEmailMeAgain={async () => {
          const res = await resubscribeMe().catch(() => ({ ok: false }));
          if (res.ok) setViewer((v) => (v ? { ...v, marketing: "subscribed" } : v));
        }}
      />

      <ExploreFlowerDialog
        popup={flowerPopup}
        onOpenChange={(next) => {
          if (!next) setFlowerPopup(null);
        }}
        signUpPath={flowerPath}
        canClaim={canClaim}
        onClaim={() => {
          setFlowerPopup(null);
          openPopup();
        }}
      />
    </main>
  );
}
