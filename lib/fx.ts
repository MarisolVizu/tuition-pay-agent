import type { ForeignCurrency } from "./types";

/**
 * Live mid-market reference rates from ExchangeRate-API's open access endpoint
 * (no key; updates once a day; attribution required: "Rates By Exchange Rate API").
 * Payments stay simulated; only the reference rate is real.
 */
export const FX_URL = "https://open.er-api.com/v6/latest/PEN";
export const FALLBACK_RATES: Record<ForeignCurrency, number> = { USD: 3.75, CNY: 0.52, EUR: 4.05 };

export interface RatesSource {
  kind: "live" | "fallback";
  provider: string;
  asOf: string;
  note?: string;
}

export interface LiveRates {
  rates: Record<ForeignCurrency, number>;
  source: RatesSource;
}

const CURRENCIES: ForeignCurrency[] = ["USD", "CNY", "EUR"];
const CACHE_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; value: LiveRates } | null = null;

/** The API returns "units of X per 1 PEN"; we need "PEN per 1 unit of X". */
export function parseRates(json: unknown): LiveRates | null {
  const j = json as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
  if (!j || j.result !== "success" || !j.rates) return null;
  const out = {} as Record<ForeignCurrency, number>;
  for (const c of CURRENCIES) {
    const perPen = j.rates[c];
    if (typeof perPen !== "number" || !(perPen > 0)) return null;
    const penPerUnit = Math.round((1 / perPen) * 10000) / 10000;
    // sanity band: reject absurd values instead of trusting them
    if (penPerUnit < FALLBACK_RATES[c] * 0.5 || penPerUnit > FALLBACK_RATES[c] * 2) return null;
    out[c] = penPerUnit;
  }
  return {
    rates: out,
    source: { kind: "live", provider: "exchangerate-api.com", asOf: j.time_last_update_utc ?? new Date().toUTCString() }
  };
}

export function fallback(note: string): LiveRates {
  return { rates: { ...FALLBACK_RATES }, source: { kind: "fallback", provider: "built-in reference values", asOf: "static", note } };
}

export async function getLiveRates(fetchImpl: typeof fetch = fetch): Promise<LiveRates> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetchImpl(FX_URL, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return fallback(`Rate API returned HTTP ${res.status}`);
    const parsed = parseRates(await res.json());
    if (!parsed) return fallback("Rate API response failed validation");
    cache = { at: Date.now(), value: parsed };
    return parsed;
  } catch (e) {
    return fallback(`Rate API unreachable: ${(e as Error).name}`);
  } finally {
    clearTimeout(timer);
  }
}

export function _resetFxCache() {
  cache = null;
}
