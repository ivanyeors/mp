import { supabaseAdmin } from "@/lib/supabase/server";

const BASE_CURRENCY = "SGD";

const FALLBACK_RATES: Record<string, number> = {
  MYR: 3.45,
  USD: 0.74,
  CNY: 5.35,
  IDR: 11600.0,
  THB: 25.8,
  PHP: 41.5,
  BND: 1.0,
};

const ZERO_DECIMAL_CURRENCIES = new Set(["IDR", "JPY", "KRW", "VND"]);

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  updated_at: string;
}

export async function getExchangeRates(base = BASE_CURRENCY): Promise<ExchangeRates> {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("exchange_rates")
      .select("target_currency, rate, fetched_at")
      .eq("base_currency", base)
      .order("target_currency");

    if (error || !data || data.length === 0) {
      return {
        base,
        rates: { ...FALLBACK_RATES },
        updated_at: new Date().toISOString(),
      };
    }

    const rates: Record<string, number> = {};
    let latestFetch = "";
    for (const row of data) {
      rates[row.target_currency] = Number(row.rate);
      if (row.fetched_at > latestFetch) latestFetch = row.fetched_at;
    }

    return { base, rates, updated_at: latestFetch };
  } catch {
    return {
      base,
      rates: { ...FALLBACK_RATES },
      updated_at: new Date().toISOString(),
    };
  }
}

export async function refreshExchangeRates(): Promise<void> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${BASE_CURRENCY}`, {
    next: { revalidate: 0 },
  });

  if (!res.ok) return;

  const json = await res.json();
  if (json.result !== "success" || !json.rates) return;

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const rows = Object.entries(json.rates as Record<string, number>)
    .filter(([code]) => code !== BASE_CURRENCY)
    .map(([code, rate]) => ({
      base_currency: BASE_CURRENCY,
      target_currency: code,
      rate,
      source: "api",
      fetched_at: now,
    }));

  if (rows.length > 0) {
    await admin.from("exchange_rates").upsert(rows, {
      onConflict: "base_currency,target_currency",
    });
  }
}

export function convertPrice(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = fromCurrency === BASE_CURRENCY ? 1 : rates[fromCurrency];
  const toRate = toCurrency === BASE_CURRENCY ? 1 : rates[toCurrency];

  if (!fromRate || !toRate) return amount;

  const inBase = amount / fromRate;
  const converted = inBase * toRate;

  return roundForCurrency(converted, toCurrency);
}

export function roundForCurrency(amount: number, currency: string): number {
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}
