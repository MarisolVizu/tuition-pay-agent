import { describe, it, expect, beforeEach } from "vitest";
import { parseRates, getLiveRates, _resetFxCache, fallbackRates } from "../lib/fx";
import { initialState, computeQuote, getProvider } from "../lib/sandbox";
import { CURRENCIES, CURRENCY_CODES, detectCurrency, type Currency } from "../lib/currencies";

/** Build an API-shaped payload for any base using the reference table (optionally scaled). */
function payload(base: Currency, scale = 1) {
  const rates: Record<string, number> = {};
  for (const c of CURRENCY_CODES) rates[c] = (CURRENCIES[c].perUSD / CURRENCIES[base].perUSD) * (c === base ? 1 : scale);
  return { result: "success", base_code: base, time_last_update_utc: "Sun, 18 Oct 2026 00:02:31 +0000", rates };
}
const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

beforeEach(() => _resetFxCache());

describe("live FX rates for any home currency", () => {
  it("inverts 'X per home' into 'home per X'", () => {
    const r = parseRates("PEN", { ...payload("PEN"), rates: { ...payload("PEN").rates, USD: 0.2857 } })!;
    expect(r.rates.USD).toBe(3.5002);
    expect(r.source.kind).toBe("live");
  });
  it("works with other bases (JPY, USD)", () => {
    const jpy = parseRates("JPY", payload("JPY"))!;
    expect(jpy.rates.USD).toBeCloseTo(150, 2);
    const usd = parseRates("USD", payload("USD"))!;
    expect(usd.rates.EUR).toBeCloseTo(1 / 0.9259, 3);
    expect(usd.rates.USD).toBeUndefined();
  });
  it("rejects failed, mismatched or absurd responses", () => {
    expect(parseRates("PEN", { result: "error" })).toBeNull();
    expect(parseRates("PEN", payload("USD"))).toBeNull(); // wrong base
    expect(parseRates("PEN", payload("PEN", 100))).toBeNull(); // absurd values
  });
  it("uses live data when the API answers, and falls back otherwise", async () => {
    const live = await getLiveRates("CNY", fakeFetch(payload("CNY")));
    expect(live.source.kind).toBe("live");
    expect((await getLiveRates("EUR", fakeFetch({}, 429))).source.kind).toBe("fallback");
    const boom = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const r = await getLiveRates("MXN", boom);
    expect(r.source.kind).toBe("fallback");
    expect(r.rates).toEqual(fallbackRates("MXN"));
  });
});

describe("home currency sessions", () => {
  it("PEN profile keeps the reference numbers", () => {
    const s = initialState();
    expect(s.home).toBe("PEN");
    expect(s.balance).toBe(18500);
    expect(s.limits).toEqual({ perTransaction: 16000, daily: 20000, autoApprove: 2000 });
  });
  it("converts the profile and fees into the chosen currency", () => {
    const s = initialState(undefined, "USD");
    expect(s.balance).toBe(4900); // 18,500 PEN ≈ 4,933 USD, rounded to a friendly figure
    expect(s.limits.perTransaction).toBe(4300);
    const q = computeQuote(s, getProvider("andes_wire")!, 100, "EUR");
    expect(q.home).toBe("USD");
    expect(q.fee).toBeCloseTo(22.67, 2);
  });
  it("same-currency payments carry no FX markup", () => {
    const s = initialState(undefined, "USD");
    const q = computeQuote(s, getProvider("andes_wire")!, 3800, "USD");
    expect(q.fxMarkup).toBe(0);
    expect(q.total).toBeCloseTo(3800 + 22.67, 2);
  });
  it("detects currencies by code or name in English and Spanish", () => {
    expect(detectCurrency("send 5000 yen")).toBe("JPY");
    expect(detectCurrency("paga en yuanes")).toBeUndefined();
    expect(detectCurrency("paga en yuan")).toBe("CNY");
    expect(detectCurrency("compare 300 euros")).toBe("EUR");
    expect(detectCurrency("1200 dólares")).toBe("USD");
  });
});
