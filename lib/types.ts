export type Currency = "PEN" | "USD" | "CNY" | "EUR";
export type ForeignCurrency = Exclude<Currency, "PEN">;

/**
 * Permission tiers (least privilege by default).
 * 0 Read-only   : agent may only read data.
 * 1 Advise      : agent may also compare options and create FX alerts.
 * 2 Confirm     : agent may propose payments; a human must approve each one.
 * 3 Autonomous  : agent may execute payments that pass every policy check
 *                 AND are under the auto-approve limit; larger ones still need a human.
 */
export type Tier = 0 | 1 | 2 | 3;

export type PayeeCategory = "university" | "housing" | "family" | "other";

export interface Payee {
  id: string;
  name: string;
  country: string;
  currency: ForeignCurrency;
  account: string; // stored in full in the sandbox, always masked on output
  verified: boolean;
  category: PayeeCategory;
}

export interface Invoice {
  id: string;
  payeeId: string;
  description: string;
  amount: number;
  currency: ForeignCurrency;
  dueDate: string; // ISO date
  status: "open" | "paid";
  rawText: string; // untrusted document text, as received
}

export interface Provider {
  id: string;
  name: string;
  fixedFeePEN: number;
  spreadPct: number; // markup over mid-market rate, in percent
  eta: string;
  compliant: boolean;
  complianceNote: string;
  allowedCategories: PayeeCategory[] | "all";
}

export interface Quote {
  providerId: string;
  providerName: string;
  amount: number;
  currency: ForeignCurrency;
  midRate: number;
  providerRate: number;
  midCostPEN: number;
  fxMarkupPEN: number;
  feePEN: number;
  totalPEN: number;
  hiddenCostPEN: number;
  eta: string;
  compliant: boolean;
  complianceNote: string;
  allowedForPayee: boolean;
}

export interface PolicyCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export type PolicyDecision = "deny" | "needs_confirmation" | "auto_execute";

export interface PendingAction {
  id: string;
  kind: "payment";
  invoiceId: string;
  providerId: string;
  quote: Quote;
  reason: string;
  createdAt: string;
  checks: PolicyCheck[];
}

export interface Transaction {
  id: string;
  ts: string;
  invoiceId: string;
  payeeName: string;
  providerName: string;
  amount: number;
  currency: ForeignCurrency;
  debitedPEN: number;
  approvedBy: "human" | "policy_auto";
  reference: string;
}

export interface FxAlert {
  id: string;
  currency: ForeignCurrency;
  direction: "below" | "above";
  targetPENPerUnit: number;
  createdAt: string;
  triggeredAt?: string;
  triggeredRate?: number;
}

export type AuditActor = "user" | "agent" | "policy" | "system";

export interface AuditEntry {
  seq: number;
  ts: string;
  actor: AuditActor;
  type: string;
  summary: string;
  data?: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface Limits {
  perTransactionPEN: number;
  dailyPEN: number;
  autoApprovePEN: number;
}

export interface SandboxState {
  version: 1;
  sessionId: string;
  createdAt: string;
  day: string;
  tier: Tier;
  balances: Record<Currency, number>;
  rates: Record<ForeignCurrency, number>; // PEN per 1 unit (mid-market)
  payees: Payee[];
  invoices: Invoice[];
  limits: Limits;
  spentTodayPEN: number;
  pending: PendingAction[];
  transactions: Transaction[];
  alerts: FxAlert[];
  audit: AuditEntry[];
  counter: number;
}

export interface AgentEvent {
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
