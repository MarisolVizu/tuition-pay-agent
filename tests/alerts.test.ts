import { describe, it, expect } from "vitest";
import { initialState, tickMarket } from "../lib/sandbox";
import { createAlert, deleteAlert, updateAlert } from "../lib/actions";
import { runRules } from "../lib/agent";
import { runTool } from "../lib/tools";

describe("rate alerts", () => {
  it("keeps one alert per currency: a new one replaces the old", () => {
    const s = initialState(); // USD = 3.75 PEN
    expect(createAlert(s, "USD", "below", 3.7).ok).toBe(true);
    const r = createAlert(s, "USD", "above", 3.8);
    expect(r.ok && r.replaced?.direction).toBe("below");
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0]).toMatchObject({ currency: "USD", direction: "above", targetPerUnit: 3.8 });
    expect(s.audit.at(-1)?.type).toBe("alert.updated");
  });
  it("rejects targets that are already reached or unrealistic", () => {
    const s = initialState();
    expect(createAlert(s, "USD", "below", 3.9).ok).toBe(false); // already below
    expect(createAlert(s, "USD", "above", 3.6).ok).toBe(false); // already above
    expect(createAlert(s, "USD", "below", 1.0).ok).toBe(false); // >50 % away
    expect(createAlert(s, "PEN", "below", 1).ok).toBe(false); // home currency
    expect(s.alerts).toHaveLength(0);
  });
  it("updates and deletes", () => {
    const s = initialState();
    const a = createAlert(s, "EUR", "below", 4.0);
    if (!a.ok) throw new Error();
    expect(updateAlert(s, a.alert.id, "above", 4.2).ok).toBe(true);
    expect(s.alerts[0]).toMatchObject({ direction: "above", targetPerUnit: 4.2 });
    expect(deleteAlert(s, "EUR").ok).toBe(true);
    expect(s.alerts).toHaveLength(0);
    expect(deleteAlert(s, "EUR").ok).toBe(false);
  });
  it("a replaced alert can trigger again", () => {
    const s = initialState();
    createAlert(s, "USD", "above", 3.751);
    tickMarket(s, () => 1); // +0.8 %
    expect(s.alerts[0].triggeredAt).toBeTruthy();
    createAlert(s, "USD", "above", 3.9);
    expect(s.alerts[0].triggeredAt).toBeUndefined();
  });
  it("the agent can delete alerts (tool + Spanish request)", () => {
    const s = initialState();
    runRules(s, "Alert me if USD drops below 3.70");
    expect(s.alerts).toHaveLength(1);
    runRules(s, "Elimina la alerta del dólar");
    expect(s.alerts).toHaveLength(0);
    expect(runTool(s, "delete_fx_alert", { currency_or_id: "USD" }).event.ok).toBe(false);
  });
  it("the agent explains why an alert is invalid", () => {
    const s = initialState();
    const r = runRules(s, "Alert me if USD drops below 3.90");
    expect(r.reply).toMatch(/already below/);
    expect(s.alerts).toHaveLength(0);
  });
});
