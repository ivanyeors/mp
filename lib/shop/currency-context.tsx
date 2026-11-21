"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  SUPPORTED_CURRENCIES,
  BASE_CURRENCY,
  CURRENCY_COOKIE_NAME,
  CURRENCY_CONFIG,
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/i18n/currencies";

interface CurrencyContextValue {
  currency: SupportedCurrency;
  setCurrency: (c: SupportedCurrency) => void;
  rates: Record<string, number>;
  isLoading: boolean;
  convertFromBase: (amount: number) => number;
  formatPrice: (amountInBase: number) => string;
  isConverted: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const RATES_CACHE_KEY = "mp_exchange_rates";
const RATES_CACHE_TTL = 60 * 60 * 1000;

function getCurrencyFromCookie(): SupportedCurrency {
  if (typeof document === "undefined") return BASE_CURRENCY;
  const match = document.cookie.match(new RegExp(`(?:^|;)\\s*${CURRENCY_COOKIE_NAME}=([^;]*)`));
  const val = match?.[1];
  return val && isSupportedCurrency(val) ? val : BASE_CURRENCY;
}

function setCurrencyCookie(currency: SupportedCurrency) {
  const maxAge = 365 * 24 * 60 * 60;
  document.cookie = `${CURRENCY_COOKIE_NAME}=${currency};path=/;max-age=${maxAge};SameSite=Lax`;
}

interface CachedRates {
  rates: Record<string, number>;
  timestamp: number;
}

function getCachedRates(): Record<string, number> | null {
  try {
    const raw = sessionStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedRates = JSON.parse(raw);
    if (Date.now() - cached.timestamp > RATES_CACHE_TTL) return null;
    return cached.rates;
  } catch {
    return null;
  }
}

function setCachedRates(rates: Record<string, number>) {
  try {
    const data: CachedRates = { rates, timestamp: Date.now() };
    sessionStorage.setItem(RATES_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<SupportedCurrency>(BASE_CURRENCY);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setCurrencyState(getCurrencyFromCookie());
  }, []);

  useEffect(() => {
    const cached = getCachedRates();
    if (cached) {
      setRates(cached);
      setIsLoading(false);
      return;
    }

    fetch("/api/shop/exchange-rates")
      .then((res) => res.json())
      .then((data) => {
        if (data.rates) {
          setRates(data.rates);
          setCachedRates(data.rates);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const setCurrency = useCallback((c: SupportedCurrency) => {
    setCurrencyState(c);
    setCurrencyCookie(c);
  }, []);

  const convertFromBase = useCallback(
    (amount: number): number => {
      if (currency === BASE_CURRENCY) return amount;
      const rate = rates[currency];
      if (!rate) return amount;
      const converted = amount * rate;
      const config = CURRENCY_CONFIG[currency];
      const factor = Math.pow(10, config.decimals);
      return Math.round(converted * factor) / factor;
    },
    [currency, rates]
  );

  const formatPrice = useCallback(
    (amountInBase: number): string => {
      const converted = convertFromBase(amountInBase);
      const config = CURRENCY_CONFIG[currency];
      const formatted = new Intl.NumberFormat(config.locale, {
        style: "currency",
        currency,
        minimumFractionDigits: config.decimals,
        maximumFractionDigits: config.decimals,
      }).format(converted);

      if (currency !== BASE_CURRENCY) {
        return `~${formatted}`;
      }
      return formatted;
    },
    [currency, convertFromBase]
  );

  const isConverted = currency !== BASE_CURRENCY;

  return (
    <CurrencyContext.Provider
      value={{ currency, setCurrency, rates, isLoading, convertFromBase, formatPrice, isConverted }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return ctx;
}

export { SUPPORTED_CURRENCIES, BASE_CURRENCY, CURRENCY_CONFIG, type SupportedCurrency };
