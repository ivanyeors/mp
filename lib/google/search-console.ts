import { JWT } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3/sites";
const INSPECT_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

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

export type GscInspection = {
  inspectionResultLink?: string;
  indexStatusResult?: {
    verdict?: string;
    coverageState?: string;
    robotsTxtState?: string;
    indexingState?: string;
    pageFetchState?: string;
    lastCrawlTime?: string;
    googleCanonical?: string;
    userCanonical?: string;
  };
  richResultsResult?: {
    detectedItems?: {
      richResultType?: string;
      items?: { issues?: { issueMessage?: string; severity?: string }[] }[];
    }[];
  };
};

export type GscInspector = {
  inspectUrl(url: string): Promise<GscInspection>;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createGscClient(
  config: GscConfig,
  opts: { fetchImpl?: FetchLike; getToken?: () => Promise<string> } = {},
): GscClient & GscInspector {
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

  async function send<T>(endpoint: string, body: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          "Content-Type": "application/json",
        },
        body,
      });
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      const text = await res.text().catch(() => "");
      throw new Error(`Search Console ${res.status}: ${text.slice(0, 300)}`);
    }
  }

  async function page(query: GscQuery, startRow: number): Promise<GscRow[]> {
    const json = await send<{ rows?: GscRow[] }>(
      url,
      JSON.stringify({
        startDate: query.startDate,
        endDate: query.endDate,
        dimensions: query.dimensions,
        type: "web",
        dataState: "all",
        rowLimit: GSC_ROW_LIMIT,
        startRow,
      }),
    );
    return json.rows ?? [];
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
    async inspectUrl(inspectionUrl) {
      const json = await send<{ inspectionResult?: GscInspection }>(
        INSPECT_ENDPOINT,
        JSON.stringify({ inspectionUrl, siteUrl: config.siteUrl }),
      );
      return json.inspectionResult ?? {};
    },
  };
}
