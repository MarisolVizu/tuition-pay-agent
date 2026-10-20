import { describe, it, expect, beforeEach } from "vitest";
import { parseRates, getLiveRates, _resetFxCache, FALLBACK_RATES } from "../lib/fx";
import { initialState } from "../lib/sandbox";

const sample = {
  result: "success",
  provider: "https://www.exchangerate-api.com",
  base_code: "PEN",
  time_last_update_utc: "Sun, 18 Oct 2026 00:02:31 +0000",
  rates: { PEN: 1, USD: 0.2857, CNY: 2.0408, EUR: 0.2481 }
};
const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

beforeEach(() => _resetFxCache());

describe("live FX rates", () => {
  it("inverts 'X per PEN' into 'PEN per X'", () => {
    const r = parseRates(sample)!;
    expect(r.rates.USD).toBe(3.5002);
    expect(r.rates.CNY).toBe(0.49);
    expect(r.source.kind).toBe("live");
  });
  it("rejects failed or absurd responses", () => {
    expect(parseRates({ result: "error" })).toBeNull();
    expect(parseRates({ ...sample, rates: { ...sample.rates, USD: 0.0001 } })).toBeNull();
    expect(parseRates({ ...sample, rates: { PEN: 1 } })).toBeNull();
  });
  it("uses live data when the API answers", async () => {
    const r = await getLiveRates(fakeFetch(sample));
    expect(r.source.kind).toBe("live");
    const s = initialState(r);
    expect(s.rates.USD).toBe(3.5002);
    expect(s.ratesSource.provider).toBe("exchangerate-api.com");
  });
  it("falls back safely on HTTP errors and network failures", async () => {
    expect((await getLiveRates(fakeFetch({}, 429))).source.kind).toBe("fallback");
    const boom = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const r = await getLiveRates(boom);
    expect(r.source.kind).toBe("fallback");
    expect(r.rates).toEqual(FALLBACK_RATES);
  });
});
