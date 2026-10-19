import type { Invoice, PolicyCheck, PolicyDecision, Provider, Quote, SandboxState } from "./types";
import { getPayee } from "./sandbox";
import { scanUntrusted } from "./guard";

/**
 * Deterministic policy engine. It runs OUTSIDE the language model: the model can only
 * propose; this code decides. A single failed check denies the action.
 */
export function evaluatePayment(
  state: SandboxState,
  invoice: Invoice,
  provider: Provider,
  quote: Quote,
  opts: { humanConfirmed?: boolean } = {}
): { decision: PolicyDecision; checks: PolicyCheck[] } {
  const payee = getPayee(state, invoice.payeeId);
  const scan = scanUntrusted(invoice.rawText);
  const { perTransactionPEN, dailyPEN, autoApprovePEN } = state.limits;

  const checks: PolicyCheck[] = [
    {
      id: "tier",
      label: "Permission tier allows payments",
      passed: state.tier >= 2,
      detail: state.tier >= 2 ? `Tier ${state.tier}` : `Tier ${state.tier} cannot move money (needs tier 2 or 3)`
    },
    {
      id: "invoice_open",
      label: "Invoice is open (no duplicate payment)",
      passed: invoice.status === "open" && !state.pending.some((p) => p.invoiceId === invoice.id),
      detail: invoice.status !== "open" ? "Already paid" : state.pending.some((p) => p.invoiceId === invoice.id) ? "A payment for this invoice is already awaiting approval" : "Open"
    },
    {
      id: "payee_verified",
      label: "Payee is verified",
      passed: !!payee?.verified,
      detail: payee ? (payee.verified ? `${payee.name} verified` : `${payee.name} has not been verified`) : "Unknown payee"
    },
    {
      id: "document_safe",
      label: "Invoice passed injection scan",
      passed: !scan.flagged,
      detail: scan.flagged ? `Suspicious instructions found: ${scan.matches.join(", ")}` : "No embedded instructions found"
    },
    {
      id: "provider_compliant",
      label: "Provider is licensed (KYC/AML)",
      passed: provider.compliant,
      detail: provider.complianceNote
    },
    {
      id: "provider_scope",
      label: "Provider can pay this kind of payee",
      passed: quote.allowedForPayee,
      detail: quote.allowedForPayee ? "In scope" : `${provider.name} only pays ${JSON.stringify(provider.allowedCategories)}`
    },
    {
      id: "balance",
      label: "Enough balance",
      passed: state.balances.PEN >= quote.totalPEN,
      detail: `Needs PEN ${quote.totalPEN.toFixed(2)}, available PEN ${state.balances.PEN.toFixed(2)}`
    },
    {
      id: "per_tx_limit",
      label: "Within per-transaction limit",
      passed: quote.totalPEN <= perTransactionPEN,
      detail: `Limit PEN ${perTransactionPEN}`
    },
    {
      id: "daily_limit",
      label: "Within daily limit",
      passed: state.spentTodayPEN + quote.totalPEN <= dailyPEN,
      detail: `Spent today PEN ${state.spentTodayPEN.toFixed(2)} of ${dailyPEN}`
    }
  ];

  if (checks.some((c) => !c.passed)) return { decision: "deny", checks };
  if (opts.humanConfirmed) return { decision: "auto_execute", checks };
  if (state.tier === 3 && quote.totalPEN <= autoApprovePEN) {
    checks.push({ id: "auto_limit", label: "Under auto-approve limit", passed: true, detail: `PEN ${quote.totalPEN.toFixed(2)} ≤ ${autoApprovePEN}` });
    return { decision: "auto_execute", checks };
  }
  checks.push({
    id: "auto_limit",
    label: "Human approval required",
    passed: true,
    detail: state.tier === 3 ? `Above auto-approve limit of PEN ${autoApprovePEN}` : "Tier 2 requires approval for every payment"
  });
  return { decision: "needs_confirmation", checks };
}

export const TOOL_MIN_TIER: Record<string, number> = {
  get_account_overview: 0,
  list_invoices: 0,
  get_fx_rates: 0,
  compare_providers: 1,
  create_fx_alert: 1,
  propose_payment: 0 // always callable; the policy engine decides (so denials are logged and explained)
};
