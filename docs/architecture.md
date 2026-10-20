---
layout: default
title: Technical documentation
---

[← Overview](index.md)

# Technical documentation

## 1. System architecture

```
 Browser (Next.js client)                     Vercel serverless functions (Node.js)
 ┌──────────────────────────┐   signed state  ┌────────────────────────────────────────────┐
 │ Chat · Account · Tiers   │ ──────────────▶ │ /api/agent    verify HMAC → agent loop      │
 │ Authorization card       │ ◀────────────── │ /api/confirm  human-only approve / reject   │
 │ Audit trail · Export     │  new state+sig  │ /api/settings tier change                   │
 └──────────────────────────┘                 │ /api/tick     simulated market              │
                                              │ /api/session  new sandbox                   │
                                              └──────┬─────────────────────────────────────┘
                                                     │
               ┌─────────────────────────────────────┼─────────────────────────────┐
               ▼                                     ▼                             ▼
     Agent (lib/agent.ts)                 Tools (lib/tools.ts)             Policy engine (lib/policy.ts)
     • LLM tool-use loop (Claude API)     • tier gate per tool             • 9 deterministic checks
     • deterministic fallback planner     • untrusted-data wrapping        • deny / needs_confirmation /
       when no API key                    • account masking                  auto_execute
               │                                     │                             │
               └──────────────► Sandbox ledger (lib/sandbox.ts, lib/actions.ts) ◀──┘
                                • balances, payees, invoices, providers, FX, limits
                                • hash-chained audit log (lib/audit.ts)
```

**Stateless by design.** Vercel functions keep no memory between requests, so the whole sandbox state travels with each request — but it is signed with HMAC-SHA256 (`lib/signing.ts`). If the browser changes a balance, a limit, the tier or an invoice status, the signature fails and the server refuses the request (HTTP 401).

**Two agent modes.** With `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` (any OpenAI-compatible provider) or `ANTHROPIC_API_KEY` set, a language model plans with tool calls. Without it, a deterministic planner runs the same tools in the same order. Both go through the same tools and the same policy engine, so the security guarantees do not depend on the model.

## 2. Core algorithms

### 2.1 Agent loop (`lib/agent.ts`)

1. Append the user message to the audit log.
2. Call the model with the system prompt, the tier and six tool schemas.
3. While the model asks for tools (max 8 rounds): run each tool through `runTool`, return results as `tool_result` blocks.
4. Return the final text plus the list of tool events shown under the reply.
5. On any API error, log it and fall back to the deterministic planner.

Every turn records which engine answered: an `llm.call` entry in the activity log (model, provider, number of model calls, tokens, latency) or an `llm.error` entry if the model failed. The UI shows the same label under every answer, and **Settings → Test AI connection** makes a live round trip to the model. With `AGENT_FALLBACK=off`, a model failure is reported instead of being answered by the rule-based planner, so every answer provably comes from the model.

The model **has no tool that executes or approves a payment**. `propose_payment` is the only path to money, and its outcome is decided by code.

### 2.2 Total-cost quote (`computeQuote`)

For an amount *A* in the invoice currency, mid-market rate *r* (home-currency units per unit; *r* = 1 and *s* = 0 when the invoice is in the home currency), provider spread *s* and fixed fee *f*:

```
mid cost     = A · r
FX markup    = A · r · s
total (PEN)  = A · r · (1 + s) + f
hidden cost  = A · r · s + f
```

Recommendation = cheapest quote that is **licensed** and **allowed for the payee category**. Cheaper non-compliant quotes are shown but marked as excluded, so the user sees why.

Example with the fallback reference rate (USD 3,800 tuition, r = 3.75; live figures vary daily): SwiftLite total PEN 14,441.75 (hidden PEN 191.75) vs bank wire PEN 14,705.50 (hidden PEN 455.50), a saving of PEN 263.75.

### 2.3 Policy engine (`lib/policy.ts`)

Each proposal is evaluated against nine checks; any failure denies it:

1. Permission tier ≥ 2
2. Invoice open and not already pending (no double payment)
3. Payee verified
4. Invoice passed the injection scan
5. Provider licensed (KYC/AML)
6. Provider in scope for the payee category
7. Sufficient balance
8. Per-transaction limit
9. Daily limit

If all pass: tier 3 and total ≤ auto-approve limit → execute; otherwise → wait for human approval. **At approval time everything is evaluated again**, because rates, balance or tier may have changed.

### 2.4 Prompt-injection defence (`lib/guard.ts`)

Invoices are untrusted. Their text is wrapped in `<untrusted>` tags (with any forged closing tag stripped), scanned with seven pattern families (instruction override, role change, fake system tags, “skip confirmation”, “pre-approved” claims, messages addressed to the AI, urgency), and the scan result is a hard policy check, so even a model that is fooled cannot get the payment through.

### 2.5 Tamper-evident audit log (`lib/audit.ts`)

`hash_n = SHA-256(seq, ts, actor, type, summary, data, hash_{n-1})`. Changing any past entry breaks every later link; `verifyChain` reports where. PII (account numbers, e-mails) is masked before an entry is written.

## 2b. Any home currency

The student chooses the currency they pay **from** (“Pay from”: PEN, USD, EUR, CNY, JPY, GBP, KRW, INR, MXN, BRL, COP, CLP, CAD, AUD). Invoices can be in any supported currency. Rates are fetched with the home currency as base, so every quote, fee, limit and balance is shown in the student’s own currency. The student profile and provider fees are defined in USD and converted at session start; when the invoice is already in the home currency there is no conversion and therefore no FX markup.

## 3. Data: what is real and what is simulated

| Data | Source |
|---|---|
| Mid-market exchange rates for 14 currencies, based on the user’s home currency | **Real.** ExchangeRate-API open access endpoint, fetched when a session starts, cached 6 hours, updated daily by the provider. Responses are validated (success flag, positive values, sanity band); on failure the sandbox uses built-in reference values and says so in the UI and the audit log. |
| Rate alerts | One alert per currency (a new one replaces the old, so alerts never contradict). Targets are validated against today’s real rate: “below” must be under it, “above” over it, within ±50 %. Alerts can be edited or deleted by the user or by the agent (`delete_fx_alert`). |
| “Simulate market move” | Simulated ±0.8 % moves on top of the real reference rate, to demonstrate FX alerts. |
| Balances, payments, invoices, payees | Simulated sandbox, as the competition rules allow for non-on-chain topics. |
| Transfer providers | Fictional, each representing a real market category: traditional bank wire, fintech transfer service, education payment platform, unlicensed operator. Spreads and fees are illustrative assumptions following the real-world pattern (banks most expensive, fintechs cheaper, unlicensed operators cheapest but non-compliant). |

## 3b. Sandbox data

| Item | Value |
|---|---|
| Balance | PEN 18,500 (≈ USD 4,933, converted to the chosen home currency) |
| Limits | per transaction PEN 16,000 · daily PEN 20,000 · auto-approve PEN 2,000 (converted likewise) |
| Invoices | Tuition USD 3,800 (verified university) · Housing deposit USD 650 (unverified payee, injected instructions) · Exchange fee CNY 1,500 (verified university) |
| Providers | Bank wire (2.6 % + PEN 85) · SwiftLite (1.1 % + PEN 35) · CampusPay (1.5 %, universities only) · QuickRemit (0.4 % + PEN 15, **unlicensed**) |

## 4. Tech stack and deployment

Next.js 14 (App Router), TypeScript, React 18, no database. Vitest for tests, tsx for the headless evidence run. Deployed on Vercel; documentation on GitHub Pages from `/docs`. Environment variables: `STATE_SECRET` (required), `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (optional).

## 5. Roadmap

Real provider APIs and open-banking read access; credit building (reporting on-time rent and tuition); multi-currency wallets held abroad; family-funded remittances where parents at home approve top-ups; OCR for invoice PDFs.
