import type { Currency, FxAlert, PendingAction, SandboxState, Tier } from "./types";
import { isCurrency, money } from "./currencies";
import { audit } from "./audit";
import { evaluatePayment } from "./policy";
import { findInvoice, getPayee, getProvider, computeQuote, nextId, round2, rollDay, evaluateAlerts, homePerUnit } from "./sandbox";

export type ProposeResult =
  | { status: "denied"; message: string; checks: PendingAction["checks"] }
  | { status: "awaiting_approval"; message: string; pending: PendingAction }
  | { status: "executed"; message: string; transactionId: string; reference: string };

export function proposePayment(state: SandboxState, invoiceId: string, providerId: string, reason: string): ProposeResult {
  rollDay(state);
  const invoice = findInvoice(state, invoiceId);
  const provider = getProvider(providerId);
  if (!invoice || !provider) {
    const message = !invoice ? `Invoice ${invoiceId} not found` : `Provider ${providerId} not found`;
    audit(state, "policy", "payment.denied", message, { invoiceId, providerId });
    return { status: "denied", message, checks: [] };
  }
  const payee = getPayee(state, invoice.payeeId);
  const quote = computeQuote(state, provider, invoice.amount, invoice.currency, payee);
  audit(state, "agent", "payment.proposed", `Agent proposed paying ${invoice.id} via ${provider.name}`, {
    invoiceId: invoice.id,
    providerId,
    total: quote.total,
    reason: reason.slice(0, 300)
  });

  const { decision, checks } = evaluatePayment(state, invoice, provider, quote);
  const failed = checks.filter((c) => !c.passed);

  if (decision === "deny") {
    const message = `Denied by policy: ${failed.map((c) => `${c.label} (${c.detail})`).join("; ")}`;
    audit(state, "policy", "payment.denied", message, { invoiceId: invoice.id, failed: failed.map((c) => c.id) });
    return { status: "denied", message, checks };
  }

  if (decision === "auto_execute") {
    audit(state, "policy", "payment.auto_approved", `Auto-approved at tier 3 (${money(state.home, quote.total)} ≤ ${money(state.home, state.limits.autoApprove)})`);
    const tx = executePayment(state, invoice.id, provider.id, "policy_auto");
    return { status: "executed", message: `Executed automatically under tier-3 limits. Reference ${tx.reference}`, transactionId: tx.id, reference: tx.reference };
  }

  const pending: PendingAction = {
    id: nextId(state, "PA"),
    kind: "payment",
    invoiceId: invoice.id,
    providerId: provider.id,
    quote,
    reason: reason.slice(0, 300),
    createdAt: new Date().toISOString(),
    checks
  };
  state.pending.push(pending);
  audit(state, "policy", "payment.awaiting_approval", `Payment ${pending.id} needs human approval`, { pendingId: pending.id, total: quote.total });
  return { status: "awaiting_approval", message: `Awaiting your approval (${pending.id}). The agent cannot approve it.`, pending };
}

function executePayment(state: SandboxState, invoiceId: string, providerId: string, approvedBy: "human" | "policy_auto") {
  const invoice = findInvoice(state, invoiceId)!;
  const provider = getProvider(providerId)!;
  const payee = getPayee(state, invoice.payeeId)!;
  const quote = computeQuote(state, provider, invoice.amount, invoice.currency, payee);
  state.balance = round2(state.balance - quote.total);
  state.spentToday = round2(state.spentToday + quote.total);
  invoice.status = "paid";
  const tx = {
    id: nextId(state, "TX"),
    ts: new Date().toISOString(),
    invoiceId: invoice.id,
    payeeName: payee.name,
    providerName: provider.name,
    amount: invoice.amount,
    currency: invoice.currency,
    debited: quote.total,
    approvedBy,
    reference: `SBX-${state.sessionId.slice(0, 8).toUpperCase()}-${String(state.counter).padStart(4, "0")}`
  };
  state.transactions.push(tx);
  audit(state, approvedBy === "human" ? "user" : "policy", "payment.executed", `Paid ${invoice.currency} ${invoice.amount} to ${payee.name} via ${provider.name}; debited ${money(state.home, quote.total)}`, {
    transactionId: tx.id,
    reference: tx.reference,
    payeeAccount: payee.account
  });
  return tx;
}

export function decidePending(state: SandboxState, pendingId: string, approve: boolean) {
  rollDay(state);
  const idx = state.pending.findIndex((p) => p.id === pendingId);
  if (idx < 0) return { ok: false, message: `No pending action ${pendingId}` };
  const [pending] = state.pending.splice(idx, 1);
  if (!approve) {
    audit(state, "user", "payment.rejected", `User rejected ${pending.id}`);
    return { ok: true, message: `Rejected ${pending.id}. Nothing was paid.` };
  }
  // Re-check everything at approval time: balance, rates or limits may have changed.
  const invoice = findInvoice(state, pending.invoiceId);
  const provider = getProvider(pending.providerId);
  if (!invoice || !provider) return { ok: false, message: "Invoice or provider no longer exists" };
  const quote = computeQuote(state, provider, invoice.amount, invoice.currency, getPayee(state, invoice.payeeId));
  const { decision, checks } = evaluatePayment(state, invoice, provider, quote, { humanConfirmed: true });
  if (decision === "deny") {
    const failed = checks.filter((c) => !c.passed).map((c) => c.label).join("; ");
    audit(state, "policy", "payment.denied", `Re-check failed at approval: ${failed}`);
    return { ok: false, message: `Re-check failed: ${failed}` };
  }
  audit(state, "user", "payment.approved", `User approved ${pending.id}`);
  const tx = executePayment(state, invoice.id, provider.id, "human");
  return { ok: true, message: `Paid. Reference ${tx.reference}`, transaction: tx };
}

export type AlertResult =
  | { ok: true; alert: FxAlert; replaced?: FxAlert; message: string }
  | { ok: false; message: string };

const prec = (n: number) => Number(n.toPrecision(6));

/** Validate a target against today's rate: "below" must be under it, "above" over it, and within a sane band. */
function validateAlert(state: SandboxState, currency: Currency, direction: "below" | "above", target: number): string | null {
  if (!isCurrency(currency) || currency === state.home) return `Pick a currency other than your account currency (${state.home}).`;
  if (direction !== "below" && direction !== "above") return "Direction must be below or above.";
  if (!(target > 0) || !Number.isFinite(target)) return "The target must be a positive number.";
  const now = homePerUnit(state, currency);
  if (direction === "below" && target >= now) return `1 ${currency} is ${prec(now)} ${state.home} today, so it is already below ${prec(target)}. Choose a target under ${prec(now)}.`;
  if (direction === "above" && target <= now) return `1 ${currency} is ${prec(now)} ${state.home} today, so it is already above ${prec(target)}. Choose a target over ${prec(now)}.`;
  if (target < now * 0.5 || target > now * 1.5) return `${prec(target)} is more than 50% away from today’s rate (${prec(now)}). Choose a realistic target.`;
  return null;
}

/**
 * Create or replace a rate alert. There is one alert per currency: a new alert for the same
 * currency replaces the old one, so alerts can never contradict each other.
 */
export function createAlert(state: SandboxState, currency: Currency, direction: "below" | "above", target: number, actor: "agent" | "user" = "agent"): AlertResult {
  const problem = validateAlert(state, currency, direction, target);
  if (problem) {
    audit(state, "policy", "alert.rejected", problem);
    return { ok: false, message: problem };
  }
  const existing = state.alerts.find((a) => a.currency === currency);
  if (existing) {
    const before = { ...existing };
    existing.direction = direction;
    existing.targetPerUnit = prec(target);
    existing.createdAt = new Date().toISOString();
    delete existing.triggeredAt;
    delete existing.triggeredRate;
    audit(state, actor, "alert.updated", `Alert ${existing.id} replaced: ${currency} ${before.direction} ${before.targetPerUnit} → ${direction} ${existing.targetPerUnit} ${state.home}`);
    evaluateAlerts(state);
    return { ok: true, alert: existing, replaced: before, message: `Updated your ${currency} alert (one alert per currency): now ${direction} ${existing.targetPerUnit} ${state.home}.` };
  }
  const alert: FxAlert = { id: nextId(state, "AL"), currency, direction, targetPerUnit: prec(target), createdAt: new Date().toISOString() };
  state.alerts.push(alert);
  audit(state, actor, "alert.created", `Alert when ${currency} goes ${direction} ${alert.targetPerUnit} ${state.home}`);
  evaluateAlerts(state);
  return { ok: true, alert, message: `Alert set: ${currency} ${direction} ${alert.targetPerUnit} ${state.home}.` };
}

export function updateAlert(state: SandboxState, id: string, direction: "below" | "above", target: number, actor: "agent" | "user" = "user"): AlertResult {
  const a = state.alerts.find((x) => x.id === id);
  if (!a) return { ok: false, message: `No alert ${id}` };
  return createAlert(state, a.currency, direction, target, actor);
}

export function deleteAlert(state: SandboxState, ref: string, actor: "agent" | "user" = "user"): { ok: boolean; message: string } {
  const r = ref.trim().toUpperCase();
  const idx = state.alerts.findIndex((a) => a.id.toUpperCase() === r || a.currency === r);
  if (idx < 0) return { ok: false, message: `No alert found for ${ref}` };
  const [a] = state.alerts.splice(idx, 1);
  audit(state, actor, "alert.deleted", `Alert ${a.id} deleted (${a.currency} ${a.direction} ${a.targetPerUnit} ${state.home})`);
  return { ok: true, message: `Deleted the ${a.currency} alert.` };
}

export function setTier(state: SandboxState, tier: Tier) {
  const from = state.tier;
  state.tier = tier;
  audit(state, "user", "tier.changed", `Permission tier changed from ${from} to ${tier}`);
  return state;
}
