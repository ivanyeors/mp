export type EditorDraft<T> = {
  savedAt: number;
  data: T;
};

export const DRAFT_PREFIX = "mp:editor-draft:v1:";
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DRAFT_EVENT = "mp:editor-draft";

export type DraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

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
  } catch {}
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
  } catch {}
}

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

export function draftTimeLabel(savedAt: number, now = Date.now()): string {
  const at = new Date(savedAt);
  const time = at.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
  return at.toDateString() === new Date(now).toDateString()
    ? time
    : `${at.toLocaleDateString("en-SG", { day: "numeric", month: "short" })}, ${time}`;
}
