"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/i18n/routing";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDockActions, type DockAction } from "@/components/ui/app-dock-actions";

const NONE: readonly DockAction[] = [];

/**
 * The dock fits three page actions beside the Admin Panel's own Home / Menu /
 * Logout on a 390px screen (measured: 344px of a 374px pill, where a fourth
 * takes it to 396px and the dock starts scrolling). A page with more than
 * three keeps the rest in its header cluster.
 */
export const MAX_MOBILE_DOCK_ACTIONS = 3;

/** What the dock actually renders, so a re-render with the same tools is a no-op. */
export function renderKey(actions: readonly DockAction[]): string {
  // JSON, not a delimiter join: a title is free text and may hold the delimiter
  // (a Result's own name can), which would let two different sets share a key.
  return JSON.stringify(
    actions.map((a) => [a.id, a.title, Boolean(a.active), Boolean(a.badge)]),
  );
}

/**
 * Publish a page's actions into the bottom app dock — phones only.
 *
 * On a phone the dock is the one control surface already within thumb reach,
 * and it is where the Rules Engine workbench has always put its tools. Desktop
 * keeps the inline header row, where the layout has room for labelled buttons
 * and the dock is only navigation chrome.
 *
 * The array need not be memoised: handlers are read through a ref, so the dock
 * is republished when the rendered tools change rather than on every render.
 * (An action's icon is assumed fixed for its id — vary the id, not the icon.)
 *
 * The scope is this page's own path, matched exactly: page actions belong to
 * the page that published them, so a list page's tools never follow you into
 * its detail route.
 *
 * Returns whether the actions are docked. Hide the docked buttons with
 * `pageActionDockedClassName` rather than this flag: CSS is right in the server
 * render, where `useIsMobile` is still false.
 */
export function useMobileDockActions(actions: readonly DockAction[]): boolean {
  const isMobile = useIsMobile();
  const scope = stripLocale(usePathname() ?? "/");
  const latest = useRef(actions);
  // In an effect, not during render: this effect is declared above the one
  // inside `useDockActions`, so the ref is current before the dock reads it.
  useEffect(() => {
    latest.current = actions;
  }, [actions]);

  const key = renderKey(actions);
  const stable = useMemo(
    () => actions.map((a, i) => ({ ...a, onClick: () => latest.current[i]?.onClick() })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useDockActions(scope, isMobile ? stable : NONE, true);
  return isMobile;
}
