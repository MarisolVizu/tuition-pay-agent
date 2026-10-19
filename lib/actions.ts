import type { ForeignCurrency, PendingAction, SandboxState, Tier } from "./types";
import { audit } from "./audit";
import { evaluatePayment } from "./policy";
import { findInvoice, getPayee, getProvider, computeQuote, nextId, round2, rollDay } from "./sandbox";

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
    totalPEN: quote.totalPEN,
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
    audit(state, "policy", "payment.auto_approved", `Auto-approved at tier 3 (PEN ${quote.totalPEN} ≤ ${state.limits.autoApprovePEN})`);
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
  audit(state, "policy", "payment.awaiting_approval", `Payment ${pending.id} needs human approval`, { pendingId: pending.id, totalPEN: quote.totalPEN });
  return { status: "awaiting_approval", message: `Awaiting your approval (${pending.id}). The agent cannot approve it.`, pending };
}

function executePayment(state: SandboxState, invoiceId: string, providerId: string, approvedBy: "human" | "policy_auto") {
  const invoice = findInvoice(state, invoiceId)!;
  const provider = getProvider(providerId)!;
  const payee = getPayee(state, invoice.payeeId)!;
  const quote = computeQuote(state, provider, invoice.amount, invoice.currency, payee);
  state.balances.PEN = round2(state.balances.PEN - quote.totalPEN);
  state.spentTodayPEN = round2(state.spentTodayPEN + quote.totalPEN);
  invoice.status = "paid";
  const tx = {
    id: nextId(state, "TX"),
    ts: new Date().toISOString(),
    invoiceId: invoice.id,
    payeeName: payee.name,
    providerName: provider.name,
    amount: invoice.amount,
    currency: invoice.currency,
    debitedPEN: quote.totalPEN,
    approvedBy,
    reference: `SBX-${state.sessionId.slice(0, 8).toUpperCase()}-${String(state.counter).padStart(4, "0")}`
  };
  state.transactions.push(tx);
  audit(state, approvedBy === "human" ? "user" : "policy", "payment.executed", `Paid ${invoice.currency} ${invoice.amount} to ${payee.name} via ${provider.name}; debited PEN ${quote.totalPEN}`, {
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
  // Re-check everything at approval time: balances, rates or limits may have changed.
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

export function createAlert(state: SandboxState, currency: ForeignCurrency, direction: "below" | "above", target: number) {
  const alert = { id: nextId(state, "AL"), currency, direction, targetPENPerUnit: round2(target * 10000) / 10000, createdAt: new Date().toISOString() };
  state.alerts.push(alert);
  audit(state, "agent", "alert.created", `Alert when ${currency} goes ${direction} ${alert.targetPENPerUnit} PEN`);
  return alert;
}

export function setTier(state: SandboxState, tier: Tier) {
  const from = state.tier;
  state.tier = tier;
  audit(state, "user", "tier.changed", `Permission tier changed from ${from} to ${tier}`);
  return state;
}
