"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { shouldStartNewVisit } from "@/lib/analytics/journey/lifecycle";
import { isAdminJourneyPath, normalizeJourneyPath } from "@/lib/analytics/journey/paths";

const VISITOR_COOKIE = "mp_vid";
const VISIT_KEY = "mp_visit_id";
const LAST_ACTIVITY_KEY = "mp_visit_last_activity";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1y

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

function readVisitorId(): string {
  const existing = readCookie(VISITOR_COOKIE);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const id = crypto.randomUUID();
  writeCookie(VISITOR_COOKIE, id);
  return id;
}

/** Same-origin referrer is not an Entry source — treat as Direct when no UTM. */
function externalReferrer(): string {
  const ref = document.referrer;
  if (!ref) return "";
  try {
    if (new URL(ref).origin === window.location.origin) return "";
  } catch {
    return "";
  }
  return ref;
}

function readGaClientId(): string | null {
  // ponytail: cookie only — gtag('get') is async and races the beacon
  const ga = readCookie("_ga");
  if (!ga) return null;
  const parts = ga.split(".");
  if (parts.length < 4) return null;
  const id = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  return /^\d+\.\d+$/.test(id) ? id : null;
}

function pushDataLayer(path: string) {
  try {
    const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: "mp_page_view", page_path: path });
  } catch {
    // best-effort dual-write
  }
}

function postIngest(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const url = "/api/analytics/ingest";
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) return;
  }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function resolveVisitId(nowIso: string): {
  visitId: string;
  isNewVisit: boolean;
  closeVisitId: string | null;
} {
  const prev = sessionStorage.getItem(VISIT_KEY);
  const last = sessionStorage.getItem(LAST_ACTIVITY_KEY);
  if (prev && /^[0-9a-f-]{36}$/i.test(prev) && !shouldStartNewVisit(last, nowIso)) {
    return { visitId: prev, isNewVisit: false, closeVisitId: null };
  }
  const closeVisitId = prev && /^[0-9a-f-]{36}$/i.test(prev) ? prev : null;
  const visitId = crypto.randomUUID();
  sessionStorage.setItem(VISIT_KEY, visitId);
  return { visitId, isNewVisit: true, closeVisitId };
}

function currentVisitContext(): { visitorId: string; visitId: string } | null {
  const visitId = sessionStorage.getItem(VISIT_KEY);
  if (!visitId || !/^[0-9a-f-]{36}$/i.test(visitId)) return null;
  return { visitorId: readVisitorId(), visitId };
}

function touchActivity() {
  sessionStorage.setItem(LAST_ACTIVITY_KEY, new Date().toISOString());
}

function sendPageView(path: string) {
  const nowIso = new Date().toISOString();
  const visitorId = readVisitorId();
  const { visitId, isNewVisit, closeVisitId } = resolveVisitId(nowIso);
  sessionStorage.setItem(LAST_ACTIVITY_KEY, nowIso);

  const payload: Record<string, unknown> = {
    visitorId,
    visitId,
    events: [{ type: "page_view", path, occurredAt: nowIso }],
  };
  const gaClientId = readGaClientId();
  if (gaClientId) payload.gaClientId = gaClientId;
  if (isNewVisit) {
    payload.entry = { search: window.location.search, referrer: externalReferrer() };
  }
  if (closeVisitId) {
    payload.closeVisitId = closeVisitId;
    payload.closeReason = "inactivity";
  }
  postIngest(payload);
  pushDataLayer(path);
}

function sendSectionView(path: string, sectionId: string) {
  const ctx = currentVisitContext();
  if (!ctx) return;
  touchActivity();
  const nowIso = new Date().toISOString();
  postIngest({
    visitorId: ctx.visitorId,
    visitId: ctx.visitId,
    events: [{ type: "section_view", path, sectionId, occurredAt: nowIso }],
  });
  try {
    const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: "mp_section_view", page_path: path, section_id: sectionId });
  } catch {
    // best-effort dual-write
  }
}

function sendPagehideClose() {
  const visitId = sessionStorage.getItem(VISIT_KEY);
  if (!visitId || !/^[0-9a-f-]{36}$/i.test(visitId)) return;
  const visitorId = readVisitorId();
  postIngest({
    visitorId,
    visitId,
    closeVisitId: visitId,
    closeReason: "pagehide",
    events: [],
  });
}

/** Storefront page_view + section_view tracer. No-ops on Admin Panel (`/settings/*`). */
export function JourneyTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);
  const seenSections = useRef(new Set<string>());

  useEffect(() => {
    if (!pathname) return;
    if (isAdminJourneyPath(pathname)) return;
    const path = normalizeJourneyPath(pathname);
    if (!path) return;
    if (lastSent.current === path) return;
    lastSent.current = path;
    seenSections.current = new Set();
    sendPageView(path);
  }, [pathname]);

  useEffect(() => {
    if (!pathname || isAdminJourneyPath(pathname)) return;
    const path = normalizeJourneyPath(pathname);
    if (!path) return;

    // Once per section per path navigation; 25% visible threshold.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          // ponytail: data-step aliases data-section for configurator steps (same section_view event)
          const sectionId =
            el.getAttribute("data-section")?.trim() ||
            el.getAttribute("data-step")?.trim();
          if (!sectionId) continue;
          const key = `${path}\0${sectionId}`;
          if (seenSections.current.has(key)) continue;
          seenSections.current.add(key);
          sendSectionView(path, sectionId);
        }
      },
      { threshold: 0.25 },
    );

    const observeAll = () => {
      document
        .querySelectorAll<HTMLElement>("[data-section], [data-step]")
        .forEach((el) => io.observe(el));
    };
    observeAll();
    // Late-mounted landing blocks (client sections).
    const mo = new MutationObserver(observeAll);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    const onHide = () => {
      if (isAdminJourneyPath(window.location.pathname)) return;
      sendPagehideClose();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  return null;
}
