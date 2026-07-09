"use client";

import * as React from "react";

import { decrementActiveApiRequests, incrementActiveApiRequests } from "@/lib/request-progress";

declare global {
  var __mpApiFetchPatched: boolean | undefined;
  var __mpOriginalFetch: typeof fetch | undefined;
}

function resolveFetchUrl(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    if (input instanceof Request) return input.url;
    // Unknown type; best-effort stringification.
    return String(input);
  } catch {
    return null;
  }
}

function resolveFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const fromInit = init?.method;
  if (typeof fromInit === "string" && fromInit) return fromInit.toUpperCase();
  if (input instanceof Request && input.method) return input.method.toUpperCase();
  return "GET";
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Pure predicate for tests; pageOrigin is typically window.location.origin. */
export function shouldTrackFetchRequest(
  rawUrl: string,
  method: string,
  pageOrigin: string,
): boolean {
  const upperMethod = method.toUpperCase();
  if (upperMethod === "HEAD" || upperMethod === "OPTIONS") return false;

  let url: URL;
  try {
    url = new URL(rawUrl, pageOrigin);
  } catch {
    return false;
  }

  if (url.origin !== pageOrigin) return false;
  if (MUTATING_METHODS.has(upperMethod)) return true;
  return url.pathname.startsWith("/api/");
}

function shouldTrackApiRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (typeof window === "undefined") return false;

  const rawUrl = resolveFetchUrl(input);
  if (!rawUrl) return false;

  return shouldTrackFetchRequest(rawUrl, resolveFetchMethod(input, init), window.location.origin);
}

export function ApiRequestTracker() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (globalThis.__mpApiFetchPatched) return;

    const originalFetch = window.fetch.bind(window);
    globalThis.__mpOriginalFetch = originalFetch;
    globalThis.__mpApiFetchPatched = true;

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const track = shouldTrackApiRequest(input, init);
      if (!track) return originalFetch(input, init);

      incrementActiveApiRequests();

      try {
        const p = originalFetch(input, init);
        return p.finally(() => {
          decrementActiveApiRequests();
        });
      } catch (err) {
        decrementActiveApiRequests();
        throw err;
      }
    }) as typeof fetch;

    return () => {
      // Root-mounted normally, but keep cleanup safe for HMR / test environments.
      if (globalThis.__mpOriginalFetch) {
        window.fetch = globalThis.__mpOriginalFetch;
      }
      globalThis.__mpApiFetchPatched = false;
      globalThis.__mpOriginalFetch = undefined;
    };
  }, []);

  return null;
}

