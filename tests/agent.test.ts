import { describe, it, expect } from "vitest";
import { initialState } from "../lib/sandbox";
import { runRules } from "../lib/agent";
import { setTier } from "../lib/actions";

describe("rule-based agent: end-to-end tasks", () => {
  it("pays tuition the cheapest safe way → pending approval via SwiftLite", () => {
    const s = initialState();
    const r = runRules(s, "Pay my tuition the cheapest safe way");
    expect(r.events.map((e) => e.tool)).toEqual(["list_invoices", "compare_providers", "propose_payment"]);
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0].providerId).toBe("swiftlite");
    expect(r.reply).toMatch(/NOT licensed/);
  });
  it("warns about and refuses the injected housing invoice (Spanish)", () => {
    const s = initialState();
    const r = runRules(s, "Paga el depósito de vivienda");
    expect(r.reply).toMatch(/Atención/);
    expect(r.reply).toMatch(/bloqueó/);
    expect(s.pending).toHaveLength(0);
    expect(s.transactions).toHaveLength(0);
  });
  it("refuses QuickRemit even when the user asks for it", () => {
    const s = initialState();
    const r = runRules(s, "Pay my tuition with QuickRemit");
    expect(r.reply).toMatch(/licensed/);
    expect(s.pending).toHaveLength(0);
  });
  it("auto-pays the small CNY fee at tier 3", () => {
    const s = initialState();
    setTier(s, 3);
    runRules(s, "Paga la cuota de intercambio en China");
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].approvedBy).toBe("policy_auto");
  });
  it("creates an FX alert", () => {
    const s = initialState();
    runRules(s, "Alert me if USD drops below 3.70");
    expect(s.alerts[0]).toMatchObject({ currency: "USD", direction: "below", targetPerUnit: 3.7 });
  });
});

describe("rule-based agent in other home currencies", () => {
  for (const home of ["USD", "JPY", "CNY", "EUR", "MXN"] as const) {
    it(`completes the tuition flow from a ${home} account`, () => {
      const s = initialState(undefined, home);
      const r = runRules(s, "Pay my tuition the cheapest safe way");
      expect(s.pending).toHaveLength(1);
      expect(s.pending[0].quote.home).toBe(home);
      expect(r.reply).toContain(home);
      expect(s.pending[0].providerId).not.toBe("quickremit");
    });
  }
  it("compares an arbitrary currency the user names", () => {
    const s = initialState(undefined, "PEN");
    const r = runRules(s, "Compare sending 50000 yen");
    expect(r.events[0].input).toMatchObject({ amount: 50000, currency: "JPY" });
    expect(r.reply).toMatch(/PEN/);
  });
});
