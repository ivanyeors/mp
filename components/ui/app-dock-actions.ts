"use client";

import { useEffect, useSyncExternalStore, type ComponentType } from "react";

/** A page-owned button shown in the Admin Panel dock while that page is mounted. */
export type DockAction = {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  /** Small attention dot, e.g. an out-of-date result. */
  badge?: boolean;
};

export type DockTools = {
  /** Locale-stripped path prefix the tools belong to. */
  scope: string;
  actions: readonly DockAction[];
};

const NONE: DockTools = { scope: "", actions: [] };
let current: DockTools = NONE;
const listeners = new Set<() => void>();

function publish(next: DockTools) {
  current = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Tools to render on `basePathname`: only inside their scope. */
export function toolsFor(tools: DockTools, basePathname: string): readonly DockAction[] {
  const { scope, actions } = tools;
  return scope && (basePathname === scope || basePathname.startsWith(`${scope}/`))
    ? actions
    : NONE.actions;
}

/** Read side, for AppDock. */
export function useDockTools(): DockTools {
  return useSyncExternalStore(subscribe, () => current, () => NONE);
}

/**
 * Write side, for a page. Pass a memoised array.
 *
 * Tools outlive the page on purpose: the dock shows them for as long as the URL
 * is inside `scope`, so moving between pages of one tool set (loading skeleton
 * and all) keeps the dock steady, and leaving the scope animates them out. On
 * unmount they drop any active/badge state so a stale "on" never lingers; the
 * next page in scope republishes live handlers.
 * ponytail: one tool set at a time (last publisher wins) — key by scope if two
 * mounted pages ever need to share the dock.
 */
export function useDockActions(scope: string, actions: readonly DockAction[]) {
  useEffect(() => {
    publish({ scope, actions });
    return () => {
      if (current.actions !== actions) return; // someone newer already published
      publish({
        scope,
        actions: actions.map((a) => ({ ...a, active: false, badge: false })),
      });
    };
  }, [scope, actions]);
}
