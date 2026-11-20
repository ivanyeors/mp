import { EasyshipError, easyshipConfig, easyshipRequest } from "@/lib/shipping/easyship";

const SYNC_TIMEOUT_MS = 30_000;

export async function easyship<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const config = easyshipConfig();
  if (!config) throw new EasyshipError("EASYSHIP_API_TOKEN is not set", null);
  return easyshipRequest<T>(config, path, { ...init, timeoutMs: SYNC_TIMEOUT_MS });
}

export async function easyshipList<T>(path: string, key: string): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; page; ) {
    const res = await easyship<Record<string, unknown> & { meta?: { pagination?: { next: number | null } } }>(
      `${path}${sep}page=${page}&per_page=100`,
    );
    out.push(...((res[key] as T[] | undefined) ?? []));
    page = res.meta?.pagination?.next ?? 0;
  }
  return out;
}
