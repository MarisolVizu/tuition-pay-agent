import { CURRENCY_CODES, fallbackRate, type Currency } from "./currencies";

/**
 * Live mid-market reference rates from ExchangeRate-API's open access endpoint
 * (no key; updated daily; attribution required: "Rates By Exchange Rate API").
 * The base is the user's home currency, so any supported currency works.
 * Payments stay simulated; only the reference rate is real.
 */
export const fxUrl = (home: Currency) => `https://open.er-api.com/v6/latest/${home}`;

export interface RatesSource {
  kind: "live" | "fallback";
  provider: string;
  asOf: string;
  note?: string;
}

export interface LiveRates {
  home: Currency;
  rates: Record<string, number>; // home per 1 unit of each currency
  source: RatesSource;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<Currency, { at: number; value: LiveRates }>();

const round = (n: number) => (n >= 1 ? Math.round(n * 10000) / 10000 : Number(n.toPrecision(6)));

export function fallbackRates(home: Currency): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CURRENCY_CODES) if (c !== home) out[c] = round(fallbackRate(home, c));
  return out;
}

/** The API returns "units of X per 1 home"; we need "home per 1 unit of X". */
export function parseRates(home: Currency, json: unknown): LiveRates | null {
  const j = json as { result?: string; base_code?: string; rates?: Record<string, number>; time_last_update_utc?: string };
  if (!j || j.result !== "success" || !j.rates || (j.base_code && j.base_code !== home)) return null;
  const out: Record<string, number> = {};
  for (const c of CURRENCY_CODES) {
    if (c === home) continue;
    const perHome = j.rates[c];
    if (typeof perHome !== "number" || !(perHome > 0)) return null;
    const homePerUnit = round(1 / perHome);
    // sanity band around the reference value: reject absurd data instead of trusting it
    const ref = fallbackRate(home, c);
    if (homePerUnit < ref / 3 || homePerUnit > ref * 3) return null;
    out[c] = homePerUnit;
  }
  return { home, rates: out, source: { kind: "live", provider: "exchangerate-api.com", asOf: j.time_last_update_utc ?? new Date().toUTCString() } };
}

export function fallback(home: Currency, note: string): LiveRates {
  return { home, rates: fallbackRates(home), source: { kind: "fallback", provider: "built-in reference values", asOf: "static", note } };
}

export async function getLiveRates(home: Currency, fetchImpl: typeof fetch = fetch): Promise<LiveRates> {
  const hit = cache.get(home);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetchImpl(fxUrl(home), { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return fallback(home, `Rate API returned HTTP ${res.status}`);
    const parsed = parseRates(home, await res.json());
    if (!parsed) return fallback(home, "Rate API response failed validation");
    cache.set(home, { at: Date.now(), value: parsed });
    return parsed;
  } catch (e) {
    return fallback(home, `Rate API unreachable: ${(e as Error).name}`);
  } finally {
    clearTimeout(timer);
  }
}

export function _resetFxCache() {
  cache.clear();
}
