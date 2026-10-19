import { describe, it, expect } from "vitest";
import { initialState, computeQuote, getProvider, findInvoice, getPayee, compareProviders } from "../lib/sandbox";
import { evaluatePayment } from "../lib/policy";
import { proposePayment, decidePending, setTier } from "../lib/actions";

const setup = (invoiceId: string, providerId: string) => {
  const s = initialState();
  const inv = findInvoice(s, invoiceId)!;
  const prov = getProvider(providerId)!;
  return { s, inv, prov, quote: computeQuote(s, prov, inv.amount, inv.currency, getPayee(s, inv.payeeId)) };
};

describe("quotes", () => {
  it("computes total cost = mid + markup + fee", () => {
    const { quote } = setup("INV-HIT-2611", "swiftlite");
    expect(quote.midCostPEN).toBe(14250);
    expect(quote.fxMarkupPEN).toBe(156.75);
    expect(quote.totalPEN).toBe(14441.75);
    expect(quote.hiddenCostPEN).toBe(191.75);
  });
  it("never recommends the non-compliant provider even though it is cheapest", () => {
    const s = initialState();
    const inv = findInvoice(s, "INV-HIT-2611")!;
    const { quotes, recommended } = compareProviders(s, inv.amount, inv.currency, getPayee(s, inv.payeeId));
    expect(quotes[0].providerId).toBe("quickremit");
    expect(recommended?.providerId).toBe("swiftlite");
  });
});

describe("policy engine", () => {
  it("requires human confirmation at tier 2 for a clean payment", () => {
    const { s, inv, prov, quote } = setup("INV-HIT-2611", "swiftlite");
    expect(evaluatePayment(s, inv, prov, quote).decision).toBe("needs_confirmation");
  });
  it("denies a non-compliant provider", () => {
    const { s, inv, prov, quote } = setup("INV-HIT-2611", "quickremit");
    const r = evaluatePayment(s, inv, prov, quote);
    expect(r.decision).toBe("deny");
    expect(r.checks.find((c) => c.id === "provider_compliant")?.passed).toBe(false);
  });
  it("denies the injected invoice: unverified payee and flagged document", () => {
    const { s, inv, prov, quote } = setup("INV-BSH-0042", "swiftlite");
    const r = evaluatePayment(s, inv, prov, quote);
    expect(r.decision).toBe("deny");
    const failed = r.checks.filter((c) => !c.passed).map((c) => c.id);
    expect(failed).toContain("payee_verified");
    expect(failed).toContain("document_safe");
  });
  it("denies payments at tiers 0 and 1", () => {
    for (const t of [0, 1] as const) {
      const { s, inv, prov, quote } = setup("INV-HIT-2611", "swiftlite");
      s.tier = t;
      expect(evaluatePayment(s, inv, prov, quote).decision).toBe("deny");
    }
  });
  it("auto-executes small, clean payments at tier 3 only", () => {
    const { s, inv, prov, quote } = setup("INV-LHU-1207", "campuspay");
    expect(evaluatePayment(s, inv, prov, quote).decision).toBe("needs_confirmation");
    s.tier = 3;
    expect(evaluatePayment(s, inv, prov, quote).decision).toBe("auto_execute");
  });
  it("still asks a human at tier 3 above the auto-approve limit", () => {
    const { s, inv, prov, quote } = setup("INV-HIT-2611", "swiftlite");
    s.tier = 3;
    expect(evaluatePayment(s, inv, prov, quote).decision).toBe("needs_confirmation");
  });
  it("enforces per-transaction and daily limits", () => {
    const { s, inv, prov, quote } = setup("INV-HIT-2611", "swiftlite");
    s.limits.perTransactionPEN = 10000;
    expect(evaluatePayment(s, inv, prov, quote).checks.find((c) => c.id === "per_tx_limit")?.passed).toBe(false);
    s.limits.perTransactionPEN = 16000;
    s.spentTodayPEN = 8000;
    expect(evaluatePayment(s, inv, prov, quote).checks.find((c) => c.id === "daily_limit")?.passed).toBe(false);
  });
});

describe("payment lifecycle", () => {
  it("propose → approve debits once and blocks a duplicate", () => {
    const s = initialState();
    const r = proposePayment(s, "INV-HIT-2611", "swiftlite", "test");
    expect(r.status).toBe("awaiting_approval");
    const dup = proposePayment(s, "INV-HIT-2611", "swiftlite", "test again");
    expect(dup.status).toBe("denied");
    if (r.status !== "awaiting_approval") throw new Error();
    const ok = decidePending(s, r.pending.id, true);
    expect(ok.ok).toBe(true);
    expect(s.balances.PEN).toBe(18500 - 14441.75);
    expect(findInvoice(s, "INV-HIT-2611")!.status).toBe("paid");
    expect(proposePayment(s, "INV-HIT-2611", "swiftlite", "again").status).toBe("denied");
  });
  it("re-checks policy at approval time (tier lowered after proposal)", () => {
    const s = initialState();
    const r = proposePayment(s, "INV-HIT-2611", "swiftlite", "test");
    if (r.status !== "awaiting_approval") throw new Error();
    setTier(s, 1);
    expect(decidePending(s, r.pending.id, true).ok).toBe(false);
    expect(s.balances.PEN).toBe(18500);
  });
  it("rejecting moves no money", () => {
    const s = initialState();
    const r = proposePayment(s, "INV-HIT-2611", "andes_wire", "test");
    if (r.status !== "awaiting_approval") throw new Error();
    decidePending(s, r.pending.id, false);
    expect(s.balances.PEN).toBe(18500);
    expect(s.transactions).toHaveLength(0);
  });
});
