import { JWT } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3/sites";

export const GSC_ROW_LIMIT = 25_000;

export type GscDimension = "date" | "query" | "page" | "country" | "device";

export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscQuery = {
  startDate: string;
  endDate: string;
  dimensions: GscDimension[];
};

export type GscConfig = {
  siteUrl: string;
  clientEmail: string;
  privateKey: string;
};

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

export function getGscConfig(): GscConfig | null {
  const siteUrl = env("GOOGLE_SEARCH_CONSOLE_SITE_URL");
  const clientEmail = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!siteUrl || !clientEmail || !privateKey) return null;
  return { siteUrl, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
}

export type GscClient = {
  queryAll(query: GscQuery): Promise<GscRow[]>;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createGscClient(
  config: GscConfig,
  opts: { fetchImpl?: FetchLike; getToken?: () => Promise<string> } = {},
): GscClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const jwt = opts.getToken
    ? null
    : new JWT({ email: config.clientEmail, key: config.privateKey, scopes: [SCOPE] });
  const getToken =
    opts.getToken ??
    (async () => {
      const { token } = await jwt!.getAccessToken();
      if (!token) throw new Error("Search Console: service account returned no access token");
      return token;
    });

  const url = `${ENDPOINT}/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`;

  async function page(query: GscQuery, startRow: number): Promise<GscRow[]> {
    const body = JSON.stringify({
      startDate: query.startDate,
      endDate: query.endDate,
      dimensions: query.dimensions,
      type: "web",
      dataState: "all",
      rowLimit: GSC_ROW_LIMIT,
      startRow,
    });
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          "Content-Type": "application/json",
        },
        body,
      });
      if (res.ok) {
        const json = (await res.json()) as { rows?: GscRow[] };
        return json.rows ?? [];
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      const text = await res.text().catch(() => "");
      throw new Error(`Search Console ${res.status}: ${text.slice(0, 300)}`);
    }
  }

  return {
    async queryAll(query) {
      const rows: GscRow[] = [];
      for (let startRow = 0; ; startRow += GSC_ROW_LIMIT) {
        const batch = await page(query, startRow);
        rows.push(...batch);
        if (batch.length < GSC_ROW_LIMIT) return rows;
      }
    },
  };
}
