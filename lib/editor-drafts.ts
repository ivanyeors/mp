/**
 * Autosaved drafts for the filling editors (Ivan, 9-11-2026): "if I
 * accidentally press back or exit or close the app or web, it should auto
 * load the last version I worked on". An edit in progress in a Filling
 * Template (Configure › Filling config) or a customer's Re-adjust is kept in
 * this browser while it differs from what is saved, and the editor opens on it
 * again. Saving removes it; so does Discard.
 *
 * Kept in `localStorage`, so it survives a reload, Back, a closed tab and a
 * closed home-screen app on the same device. It is never sent anywhere: a
 * draft is not a save, and another device or Staff member does not see it.
 * Storage that throws (a private window, blocked site data) keeps nothing and
 * the editors work as before.
 *
 * Pure over an injectable store, so the rules are testable without a browser.
 */

export type EditorDraft<T> = {
  /** When it was last written, ms since the epoch. */
  savedAt: number;
  data: T;
};

/** Every draft's storage key starts with this; the version lets a later shape ignore these. */
export const DRAFT_PREFIX = "mp:editor-draft:v1:";
/** A draft untouched this long is dropped: a month-old edit is not "the last version I worked on". */
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Fired on `window` when a draft is written or removed, so a list can mark the templates that have one. */
export const DRAFT_EVENT = "mp:editor-draft";

export type DraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** The browser's localStorage, or null where there is none or it refuses to be read. */
export function browserDraftStore(): DraftStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function announce(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { key } }));
  } catch {
    // An event that cannot be made changes nothing stored.
  }
}

function parse<T>(raw: string | null): EditorDraft<T> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<EditorDraft<T>>;
    return typeof v?.savedAt === "number" && "data" in v ? { savedAt: v.savedAt, data: v.data as T } : null;
  } catch {
    return null;
  }
}

/** The draft kept under `key`, or null (none, unreadable, or older than DRAFT_MAX_AGE_MS, which is then dropped). */
export function readDraft<T>(key: string, now = Date.now(), store: DraftStore | null = browserDraftStore()): EditorDraft<T> | null {
  if (!store) return null;
  try {
    const draft = parse<T>(store.getItem(DRAFT_PREFIX + key));
    if (draft && now - draft.savedAt > DRAFT_MAX_AGE_MS) {
      store.removeItem(DRAFT_PREFIX + key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/** Keep `data` under `key`; the time it was kept, or null when the store refused it (full, blocked). */
export function writeDraft<T>(key: string, data: T, now = Date.now(), store: DraftStore | null = browserDraftStore()): number | null {
  if (!store) return null;
  try {
    store.setItem(DRAFT_PREFIX + key, JSON.stringify({ savedAt: now, data } satisfies EditorDraft<T>));
    announce(key);
    return now;
  } catch {
    return null;
  }
}

export function clearDraft(key: string, store: DraftStore | null = browserDraftStore()): void {
  if (!store) return;
  try {
    if (store.getItem(DRAFT_PREFIX + key) === null) return;
    store.removeItem(DRAFT_PREFIX + key);
    announce(key);
  } catch {
    // Nothing to do: a store that cannot be written holds no draft we wrote.
  }
}

/**
 * The drafts whose key starts with `prefix` (after DRAFT_PREFIX), newest
 * first, as `{ key, savedAt }` with `key` the part after `prefix`. Expired
 * ones are dropped on the way.
 */
export function listDrafts(prefix: string, now = Date.now(), store: DraftStore | null = browserDraftStore()): Array<{ key: string; savedAt: number }> {
  if (!store) return [];
  const full = DRAFT_PREFIX + prefix;
  const found: Array<{ key: string; savedAt: number }> = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(full)) keys.push(k);
    }
    for (const k of keys) {
      const draft = readDraft<unknown>(k.slice(DRAFT_PREFIX.length), now, store);
      if (draft) found.push({ key: k.slice(full.length), savedAt: draft.savedAt });
    }
  } catch {
    return [];
  }
  return found.sort((a, b) => b.savedAt - a.savedAt);
}

/** "7:04 pm" today, "9 Nov, 7:04 pm" another day: when a draft was last kept. */
export function draftTimeLabel(savedAt: number, now = Date.now()): string {
  const at = new Date(savedAt);
  const time = at.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
  return at.toDateString() === new Date(now).toDateString()
    ? time
    : `${at.toLocaleDateString("en-SG", { day: "numeric", month: "short" })}, ${time}`;
}
