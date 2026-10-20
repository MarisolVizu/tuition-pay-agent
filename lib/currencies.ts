/**
 * Currencies Kuntur supports, with fallback reference values (units per 1 USD).
 * Fallback values are only used when the live rate API is unavailable, and the UI says so.
 */
export const CURRENCIES = {
  PEN: { name: "Peruvian sol", perUSD: 3.75 },
  USD: { name: "US dollar", perUSD: 1 },
  EUR: { name: "Euro", perUSD: 0.9259 },
  CNY: { name: "Chinese yuan (renminbi)", perUSD: 7.2115 },
  JPY: { name: "Japanese yen", perUSD: 150 },
  GBP: { name: "British pound", perUSD: 0.79 },
  KRW: { name: "South Korean won", perUSD: 1380 },
  INR: { name: "Indian rupee", perUSD: 85 },
  MXN: { name: "Mexican peso", perUSD: 18.5 },
  BRL: { name: "Brazilian real", perUSD: 5.5 },
  COP: { name: "Colombian peso", perUSD: 4100 },
  CLP: { name: "Chilean peso", perUSD: 940 },
  CAD: { name: "Canadian dollar", perUSD: 1.37 },
  AUD: { name: "Australian dollar", perUSD: 1.52 }
} as const;

export type Currency = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as Currency[];

export function isCurrency(x: unknown): x is Currency {
  return typeof x === "string" && x in CURRENCIES;
}

/** Fallback: how many units of `home` one unit of `c` costs. */
export function fallbackRate(home: Currency, c: Currency): number {
  return CURRENCIES[home].perUSD / CURRENCIES[c].perUSD;
}

const NAMES: [RegExp, Currency][] = [
  [/\b(yuan|rmb|renminbi|cny)\b/i, "CNY"],
  [/\b(yen|jpy)\b/i, "JPY"],
  [/\b(euros?|eur)\b/i, "EUR"],
  [/\b(libras?|pounds?|gbp)\b/i, "GBP"],
  [/\b(won|krw)\b/i, "KRW"],
  [/\b(rupias?|rupees?|inr)\b/i, "INR"],
  [/\b(reais|reales|brl)\b/i, "BRL"],
  [/\b(mxn|pesos? mexicanos?)\b/i, "MXN"],
  [/\b(cop|pesos? colombianos?)\b/i, "COP"],
  [/\b(clp|pesos? chilenos?)\b/i, "CLP"],
  [/\b(cad|canadian dollars?|d[oó]lares? canadienses?)\b/i, "CAD"],
  [/\b(aud|australian dollars?|d[oó]lares? australianos?)\b/i, "AUD"],
  [/\b(soles|sol|pen)\b/i, "PEN"],
  [/\b(usd|d[oó]lar(es)?|dollars?)\b/i, "USD"]
];

/** Find a currency mentioned in free text (code or common name, English or Spanish). */
export function detectCurrency(text: string): Currency | undefined {
  for (const [re, c] of NAMES) if (re.test(text)) return c;
  return undefined;
}

export function money(code: string, n: number): string {
  return `${code} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
